"""T-matrix input for the two-channel MO solver: coupled-channel model below s_m, smooth interpolation of
(delta1, delta2, eta) to (pi, pi, 1) between s_m and s_a (channels decouple, S = 1 beyond s_a)."""
import numpy as np
MPI, MK = 0.13957, 0.4957
PI = np.pi

def unwrap_phases(model, um, du=0.0005):
    """continuous delta1 (from pi pi threshold) and delta2 (from K Kbar threshold, delta2(th)=0) up to um."""
    us = np.arange(2 * MPI + du, um + 1e-12, du)
    d1 = []; prev = 0.0
    for u in us:
        Sm = model.S(u * u)
        d = np.angle(Sm[0, 0]) / 2
        while d - prev > PI / 2: d -= PI
        while d - prev < -PI / 2: d += PI
        prev = d; d1.append(d)
    uk = np.arange(2 * MK + du / 10, um + 1e-12, du)
    d2 = []; prev = 0.0
    for u in uk:
        Sm = model.S(u * u)
        d = np.angle(Sm[1, 1]) / 2
        while d - prev > PI / 2: d -= PI
        while d - prev < -PI / 2: d += PI
        prev = d; d2.append(d)
    return us, np.array(d1), uk, np.array(d2)

class TInput:
    def __init__(self, model, um=1.3, ua=2.0, d1inf=PI, d2inf=PI):
        self.model, self.um, self.ua = model, um, ua
        us, d1, uk, d2 = unwrap_phases(model, um)
        self.d1m, self.d2m = d1[-1], d2[-1]
        Sm = model.S(um * um)
        self.etam = abs(Sm[0, 0])
        # sign xi of S12 relative to i sqrt(1-eta^2) e^{i(d1+d2)}
        ref = 1j * np.sqrt(max(1 - self.etam ** 2, 0)) * np.exp(1j * (self.d1m + self.d2m))
        self.xi = np.sign((Sm[0, 1] / ref).real) if abs(ref) > 1e-12 else 1.0
        self.d1inf, self.d2inf = d1inf, d2inf
        self.us, self.d1, self.uk, self.d2 = us, d1, uk, d2

    def params(self, s):
        x = (np.sqrt(s) - self.um) / (self.ua - self.um)
        g = np.clip(x, 0, 1); g = 3 * g ** 2 - 2 * g ** 3
        return (self.d1m + (self.d1inf - self.d1m) * g, self.d2m + (self.d2inf - self.d2m) * g,
                self.etam + (1 - self.etam) * g)

    def __call__(self, s):
        if s <= self.um ** 2:
            return self.model.t(s)
        if s >= self.ua ** 2:
            return np.zeros((2, 2), complex)
        d1, d2, eta = self.params(s)
        S = np.array([[eta * np.exp(2j * d1), self.xi * 1j * np.sqrt(1 - eta ** 2) * np.exp(1j * (d1 + d2))],
                      [self.xi * 1j * np.sqrt(1 - eta ** 2) * np.exp(1j * (d1 + d2)), eta * np.exp(2j * d2)]])
        sg = np.array([np.sqrt(1 - 4 * MPI ** 2 / s), np.sqrt(1 - 4 * MK ** 2 / s)])
        return (S - np.eye(2)) / (2j * np.sqrt(np.outer(sg, sg)))
