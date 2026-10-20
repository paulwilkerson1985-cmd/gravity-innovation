"""Q10: independent finite-element (FEniCS 2019.1 / dolfin, the toolchain SELCIE is built on) solution of the
dimensionless symmetron benchmark, as a cross-check of the repository's finite-difference solvers.
Equation (units: length 1/mu, field v): lap(phi) = -phi + phi^3 in vacuum; Dirichlet phi = 0 on the
two Cu spheres and the chamber walls (screened bodies); axis r = 0 natural (r-weighted weak form);
optional Robin sheet (membrane) at z = zm: jump [d_n phi] = kappa phi  ->  + kappa phi v r dS.
Force on the test sphere (z): virtual-work volume integral F_z = int (T_zr d_r chi + T_zz d_z chi) dV with
T_ij = d_i phi d_j phi - delta_ij (|grad phi|^2/2 + V), V = -phi^2/2 + phi^4/4, and chi a smooth cutoff (= 1 near
the test sphere, = 0 near everything else); exact (= minus the closed-surface stress integral) on-shell.
Also the stress-tensor integral on the repo's box (r < a1+0.08, |z| < a1+0.08), as in symm.force_z.
Usage: python fem_symmetron.py <mesh_base> [deg] [kappa] [label]"""
import sys, json, time, numpy as np
import dolfin as d
d.set_log_level(30)
d.parameters["form_compiler"]["cpp_optimize"] = True
d.parameters["form_compiler"]["representation"] = "uflacs"

R, L, A1, A2, D = 5.0, 5.0, 0.3, 0.6, 1.4

def load(base):
    mesh = d.Mesh()
    with d.XDMFFile(base + "_tri.xdmf") as f:
        f.read(mesh)
    mvc = d.MeshValueCollection("size_t", mesh, 1)
    with d.XDMFFile(base + "_lin.xdmf") as f:
        f.read(mvc, "tag")
    ff = d.cpp.mesh.MeshFunctionSizet(mesh, mvc)
    return mesh, ff

def solve(base, deg=2, kappa=None, source=True):
    mesh, ff = load(base)
    V = d.FunctionSpace(mesh, "CG", deg)
    tags = set(int(t) for t in np.unique(ff.array()) if t < 100)
    bcs = [d.DirichletBC(V, d.Constant(0.0), ff, t) for t in (1, 3, 4) if t in tags]
    x = d.SpatialCoordinate(mesh); r, z = x[0], x[1]
    phi = d.Function(V); v = d.TestFunction(V)
    # initial guess: product of exact 1D kinks tanh(dist/sqrt2) from each Dirichlet surface
    X = V.tabulate_dof_coordinates(); rr, zz = X[:, 0], X[:, 1]
    dw = np.minimum.reduce([R - rr, L - zz, L + zz])
    g0 = np.tanh(np.clip(dw, 0, None) / np.sqrt(2)) * np.tanh(np.clip(np.hypot(rr, zz) - A1, 0, None) / np.sqrt(2))
    if source:
        g0 *= np.tanh(np.clip(np.hypot(rr, zz + D) - A2, 0, None) / np.sqrt(2))
    phi.vector()[:] = g0
    dS = d.Measure("dS", domain=mesh, subdomain_data=ff)
    F = (d.inner(d.grad(phi), d.grad(v)) + (phi**3 - phi) * v) * r * d.dx
    if kappa is not None:
        F += d.Constant(kappa) * phi("+") * v("+") * r("+") * dS(5)
    J = d.derivative(F, phi)
    t0 = time.time()
    prob = d.NonlinearVariationalProblem(F, phi, bcs, J)
    sol = d.NonlinearVariationalSolver(prob)
    prm = sol.parameters["newton_solver"]
    prm["absolute_tolerance"] = 1e-11; prm["relative_tolerance"] = 1e-12; prm["maximum_iterations"] = 50
    prm["linear_solver"] = "mumps"
    its, conv = sol.solve()
    return mesh, V, phi, (its, conv, time.time() - t0)

def force_virtual_work(mesh, phi, rho1, rho2):
    x = d.SpatialCoordinate(mesh); r, z = x[0], x[1]
    rho = d.sqrt(r**2 + z**2)
    s = (rho - rho1) / (rho2 - rho1)
    chi = d.conditional(d.lt(rho, rho1), 1.0, d.conditional(d.gt(rho, rho2), 0.0, 1 - 3 * s**2 + 2 * s**3))
    gc = d.grad(chi)
    pr, pz = phi.dx(0), phi.dx(1)
    e = 0.5 * (pr**2 + pz**2) - phi**2 / 2 + phi**4 / 4
    Tzr = pz * pr; Tzz = pz**2 - e
    dxq = d.dx(metadata={"quadrature_degree": 10})
    return 2 * np.pi * d.assemble((Tzr * gc[0] + Tzz * gc[1]) * r * dxq)

def force_box(mesh, phi, deg, rho_s=A1 + 0.08, zlo=-A1 - 0.08, zhi=A1 + 0.08, n=4001):
    """F_z = -closed-surface integral of T_zj n_j on the cylinder r<rho_s, zlo<z<zhi (symm.force_z convention)."""
    W = d.VectorFunctionSpace(mesh, "DG", deg - 1)
    gp = d.project(d.grad(phi), W, solver_type="mumps")
    def T(pt):
        p = phi(pt); g = gp(pt); pr, pz = g[0], g[1]
        Vv = -p**2 / 2 + p**4 / 4
        return 0.5 * (pz**2 - pr**2) - Vv, pz * pr      # Tzz, Tzr
    rs = np.linspace(0, rho_s, n); zs = np.linspace(zlo, zhi, n)
    top = np.trapezoid([T((q, zhi))[0] * 2 * np.pi * q for q in rs], rs)
    bot = np.trapezoid([T((q, zlo))[0] * 2 * np.pi * q for q in rs], rs)
    side = np.trapezoid([T((rho_s, q))[1] * 2 * np.pi * rho_s for q in zs], zs)
    return -(top - bot + side)

if __name__ == "__main__":
    base = sys.argv[1]; deg = int(sys.argv[2]) if len(sys.argv) > 2 else 2
    kappa = None if len(sys.argv) <= 3 or sys.argv[3] == "none" else float(sys.argv[3])
    label = sys.argv[4] if len(sys.argv) > 4 else base
    source = "_ns" not in base
    mesh, V, phi, info = solve(base, deg, kappa, source)
    out = dict(label=label, mesh=base, deg=deg, kappa=kappa, source=source, cells=mesh.num_cells(),
               dofs=V.dim(), newton_its=info[0], converged=bool(info[1]), solve_s=round(info[2], 1),
               hmin_mesh=mesh.hmin())
    cuts = [(0.34, 0.50), (0.31, 0.45), (0.36, 0.53)] if kappa is not None else [(0.34, 0.50), (0.40, 0.75), (0.31, 0.60), (0.45, 0.78)]
    out["F_vw"] = {"%.2f-%.2f" % c: force_virtual_work(mesh, phi, *c) for c in cuts}
    out["F_box"] = force_box(mesh, phi, deg)
    out["phi_mid"] = phi((0.0, -0.55)); out["phi_far"] = phi((2.5, 2.5))
    print(json.dumps(out))
