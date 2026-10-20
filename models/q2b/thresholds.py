"""Exclusion thresholds on A2/lam^2 from existing atom-interferometer data (axisymmetric model, near minus no-source)."""
import numpy as np, sys, json
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from dilaton_atoms import D_of, kinv_m, C2
lams = np.array([1e26, 2e26, 5e26, 1e27, 2e27, 3e27, 5e27, 7e27, 1e28, 1.5e28, 2.5e28])
cases = [('A: Rc=2.5cm,H=3.0cm (most conservative)', 0.025, 0.030),
         ('B: Rc=2.5cm,H=6.1cm (conservative)', 0.025, 0.061),
         ('C: Rc=6.1cm,H=6.1cm (Hamilton-2015-size)', 0.061, 0.061)]
bounds = {'Panda2024 (13 nm/s2, s=4mm)': (13e-9, 0.004), 'Jaffe2017 (50 nm/s2, s=5mm)': (50e-9, 0.005)}
out = {}
for name, Rc, Hc in cases:
    print('\n== chamber', name)
    Ds = {0.004: [], 0.005: []}
    for lam in lams:
        o, *_ = D_of(lam, Rc, Hc, [0.004, 0.005], h=2.5e-4)
        for s in Ds: Ds[s].append(o[s]['D'])
    for bname, (ab, s) in bounds.items():
        D = np.array(Ds[s]); thr = ab / (C2 * D)
        # crossing of thr with Tier-2 lower edge 1e-26 (log-log interpolation)
        lt, ld = np.log10(lams), np.log10(thr)
        cross = None
        for i in range(len(lams) - 1):
            if (ld[i] + 26) * (ld[i + 1] + 26) <= 0:
                cross = 10**(lt[i] + (-26 - ld[i]) * (lt[i + 1] - lt[i]) / (ld[i + 1] - ld[i])); break
        print('  %s: lambda_cross(thr=1e-26) = %s' % (bname, '%.2e' % cross if cross else 'none'))
        for lam, d, t in zip(lams, D, thr):
            print('     lam=%.1e 1/k=%6.2f cm  D=%.3e /m  thr A2/lam^2 > %.2e  -> A2 > %.2e' % (lam, kinv_m(lam) * 100, d, t, t * lam**2))
        out[name + ' | ' + bname] = dict(lams=lams.tolist(), D=D.tolist(), thr=thr.tolist(), cross=cross)
json.dump(out, open('thresholds.json', 'w'), indent=1)
