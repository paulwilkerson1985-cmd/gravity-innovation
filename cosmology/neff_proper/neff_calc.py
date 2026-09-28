"""
Thermal-relic Delta N_eff for a light real scalar phi with the universal conformal coupling
    L_int = -(phi^2 / 2 M^2) Theta,   Theta = T^mu_mu   (canonical / metric-variation trace)
in the symmetric phase (phi effectively massless).  Fable 5, 27 Sep 2026.  Replaces ../neff_estimate.py.

Units: GeV.  Conventions (derived in SUMMARY.md sec. 0):
  * pair-production rate density  gamma = S (T/64 pi^4) int ds (sqrt(lambda)/sqrt s) K1(sqrt s/T) Sum|M|^2 /(16 pi)
    with S = 1/2 for identical initial species; Sum|M|^2 summed over initial internal d.o.f.
  * per-phi number-changing rate Gamma = 2 gamma / n_phi^eq,  n_phi^eq = zeta(3) T^3/pi^2 (MB: T^3/pi^2 -> we use BE for n_phi^eq).
  * Delta N_eff from the Boltzmann solution: rho_phi / rho_(one nu species) evaluated at T = 5 MeV.

Inputs:
  * g_*rho(T), g_*s(T): Saikawa & Shirai 2018 (arXiv:1803.01038) table 'saikawa_shirai_2018_gstar.dat' (with errors).
  * (eps-3P)/T^4 cross-check: HotQCD 2014 (arXiv:1407.6387) pressure fit, Tc = 154 MeV, 100-400 MeV.
"""
import numpy as np
from scipy.special import kn, zeta
from scipy.integrate import quad, solve_ivp
from scipy.interpolate import interp1d
import os, sys, json

HERE = os.path.dirname(os.path.abspath(__file__))
MPL = 1.22e19          # GeV (non-reduced)
Z3 = zeta(3)
PI = np.pi

# ----------------------------------------------------------------------------------------------
# 1. Equation of state
# ----------------------------------------------------------------------------------------------
_ss = np.loadtxt(os.path.join(HERE, "saikawa_shirai_2018_gstar.dat"))
_lT = np.log(_ss[:, 0])
_g_rho = interp1d(_lT, _ss[:, 1], bounds_error=False, fill_value=(_ss[0, 1], _ss[-1, 1]))
_g_s = interp1d(_lT, _ss[:, 3], bounds_error=False, fill_value=(_ss[0, 3], _ss[-1, 3]))
_g_s_err = interp1d(_lT, _ss[:, 4], bounds_error=False, fill_value=(0, 0))
_dlng_s = np.gradient(np.log(_ss[:, 3]), _lT)
_dlng_s_i = interp1d(_lT, _dlng_s, bounds_error=False, fill_value=(0, 0))

GS_SHIFT = 0.0  # in units of the tabulated error; set +-1 for the EoS band


def g_rho(T):
    return float(_g_rho(np.log(T))) + GS_SHIFT * float(_g_s_err(np.log(T)))


def g_s(T):
    return float(_g_s(np.log(T))) + GS_SHIFT * float(_g_s_err(np.log(T)))


def dlngs_dlnT(T):
    return float(_dlng_s_i(np.log(T)))


def hubble(T):
    return 1.66 * np.sqrt(g_rho(T)) * T ** 2 / MPL


def entropy(T):
    return (2 * PI ** 2 / 45) * g_s(T) * T ** 3


def hotqcd_interaction_measure(T):
    """(eps - 3P)/T^4 from the HotQCD 2014 pressure fit (valid 100-400 MeV)."""
    Tc = 0.154
    ct, an, bn, dn = 3.8706, -8.7704, 3.9200, 0.3419
    t0, ad, bd, dd = 0.9761, -1.2600, 0.8425, -0.0475
    pid = 95 * PI ** 2 / 180

    def p(T):
        t = T / Tc
        return 0.5 * (1 + np.tanh(ct * (t - t0))) * (pid + an / t + bn / t**2 + dn / t**4) / (1 + ad / t + bd / t**2 + dd / t**4)
    h = 1e-4 * T
    return T * (p(T + h) - p(T - h)) / (2 * h)   # T d(p/T^4)/dT = (eps-3p)/T^4


