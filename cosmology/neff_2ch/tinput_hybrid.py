"""Hybrid data input (Q4 revision): fitted coupled-channel model below the K Kbar threshold; above it, S built from
delta1 (model), the measured pi pi -> K Kbar phase phi_0^0 = delta1 + delta2 and the inelasticity from |g_0^0|
(Pelaez-Rodas 2018 CFD), up to u_m <= 1.47 GeV; then smooth interpolation to (d1inf, d2inf, eta=1) at u_a."""
import numpy as np, json
from tinput import TInput, unwrap_phases, MPI, MK, PI
from pr2018 import phi as phi_pr, gmod as g_pr
from model_data import TCData

def load_model(tag="avg"):
    p = json.load(open(f"fit_data_{tag}.json"))["params"]
    return TCData(api=p[0], ak=p[1], c=p[2], d=p[3], g12=p[4], g22=p[5])

class TInputHybrid(TInput):
    def __init__(self, model, um=1.47, ua=2.0, d1inf=PI, d2inf=PI, etafit="avg", phifit="avg", d1shift_deg=0.0):
        self.model, self.um, self.ua, self.d1inf, self.d2inf = model, um, ua, d1inf, d2inf
        self.etafit, self.phifit, self.d1shift = etafit, phifit, np.radians(d1shift_deg)
        self.us, self.d1, self.uk, self.d2m_model = unwrap_phases(model, max(um, 1.0) + 0.001, du=0.0005)
        self.uK = 2 * MK
        # sign of S12 just above threshold from the model
        u0 = self.uK + 0.002; Sm = model.S(u0 * u0)
        d1m, d2m, etam = self._data(u0 * u0)
        ref = 1j * np.sqrt(max(1 - etam ** 2, 1e-12)) * np.exp(1j * (d1m + d2m))
        self.xi = np.sign((Sm[0, 1] / ref).real)
        self.d1m, self.d2m, self.etam = self._data(um * um)

    def _phi(self, u):
        if self.phifit == "avg": return np.radians(0.5 * (phi_pr(u, "CFD_B") + phi_pr(u, "CFD_C")))
        return np.radians(phi_pr(u, self.phifit))
    def _g(self, u):
        if self.etafit == "avg": return 0.5 * (g_pr(u, "CFD_B") + g_pr(u, "CFD_C"))
        return g_pr(u, self.etafit)
    def _data(self, s):
        u = np.sqrt(s)
        # delta1 shift fades in from 0 at threshold to full at 1.2 GeV (keeps continuity with delta1(2mK) = 226.5)
        w = np.clip((u - self.uK) / (1.2 - self.uK), 0, 1)
        d1 = np.interp(u, self.us, self.d1) + self.d1shift * w
        d2 = self._phi(u) - d1
        sp, sk = np.sqrt(1 - 4 * MPI ** 2 / s), np.sqrt(1 - 4 * MK ** 2 / s)
        eta = np.sqrt(max(1 - 4 * sp * sk * self._g(u) ** 2, 0.0))
        return d1, d2, eta

    def params(self, s):
        x = (np.sqrt(s) - self.um) / (self.ua - self.um)
        g = np.clip(x, 0, 1); g = 3 * g ** 2 - 2 * g ** 3
        return (self.d1m + (self.d1inf - self.d1m) * g, self.d2m + (self.d2inf - self.d2m) * g, self.etam + (1 - self.etam) * g)

    def _S_from(self, s, d1, d2, eta):
        S = np.array([[eta * np.exp(2j * d1), self.xi * 1j * np.sqrt(max(1 - eta ** 2, 0)) * np.exp(1j * (d1 + d2))],
                      [self.xi * 1j * np.sqrt(max(1 - eta ** 2, 0)) * np.exp(1j * (d1 + d2)), eta * np.exp(2j * d2)]])
        return S

    def __call__(self, s):
        if s <= (self.uK) ** 2 * (1 + 1e-9):
            return self.model.t(s)
        if s >= self.ua ** 2:
            return np.zeros((2, 2), complex)
        if s <= self.um ** 2:
            d1, d2, eta = self._data(s)
        else:
            d1, d2, eta = self.params(s)
        S = self._S_from(s, d1, d2, eta)
        sg = np.array([np.sqrt(1 - 4 * MPI ** 2 / s), np.sqrt(1 - 4 * MK ** 2 / s)])
        return (S - np.eye(2)) / (2j * np.sqrt(np.outer(sg, sg)))
