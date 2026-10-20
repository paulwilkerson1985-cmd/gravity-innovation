"""DR-loop two-channel model with V11 = c * LO11 + d (linear in s): no s^2 growth (avoids left-region ghosts)."""
import numpy as np
from model_dr import TCDR, G_dr, MPI, MK, FPI, PI, NORM
class TCDR2(TCDR):
    def __init__(self, api=-1.0, ak=-1.0, c=1.0, d=0.0, **kw):
        self.c, self.dd = c, d
        super().__init__(api=api, ak=ak, b=0.0, **kw)
    def V(self, s):
        v = super().V(s)
        v[0, 0] = self.c * v[0, 0] + self.dd
        return v
