#!/usr/bin/env python3
"""artgate_compare.py - calibrated DEFECT FLOOR: candidate frame vs the last ACCEPTED frame. Free, ~2 s.

  python3 -I artgate_compare.py CANDIDATE.png BASELINE.png [--clean-cand C.png --clean-base B.png]
                               [--mask x0,y0,x1,y1 ...] [--mask none] [--strict] [--out floor.json]
                               [--role target|control] [--expect FAIL|pass] [--run RUN]

What it is: a floor / regression detector calibrated on 63 real round-to-round changes of Orbkin frames,
the reference and 15 synthetic degradations (judge-calibration.md section 3.5). It catches flattened
values, blur and heavy desaturation with zero false alarms on the real changes (in-sample). It is NOT a
quality score and the numbers are NOT targets: exceeding a floor earns nothing, and "more edge energy"
is satisfied by noise. Quality decisions belong to visual_judge.py (pairwise).

Rules (FAIL unless noted): value_range_p5_p95 >= 55, squint_value_std >= 12, hf_ratio >= 0.30;
drops vs baseline: value range > 10, squint std > 5, hf_ratio > 0.12; colourfulness drop > 20 = WARN.
Calibrated on 16:9 desktop frames. On portrait (phone) frames the same rules run but are reported as WARN
unless --strict, because the portrait floors are not calibrated yet.

Default mask = battle HUD layout (16:9): top-left HUD, right HUD + buttons, bottom dialog band, top-right.
Pass --mask none for non-battle screens, or your own boxes (fractions or pixels of the candidate).
Exit codes: 0 pass (warnings allowed), 1 a FAIL rule fired, 2 bad input. Prints one JSON object.
Cost 0; 2-9 s on the loaded cloud box. The JSON carries "provenance" (sha256 of both frames, RUN-relative paths,
seconds) and, with --role control --expect FAIL|pass, a "control" block saying whether the floor did what a
synthetic degradation should make it do (report.sh lists those under "Instrument checks").
"""
import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import artgate  # noqa: E402
import judgelib as J  # noqa: E402

DEFAULT_MASK = ['0,0,0.28,0.13', '0.67,0.6,1,1', '0,0.83,1,1', '0.86,0,1,0.07']
# absolute floors: every real Orbkin battle frame and the reference pass; the listed degradations fail
FLOORS = {
    'value_range_p5_p95': (55.0, 'FAIL', 'value range collapsed (fog/flat grade); real min 61.3, ref 80.4, flattened 46.2'),
    'squint_value_std': (12.0, 'FAIL', 'no big value masses at a squint; real min 13.5, ref 19.3, flattened 10.6'),
    'hf_ratio': (0.30, 'FAIL', 'frame is soft/blurred; real min 0.35, ref 0.34, blurred 0.23'),
}
# relative drops vs the baseline frame (same shot, same camera)
DROPS = {
    'value_range_p5_p95': (10.0, 'FAIL', 'value range dropped; worst real change -2.5, flatten -33.7'),
    'squint_value_std': (5.0, 'FAIL', 'big-mass contrast dropped; worst real change -3.7, flatten -7.8'),
    'hf_ratio': (0.12, 'FAIL', 'crispness dropped; worst real change -0.10, blur -0.19'),
    'colorfulness_hasler': (20.0, 'WARN', 'colour drained; real p5 -15.8 (one screen redesign -36.8), desaturate -29.5'),
}
REPORT_KEYS = ('value_range_p5_p95', 'squint_value_std', 'hf_ratio', 'colorfulness_hasler',
               'edge_energy_mean', 'detail_cv', 'delta_bstar_rel', 'notan_dominant', 'near_black_share')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('candidate')
    ap.add_argument('baseline')
    ap.add_argument('--clean-cand')
    ap.add_argument('--clean-base')
    ap.add_argument('--mask', nargs='*', default=None, help='boxes, or "none"')
    ap.add_argument('--strict', action='store_true', help='portrait frames: FAIL rules fail (default: WARN, uncalibrated)')
    ap.add_argument('--out')
    ap.add_argument('--json', action='store_true', help='(kept for compatibility; output is always JSON)')
    J.add_role_args(ap)
    a = ap.parse_args()
    T0 = time.time(); RUN = J.run_dir_of(a.out, a.run)
    mask = DEFAULT_MASK if a.mask is None else ([] if a.mask == ['none'] else a.mask)
    try:
        c = artgate.measure(a.clean_cand or a.candidate, [], mask)
        b = artgate.measure(a.clean_base or a.baseline, [], mask)
    except (OSError, ValueError) as e:
        print(f'error: {e}', file=sys.stderr)
        sys.exit(2)
    portrait = c['size'][1] > c['size'][0]
    downgrade = portrait and not a.strict
    findings = []
    for k, (lo, sev, why) in FLOORS.items():
        if c[k] < lo:
            findings.append({'rule': f'{k} >= {lo}', 'value': c[k], 'severity': 'WARN' if downgrade else sev, 'why': why})
    for k, (d, sev, why) in DROPS.items():
        if b[k] - c[k] > d:
            findings.append({'rule': f'{k} drop <= {d}', 'delta': round(c[k] - b[k], 3),
                             'severity': 'WARN' if (downgrade and sev == 'FAIL') else sev, 'why': why})
    out = {'candidate': a.candidate, 'baseline': a.baseline, 'size': c['size'],
           'calibrated_view': not portrait, 'findings': findings,
           'pass': not any(f['severity'] == 'FAIL' for f in findings),
           'deltas': {k: round(c[k] - b[k], 3) for k in REPORT_KEYS if isinstance(c.get(k), (int, float)) and isinstance(b.get(k), (int, float))},
           'note': 'floors, not targets: do not try to raise these numbers'}
    if downgrade and findings:
        out['note'] = 'portrait frame: floors uncalibrated, reported as WARN (use --strict to fail); ' + out['note']
    out['decision'] = 'pass' if out['pass'] else 'FAIL'
    out['role'] = a.role; out['expect'] = a.expect
    inputs = {'candidate': a.candidate, 'baseline': a.baseline}
    if a.clean_cand: inputs['clean_cand'] = a.clean_cand
    if a.clean_base: inputs['clean_base'] = a.clean_base
    out['provenance'] = J.provenance(inputs, RUN, T0, 0.0, None, None, a.role, a.expect, 'artgate_compare.py')
    out['control'] = J.control_outcome(a.role, a.expect, out['decision'])
    J.write_result(out, a.out)
    sys.exit(0 if out['pass'] else 1)


if __name__ == '__main__':
    main()
