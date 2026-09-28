import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""
Build finite-omega TRACE-channel tables sigma_tr(E_f, E_i) for nn and np with realistic potentials
(AV18, Reid93, NijmII), all partial waves up to J=4 (incl. coupled channels), using pw_solver.Channel.

Output (npz per potential):  E grid [MeV, cm], H[sys](E_f,E_i) = sum_ch (2J+1) sum_ab |Itilde_ab|^2  [fm^-2]
so that  sigma_tr(E_f,E_i) = w pi H /(k_i k_f)^2  [fm^2],  w=2 (nn), 1 (np);
plus soft[sys](E) = w pi sum (2J+1) (1/4) Tr|dS/dk|^2  (omega->0 theorem from the same potential)
and el[sys](E) = elastic sigma from the potential (half-sphere convention for nn).
Also prints the diagonal check  sigma_tr(E,E)/sigma_tr_soft(E)  (should be 1: exact identity <-> Wigner time delay).
"""
import numpy as np, sys, time
import pw_solver as ps

EG = np.concatenate([np.linspace(0.5, 20, 14), np.linspace(24, 180, 40), np.linspace(190, 460, 28)])


def build(pot, rmax=16.0, h=0.004):
    out = {'E': EG}
    for system in ('nn', 'np'):
        w = 2.0 if system == 'nn' else 1.0
        H = 0; soft = 0; el = 0
        t = time.time()
        for ch in ps.SYSTEMS[system]:
            name, l, S, J, T, coupled = ch
            c = ps.Channel(pot, ch, system, EG, rmax=rmax, h=h)
            I, G = c.trace_matrix()
            H = H + (2 * J + 1) * np.sum(I ** 2, axis=(2, 3))
            soft = soft + (2 * J + 1) * c.trace_softlimit()
            el = el + (2 * J + 1) * np.pi / c.k ** 2 * 0.25 * np.sum(np.abs(c.S - np.eye(c.nc)[None]) ** 2, axis=(1, 2))
        k = np.sqrt(ps.U_FAC * EG)
        out[f'H_{system}'] = H
        out[f'soft_{system}'] = w * np.pi * soft
        out[f'el_{system}'] = w * el
        out[f'sigtr_{system}'] = w * np.pi * H / np.outer(k, k) ** 2   # [f, i]
        print(f'{pot} {system}: built in {time.time()-t:.1f}s', flush=True)
    return out


if __name__ == '__main__':
    args = sys.argv[1:]
    suffix = ''
    if args and args[0] == '--nucleon':
        ps.W_MODE = 'nucleon'; suffix = '_nucleonOnly'; args = args[1:]
    pots = args or ['AV18', 'Reid93', 'NijmII']
    for pot in pots:
        o = build(pot)
        np.savez((_GI + f'/supernova/sn_deep/trace_{pot}{suffix}.npz'), **o)
        k = np.sqrt(ps.U_FAC * EG)
        print(f'\n{pot}: diagonal check sigma_tr(E,E)/soft(E), and c_tr^2 = soft/sigma_el, mb')
        print('  E_cm  T_lab |  nn: diag/soft  soft[mb] el[mb] c2 |  np: diag/soft  soft[mb] el[mb] c2')
        for i, E in enumerate(EG):
            if E not in (2.5, 5, 12.5, 25, 50, 75, 100, 150, 175, 250, 350, 450) and i % 6:
                continue
            row = f'{E:6.1f} {2*E:6.0f} |'
            for s in ('nn', 'np'):
                d = o[f'sigtr_{s}'][i, i]; sf = o[f'soft_{s}'][i]; e = o[f'el_{s}'][i]
                row += f'  {d/sf:8.3f}  {sf*10:8.2f} {e*10:8.2f} {sf/e:5.2f} |'
            print(row)
