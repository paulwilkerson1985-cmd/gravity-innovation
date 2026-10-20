"""Q10 extra check (suggested and first run by the Fable review, 20 Oct 2026): the force as minus the energy derivative,
with no stress tensor. The mesh is moved by delta*chi(x)*zhat (ALE; chi = the virtual-work cutoff 0.40-0.75, so only the
test sphere and its neighbourhood move), the field is re-solved, and F = -dE/ddelta by central differences.
Compare with F_vw(0.40, 0.75) on the undeformed mesh. Usage: python ale_check.py (needs meshes/b2 from run_q10.sh)."""
import sys, numpy as np
import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dolfin as d
import fem_symmetron as fs
base, deg = "meshes/b2", 2
rho1, rho2 = 0.40, 0.75
def chi_np(r, z):
    rho = np.hypot(r, z); s = (rho - rho1) / (rho2 - rho1)
    return np.where(rho < rho1, 1.0, np.where(rho > rho2, 0.0, 1 - 3 * s**2 + 2 * s**3))
def energy_on_moved(delta):
    mesh, ff = fs.load(base)
    W = d.VectorFunctionSpace(mesh, "CG", 1)
    disp = d.Function(W)
    X = W.tabulate_dof_coordinates().reshape(-1, 2)
    vals = np.zeros(W.dim())
    # dof ordering: component-wise interleaved; set z-component = delta*chi
    sub1 = W.sub(1).dofmap().dofs()
    Xs = X[sub1]
    vals[sub1] = delta * chi_np(Xs[:, 0], Xs[:, 1])
    disp.vector()[:] = vals
    d.ALE.move(mesh, disp)
    V = d.FunctionSpace(mesh, "CG", deg)
    bcs = [d.DirichletBC(V, d.Constant(0.0), ff, t) for t in (1, 3, 4)]
    x = d.SpatialCoordinate(mesh); r = x[0]
    phi = d.Function(V); v = d.TestFunction(V)
    Xd = V.tabulate_dof_coordinates(); rr, zz = Xd[:, 0], Xd[:, 1]
    dw = np.minimum.reduce([fs.R - rr, fs.L - zz, fs.L + zz])
    g0 = np.tanh(np.clip(dw, 0, None) / np.sqrt(2)) * np.tanh(np.clip(np.hypot(rr, zz - delta) - fs.A1, 0, None) / np.sqrt(2)) \
         * np.tanh(np.clip(np.hypot(rr, zz + fs.D) - fs.A2, 0, None) / np.sqrt(2))
    phi.vector()[:] = g0
    F = (d.inner(d.grad(phi), d.grad(v)) + (phi**3 - phi) * v) * r * d.dx
    prob = d.NonlinearVariationalProblem(F, phi, bcs, d.derivative(F, phi))
    sol = d.NonlinearVariationalSolver(prob); prm = sol.parameters["newton_solver"]
    prm["absolute_tolerance"] = 1e-11; prm["relative_tolerance"] = 1e-12; prm["linear_solver"] = "mumps"
    sol.solve()
    e = (0.5 * d.inner(d.grad(phi), d.grad(phi)) - phi**2 / 2 + phi**4 / 4 + 0.25) * r * d.dx
    E = 2 * np.pi * d.assemble(e)
    Fvw = fs.force_virtual_work(mesh, phi, rho1, rho2) if delta == 0 else None
    return E, Fvw
E0, F0 = energy_on_moved(0.0)
print("delta=0: E = %.8f  F_vw(0.40,0.75) = %.6f" % (E0, F0))
for delta in [0.01, 0.005, 0.0025]:
    Ep, _ = energy_on_moved(delta); Em, _ = energy_on_moved(-delta)
    print("delta=%.4f  -(E+ - E-)/(2 delta) = %.6f   (E+ - 2E0 + E-)/delta^2 = %.3f" % (delta, -(Ep - Em) / (2 * delta), (Ep - 2 * E0 + Em) / delta**2))
