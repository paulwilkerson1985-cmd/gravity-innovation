"""
Exact (all orders in V, finite omega) monopole (K->0) pair-emission amplitude for NR two-nucleon
scattering with a universally scaling local potential (conformal coupling => V_A(r) = A V(A r)).
Scalar-charge operator S = sum(m - p^2/2m) + V + r.dV/dr, and between exact eigenstates with
E_f = E_i - omega:   <f|S|i> = <f| 2V + r V' |i>     (since -T = V - H and <f|i>=0).
Per partial wave: amplitude ratio to the on-shell T at E_i,
     c0_l = - e^{i delta_f} Int u_f (2U + r U') u_i dr / (k_f sin delta_i),   U = m V/(hbar c)^2,
with u -> sin(kr - l pi/2 + delta) real standing waves.  Born/contact limit gives c0 = -1.
Potentials: Reid68 soft-core 1S0; Malfliet-Tjon MT-III (1S0 and 3S1, central).
"""
import numpy as np
HBARC, MN = 197.3269804, 938.918
U_FAC = MN / HBARC ** 2   # MeV^-1 fm^-2 (2 mu/hbar^2 with mu = m/2)

def V_reid1S0(r):
    x = 0.7 * r
    return (-10.463 * np.exp(-x) - 1650.6 * np.exp(-4 * x) + 6484.2 * np.exp(-7 * x)) / x
def V_MT(r, VA):
    return (-VA * np.exp(-1.55 * r) + 1438.72 * np.exp(-3.11 * r)) / r
POTS = {'Reid68-1S0': V_reid1S0,
        'MT3-1S0': lambda r: V_MT(r, 513.968),
        'MT3-3S1': lambda r: V_MT(r, 626.885)}

def solve(Vfun, E, l=0, rmax=20.0, n=40001):
    """Numerov; returns r, u normalized to sin(kr - l pi/2 + delta), delta."""
    r = np.linspace(1e-6, rmax, n); h = r[1] - r[0]
    k = np.sqrt(E * U_FAC)
    Q = k ** 2 - l * (l + 1) / r ** 2 - U_FAC * Vfun(r)
    u = np.zeros(n); u[0] = r[0] ** (l + 1); u[1] = r[1] ** (l + 1)
    for i in range(1, n - 1):
        u[i + 1] = (2 * u[i] * (1 - 5 * h * h * Q[i] / 12) - u[i - 1] * (1 + h * h * Q[i - 1] / 12)) / (1 + h * h * Q[i + 1] / 12)
    # match at two points near rmax (potential negligible there for l=0)
    i1, i2 = n - 2001, n - 1
    r1, r2 = r[i1], r[i2]
    # u = A sin(kr - l pi/2) + B cos(kr - l pi/2)  (valid for l=0; for l>0 use Riccati functions - only l=0 here)
    M = np.array([[np.sin(k * r1), np.cos(k * r1)], [np.sin(k * r2), np.cos(k * r2)]])
    A, B = np.linalg.solve(M, [u[i1], u[i2]])
    delta = np.arctan2(B, A)
    amp = np.hypot(A, B)
    return r, u / amp * np.sign(np.cos(delta) * A + np.sin(delta) * B) , delta, k

def c0(Vfun, Ei, Ef):
    r, ui, di, ki = solve(Vfun, Ei)
    _, uf, df, kf = solve(Vfun, Ef)
    U = U_FAC * Vfun(r)
    dU = np.gradient(U, r)
    W = 2 * U + r * dU
    I = np.trapezoid(uf * W * ui, r)
    return -np.exp(1j * df) * I / (kf * np.sin(di)), np.degrees(di), np.degrees(df)

if __name__ == '__main__':
    for name, V in POTS.items():
        # phase-shift check vs PWA93 (Tlab = 2 Ecm)
        print(name, 'delta(Ecm=5,25,50,100 MeV) =', [round(np.degrees(solve(V, E)[2]) % 180, 1) for E in (5, 25, 50, 100)])
        for Ei in (30, 60, 100, 150):
            row = []
            for x in (0.2, 0.5, 0.8):
                c, di, df = c0(V, Ei, Ei * (1 - x))
                row.append(f"w/E={x}: |c0|={abs(c):.2f}")
            print(f"   Ei={Ei:4d} MeV  " + '  '.join(row))
