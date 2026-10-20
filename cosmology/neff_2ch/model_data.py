"""Data-constrained two-channel model (Q4 rev., 12 Oct 2026): DR loops (a_pi, a_K), V11 = c*V11^LO + d,
V12 *= g12, V22 *= g22.  Fitted to CGL delta_0^0 (0.32-0.78 GeV), delta_0^0(2 m_K) = 226.5 deg (GKPY, as quoted by
Pelaez-Rodas 2018), the pi pi -> K Kbar phase phi_0^0 (Pelaez-Rodas 2018 CFD, 1.0-1.40 GeV) and the inelasticity
eta = sqrt(1 - 4 sigma_pi sigma_K |g_0^0|^2) from their CFD modulus (B or C)."""
import numpy as np
from model_dr2 import TCDR2
class TCData(TCDR2):
    def __init__(self, api=-0.5, ak=-1.6, c=0.85, d=0.05, g12=1.0, g22=1.0, **kw):
        self.g12, self.g22 = g12, g22
        super().__init__(api=api, ak=ak, c=c, d=d, **kw)
    def V(self, s):
        v = super().V(s)
        v[0, 1] *= self.g12; v[1, 0] *= self.g12; v[1, 1] *= self.g22
        return v
