"""Deterministic check of the trapped/semi-trapped regime: steady-state diffusion of the phi energy density
   -(1/r^2) d/dr [ r^2 D du/dr ] + Gamma u = Q ,   D = c lambda/3 (flux-limited: D -> c lambda/(3 + lambda |u'|/u)),
   Gamma = Q/u_BB (detailed balance), Marshak boundary -D u' = c u/2 at r_max.  No spectral degradation
   (so f_esc here is an upper estimate at moderate tau; the MC in transport_mc.py includes degradation).
Gives L_esc(M) down to M ~ 1 TeV, i.e. the lower edge of the excluded band."""
import numpy as np, sys
from transport_mc import Star, C_CM, KM
from scipy.linalg import solve_banded


def solve(star, M_TeV, n_iter=30):
    r = star.r.copy(); r[0] = 1e-3 * KM
    n = len(r); h = r[1] - r[0]
    sig = star.sigma_cm2(M_TeV)
    lam = 1.0 / (star.nB * sig + 1e-300)
    Q = star.Q / M_TeV ** 4
    Gam = Q / star.uBB
    u = np.zeros(n)
    for it in range(n_iter):
        # flux limiter
        if it == 0:
            D = C_CM * lam / 3
        else:
            up = np.gradient(u, r)
            D = C_CM * lam / (3 + lam * np.abs(up) / np.maximum(u, 1e-300))
        Dh = 0.5 * (D[1:] + D[:-1]); rh = 0.5 * (r[1:] + r[:-1])
        A = np.zeros((3, n)); b = Q.copy()
        for i in range(n):
            if i == 0:
                # u'(0)=0: (r^2 D u')' ~ (rh0^2 Dh0 (u1-u0)/h)/ (r0^2 h)
                c1 = rh[0] ** 2 * Dh[0] / (r[0] ** 2 * h * h)
                A[1, 0] = c1 + Gam[0]; A[0, 1] = -c1
            elif i == n - 1:
                # Marshak: -D u' = c u /2 at outer face
                cm = rh[-1] ** 2 * Dh[-1] / (r[-1] ** 2 * h * h)
                A[1, i] = cm + Gam[i] + C_CM / (2 * h); A[2, i - 1] = -cm
            else:
                cm = rh[i - 1] ** 2 * Dh[i - 1] / (r[i] ** 2 * h * h); cp = rh[i] ** 2 * Dh[i] / (r[i] ** 2 * h * h)
                A[1, i] = cm + cp + Gam[i]; A[2, i - 1] = -cm; A[0, i + 1] = -cp
        unew = solve_banded((1, 1), A, b)
        if it > 0 and np.max(np.abs(unew - u) / np.maximum(unew, 1e-300)) < 1e-4:
            u = unew; break
        u = unew
    dV = 4 * np.pi * r ** 2 * h
    Lprod = np.sum(Q * dV); Labs = np.sum(Gam * u * dV)
    Lesc = 4 * np.pi * r[-1] ** 2 * C_CM * u[-1] / 2
    return dict(Lprod=Lprod, Labs=Labs, Lesc=Lesc, f_esc=Lesc / Lprod, u_over_uBB_center=u[0] / star.uBB[0],
                u_over_uBB_peak=(u / star.uBB)[np.argmax(star.T)])


if __name__ == '__main__':
    print('Deterministic diffusion (no spectral degradation).  L in erg/s.')
    for name in ('cold', 'hot'):
        for Y0 in (0.0, 0.01):
            st = Star(name, Y0=Y0)
            print(f'\n{name}, Y_pi(37)={Y0}:  L_prod(1 TeV) = {st.L_NN + st.L_pi:.2e}')
            print('   M[TeV]  tau_c   f_esc  L_abs/L_prod  u/uBB(center) u/uBB(T-peak) | L_esc/3e52')
            for M in (1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0, 6.0, 8.0, 10.0):
                o = solve(st, M)
                print(f'   {M:4.1f}  {st.tau_center(M):6.1f}  {o["f_esc"]:6.3f}   {o["Labs"]/o["Lprod"]:6.3f}     '
                      f'{o["u_over_uBB_center"]:7.3f}      {o["u_over_uBB_peak"]:7.3f}    | {o["Lesc"]/3e52:8.3f}')
