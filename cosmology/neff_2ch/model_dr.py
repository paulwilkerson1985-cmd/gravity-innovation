"""Two-channel (pi pi, K Kbar) I=0 S-wave model with dimensional-regularization loops (channel-dependent
subtraction constants) and LO chiral kernels, V11 -> V11 (1 + b s).  Normalization as in twochannel.py."""
import numpy as np, sys
import _gi_path  # noqa: F401  (adds cosmology/neff_proper to sys.path)
from twochannel import TwoChannel, MPI, MK, FPI, PI, NORM

MU = 1.0   # GeV, renormalization scale (absorbed in a_i)

def G_dr(s, m, a):
    """(1/16 pi^2)[a + ln(m^2/mu^2) + sigma ln((sigma+1)/(sigma-1))] at s + i eps (any real s != 0)."""
    s = complex(s, 1e-14)
    sg = np.sqrt(1 - 4 * m * m / s)
    if sg.real < 0: sg = -sg
    val = sg * np.log((sg + 1) / (sg - 1))
    return (a + np.log(m * m / MU ** 2) + val) / (16 * PI ** 2)

class TCDR(TwoChannel):
    def __init__(self, api=-1.0, ak=-1.0, b=0.0, **kw):
        self.api, self.ak, self.b = api, ak, b
        super().__init__(**kw)
    def V(self, s):
        v = super().V(s)
        v[0, 0] *= (1 + self.b * s)
        return v
    def Gt(self, s):
        return np.diag([-16 * PI * G_dr(s, self.mpi, self.api), -16 * PI * G_dr(s, self.mk, self.ak)])
    def _Dreal(self, s):
        if abs(s) < 1e-10: s = 1e-10
        return self.D(s).real