# ----------------------------------------------------------------------------------------------
# 2. Running alpha_s (2-loop, nf thresholds at m_c, m_b; alpha_s(MZ)=0.118)
# ----------------------------------------------------------------------------------------------
MZ, ASMZ = 91.1876, 0.118
MC, MB_, MT = 1.27, 4.18, 173.0


def _run2(alpha0, mu0, mu, nf):
    b0 = (33 - 2 * nf) / (12 * PI)
    b1 = (153 - 19 * nf) / (24 * PI ** 2)
    L = np.log(mu ** 2 / mu0 ** 2)
    # numerically integrate d alpha/d ln mu^2 = -b0 a^2 - b1 a^3
    n = 200
    a = alpha0
    dl = L / n
    for _ in range(n):
        k1 = -(b0 * a**2 + b1 * a**3)
        a2 = a + 0.5 * dl * k1
        k2 = -(b0 * a2**2 + b1 * a2**3)
        a = a + dl * k2
        if a > 3 or a < 0:
            return 3.0
    return a


def alpha_s(mu, cap=1.0):
    mu = max(mu, 0.3)
    if mu >= MB_:
        a = _run2(ASMZ, MZ, mu, 5)
    else:
        ab = _run2(ASMZ, MZ, MB_, 5)
        if mu >= MC:
            a = _run2(ab, MB_, mu, 4)
        else:
            ac = _run2(ab, MB_, MC, 4)
            a = _run2(ac, MC, mu, 3)
    return min(a, cap)


def nf_active(mu):
    return 3 + (mu > MC) + (mu > MB_) + (mu > MT)


# ----------------------------------------------------------------------------------------------
# 3. Rate densities gamma(T, M) per channel
# ----------------------------------------------------------------------------------------------
def gg_integral(T, m1, m2, M2sum, S=1.0, smax_fac=60.0):
    """gamma = S (T/64 pi^4) int ds (sqrt(lam)/sqrt s) K1(sqrt s/T) M2sum(s) / (16 pi).
    M2sum(s) = Sum_dof |M|^2 (dimensionless; already includes 1/M^4)."""
    smin = (m1 + m2) ** 2
    smax = max((smax_fac * T) ** 2, smin * 1.0001 + (40 * T) ** 2)
    def f(ls):
        s = np.exp(ls)
        rs = np.sqrt(s)
        lam = (s - (m1 + m2) ** 2) * (s - (m1 - m2) ** 2)
        if lam <= 0:
            return 0.0
        x = rs / T
        k1 = kn(1, x) if x < 600 else 0.0
        return s * np.sqrt(lam) / rs * k1 * M2sum(s)
    val, _ = quad(f, np.log(smin * (1 + 1e-9)), np.log(smax), limit=200)
    return S * T / (64 * PI ** 4) * val / (16 * PI)


# species tables: name, mass [GeV], N_c (colour), kind
LEPTONS = [("e", 0.000511), ("mu", 0.10566), ("tau", 1.77686)]
QUARKS = [("u", 0.0022), ("d", 0.0047), ("s", 0.093), ("c", 1.27), ("b", 4.18)]      # MSbar(2 GeV) light, MSbar(m) heavy
MESONS = [("pi", 0.138, 3), ("K", 0.4957, 4), ("eta", 0.5479, 1), ("etap", 0.9578, 1)]  # (name, mass, n_real)


def gamma_fermion(T, M, m, Nc=1):
    """f fbar -> phi phi via Theta_f = m psibar psi.  Sum|M|^2 = 2 Nc m^2 (s-4m^2)/M^4."""
    if m / T > 60:
        return 0.0
    return gg_integral(T, m, m, lambda s: 2 * Nc * m**2 * (s - 4 * m**2) / M**4, S=1.0)


