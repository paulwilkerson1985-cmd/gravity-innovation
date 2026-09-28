"""
Rate model with variants + fast Boltzmann solver (gamma scales exactly as M^-4, so gamma*M^4 is tabulated once per variant).
Fable 5, 27 Sep 2026.  See SUMMARY.md.
"""
import numpy as np
from scipy.special import kn, zeta
from scipy.integrate import quad, solve_ivp
from scipy.interpolate import interp1d
from neff_calc import (g_rho, g_s, dlngs_dlnT, hubble, entropy, alpha_s, nf_active, gg_integral,
                       LEPTONS, QUARKS, MESONS, PI, Z3, MPL, hotqcd_interaction_measure)
import neff_calc

MPI = 0.13957

# ------------------------------------------------------------------------------------------------
# Omnes function for the I=0 S-wave pi pi phase (CGL 2001 parametrisation below 0.8 GeV, then a smooth
# continuation through the f0(980) region).  |theta_pi(s)|^2 = (s+2m^2)^2 |Omega(s)|^2.
# ------------------------------------------------------------------------------------------------
def delta00(s):
    """I=0 S-wave pi pi phase shift in radians: CGL 2001 below 0.8 GeV, smooth rise to 180 deg at 0.98 GeV,
    then constant (delta_inf = pi, so Omega ~ 1/s and (s+2m^2) Omega -> const: the DGL-type single-channel choice;
    the f0(980)/K Kbar two-channel structure is not resolved -- see SUMMARY 1b)."""
    rs = np.sqrt(s)
    if rs <= 2 * MPI:
        return 0.0
    if rs < 0.80:
        q2m = (s / 4 - MPI**2) / MPI**2
        A, B, C, D, s0 = 0.220, 0.268, -0.0139, -0.00139, 36.77 * MPI**2
        t = np.sqrt(1 - 4 * MPI**2 / s) * (A + B * q2m + C * q2m**2 + D * q2m**3) * (4 * MPI**2 - s0) / (s - s0)
        d = np.arctan(t)
        if d < 0:
            d += PI
        return d
    d08 = delta00(0.80**2 * 0.999999)
    if rs < 0.98:
        return d08 + (rs - 0.80) / 0.18 * (PI - d08)
    return PI


_om_cache = {}


def omnes_sq(s):
    """|Omega(s)|^2, Omega(s) = exp[(s/pi) P int_{4m^2}^inf delta(s')/(s'(s'-s)) ds']  (subtracted principal value)."""
    key = round(np.log(s), 3)
    if key in _om_cache:
        return _om_cache[key]
    s4 = 4 * MPI**2
    d_s = delta00(s)

    def f(sp):
        if abs(sp - s) < 1e-12:
            return 0.0
        return (delta00(sp) - d_s) / (sp * (sp - s))
    val = 0.0
    edges = [s4, 0.64, 0.9604, 4.0, 400.0]
    for a, b in zip(edges[:-1], edges[1:]):
        pts = [s] if a < s < b else None
        v, _ = quad(f, a, b, limit=300, points=pts)
        val += v
    val += (PI - d_s) / 400.0                      # tail, delta = pi beyond 400 GeV^2
    if s > s4:                                      # P int ds'/(s'(s'-s)) = (1/s) ln(s4/(s-s4))
        val += d_s / s * np.log(s4 / (s - s4))
    out = float(np.exp(2 * s / PI * val))
    _om_cache[key] = out
    return out


