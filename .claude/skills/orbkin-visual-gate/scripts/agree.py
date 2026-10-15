#!/usr/bin/env python3
"""agree.py - score the owner's blind A/B picks, measure agreement with the Opus judge, update the trust table.

python3 -I agree.py --key key.json picks1.json [picks2.json ...] [--opus verdicts.json] [--out report.json]
                    [--trust trust.json] [--anchors DIR] [--no-anchors] [--sealed DIR]
python3 -I agree.py --selftest

key.json comes from owner_kit.py; picks*.json are the page's exports. Opus verdicts are read from key.json
(pairs[id].opus, written by owner_kit.py --from-verdicts / --judge) unless --opus gives a file
{verdicts: {id: {verdict: x|y|same, x_share}}}. Nothing is sent anywhere (stdlib + numpy).
Trust table (default <sealed>/trust.json; every family starts human_gated): after scoring, every rated
main pair is stored as an anchor in <sealed>/anchors/<set>-<pair>/ (a.png = x, b.png = y, verdict.json with
the human and Opus verdicts) and each family's state is recomputed over ALL anchors on disk:
judge_trusted when anchors >= 5, Cohen's kappa >= 0.6 and zero human-vs-Opus contradictions; else
human_gated. Only the verifier reads trust.json and anchors/; never paste them into a generator prompt.
Exit 0 (report printed), 2 bad input.

Per rater (quality control, from ITU-T P.808-style gold/trap logic and test-retest):
  gold      G* pairs have a known better side; failing an EASY gold (blur, value-flatten) = attention problem
  null      N1 is the same file twice: a 'clearly' pick there means the rater is guessing confidently
  retest    pairs shown twice with sides swapped: same winner both times? (exact, and allowing 'same')
  position  share of decided picks that went to the LEFT/first image (0.5 = no side bias)
  speed     median response time; < 2 s median suggests click-through
Per pair: human verdict (x / y / same) = plurality over all votes of accepted raters; a tie between
x and y, or a plurality of 'same', gives 'same'. Signed mean strength in [-2, 2] (negative = x).
Agreement (main pairs only): raw agreement, Cohen's kappa (3 classes), linearly weighted kappa
(ordered x < same < y), Gwet's AC1 (robust to skewed marginals), number of hard contradictions
(x vs y), decided-only agreement, bootstrap 95% CI over pairs, Spearman between Opus x-share
and human mean score. Density ladder: Bradley-Terry with ties counted as half a win each side
(MM algorithm, Hunter 2004) for humans and for Opus votes.
"""
import argparse, json, math, os, random, sys
import numpy as np

CLASSES = ['x', 'same', 'y']


# ---------------------------------------------------------------- statistics
def cohen_kappa(a, b, classes=CLASSES, weights=None):
    """a, b: equal-length label lists. weights None = unweighted; 'linear' = ordered classes."""
    k = len(classes); idx = {c: i for i, c in enumerate(classes)}
    n = len(a)
    if n == 0: return None
    O = np.zeros((k, k))
    for u, v in zip(a, b): O[idx[u], idx[v]] += 1
    O /= n
    E = np.outer(O.sum(1), O.sum(0))
    if weights == 'linear':
        W = np.array([[abs(i - j) / (k - 1) for j in range(k)] for i in range(k)])
    else:
        W = 1 - np.eye(k)
    de = (W * E).sum()
    if de == 0: return 1.0 if (W * O).sum() == 0 else 0.0
    return float(1 - (W * O).sum() / de)


def gwet_ac1(a, b, classes=CLASSES):
    k = len(classes); n = len(a)
    if n == 0: return None
    pa = sum(1 for u, v in zip(a, b) if u == v) / n
    pi = [(a.count(c) + b.count(c)) / (2 * n) for c in classes]
    pe = sum(p * (1 - p) for p in pi) / (k - 1)
    return float((pa - pe) / (1 - pe)) if pe < 1 else 1.0


