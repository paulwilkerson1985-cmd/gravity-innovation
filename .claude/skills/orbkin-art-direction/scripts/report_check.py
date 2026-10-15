#!/usr/bin/env python3
"""report_check.py - refuse an art-direction report that is not finished.

The pilot's gate2/report.md shipped with empty "Still weak", "Not verified" and "Files changed" sections and
"none queued" although a 10-trial owner kit existed (built outside $RUN/kit). This script is the last step of
S6: it reads the gate report (report.sh output) and the art-direction sections appended to it, and exits 1
with a list of what is missing. The report is not done until it passes.

Run isolated:
  python3 -I report_check.py RUN_DIR/report.md [--run RUN_DIR] [--kit-expected] [--json]
Checks (each named in the output):
  sections      the report has these headings, each with at least one non-empty, non-placeholder line:
                "Criteria triage", "Critique", "Change", "Prediction", "Gate", "Craft check", "Still weak"
                (>= 2 numbered items), "Owner batch", "Not verified" / "Not measurable", "Files changed"
                (or the literal "none" with a reason).
  owner_kit     when the report says "none queued" but a kit/key.json exists anywhere under --run or beside
                it, or --kit-expected was passed (human-gated family), that is a failure: build the kit at
                $RUN/kit and re-run report.sh.
  prediction    the Prediction section quotes verdict_risk.py's `predicted` line per view (desk AND phone for
                arena work) and does not contain "UNPROVEN".
  gate_hash     the Gate section records the gate skill's hash + dirty flag per round.
  verdict_words the report never claims "better"/"improved"/"accepted" in prose unless a verdict row says
                `better` (quotes the decision words); unsealed runs never say ACCEPTED.
Exit 0 pass, 1 fail (list printed), 2 bad input.
"""
import argparse
import glob
import json
import os
import re
import sys

REQUIRED = {
    'Criteria triage': 1, 'Critique': 1, 'Change': 1, 'Prediction': 1, 'Gate': 1, 'Craft check': 1,
    'Still weak': 2, 'Owner batch': 1, 'Not verified': 1, 'Files changed': 1,
}
PLACEHOLDER = re.compile(r'^\s*(?:[-*]|\d+\.)?\s*$')


def sections(md):
    out = {}
    cur = None
    for line in md.splitlines():
        m = re.match(r'^#{1,4}\s+(.*)', line)
        if m:
            cur = m.group(1).strip()
            out[cur] = []
        elif cur is not None:
            out[cur].append(line)
    return out


def find(secs, name):
    for k, v in secs.items():
        if k.lower().startswith(name.lower()) or name.lower() in k.lower():
            return k, v
    return None, None


def content_lines(lines):
    return [l for l in lines if l.strip() and not PLACEHOLDER.match(l) and not l.strip().startswith('|---')]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('report')
    ap.add_argument('--run', help='run dir (default: the report\'s directory)')
    ap.add_argument('--kit-expected', action='store_true', help='the change is in a human-gated family: a kit must be queued')
    ap.add_argument('--json', action='store_true')
    a = ap.parse_args()
    try:
        with open(a.report) as f:
            md = f.read()
    except OSError as ex:
        print(f'error: {ex}', file=sys.stderr)
        sys.exit(2)
    run = a.run or os.path.dirname(os.path.abspath(a.report))
    secs = sections(md)
    fails, notes = [], []
    for name, need in REQUIRED.items():
        k, v = find(secs, name)
        if name == 'Not verified' and k is None:
            k, v = find(secs, 'Not measurable')
        if k is None:
            fails.append(f'section missing: "{name}"')
            continue
        lines = content_lines(v)
        if name == 'Still weak':
            items = [l for l in lines if re.match(r'^\s*\d+\.\s*\S', l)]
            if len(items) < need:
                fails.append(f'"{k}" needs at least {need} numbered items with text (has {len(items)})')
        elif len(lines) < need:
            fails.append(f'"{k}" is empty')
        if name == 'Files changed' and lines and all(re.fullmatch(r'\s*-?\s*none\s*', l.lower()) for l in lines):
            fails.append('"Files changed" says only "none": name the files or say "none (critique only), reason"')
    # owner kit
    k, v = find(secs, 'Owner batch')
    body = '\n'.join(v or [])
    kits = glob.glob(os.path.join(run, '**', 'key.json'), recursive=True) + glob.glob(os.path.join(os.path.dirname(run.rstrip('/')), '*', 'kit', 'key.json'))
    if 'none queued' in body.lower():
        if kits:
            fails.append(f'report says "none queued" but a kit exists: {kits[0]} (build it at $RUN/kit so report.sh sees it, then report.sh --force)')
        elif a.kit_expected:
            fails.append('human-gated family but no owner kit queued (owner_kit.py $RUN/kit --from-verdicts $RUN --family <f> --inline)')
    # prediction
    k, v = find(secs, 'Prediction')
    body = '\n'.join(v or [])
    if k is not None:
        if 'UNPROVEN' in body:
            fails.append('Prediction contains UNPROVEN: run critique.py --arena/--layout on both frames so verdict_risk.py can evaluate the protected signatures')
        if 'predicted' not in body.lower():
            fails.append('Prediction does not quote verdict_risk.py\'s `predicted` line')
        views = [w for w in ('desk', 'phone') if w in body.lower()]
        if len(views) < 2:
            notes.append(f'Prediction names only {views or "no"} view(s); arena work needs desk AND phone')
    # gate hash
    k, v = find(secs, 'Gate')
    body = '\n'.join(v or [])
    if k is not None and not re.search(r'\b[0-9a-f]{7,40}\b', body):
        fails.append('Gate section records no gate-skill hash (git log -1 --format=%h -- .claude/skills/orbkin-visual-gate + dirty flag)')
    # verdict words
    low = md.lower()
    table_better = re.search(r'\|\s*\*{0,2}better\*{0,2}\s*\|', low) is not None
    if re.search(r'\b(looks better|is better|improved|improvement achieved|accepted)\b', low) and not table_better:
        if 'not accepted' not in low or re.search(r'\b(looks better|is better|improved)\b', low):
            fails.append('prose claims better/improved/accepted but no verdict row says `better`; quote the decision words only')
    if 'unsealed' in low and re.search(r'\baccepted\b(?! *\()', low) and 'not accepted' not in low and 'never accept' not in low:
        fails.append('unsealed run must not say ACCEPTED')
    out = {'report': a.report, 'verdict': 'FAIL' if fails else 'PASS', 'fails': fails, 'notes': notes, 'kits_found': kits}
    print(json.dumps(out, indent=1 if a.json else None))
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
