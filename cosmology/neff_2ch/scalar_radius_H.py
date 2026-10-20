import numpy as np, sys, warnings
warnings.filterwarnings("ignore")
import _gi_path  # noqa: F401  (adds cosmology/neff_proper to sys.path)
from tinput_hybrid import TInputHybrid, load_model
from mo_solver import MOSolver
from twochannel import NORM
MPI = 0.13957; HC2 = 0.0389379
for fit in ("avg", "CFD_B", "CFD_C"):
    ti = TInputHybrid(load_model(fit), etafit=fit, phifit=fit)
    mo = MOSolver(ti, nch=2, ua=2.0, h=0.002).solve(); Op = mo.omega_prime0().real
    r = [6 * ((Op @ (NORM * np.array([MPI**2, rk * MPI**2])))[0] / NORM[0]) / MPI**2 * HC2 for rk in (0.0, 0.5, 1.0)]
    # pion scalar form factor shape |Gamma(s)/Gamma(0)| (one subtraction) at a few energies
    F0 = NORM * np.array([MPI**2, 0.5 * MPI**2])
    shape = [abs((mo.omega(u*u) @ F0)[0] / F0[0]) for u in (0.5, 0.7, 0.85, 0.95, 0.98, 1.05, 1.2)]
    print(f"{fit}: <r^2>_S = {r[1]:.3f} fm^2 (Gamma_K(0)/mpi^2 = 0..1: {r[0]:.3f}-{r[2]:.3f});  |Gamma_pi(s)/Gamma_pi(0)| at 0.5,0.7,0.85,0.95,0.98,1.05,1.2 GeV: " + " ".join(f"{x:.2f}" for x in shape))