# ------------------------------------------------------------------------------------------------
# Hadron resonance gas list: (name, mass GeV, degeneracy incl. isospin & spin, baryon?)  states to ~1.7 GeV
# degeneracy counts particle+antiparticle where distinct (mesons: full multiplet; baryons: x2 for antibaryons)
# ------------------------------------------------------------------------------------------------
HRG_MESONS = [
    ("pi", 0.138, 3), ("K", 0.4957, 4), ("eta", 0.5479, 1), ("rho", 0.7753, 9), ("omega", 0.7827, 3),
    ("K*", 0.8917, 12), ("eta'", 0.9578, 1), ("f0(980)", 0.990, 1), ("a0(980)", 0.980, 3), ("phi", 1.0195, 3),
    ("h1(1170)", 1.166, 3), ("b1(1235)", 1.2295, 9), ("a1(1260)", 1.23, 9), ("K1(1270)", 1.253, 12),
    ("f2(1270)", 1.2755, 5), ("f1(1285)", 1.2819, 3), ("eta(1295)", 1.294, 1), ("pi(1300)", 1.30, 3),
    ("a2(1320)", 1.3182, 15), ("f0(1370)", 1.35, 1), ("K1(1400)", 1.403, 12), ("K*(1410)", 1.414, 12),
    ("eta(1405)", 1.4088, 1), ("omega(1420)", 1.41, 3), ("f1(1420)", 1.4264, 3), ("K0*(1430)", 1.425, 4),
    ("K2*(1430)", 1.4273, 20), ("rho(1450)", 1.465, 9), ("a0(1450)", 1.474, 3), ("eta(1475)", 1.476, 1),
    ("f0(1500)", 1.506, 1), ("f2'(1525)", 1.5174, 5), ("f2(1565)", 1.562, 5), ("pi1(1600)", 1.66, 9),
    ("eta2(1645)", 1.617, 5), ("omega(1650)", 1.67, 3), ("omega3(1670)", 1.667, 7), ("pi2(1670)", 1.6706, 15),
    ("phi(1680)", 1.68, 3), ("rho3(1690)", 1.6888, 21), ("rho(1700)", 1.72, 9), ("K*(1680)", 1.718, 12),
    ("K2(1770)", 1.773, 20), ("K3*(1780)", 1.776, 28),
]
HRG_BARYONS = [  # degeneracy = (2J+1)*(2I+1)*2 (antibaryons)
    ("N", 0.9389, 8), ("Delta", 1.232, 32), ("Lambda", 1.1157, 4), ("Sigma", 1.1926, 12), ("Xi", 1.3183, 8),
    ("Sigma(1385)", 1.3837, 24), ("Lambda(1405)", 1.4051, 4), ("N(1440)", 1.44, 8), ("N(1520)", 1.515, 16),
    ("Lambda(1520)", 1.5195, 8), ("Xi(1530)", 1.5318, 16), ("N(1535)", 1.53, 8), ("Sigma(1660)", 1.66, 12),
    ("Delta(1600)", 1.57, 32), ("Delta(1620)", 1.61, 16), ("Lambda(1600)", 1.6, 4), ("Lambda(1670)", 1.674, 4),
    ("Sigma(1670)", 1.675, 24), ("N(1650)", 1.65, 8), ("N(1675)", 1.675, 24), ("N(1680)", 1.685, 24),
    ("Omega", 1.6725, 8), ("Lambda(1690)", 1.69, 8), ("N(1700)", 1.72, 16), ("N(1710)", 1.71, 8), ("N(1720)", 1.72, 16),
    ("Delta(1700)", 1.71, 64), ("Xi(1690)", 1.69, 8), ("Sigma(1750)", 1.75, 12), ("Lambda(1800)", 1.8, 4),
]


def hrg_interaction_measure(T):
    """(eps-3P)/T^4 of the free HRG (MB), for the cross-check against lattice."""
    tot = 0.0
    for lst in (HRG_MESONS, HRG_BARYONS):
        for name, m, g in lst:
            x = m / T
            if x < 300:
                tot += g * x**3 * kn(1, x) / (2 * PI**2)
    return tot


