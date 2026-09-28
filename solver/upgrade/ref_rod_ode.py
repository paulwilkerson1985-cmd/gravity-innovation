"""Exact radial reference: infinite straight rod of radius a on the axis of a cylinder (radius Rc, phi(Rc)=0),
broken-phase vacuum between:  phi'' + phi'/r = -phi + phi^3.  Rod surface: phi(a)=0 (q=inf) or 2 pi a phi'(a) = q phi(a).
Solved in x = ln r with scipy solve_bvp."""
import numpy as np
from scipy.integrate import solve_bvp


def rod_profile(a, Rc, q=np.inf, n=4000):
    x = np.linspace(np.log(a), np.log(Rc), n)

    def f(x, y):
        return np.vstack([y[1], np.exp(2 * x) * (-y[0] + y[0]**3)])

    def bc(ya, yb):
        left = ya[0] if np.isinf(q) else 2 * np.pi * ya[1] - q * ya[0]
        return np.array([left, yb[0]])
    r = np.exp(x)
    y0 = np.vstack([np.tanh((r - a) / 0.5) * np.tanh((Rc - r) / 1.4), np.zeros_like(x)])
    y0[1] = np.gradient(y0[0], x)
    sol = solve_bvp(f, bc, x, y0, tol=1e-10, max_nodes=10**6)
    assert sol.success, sol.message
    return lambda rr: sol.sol(np.log(rr))[0]