def gamma_scalar(T, M, m, nreal):
    """pi pi -> phi phi via Theta = -(d pi)^2 + 2 m^2 pi^2: <0|Theta|pi pi> = s + 2 m^2 per real d.o.f."""
    if m / T > 60:
        return 0.0
    return gg_integral(T, m, m, lambda s: nreal * (s + 2 * m**2) ** 2 / M**4, S=0.5)


def gamma_gluon(T, M, mu_fac=2 * PI, cap=1.0):
    """g g -> phi phi via the trace anomaly Theta_g = -(b0 alpha_s/8 pi) G^a G^a.
    Sum_{pol,col}|<gg|G^2|0>|^2 = 64 s^2  ->  gamma = 24 c^2 T^8 / pi^5, c = b0 alpha_s/(8 pi M^2)."""
    mu = mu_fac * T
    a = alpha_s(mu, cap)
    b0 = 11 - 2 * nf_active(mu) / 3
    c = b0 * a / (8 * PI * M**2)
    return 24 * c**2 * T**8 / PI**5


def gamma_higgs(T, M):
    """Higgs-portal channel from Theta_SM = -m_h^2 |H|^2: lambda_p = m_h^2/(2M^2), 4 real components.
    Symmetric phase (T > 160 GeV): massless components, gamma = lambda_p^2 T^4/(32 pi^5).
    Broken phase: h with m_h, three Goldstones ~ W_L, Z_L with m_W, m_Z (equivalence theorem)."""
    mh, mW, mZ = 125.1, 80.4, 91.2
    lp = mh**2 / (2 * M**2)
    if T > 160.0:
        return lp**2 * T**4 / (32 * PI**5)
    tot = 0.0
    for m, n in [(mh, 1), (mW, 2), (mZ, 1)]:
        tot += gg_integral(T, m, m, lambda s: n * 4 * lp**2, S=0.5)
    return tot


# crossover switching
TC, DT_SWITCH = 0.155, 0.015
HAD_FAC, QGP_FAC = 1.0, 1.0        # multiplicative K-factors for the uncertainty band
MU_FAC, AS_CAP = 2 * PI, 1.0
COMBINE = "switch"                # "switch" (tanh interpolation) or "sum" (both phases overlapping)


def w_hadron(T):
    return 0.5 * (1 - np.tanh((T - TC) / DT_SWITCH))


def gamma_channels(T, M):
    """dict of channel -> gamma (GeV^4)."""
    out = {}
    for name, m in LEPTONS:
        out[name] = gamma_fermion(T, M, m)
    wh = w_hadron(T)
    wq = 1 - wh
    if COMBINE == "sum":
        wh = wq = 1.0
    if wq > 1e-6:
        for name, m in QUARKS:
            out[name] = wq * QGP_FAC * gamma_fermion(T, M, m, Nc=3)
        out["g"] = wq * QGP_FAC * gamma_gluon(T, M, MU_FAC, AS_CAP)
    if wh > 1e-6:
        for name, m, nr in MESONS:
            out[name] = wh * HAD_FAC * gamma_scalar(T, M, m, nr)
    if T > 2.0:
        out["H"] = gamma_higgs(T, M)
    return out


def gamma_total(T, M):
    return sum(gamma_channels(T, M).values())


def n_phi_eq(T):
    return Z3 * T**3 / PI**2


def rho_phi_eq(T):
    return PI**2 / 30 * T**4


def Gamma_per_phi(T, M):
    return 2 * gamma_total(T, M) / n_phi_eq(T)