# ------------------------------------------------------------------------------------------------
# Rate model
# ------------------------------------------------------------------------------------------------
class RateModel:
    """
    hadrons : 'LO' (pi,K,eta,eta' with LO ChPT vertices), 'omnes' (pions x |Omega|^2), 'HRG' (omnes pions + all
              resonances, mesons with (s+2m^2)^2 g vertices, baryons with 2 m^2 (s-4m^2) g/2 ... fermion form),
              'HRG-massonly' (same but resonance vertex 2m^2 instead of s+2m^2: the 'improved' choice)
    had_fac, qgp_fac : multiplicative K-factors
    mu_fac : alpha_s scale mu = mu_fac * T ; as_cap : cap on alpha_s
    Tc, dT : crossover switching ; combine : 'switch' or 'sum'
    gs_shift : shift of g_*s, g_*rho by this many tabulated sigmas
    """

    def __init__(self, hadrons="omnes", had_fac=1.0, qgp_fac=1.0, mu_fac=2 * PI, as_cap=1.0, Tc=0.155, dT=0.015,
                 combine="switch", gs_shift=0.0, label=None, higgs=True):
        self.hadrons, self.had_fac, self.qgp_fac = hadrons, had_fac, qgp_fac
        self.mu_fac, self.as_cap, self.Tc, self.dT, self.combine = mu_fac, as_cap, Tc, dT, combine
        self.gs_shift = gs_shift
        self.higgs = higgs
        self.label = label or f"{hadrons} hf={had_fac} qf={qgp_fac} mu={mu_fac/PI:.0f}piT dT={dT*1e3:.0f} {combine} gs{gs_shift:+.0f}"
        self._grid = None

    # --- channels: gamma * M^4 (GeV^8) ----------------------------------------------------------
    def w_hadron(self, T):
        return 0.5 * (1 - np.tanh((T - self.Tc) / self.dT))

    def channels(self, T):
        out = {}
        for name, m in LEPTONS:
            if m / T < 60:
                out[name] = gg_integral(T, m, m, lambda s, m=m: 2 * m**2 * (s - 4 * m**2), S=1.0)
        wh = self.w_hadron(T)
        wq = 1 - wh
        if self.combine == "sum":
            wh = wq = 1.0
        if wq > 1e-6:
            for name, m in QUARKS:
                if m / T < 60:
                    out[name] = wq * self.qgp_fac * gg_integral(T, m, m, lambda s, m=m: 6 * m**2 * (s - 4 * m**2), S=1.0)
            mu = self.mu_fac * T
            a = alpha_s(mu, self.as_cap)
            b0 = 11 - 2 * nf_active(mu) / 3
            c = b0 * a / (8 * PI)
            out["g"] = wq * self.qgp_fac * 24 * c**2 * T**8 / PI**5
        if wh > 1e-6:
            om = (lambda s: omnes_sq(s)) if self.hadrons in ("omnes", "HRG", "HRG-massonly") else (lambda s: 1.0)
            for name, m, nr in MESONS:
                if m / T < 60:
                    f = om if name == "pi" else (lambda s: 1.0)
                    out[name] = wh * self.had_fac * gg_integral(T, m, m, lambda s, m=m, nr=nr, f=f: nr * (s + 2 * m**2)**2 * f(s), S=0.5)
            if self.hadrons in ("HRG", "HRG-massonly"):
                mass_only = self.hadrons == "HRG-massonly"
                for name, m, g in HRG_MESONS:
                    if name in ("pi", "K", "eta", "eta'") or m / T > 60:
                        continue
                    if mass_only:
                        out[name] = wh * self.had_fac * gg_integral(T, m, m, lambda s, m=m, g=g: g * (2 * m**2)**2, S=0.5)
                    else:
                        out[name] = wh * self.had_fac * gg_integral(T, m, m, lambda s, m=m, g=g: g * (s + 2 * m**2)**2, S=0.5)
                for name, m, g in HRG_BARYONS:
                    if m / T > 60:
                        continue
                    # g counts B and Bbar states; B Bbar pairs: species count g/2 (spin-summed already), fermion form
                    out[name] = wh * self.had_fac * gg_integral(T, m, m, lambda s, m=m, g=g: (g / 2) * m**2 * (s - 4 * m**2), S=1.0)
        if self.higgs and T > 2.0:
            mh, mW, mZ = 125.1, 80.4, 91.2
            lp = mh**2 / 2
            if T > 160.0:
                out["H"] = lp**2 * T**4 / (32 * PI**5)
            else:
                tot = 0.0
                for m, n in [(mh, 1), (mW, 2), (mZ, 1)]:
                    tot += gg_integral(T, m, m, lambda s, n=n: n * 4 * lp**2, S=0.5)
                out["H"] = tot
        return out

    def gammaM4(self, T):
        return sum(self.channels(T).values())

    # --- tabulate ---------------------------------------------------------------------------------
    def build(self, Tmin=0.003, Tmax=300.0, n=260):
        Ts = np.logspace(np.log10(Tmin), np.log10(Tmax), n)
        g = np.array([self.gammaM4(T) for T in Ts])
        self._grid = interp1d(np.log(Ts), np.log(np.maximum(g, 1e-300)), kind="cubic", bounds_error=False, fill_value="extrapolate")
        self.Ts, self.gM4 = Ts, g
        return self

    def gamma(self, T, M):
        if self._grid is None:
            self.build()
        return float(np.exp(self._grid(np.log(T)))) / M**4

    # --- EoS with shift ---------------------------------------------------------------------------
    def _with_shift(self):
        neff_calc.GS_SHIFT = self.gs_shift

    def Gamma_over_H(self, T, M):
        self._with_shift()
        return 2 * self.gamma(T, M) / (Z3 * T**3 / PI**2) / hubble(T)

    def T_dec(self, M, Tlo=0.005, Thi=100.0):
        Ts = np.logspace(np.log10(Tlo), np.log10(Thi), 600)
        r = np.array([self.Gamma_over_H(t, M) for t in Ts])
        idx = np.where(r >= 1)[0]
        return (Ts[idx[0]] if len(idx) else None), r, Ts

    # --- Boltzmann --------------------------------------------------------------------------------
    def solve(self, M, T_start=50.0, T_end=0.005, start_frac=1.0, elastic=0.0):
        """start_frac: initial n/n_eq at T_start (1 = equilibrium, 0 = freeze-in from nothing)."""
        self._with_shift()

        def rhs(lnT, y):
            T = np.exp(lnT)
            n, rho = y
            H = hubble(T)
            fac = 1 + dlngs_dlnT(T) / 3
            g = self.gamma(T, M)
            neq = Z3 * T**3 / PI**2
            rhoeq = PI**2 / 30 * T**4
            dep = 1 - (n / neq) ** 2
            dn = -3 * H * n + 2 * g * dep
            # energy: production 2 gamma (rho_eq/n_eq) minus annihilation loss 2 gamma (n/n_eq)^2 (rho/n)
            drho = -4 * H * rho + (2 * g / neq) * (rhoeq - (n / neq) * rho)
            if elastic and n > 0:
                drho += elastic * (2 * g / neq) * ((rhoeq / neq) * n - rho)   # elastic energy exchange, rate = elastic x Gamma_ann
            return [-fac / H * dn, -fac / H * drho]

        n0 = start_frac * Z3 * T_start**3 / PI**2
        rho0 = start_frac * PI**2 / 30 * T_start**4
        lnTs = np.linspace(np.log(T_start), np.log(T_end), 500)
        sol = solve_ivp(rhs, (lnTs[0], lnTs[-1]), [n0, rho0], t_eval=lnTs, method="LSODA", rtol=1e-8, atol=1e-40)
        T = np.exp(sol.t)
        n, rho = sol.y
        rho_nu1 = 2 * (7 / 8) * PI**2 / 30 * T**4
        return dict(T=T, n=n, rho=rho, dNeff=rho / rho_nu1, dNeff_final=float((rho / rho_nu1)[-1]),
                    n_over_neq=n / (Z3 * T**3 / PI**2))


def dNeff_instant(Tdec):
    return (4 / 7) * (10.75 / g_s(Tdec)) ** (4 / 3)
