import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""U4: map foil thickness -> switch residual across the wedge; minimum Cu/Al thickness for >=99% (|res|<=1e-2) and
>=99.99% (|res|<=1e-4) suppression.  Inputs (h=0.05, benchmark geometry scaled with 1/mu):
   u3_robin_h0.05.json  : residual vs kappa (zero-thickness Robin foils)          -> used for m t <= 0.3
   u3_slab_h0.05.json   : residual vs (m, m t) (two-port thick slab)              -> used for m t >= 0.3
   u3b_corner_h0.05.json: correction for the pinned corner rings of slab-mode cans (C(kappa_eff))
 holed cans: R = R_closed(m, mt) + floor(m), floor = hole leakage at mt=8 (h=0.05; ~15-40% low vs finer grids).
 kappa_eff = 2 m tanh(m t / 2) (symmetric pinning of a slab), m = m_in/mu = sqrt(rho/rho_crit - 1)."""
import sys, json, numpy as np
sys.path.insert(0, (_GI + '/solver/upgrade'))
import units as U

rob = json.load(open('u3_robin_h0.05.json'))['data']
slb = json.load(open('u3_slab_h0.05.json'))['data']
cor = json.load(open('u3b_corner_h0.05.json'))
KS = np.array([1, 3, 10, 30, 100, 300, 1000, 3000, 10000.])
MS = np.array([25, 50, 100, 200, 400, 800, 1600.]); MTS = np.array([0.3, 1, 2, 3, 5, 8.])


def robin(conf, k):
    y = np.array([rob[conf]['%s' % (int(x) if x < 1000 else float(x))] if ('%s' % (int(x) if x < 1000 else float(x))) in rob[conf]
                  else rob[conf][str(x)] for x in KS])
    return y


def _rob(conf):
    d = rob[conf]; out = []
    for x in KS:
        for key in (str(int(x)), str(float(x)), '%g' % x):
            if key in d:
                out.append(d[key]); break
    return np.array(out)


ROB = {c: _rob(c) for c in rob}
CORR = np.array([cor[k][0] / cor[k][1] for k in sorted(cor, key=float)])
CK = np.array(sorted(float(k) for k in cor))


def interp_loglog(x, xs, ys):
    """log-log interpolation of positive ys; linear extrapolation in log space at the ends."""
    lx, ly = np.log(xs), np.log(np.abs(ys))
    i = np.clip(np.searchsorted(lx, np.log(x)) - 1, 0, len(xs) - 2)
    w = (np.log(x) - lx[i]) / (lx[i + 1] - lx[i])
    return np.exp(ly[i] + w * (ly[i + 1] - ly[i]))


def R_robin(conf, k):
    return interp_loglog(max(k, 1.0), KS, ROB[conf]) if k >= 1 else 1.0


def corner_C(k):
    return float(np.exp(np.interp(np.log(max(k, 1)), np.log(CK), np.log(CORR))))


def slab_grid(conf, corrected):
    G = np.zeros((len(MS), len(MTS)))
    for i, m in enumerate(MS):
        for j, mt in enumerate(MTS):
            v = slb[conf]['%g,%g' % (m, mt)]
            if corrected:
                v *= corner_C(2 * m * np.tanh(mt / 2))
            G[i, j] = v
    return G


SL = {'can0': slab_grid('can0', True), 'pairW2': slab_grid('pairW2', False), 'pairW1': slab_grid('pairW1', False)}
FLOOR = {c: np.array([slb[c]['%g,8' % m] - slb['can0']['%g,8' % m] for m in MS]) for c in ('can1', 'can2')}


def R_slab(conf, m, mt):
    Gd = SL[conf]
    lm = np.log(m); lms = np.log(MS)
    i = int(np.clip(np.searchsorted(lms, lm) - 1, 0, len(MS) - 2)); wi = (lm - lms[i]) / (lms[i + 1] - lms[i])
    j = int(np.clip(np.searchsorted(MTS, mt) - 1, 0, len(MTS) - 2)); wj = (mt - MTS[j]) / (MTS[j + 1] - MTS[j])
    L = np.log(np.abs(Gd))
    v = (1 - wi) * ((1 - wj) * L[i, j] + wj * L[i, j + 1]) + wi * ((1 - wj) * L[i + 1, j] + wj * L[i + 1, j + 1])
    return np.exp(v)


def residual(conf, m, t_mu):
    """signed residual for configuration conf with slab (m, t) in units of mu."""
    mt = m * t_mu
    base = 'can0' if conf.startswith('can') else conf
    if mt <= 0.3:
        r = R_robin(base, 2 * m * np.tanh(mt / 2))
    else:
        r = R_slab(base, m, min(mt, 8.0)) if mt <= 8 else R_slab(base, m, 8.0) * (np.exp(-2 * (mt - 8)) if base == 'can0' else 1)
    if conf in FLOOR:
        r = r + float(np.exp(np.interp(np.log(m), np.log(MS), np.log(np.abs(FLOOR[conf]))))) * np.sign(FLOOR[conf][0])
    return r


def t_min(conf, m, Linv_cm, target):
    ts = np.logspace(-8, -1.3, 1500)                    # metres: 10 nm .. 5 cm
    rs = np.array([residual(conf, m, U.mu_t(t, Linv_cm)) for t in ts])
    ok = np.abs(rs) <= target
    if not ok[-1]:
        return np.inf
    bad = np.where(~ok)[0]
    return ts[0] if len(bad) == 0 else ts[bad[-1] + 1]


def wedge_label(M, L):
    """yes: 15 TeV <= M <= M_max(1/mu); edge: M within 3% above the air-pinning M_max; SN-cons: 5 <= M < 15 TeV
    (allowed only if the SN1987A bound relaxes to the conservative ~5-7 TeV floor); no: M > 1.03 M_max."""
    Mx = U.M_max_TeV(L)
    if M > 1.03 * Mx:
        return 'no'
    if M < 15:
        return 'SN-cons'
    return 'yes' if M <= Mx else 'edge'


def fmt_t(t):
    if not np.isfinite(t):
        return 'never'
    return '%.2g um' % (t * 1e6) if t < 1e-3 else '%.2g mm' % (t * 1e3)


if __name__ == '__main__':
    print('=== residual vs kappa/mu (Robin foils, h=0.05; h=0.025 agrees to 1-2% for the through-foil part) ===')
    print('%-8s ' % 'kappa/mu' + ' '.join('%-10s' % c for c in ['pairW1', 'pairW2', 'can0', 'can1(1cm)', 'can2(2cm)']))
    for k in [10, 100, 1000, 10000]:
        print('%-8g ' % k + ' '.join('%+.2e ' % R_robin(c, k) for c in ['pairW1', 'pairW2', 'can0', 'can1', 'can2']))
    print('\n=== kappa/mu -> physical thickness (thin-sheet t = kappa t*, valid while kappa << 2 m_in/mu; '
          'symmetric-pinning thickness t = (2/m) artanh(kappa/2m) else "unreachable") ===')
    pts = [(L, M) for L in (4, 10, 15) for M in (5, 15, 36, 55)]
    for mat in ('Cu', 'Al'):
        rho = U.RHO[mat]
        print('-- %s (rho=%.2f g/cc)' % (mat, rho))
        print('   %-11s %-6s %-9s %-9s ' % ('(1/mu,M)', 'wedge', 't*', 'kmax/mu') + ' '.join('%-12s' % ('k=%g' % k) for k in (10, 100, 1e3, 1e4)))
        for L, M in pts:
            m = U.m_in_over_mu(rho, M, L)
            wedge = wedge_label(M, L)
            cells = []
            for k in (10, 100, 1e3, 1e4):
                if k < 2 * m:
                    t = 2 / m * np.arctanh(k / (2 * m)) * L * 1e-2
                    cells.append(fmt_t(t))
                else:
                    cells.append('unreach.')
            print('   (%2d,%2d TeV) %-6s %-9s %-9.0f ' % (L, M, wedge, fmt_t(U.t_star_m(rho, M, L)), 2 * m) + ' '.join('%-12s' % c for c in cells))
    print('\n=== minimum foil thickness for >=99%% / >=99.99%% suppression (full thick-slab model) ===')
    confs = [('can0', 'closed can'), ('can1', 'can, 1 cm hole'), ('can2', 'can, 2 cm hole'), ('pairW2', 'foil pair W=20 cm'), ('pairW1', 'foil pair W=10 cm')]
    res = {}
    for mat in ('Cu', 'Al'):
        rho = U.RHO[mat]
        print('-- %s' % mat)
        print('   %-12s %-8s ' % ('(1/mu,M)', 'wedge') + ' '.join('%-22s' % n for _, n in confs))
        for L, M in pts:
            m = U.m_in_over_mu(rho, M, L)
            wedge = wedge_label(M, L)
            cells = []
            for c, _ in confs:
                a, b = t_min(c, m, L, 1e-2), t_min(c, m, L, 1e-4)
                res['%s,%d,%d,%s' % (mat, L, M, c)] = (a, b)
                cells.append('%s / %s' % (fmt_t(a), fmt_t(b)))
            print('   (%2d cm,%2d)  %-8s ' % (L, M, wedge) + ' '.join('%-22s' % x for x in cells) + '   [m_in/mu=%.0f%s]' % (m, ', extrap.' if m < 25 else ''))
    json.dump({k: [float(v[0]), float(v[1])] for k, v in res.items()}, open('u4_thickness_map.json', 'w'), indent=1)