def spearman(x, y):
    x = np.asarray(x, float); y = np.asarray(y, float)
    if len(x) < 3: return None
    def rank(v):
        o = np.argsort(v, kind='mergesort'); r = np.empty(len(v)); r[o] = np.arange(len(v))
        for val in np.unique(v):  # average ranks for ties
            m = v == val; r[m] = r[m].mean()
        return r
    rx, ry = rank(x), rank(y)
    if rx.std() == 0 or ry.std() == 0: return None
    return float(np.corrcoef(rx, ry)[0, 1])


def bootstrap_ci(fn, items, n=2000, seed=1):
    rnd = random.Random(seed); vals = []
    for _ in range(n):
        s = [items[rnd.randrange(len(items))] for _ in items]
        v = fn(s)
        if v is not None and not math.isnan(v): vals.append(v)
    if not vals: return None
    vals.sort()
    return [round(vals[int(0.025 * len(vals))], 3), round(vals[int(0.975 * len(vals)) - 1], 3)]


def binom_two_sided(k, n, p=0.5):
    """exact two-sided binomial test p-value."""
    if n == 0: return 1.0
    pk = [math.comb(n, i) * p ** i * (1 - p) ** (n - i) for i in range(n + 1)]
    obs = pk[k]
    return float(min(1.0, sum(q for q in pk if q <= obs * (1 + 1e-9))))


def bradley_terry(conds, games, iters=2000, tol=1e-10):
    """games: list of (winner, loser, weight). Ties should be passed as two half-weight games.
    MM algorithm (Hunter 2004) with a tiny symmetric prior (one half-game of each pair both ways)
    so unanimous data stays finite. Returns log-strengths centred at 0 (natural log units)."""
    idx = {c: i for i, c in enumerate(conds)}; k = len(conds)
    W = np.zeros((k, k))
    for w, l, wt in games: W[idx[w], idx[l]] += wt
    N = W + W.T
    for i in range(k):
        for j in range(k):
            if i != j and N[i, j] > 0:
                W[i, j] += 0.25; W[j, i] += 0.25
    N = W + W.T
    p = np.ones(k)
    for _ in range(iters):
        wins = W.sum(1)
        denom = np.array([sum(N[i, j] / (p[i] + p[j]) for j in range(k) if j != i and N[i, j] > 0) for i in range(k)])
        newp = np.where(denom > 0, wins / np.where(denom > 0, denom, 1), p)
        newp /= np.exp(np.log(newp).mean())
        if np.max(np.abs(newp - p)) < tol: p = newp; break
        p = newp
    s = np.log(p)
    return {c: round(float(s[idx[c]]), 3) for c in conds}


# ---------------------------------------------------------------- data
def load_picks(paths):
    out = []
    for p in paths:
        d = json.load(open(p))
        if d.get('format') != 'orbkin-ab-picks-v1':
            print(f'warning: {p} is not an orbkin-ab-picks-v1 file', file=sys.stderr)
        d['_file'] = os.path.basename(p)
        out.append(d)
    return out


def to_xy(ans, pair):
    """Map one answer to 'x' / 'y' / 'same' and a signed strength (negative = x)."""
    if ans['v'] == 0 or ans.get('choice') is None: return 'same', 0
    side = 'x' if ans['choice'] == pair['x']['img'] else 'y' if ans['choice'] == pair['y']['img'] else None
    if side is None: raise ValueError(f"answer for {ans['pair']} chose an image not in the key")
    return side, (-ans['strength'] if side == 'x' else ans['strength'])


