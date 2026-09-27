"""Exact (1D ODE, high-accuracy) reference for a single pinned sphere of radius a in
unbounded broken-phase vacuum:  phi'' + (2/r) phi' = -phi + phi^3,  phi(a)=0, phi(inf)=1.
Far field: delta = 1-phi -> Q exp(-sqrt2 r)/r.  Returns profile function and Q."""
import numpy as np
from scipy.integrate import solve_bvp
m = np.sqrt(2.0)

def sphere_profile(a, Rmax=14.0, n=4000):
    r = np.linspace(a, Rmax, n)
    y0 = np.vstack([1 - (a / r) * np.exp(-m * (r - a)), (a / r) * np.exp(-m * (r - a)) * (m + 1 / r)])
    def f(r, y):
        return np.vstack([y[1], -2 / r * y[1] - y[0] + y[0] ** 3])
    def bc(ya, yb):
        # Robin tail condition at Rmax: delta' = -(m + 1/r) delta, delta = 1-phi
        return np.array([ya[0], -yb[1] + (m + 1 / Rmax) * (1 - yb[0])])
    sol = solve_bvp(f, bc, r, y0, tol=1e-10, max_nodes=200000)
    assert sol.success, sol.message
    rr = np.linspace(6, 10, 50)
    Q = np.median((1 - sol.sol(rr)[0]) * rr * np.exp(m * rr))
    return sol, Q

def linear_Q(a):
    """Linearized (Yukawa, mass sqrt2) Dirichlet sphere: delta = a e^{-m(r-a)}/r."""
    return a * np.exp(m * a)

def F_asym(D, Q1, Q2):
    """Large-separation force between two bodies with tail charges Q1,Q2 (units v^2)."""
    return 4 * np.pi * Q1 * Q2 * (1 + m * D) * np.exp(-m * D) / D ** 2

if __name__ == '__main__':
    for a in [0.3, 0.6]:
        sol, Q = sphere_profile(a)
        sol2, Q2 = sphere_profile(a, Rmax=18.0, n=6000)
        print('a=%.2f  Q_nonlinear=%.5f (Rmax=18: %.5f)  Q_linear=%.5f  ratio=%.3f  slope phi\'(a)=%.5f' % (a, Q, Q2, linear_Q(a), Q / linear_Q(a), sol.sol(a)[1]))
    s1, Q1 = sphere_profile(0.3); s2, Q2 = sphere_profile(0.6)
    for D in [1.4, 2.0, 3.0, 4.0]:
        print('D=%.1f  F_asym(nonlinear Q)=%.4f   F_point(linear Q)=%.4f' % (D, F_asym(D, Q1, Q2), F_asym(D, linear_Q(0.3), linear_Q(0.6))))
    print('asymptotic ratio F(1.4)/F(3.0) = %.2f (independent of Q)' % (F_asym(1.4, 1, 1) / F_asym(3.0, 1, 1)))