# ----------------------------------------------------------------------------------------------
# 4. Boltzmann equation (number + energy moments) in T
#    d/dt = -H T [1 + (1/3) dln g_s/dln T]^{-1} ... we use  dt = -dlnT (1 + dlngs/3)/H   (s a^3 = const)
#    n: dn/dt + 3 H n = 2 gamma [1 - (n/n_eq)^2]
#    rho: drho/dt + 4 H rho = 2 gamma Ebar [1 - (n/n_eq)^2] + Gamma_el (3 T n - rho)   [Gamma_el optional]
#    Ebar = rho_eq/n_eq (energy per produced phi, thermal average).
# ----------------------------------------------------------------------------------------------
def solve_boltzmann(M, T_start=50.0, T_end=0.005, n0=None, rho0=None, elastic=False, n_grid=None):
    """Integrate from T_start down to T_end. Returns dict with T grid, Y=n/s, R=rho/s^{4/3}, dNeff(T)."""
    def rhs(lnT, y):
        T = np.exp(lnT)
        n, rho = y
        H = hubble(T)
        fac = 1 + dlngs_dlnT(T) / 3          # dt = -dlnT * fac / H
        g = gamma_total(T, M)
        neq = n_phi_eq(T)
        rhoeq = rho_phi_eq(T)
        dep = 1 - (n / neq) ** 2
        dn_dt = -3 * H * n + 2 * g * dep
        drho_dt = -4 * H * rho + 2 * g * (rhoeq / neq) * dep
        if elastic:
            Gel = 2 * g / neq                # elastic energy-exchange rate ~ annihilation rate (crossing); see SUMMARY
            drho_dt += Gel * (3 * T * n - rho) if n > 0 else 0.0
        return [-fac / H * dn_dt, -fac / H * drho_dt]

    if n0 is None:
        n0 = n_phi_eq(T_start)
    if rho0 is None:
        rho0 = rho_phi_eq(T_start) * (n0 / n_phi_eq(T_start))
    lnTs = np.linspace(np.log(T_start), np.log(T_end), 600)
    sol = solve_ivp(rhs, (lnTs[0], lnTs[-1]), [n0, rho0], t_eval=lnTs, method="LSODA", rtol=1e-7, atol=1e-30)
    T = np.exp(sol.t)
    n, rho = sol.y
    rho_nu1 = 2 * (7 / 8) * PI**2 / 30 * T**4       # one neutrino species (nu + nubar)
    dN = rho / rho_nu1
    return dict(T=T, n=n, rho=rho, dNeff=dN, dNeff_final=float(dN[-1]),
                Y=n / np.array([entropy(t) for t in T]))


def T_decouple(M, Tlo=0.01, Thi=50.0, n=400):
    Ts = np.logspace(np.log10(Tlo), np.log10(Thi), n)
    r = np.array([Gamma_per_phi(t, M) / hubble(t) for t in Ts])
    idx = np.where(r >= 1)[0]
    if len(idx) == 0:
        return None, r.max(), Ts, r
    return Ts[idx[0]], r.max(), Ts, r


def dNeff_instant(Tdec):
    return (4 / 7) * (10.75 / g_s(Tdec)) ** (4 / 3)


if __name__ == "__main__":
    M = float(sys.argv[1]) * 1e3 if len(sys.argv) > 1 else 5e3
    print(f"M = {M/1e3:.1f} TeV")
    print("  T[GeV]   Gamma/H    channels (fraction of gamma)")
    for T in [0.02, 0.05, 0.08, 0.1, 0.12, 0.14, 0.155, 0.17, 0.2, 0.25, 0.3, 0.4, 0.5, 0.7, 1.0, 2.0, 5.0, 10.0, 30, 100, 200, 1000]:
        ch = gamma_channels(T, M)
        tot = sum(ch.values())
        top = sorted(ch.items(), key=lambda kv: -kv[1])[:4]
        frac = ", ".join(f"{k}:{v/tot:.2f}" for k, v in top if v / tot > 0.01)
        print(f"  {T:7.3f}  {2*tot/n_phi_eq(T)/hubble(T):9.3e}   {frac}")
    Td, rmax, _, _ = T_decouple(M)
    print(f"  Gamma=H at T_dec = {Td*1e3 if Td else None} MeV ; instantaneous dNeff = {dNeff_instant(Td) if Td else None}")
    sol = solve_boltzmann(M)
    print(f"  Boltzmann dNeff = {sol['dNeff_final']:.4f}")
    sol2 = solve_boltzmann(M, elastic=True)
    print(f"  Boltzmann dNeff (with elastic energy exchange) = {sol2['dNeff_final']:.4f}")