def rater_qc(d, key):
    P = key['pairs']; A = d['answers']
    q = {'file': d['_file'], 'rater': d.get('rater') or '', 'role': d.get('role'), 'n': len(A),
         'complete': len(A) >= len(d.get('plan', A))}
    gold = {}
    for a in A:
        p = P.get(a['pair'])
        if p and p['kind'] == 'gold' and a['rep'] == 0:
            side, _ = to_xy(a, p); gold[a['pair']] = (side == p['expect'])
    easy = [v for k, v in gold.items() if P[k]['family'] in ('gold_blur', 'gold_flat')]
    q['gold_easy_pass'] = f"{sum(easy)}/{len(easy)}"; q['gold_hard_pass'] = {k: v for k, v in gold.items() if P[k]['family'] not in ('gold_blur', 'gold_flat')}
    nulls = [a for a in A if P.get(a['pair'], {}).get('kind') == 'null']
    q['null_confident_picks'] = sum(1 for a in nulls if a['strength'] == 2)
    q['null_same'] = f"{sum(1 for a in nulls if a['v'] == 0)}/{len(nulls)}"
    # test-retest
    rt = []
    for pid in key.get('repeats', []):
        two = [a for a in A if a['pair'] == pid]
        if len(two) == 2:
            s0, _ = to_xy(two[0], P[pid]); s1, _ = to_xy(two[1], P[pid])
            rt.append({'pair': pid, 'first': s0, 'second': s1, 'same_answer': s0 == s1, 'contradiction': {s0, s1} == {'x', 'y'}})
    q['retest'] = rt
    q['retest_agree'] = f"{sum(r['same_answer'] for r in rt)}/{len(rt)}"
    q['retest_contradictions'] = sum(r['contradiction'] for r in rt)
    dec = [a for a in A if a['v'] != 0 and P.get(a['pair'], {}).get('kind') != 'null']
    left = sum(1 for a in dec if a['v'] < 0)
    q['left_share'] = round(left / len(dec), 3) if dec else None
    q['left_binom_p'] = round(binom_two_sided(left, len(dec)), 3) if dec else None
    q['same_rate_main'] = round(sum(1 for a in A if a['v'] == 0 and P.get(a['pair'], {}).get('kind') == 'main') /
                                max(1, sum(1 for a in A if P.get(a['pair'], {}).get('kind') == 'main')), 3)
    rts = sorted(a['rt_ms'] for a in A)
    q['median_rt_s'] = round(rts[len(rts) // 2] / 1000, 1) if rts else None
    q['total_minutes'] = round(sum(rts) / 60000, 1)
    q['views'] = sorted({a.get('view') for a in A})
    q['used_1to1'] = sum(1 for a in A if a.get('native'))
    # accept unless an easy gold failed or the rater clicked through
    reasons = []
    if easy and not all(easy): reasons.append('failed an easy gold pair')
    if q['median_rt_s'] is not None and q['median_rt_s'] < 2.0: reasons.append('median response < 2 s')
    if q['null_confident_picks'] > 0: reasons.append('picked "clearly" on an identical pair (warning only)')
    q['accepted'] = not any(r for r in reasons if 'warning' not in r)
    q['flags'] = reasons
    return q


def human_verdicts(raters, key, include_repeats=True):
    P = key['pairs']; votes = {}
    for d in raters:
        for a in d['answers']:
            if a['pair'] not in P: continue
            if a['rep'] == 1 and not include_repeats: continue
            side, s = to_xy(a, P[a['pair']])
            votes.setdefault(a['pair'], []).append((side, s, d.get('role'), a.get('why', [])))
    out = {}
    for pid, vs in votes.items():
        c = {k: sum(1 for v in vs if v[0] == k) for k in CLASSES}
        if c['x'] > c['y'] and c['x'] >= c['same']: verdict = 'x'
        elif c['y'] > c['x'] and c['y'] >= c['same']: verdict = 'y'
        else: verdict = 'same'
        why = {}
        for v in vs:
            for w in v[3]: why[w] = why.get(w, 0) + 1
        out[pid] = {'verdict': verdict, 'counts': c, 'mean': round(float(np.mean([v[1] for v in vs])), 3), 'n': len(vs), 'why': why}
    return out


def agreement(hv, opus, key):
    P = key['pairs']
    items = []
    for pid, p in P.items():
        if p['kind'] != 'main' or pid not in hv or pid not in opus: continue
        items.append((pid, hv[pid]['verdict'], opus[pid]['verdict'], hv[pid]['mean'], opus[pid].get('x_share')))
    if not items: return {'n': 0}
    h = [i[1] for i in items]; o = [i[2] for i in items]
    raw = sum(1 for u, v in zip(h, o) if u == v) / len(items)
    dec = [(u, v) for u, v in zip(h, o) if u != 'same' and v != 'same']
    res = {
        'n': len(items),
        'raw_agreement': round(raw, 3),
        'kappa': round(cohen_kappa(h, o), 3),
        'kappa_linear': round(cohen_kappa(h, o, weights='linear'), 3),
        'gwet_ac1': round(gwet_ac1(h, o), 3),
        'kappa_ci95': bootstrap_ci(lambda s: cohen_kappa([i[1] for i in s], [i[2] for i in s]), items),
        'contradictions': [i[0] for i in items if {i[1], i[2]} == {'x', 'y'}],
        'decided_both': len(dec),
        'decided_agree': sum(1 for u, v in dec if u == v),
        'human_same_opus_decided': [i[0] for i in items if i[1] == 'same' and i[2] != 'same'],
        'opus_same_human_decided': [i[0] for i in items if i[2] == 'same' and i[1] != 'same'],
        # opus x_share is the share of votes for x; human mean is negative for x, so flip the sign
        'spearman_soft': (lambda r: round(r, 3) if r is not None else None)(spearman([-i[3] for i in items], [i[4] for i in items])),
        'per_pair': [{'pair': i[0], 'family': P[i[0]]['family'], 'human': i[1], 'opus': i[2], 'human_mean': i[3], 'opus_x_share': i[4]} for i in items],
    }
    fam = {}
    for i in items:
        f = P[i[0]]['family']; fam.setdefault(f, [0, 0]); fam[f][0] += (i[1] == i[2]); fam[f][1] += 1
    res['by_family'] = {f: f'{a}/{n}' for f, (a, n) in fam.items()}
    return res


def density_bt(raters, key, opus_votes=None):
    """Bradley-Terry over the 'density' family, separately per device (desk / phone): the right sprite
    density can differ by screen, and the game can set the tunable per device tier."""
    P = key['pairs']
    def games_from(pairs_votes):
        g = []
        for pid, side in pairs_votes:
            x, y = P[pid]['x']['label'], P[pid]['y']['label']
            if side == 'x': g.append((x, y, 1.0))
            elif side == 'y': g.append((y, x, 1.0))
            else: g += [(x, y, 0.5), (y, x, 0.5)]
        return g
    out = {}
    for dev in sorted({p['device'] for p in P.values() if p.get('family') == 'density'}):
        fam = [pid for pid, p in P.items() if p.get('family') == 'density' and p['device'] == dev]
        conds = sorted({P[pid][s]['label'] for pid in fam for s in 'xy'})
        r = {'conditions': conds, 'pairs': fam}
        hv = [(a['pair'], to_xy(a, P[a['pair']])[0]) for d in raters for a in d['answers'] if a['pair'] in fam]
        if hv: r['human_log_strength'] = bradley_terry(conds, games_from(hv)); r['human_votes'] = len(hv)
        ov = [(v['pair'], v['pick']) for v in (opus_votes or []) if v['pair'] in fam]
        if ov: r['opus_log_strength'] = bradley_terry(conds, games_from(ov)); r['opus_votes'] = len(ov)
        out[dev] = r
    return out


def recommendations(qc, agr, hv, key, dens):
    rec = []
    acc = [q for q in qc if q['accepted']]
    if not acc: return ['No accepted rater: re-run the session (check gold pairs, slow down).']
    if agr.get('n'):
        k = agr['kappa']
        if k is not None and k >= 0.6 and not agr['contradictions']:
            rec.append(f"Judge tracks you (kappa {k}): keep the Opus pairwise gate as the default; ask the owner only on 'same' verdicts and on new families.")
        elif agr['contradictions']:
            rec.append(f"Judge CONTRADICTS you on {agr['contradictions']}: do not let the judge decide these families alone; "
                       "add these pairs as anchors in the judge prompt or require an owner pick for that family.")
        else:
            rec.append(f"Weak agreement (kappa {k}): treat Opus 'better' as a hint only; gate on owner picks for art-direction changes.")
        if agr['human_same_opus_decided']:
            rec.append(f"Opus decides where you see no difference on {agr['human_same_opus_decided']}: raise the judge's bar "
                       "(more votes per order, or require confidence >= 3 in both orders) before claiming an improvement.")
        if agr['opus_same_human_decided']:
            rec.append(f"You see a difference Opus calls 'same' on {agr['opus_same_human_decided']}: add a focal crop or a 1:1 crop to the judge for these families.")
    for dev, r in dens.items():
        if r.get('human_log_strength'):
            hs = r['human_log_strength']; best = max(hs, key=hs.get)
            spread = max(hs.values()) - min(hs.values())
            ob = max(r['opus_log_strength'], key=r['opus_log_strength'].get) if r.get('opus_log_strength') else None
            note = 'weak (one session; collect more before changing code)' if spread < 1.0 or r['human_votes'] < 6 else 'clear'
            rec.append(f"Sprite density on {dev}: humans favour {best} ({hs}, {note}); Opus favours {ob}. "
                       f"{'Opus agrees.' if ob == best else 'Opus disagrees: the human pick wins for this tunable.'}")
    for pid, p in key['pairs'].items():
        if p['kind'] == 'probe' and pid in hv and hv[pid]['verdict'] != 'same':
            rec.append(f"You preferred one of two captures of the SAME build ({pid}): animation phase matters to you too; always capture A/B frames with a frozen clock.")
    return rec


def update_trust(key, hv, ov, args):
    """Store this batch's rated main pairs as anchors and recompute the per-family trust table over all anchors."""
    import shutil, datetime
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import judgelib
    sealed = judgelib.sealed_dir(args.sealed)
    trust_path = args.trust or os.path.join(sealed, 'trust.json')
    anchors = args.anchors or os.path.join(sealed, 'anchors')
    os.makedirs(anchors, exist_ok=True)
    setname = (key.get('set') or 'batch').replace('/', '_')
    for pid, p in key['pairs'].items():
        if p['kind'] != 'main' or pid not in hv:
            continue
        d = os.path.join(anchors, f'{setname}-{pid}')
        os.makedirs(d, exist_ok=True)
        for side, name in (('x', 'a.png'), ('y', 'b.png')):
            src = p[side].get('src')
            if src and os.path.exists(src) and not os.path.exists(os.path.join(d, name)):
                shutil.copy(src, os.path.join(d, name))
        json.dump({'pair': pid, 'set': setname, 'family': p.get('family'), 'device': p.get('device'), 'arena': p.get('arena'),
                   'x_label': p['x'].get('label'), 'y_label': p['y'].get('label'),
                   'human': hv[pid], 'opus': ov.get(pid), 'rated': datetime.date.today().isoformat()},
                  open(os.path.join(d, 'verdict.json'), 'w'), indent=1)
    # recompute over everything on disk
    fam = {}
    for name in sorted(os.listdir(anchors)):
        vp = os.path.join(anchors, name, 'verdict.json')
        if not os.path.isfile(vp):
            continue
        try:
            v = json.load(open(vp))
        except (OSError, json.JSONDecodeError):
            continue
        f = v.get('family') or 'unassigned'
        h = (v.get('human') or {}).get('verdict'); o = (v.get('opus') or {}).get('verdict')
        fam.setdefault(f, []).append((h, o))
    try:
        trust = json.load(open(trust_path))
    except (OSError, json.JSONDecodeError):
        trust = {'version': 1, 'rule': 'judge_trusted when anchors >= 5 and kappa >= 0.6 and contradictions == 0; else human_gated', 'families': {}}
    today = datetime.date.today().isoformat()
    for f, rows in fam.items():
        both = [(h, o) for h, o in rows if h in CLASSES and o in CLASSES]
        k = cohen_kappa([h for h, o in both], [o for h, o in both]) if len(both) >= 2 else None
        contra = sum(1 for h, o in both if {h, o} == {'x', 'y'})
        state = 'judge_trusted' if (len(both) >= 5 and k is not None and k >= 0.6 and contra == 0) else 'human_gated'
        trust['families'][f] = {'state': state, 'anchors': len(rows), 'compared_with_opus': len(both),
                                'kappa': None if k is None else round(k, 3), 'contradictions': contra, 'updated': today}
    os.makedirs(os.path.dirname(trust_path), exist_ok=True)
    json.dump(trust, open(trust_path, 'w'), indent=1)
    return trust_path, {f: t['state'] for f, t in trust['families'].items()}


def run(args):
    key = json.load(open(args.key))
    if args.opus:
        opus = json.load(open(args.opus)); ov = opus.get('verdicts', opus)
    else:
        ov = {pid: p['opus'] for pid, p in key['pairs'].items() if isinstance(p.get('opus'), dict) and p['opus'].get('verdict')}
    raters = load_picks(args.picks)
    qc = [rater_qc(d, key) for d in raters]
    acc = [d for d, q in zip(raters, qc) if q['accepted']]
    hv = human_verdicts(acc, key)
    agr = agreement(hv, ov, key)
    votes = []
    if args.opus_votes and os.path.exists(args.opus_votes):
        votes = [json.loads(l) for l in open(args.opus_votes) if l.strip()]
    dens = density_bt(acc, key, votes)
    rep = {'raters': qc, 'accepted': len(acc), 'human': hv, 'agreement': agr, 'density': dens,
           'recommendations': recommendations(qc, agr, hv, key, dens)}
    if acc and not args.no_anchors:
        tp, states = update_trust(key, hv, ov, args)
        rep['trust'] = {'file': tp, 'families': states}
    if args.out:
        json.dump(rep, open(args.out, 'w'), indent=1)
    # human-readable summary
    print('== raters')
    for q in qc:
        print(f"  {q['file']}: role={q['role']} n={q['n']} accepted={q['accepted']} gold_easy={q['gold_easy_pass']} "
              f"null_same={q['null_same']} retest={q['retest_agree']} left_share={q['left_share']} (p={q['left_binom_p']}) "
              f"median_rt={q['median_rt_s']}s total={q['total_minutes']}min flags={q['flags']}")
    print('== agreement with Opus (main pairs)')
    for k in ('n', 'raw_agreement', 'kappa', 'kappa_ci95', 'kappa_linear', 'gwet_ac1', 'spearman_soft', 'contradictions',
              'human_same_opus_decided', 'opus_same_human_decided', 'by_family'):
        if k in agr: print(f'  {k}: {agr[k]}')
    for r in agr.get('per_pair', []):
        flag = '  <-- contradiction' if {r['human'], r['opus']} == {'x', 'y'} else ('' if r['human'] == r['opus'] else '  (differs)')
        print(f"   {r['pair']} {r['family']:<20} human={r['human']:<4} opus={r['opus']:<4} mean={r['human_mean']:+.2f} opus_x={r['opus_x_share']}{flag}")
    print('== density (Bradley-Terry log-strength, ties = half wins), per device')
    for dev, r in dens.items(): print(f'   {dev}:', {k: v for k, v in r.items() if k != 'pairs'})
    print('== recommendations')
    for r in rep['recommendations']: print('  -', r)
    if rep.get('trust'):
        print('== trust table', rep['trust']['file'])
        for f, st in rep['trust']['families'].items(): print(f'   {f}: {st}')
    return rep


# ---------------------------------------------------------------- self-test
def selftest():
    # stats sanity
    assert abs(cohen_kappa(['x', 'y', 'same', 'x'], ['x', 'y', 'same', 'x']) - 1) < 1e-9
    a = ['x'] * 5 + ['y'] * 5; b = ['x'] * 5 + ['y'] * 5
    assert abs(cohen_kappa(a, b) - 1) < 1e-9
    b2 = ['y'] * 5 + ['x'] * 5
    assert cohen_kappa(a, b2) < -0.99
    # textbook example (Cohen): 2 classes, po=0.7, pe=0.5 -> 0.4
    a = ['x'] * 20 + ['x'] * 5 + ['y'] * 10 + ['y'] * 15
    b = ['x'] * 20 + ['y'] * 5 + ['x'] * 10 + ['y'] * 15
    assert abs(cohen_kappa(a, b, classes=['x', 'y']) - 0.4) < 1e-9, cohen_kappa(a, b, classes=['x', 'y'])
    bt = bradley_terry(['a', 'b', 'c'], [('b', 'a', 1)] * 8 + [('a', 'b', 1)] * 2 + [('c', 'b', 1)] * 6 + [('b', 'c', 1)] * 4)
    assert bt['b'] > bt['a'] and bt['c'] > bt['b'], bt
    assert abs(binom_two_sided(5, 10) - 1.0) < 1e-9 and binom_two_sided(10, 10) < 0.002
    # synthetic end-to-end: fake key + 2 raters
    key = {'pairs': {}, 'repeats': ['P1']}
    for i in range(1, 9):
        key['pairs'][f'P{i}'] = {'id': f'P{i}', 'kind': 'main', 'family': 'density' if i <= 3 else 'f', 'device': 'desk',
                                 'x': {'label': ['d1', 'd1', 'd15'][i - 1] if i <= 3 else 'a', 'img': f'x{i}'},
                                 'y': {'label': ['d2', 'd15', 'd2'][i - 1] if i <= 3 else 'b', 'img': f'y{i}'}}
    key['pairs']['G1'] = {'id': 'G1', 'kind': 'gold', 'family': 'gold_blur', 'device': 'desk', 'expect': 'x', 'x': {'label': 'c', 'img': 'gx'}, 'y': {'label': 'd', 'img': 'gy'}}
    key['pairs']['N1'] = {'id': 'N1', 'kind': 'null', 'family': 'identical', 'device': 'desk', 'expect': 'same', 'x': {'label': 'c', 'img': 'nx'}, 'y': {'label': 'c2', 'img': 'ny'}}
    truth = {f'P{i}': ('y' if i % 2 else 'x') for i in range(1, 9)}
    def mk(name, flip=0.0, seed=0):
        r = random.Random(seed); ans = []
        for j, pid in enumerate(list(key['pairs']) + ['P1']):
            p = key['pairs'][pid]
            want = p.get('expect') if p['kind'] != 'main' else truth[pid]
            if p['kind'] == 'main' and r.random() < flip: want = 'x' if want == 'y' else 'y'
            left_is_x = r.random() < 0.5
            L, R = (p['x']['img'], p['y']['img']) if left_is_x else (p['y']['img'], p['x']['img'])
            if want == 'same': v, ch = 0, None
            else:
                img = p[want]['img']; v = (-2 if img == L else 2); ch = img
            ans.append({'i': j, 'pair': pid, 'rep': 1 if j >= len(key['pairs']) else 0, 'left': L, 'right': R, 'v': v,
                        'choice': ch, 'strength': abs(v), 'rt_ms': 6000 + r.randrange(4000), 'view': 'sbs', 'native': False, 'flips': 0, 'why': ['detail']})
        return {'format': 'orbkin-ab-picks-v1', 'rater': name, 'role': 'owner', 'answers': ans, 'plan': ans, '_file': name}
    raters = [mk('r1', 0.0, 1), mk('r2', 0.0, 2)]
    qc = [rater_qc(d, key) for d in raters]
    assert all(q['accepted'] for q in qc), qc
    hv = human_verdicts(raters, key)
    opus = {pid: {'verdict': v, 'x_share': 0.0 if v == 'y' else 1.0} for pid, v in truth.items()}
    agr = agreement(hv, opus, key)
    assert agr['kappa'] == 1.0 and not agr['contradictions'], agr
    opus_bad = dict(opus); opus_bad['P4'] = {'verdict': 'y', 'x_share': 0.0}
    agr2 = agreement(hv, opus_bad, key)
    assert agr2['contradictions'] == ['P4'] and agr2['kappa'] < 1
    dens = density_bt(raters, key)
    hs = dens['desk']['human_log_strength']  # synthetic truth: d2 > d1 (P1), d1 > d15 (P2), d2 > d15 (P3)
    assert hs['d2'] > hs['d1'] > hs['d15'], dens
    print('selftest ok:', {'kappa': agr['kappa'], 'kappa_with_1_flip': agr2['kappa'], 'density': hs})


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('picks', nargs='*')
    ap.add_argument('--key'); ap.add_argument('--opus'); ap.add_argument('--opus-votes'); ap.add_argument('--out')
    ap.add_argument('--trust'); ap.add_argument('--anchors'); ap.add_argument('--no-anchors', action='store_true'); ap.add_argument('--sealed')
    ap.add_argument('--selftest', action='store_true')
    a = ap.parse_args()
    if a.selftest: selftest()
    else:
        if not a.key or not a.picks: ap.error('need --key and at least one picks file')
        run(a)
