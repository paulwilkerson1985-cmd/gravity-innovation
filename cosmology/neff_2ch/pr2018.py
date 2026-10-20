"""Pelaez & Rodas 2018 (arXiv:1807.04543) CFD parametrization of the pi pi -> K Kbar I=0 S-wave g_0^0:
phase phi (deg) and modulus |g| in Region I (2 m_K .. 1.47 GeV), Eqs. (18)-(23), Tables III-V (as extracted)."""
import numpy as np
MPI, MK = 0.13957, 0.4957
UK, UMAX = 2 * MK, 1.47
PAR = {"CFD_B": dict(B=(22.1, 27.7, 1.8), D=(0.60, -0.35, 0.13, -0.12)),
       "CFD_C": dict(B=(22.9, 28.4, 1.1), D=(0.46, -0.25, 0.11, -0.087))}
D0K = 226.5
def cheb(x, c):
    p = [1.0, x, 2 * x * x - 1, 4 * x ** 3 - 3 * x]
    return sum(ci * pi for ci, pi in zip(c, p))
def phi(rs, fit="CFD_C"):
    B1, B2, B3 = PAR[fit]["B"]; B0 = D0K + B1 - B2 + B3
    x = 2 * (rs - UK) / (UMAX - UK) - 1
    return cheb(x, (B0, B1, B2, B3))
def gmod(rs, fit="CFD_C"):
    x = 2 * (rs - UK) / (UMAX - UK) - 1
    return cheb(x, PAR[fit]["D"])
def eta_from_g(rs, fit="CFD_C"):
    s = rs * rs
    sp, sk = np.sqrt(1 - 4 * MPI ** 2 / s), np.sqrt(1 - 4 * MK ** 2 / s)
    return np.sqrt(max(1 - 4 * sp * sk * gmod(rs, fit) ** 2, 0))
