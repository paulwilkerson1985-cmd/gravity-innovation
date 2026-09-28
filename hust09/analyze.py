import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""Convert 3D near/far energies into the HUST-09 G bias and excluded v^2.
delta G/G = Delta K_phi / Delta K_g,  Delta K_phi = Delta K' * v^2 * (1/mu),  Delta K' = -4 (E_near - E_far)  [v^2/mu units]
Delta K_g = I * Delta(omega^2) = 4.5057e-5 kg m^2 * 1.682245e-6 s^-2 = 7.580e-11 N m/rad (Tu 2010 / Luo 2009)."""
import json, numpy as np
DKg = 4.5057e-5 * 1.682245e-6
rows = [json.loads(l) for l in open((_GI + '/hust09/m3d_results.jsonl'))]
def pick(hf, zd, gap, imu, key):
    c = [r for r in rows if r['hf'] == hf and r['zd'] == zd and r.get('gap', 2.0) == gap and r['imu'] == imu and key in r]
    if key == 'dKp0':
        c = [r for r in c if r['near0']['res'] < 1e-10 and r['far0']['res'] < 1e-10]
    return c[-1][key] if c else None
print('Delta K_g = %.4e N m/rad;  26 ppm <-> %.2e N m/rad' % (DKg, 26e-6 * DKg))
print('\nNOMINAL (h=1.5 mm, zd=200, gap=2):')
print(' 1/mu[cm]  dK\'(shield)   dK\'(no shield)  suppr.   dG/G per v^2[1/N]   v2_excl(26ppm)  (50ppm)   (300ppm)   free: v2(26ppm)')
tab = {}
for imu in [15., 20., 30., 40., 50., 60.]:
    d = pick(1.5, 200.0, 2.0, imu, 'dKp'); d0 = pick(1.5, 200.0, 2.0, imu, 'dKp0')
    if d is None: continue
    c = d * imu * 1e-3 / DKg
    c0 = d0 * imu * 1e-3 / DKg if d0 else np.nan
    tab[imu] = c
    print('  %4.1f    %.3e     %s     %s   %.3e        %.2e       %.2e   %.2e     %s' %
          (imu / 10, d, '%.3e' % d0 if d0 else '   --    ', '%.1e' % (d / d0) if d0 else '  --  ', c, 26e-6 / c, 50e-6 / c,
           300e-6 / c, '%.1e' % (26e-6 / c0) if d0 else '--'))
print('\nSensitivity runs (dK\' shielded):')
for (hf, zd, gap) in [(2.0, 200., 2.), (1.0, 200., 2.), (1.5, 150., 2.), (1.5, 250., 2.), (1.5, 200., 6.), (1.5, 200., 12.)]:
    for imu in [20., 40., 50., 60.]:
        d = pick(hf, zd, gap, imu, 'dKp')
        if d is None: continue
        dn = pick(1.5, 200.0, 2.0, imu, 'dKp')
        print('  h=%.1f zd=%.0f gap=%.0f 1/mu=%.0f mm: dK\' = %.3e  (ratio to nominal %s)' %
              (hf, zd, gap, imu, d, '%.2f' % (d / dn) if dn else 'n/a'))

print('\nBEST ESTIMATE (h=1.5 value x 0.80 continuum correction from h=2.0/1.5/1.0 trend; nominal zd=200, gap=2):')
print(' 1/mu[cm]   dK\'_best    dG/G per v^2 [1/N]   v2_excl: 26 ppm    50 ppm     300 ppm')
for imu in [15., 20., 30., 40., 50., 60., 80.]:
    d = pick(1.5, 200.0, 2.0, imu, 'dKp')
    if d is None:
        print('  %4.1f     no condensation (chamber threshold 1/mu_c = 5.1-6.6 cm) -> no constraint' % (imu / 10)); continue
    d *= 0.80; c = d * imu * 1e-3 / DKg
    print('  %4.1f     %.2e      %.3e             %.1e          %.1e    %.1e' % (imu / 10, d, c, 26e-6 / c, 50e-6 / c, 300e-6 / c))
