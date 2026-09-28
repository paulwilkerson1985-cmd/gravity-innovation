"""Exact 1D references for foils in the broken phase (phi'' = -phi + phi^3 in vacuum, units mu, v).
 * infinite symmetric Robin sheet: phi = tanh((|x|+x0)/sqrt2), 2 phi'(0+) = kappa phi(0)
       => T = phi(0) = (-kappa + sqrt(kappa^2+8)) / (2 sqrt2)  ~ sqrt2/kappa  (kappa >> 1)
 * finite domains [zlo, zf] U [zf, zhi] with Dirichlet phi=0 at zlo, zhi and an interface at zf:
       'robin'   : phi continuous, phi'(+) - phi'(-) = kappa phi
       'port'    : linear two-port slab (m, t) of zero thickness (what symm_robin models)
       'resolved': slab of real thickness t, interior phi'' = m^2 phi + phi^3 (full nonlinear), outer region
                   above shifted by t so that the vacuum widths match the zero-thickness models.
   solved with scipy solve_bvp (multi-region mapped onto s in [0,1])."""
import numpy as np
from scipy.integrate import solve_bvp


def T_inf(kappa):
    return (-kappa + np.sqrt(kappa**2 + 8)) / (2 * np.sqrt(2))


def x0_inf(kappa):
    return np.sqrt(2) * np.arctanh(T_inf(kappa))


def _guess(s, n):
    return np.vstack([np.full_like(s, 0.5)] * n)


def interface_bvp(zlo, zf, zhi, kind, par, tol=1e-9, nodes=6000):
    """returns (phi_minus, phi_plus, callable phi(z)) for the finite-domain problem."""
    s = np.linspace(0, 1, nodes)
    l1, l2 = zf - zlo, zhi - zf
    if kind in ('robin', 'port'):
        def f(s, y):
            # y = [p1, p1', p2, p2'] with derivatives wrt s
            return np.vstack([y[1], l1**2 * (-y[0] + y[0]**3), y[3], l2**2 * (-y[2] + y[2]**3)])

        def bc(ya, yb):
            pm, dm = yb[0], yb[1] / l1          # phi(-), phi'(-) at the interface
            pp, dp = ya[2], ya[3] / l2          # phi(+), phi'(+)
            if kind == 'robin':
                k = par[0]
                return np.array([ya[0], yb[2], pm - pp, dp - dm - k * pm])
            m, t = par
            C, S = np.cosh(m * t), np.sinh(m * t)
            return np.array([ya[0], yb[2], dm - m * (-C * pm + pp) / S, dp - m * (-pm + C * pp) / S])
        if kind == 'robin':
            ke = par[0]
        else:
            ke = 2 * par[0] * np.tanh(par[0] * par[1] / 2)
        x0 = x0_inf(ke); r2 = np.sqrt(2)
        y0 = np.zeros((4, len(s)))
        y0[0] = np.tanh(l1 * s / r2) * np.tanh((l1 * (1 - s) + x0) / r2)
        y0[2] = np.tanh(l2 * (1 - s) / r2) * np.tanh((l2 * s + x0) / r2)
        if l2 < np.pi:
            y0[2] *= 0.3
        y0[1] = np.gradient(y0[0], s); y0[3] = np.gradient(y0[2], s)
        sol = solve_bvp(f, bc, s, y0, tol=tol, max_nodes=10**6)
        assert sol.success, sol.message

        def phi(z):
            z = np.asarray(z, float)
            return np.where(z <= zf, sol.sol(np.clip((z - zlo) / l1, 0, 1))[0], sol.sol(np.clip((z - zf) / l2, 0, 1))[2])
        return sol.sol(1.0)[0], sol.sol(0.0)[2], phi
    # resolved slab: three regions, slab [zf, zf+t], top vacuum [zf+t, zhi+t]
    m, t = par
    ls = t

    def f(s, y):
        return np.vstack([y[1], l1**2 * (-y[0] + y[0]**3), y[3], ls**2 * (m**2 * y[2] + y[2]**3),
                          y[5], l2**2 * (-y[4] + y[4]**3)])

    def bc(ya, yb):
        return np.array([ya[0], yb[4],
                         yb[0] - ya[2], yb[1] / l1 - ya[3] / ls,
                         yb[2] - ya[4], yb[3] / ls - ya[5] / l2])
    x0 = x0_inf(2 * m * np.tanh(m * t / 2)); r2 = np.sqrt(2)
    y0 = np.zeros((6, len(s)))
    y0[0] = np.tanh(l1 * s / r2) * np.tanh((l1 * (1 - s) + x0) / r2)
    y0[4] = np.tanh(l2 * (1 - s) / r2) * np.tanh((l2 * s + x0) / r2) * (0.3 if l2 < np.pi else 1)
    y0[2] = y0[0][-1] * np.cosh(m * t * (s - 0.5)) / np.cosh(m * t / 2)
    y0[1] = np.gradient(y0[0], s); y0[3] = np.gradient(y0[2], s); y0[5] = np.gradient(y0[4], s)
    sol = solve_bvp(f, bc, s, y0, tol=tol, max_nodes=10**6)
    assert sol.success, sol.message

    def phi(z):   # z in zero-thickness coordinates: z<=zf lower region; z>zf upper region (shifted)
        z = np.asarray(z, float)
        return np.where(z <= zf, sol.sol(np.clip((z - zlo) / l1, 0, 1))[0], sol.sol(np.clip((z - zf) / l2, 0, 1))[4])
    return sol.sol(1.0)[0], sol.sol(0.0)[4], phi


if __name__ == '__main__':
    for k in [0.1, 1, 10, 100, 1e3, 1e4]:
        pm, pp, _ = interface_bvp(-8, 0, 8, 'robin', (k,))
        print('kappa=%g  T_inf=%.6e  sqrt2/kappa=%.3e  BVP(L=8)=%.6e' % (k, T_inf(k), np.sqrt(2) / k, pm))
