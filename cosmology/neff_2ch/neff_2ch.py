"""RateModel variant with the two-channel dispersive trace form factors theta_pi(s), theta_K(s) (Q4, 12 Oct 2026).
pi pi -> phi phi : Sum|M|^2 = 3 |theta_pi(s)|^2 / M^4, S = 1/2   (replaces 3 (s+2m^2)^2 |Omega_1ch|^2)
K Kbar -> phi phi: Sum|M|^2 = 4 |theta_K(s)|^2 / M^4, S = 1/2    (replaces 4 (s+2mK^2)^2, LO)
eta, eta': LO as before.  Everything else (QGP, crossover, Boltzmann) unchanged from neff_model.RateModel."""
import numpy as np, sys
import _gi_path  # noqa: F401  (adds cosmology/neff_proper to sys.path)
from neff_model import RateModel
from neff_calc import gg_integral, MESONS
from scipy.interpolate import interp1d

class RateModel2ch(RateModel):
    def __init__(self, fftab, stat_fac=1.0, **kw):
        kw.setdefault("hadrons", "omnes")
        super().__init__(**kw)
        rs = fftab["rs"]
        self._tp = interp1d(rs, np.log(np.maximum(fftab["thpi2"], 1e-30)), bounds_error=False, fill_value="extrapolate")
        self._tk = interp1d(rs, np.log(np.maximum(fftab["thk2"], 1e-30)), bounds_error=False, fill_value="extrapolate")
        self.stat_fac = stat_fac

    def channels(self, T):
        out = super().channels(T)
        wh = self.w_hadron(T)
        if self.combine == "sum":
            wh = 1.0
        if wh > 1e-6:
            for name, m, nr in MESONS:
                if name == "pi" and m / T < 60:
                    out["pi"] = wh * self.had_fac * gg_integral(T, m, m, lambda s, nr=nr: nr * np.exp(self._tp(np.sqrt(s))), S=0.5)
                if name == "K" and m / T < 60:
                    out["K"] = wh * self.had_fac * gg_integral(T, m, m, lambda s, nr=nr: nr * np.exp(self._tk(np.sqrt(s))), S=0.5)
        if self.stat_fac != 1.0:
            out = {k: v * self.stat_fac for k, v in out.items()}
        return out
