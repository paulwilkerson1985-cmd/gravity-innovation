"""Q10 toolchain smoke test: run SELCIE's own example 'Analytic_solution_parallel_plates.py' (chameleon field between
two plates, exact analytic solution) unmodified apart from a non-interactive backend, and print the max relative
error. Confirms SELCIE (github C-Briddon/SELCIE, v1.9.0) and FEniCS 2019.1 work in this environment.
Usage: SELCIE_DIR=<clone> python selcie_smoke.py"""
import os, sys, runpy, numpy as np, matplotlib
matplotlib.use("Agg")
sel = os.environ["SELCIE_DIR"]; sys.path.insert(0, sel)
g = runpy.run_path(os.path.join(sel, "Examples", "Analytic_solution_parallel_plates.py"), run_name="__main__")
re = g["rel_err"]; z = g["z"]
print("SELCIE parallel-plate chameleon example: max rel. error vs analytic = %.2e (median %.2e) over %d points"
      % (np.max(re), np.median(re), len(z)))
