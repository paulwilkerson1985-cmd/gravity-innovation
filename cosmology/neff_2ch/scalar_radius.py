"""Validation: pion scalar radius from the same Omnes matrix (one subtraction, Gamma_pi(0)=mpi^2, Gamma_K(0)=mpi^2/2 at LO).
Literature: <r^2>_S^pi = 0.61 +- 0.04 fm^2 (Colangelo-Gasser-Leutwyler 2001, dispersive)."""
import numpy as np, sys, warnings
warnings.filterwarnings("ignore")
from formfactors import models
from tinput import TInput
from mo_solver import MOSolver
from twochannel import NORM
MPI = 0.13957
HC2 = 0.0389379  # (hbar c)^2 in GeV^2 fm^2
ms = models()
for name in ("A", "B"):
    mo = MOSolver(TInput(ms[name], um=1.3, ua=2.0), nch=2, ua=2.0, h=0.002).solve()
    Op = mo.omega_prime0().real
    for rk in (0.5, 0.0, 1.0):     # Gamma_K(0)/mpi^2: LO 0.5; vary
        F0 = NORM * np.array([MPI**2, rk * MPI**2])
        d = (Op @ F0)[0] / NORM[0]
        r2 = 6 * d / MPI**2 * HC2
        print(f"model {name}: Gamma_K(0)/mpi^2 = {rk:.1f}  ->  <r^2>_S^pi = {r2:.3f} fm^2")
    print(f"   Omega'(0) = {np.round(Op,3).tolist()} GeV^-2")
