"""
Two-channel (pi pi, K Kbar) I=0 S-wave dynamics and the trace (Theta) form factors theta_pi(s), theta_K(s).

T-matrix model: LO chiral kernels unitarized with the cutoff-regularized two-meson loop (Oller & Oset 1997,
Nucl. Phys. A620, 438). Normalization used here: S = 1 + 2 i sqrt(sigma) t sqrt(sigma), sigma_i = sqrt(1-4 m_i^2/s),
t_ij = -T^OO_ij / (16 pi). Unitarized t = D^{-1} V with D = 1 - V Gt, Gt = -16 pi G^OO (Im Gt = sigma).

Form factors (column vector in the I=0 unitary-normalized basis):
  F = ( sqrt(3/2) theta_pi , sqrt(2) theta_K ),   F(s) = D(s)^{-1} P(s),  P linear in s,
fixed by the exact low-energy theorems theta_P(0) = 2 m_P^2 and the LO slopes theta_P'(0) = 1 (varied).
D^{-1} has the right-hand cut only and Disc D^{-1} = 2 i t sigma (D^{-1})*, so F obeys two-channel Watson/unitarity
with this t (a Muskhelishvili-Omnes solution).  Units GeV.
"""
import numpy as np
from scipy.integrate import quad

MPI, MK = 0.13957, 0.4957
FPI = 0.0924
PI = np.pi
NORM = np.array([np.sqrt(1.5), np.sqrt(2.0)])


def sig(s, m):
    return np.sqrt(complex(1 - 4 * m * m / s))


def G_oo(s, m, qmax):
    """Oller-Oset cutoff loop for equal masses (analytic form), s real > 0 approached from above (+i eps).
    G = (1/16 pi^2) { sigma ln[(sigma a + 1)/(sigma a - 1)] - 2 ln[(qmax/m)(1 + a)] },  a = sqrt(1 + m^2/qmax^2)."""
    a = np.sqrt(1 + m * m / qmax ** 2)
    sg = np.sqrt(complex(1 - 4 * m * m / s) + 0j)
    if s > 4 * m * m:
        sg = abs(sg.real) + 0j
        val = sg * (np.log(abs((sg.real * a + 1) / (sg.real * a - 1))) - 1j * PI * (sg.real * a < 1))
    else:
        # 0 < s < 4m^2: sigma = i x, x = sqrt(4m^2/s - 1); sigma ln((i x a+1)/(i x a-1)) = i x * (-2i) arctan(1/(x a)) = 2x arctan(1/(xa))... sign below
        x = np.sqrt(4 * m * m / s - 1)
        z = (1j * x * a + 1) / (1j * x * a - 1)
        val = 1j * x * np.log(z)
    return (val - 2 * np.log(qmax / m * (1 + a))) / (16 * PI ** 2)


def G_oo_numeric(s, m, qmax, eps=1e-7):
    if s > 4 * m * m and s / 4 - m * m < qmax ** 2:
        q0 = np.sqrt(s / 4 - m * m)
        h = lambda q: -q * q / (8 * PI ** 2 * np.sqrt(q * q + m * m) * (q + q0))
        re = quad(h, 0, qmax, weight='cauchy', wvar=q0, limit=400)[0]
    else:
        f = lambda q: q * q / (2 * PI ** 2) / (np.sqrt(q * q + m * m) * (s - 4 * (q * q + m * m)))
        re = quad(f, 0, qmax, limit=400)[0]
    # imaginary part analytically: -pi delta(s-4w^2)
    if s > 4 * m * m and s / 4 - m * m < qmax ** 2:
        im = -np.sqrt(1 - 4 * m * m / s) / (16 * PI)
    else:
        im = 0.0
    return re + 1j * im


class TwoChannel:
    def __init__(self, qmax=1.03, f=FPI, mpi=MPI, mk=MK, slope_pi=1.0, slope_k=1.0):
        self.qmax, self.f, self.mpi, self.mk = qmax, f, mpi, mk
        self.slope_pi, self.slope_k = slope_pi, slope_k
        self._setup_poly()

    def V(self, s):
        f2 = self.f ** 2
        T11 = -(s - self.mpi ** 2 / 2) / f2
        T12 = -np.sqrt(3) * s / (4 * f2)
        T22 = -3 * s / (4 * f2)
        return -np.array([[T11, T12], [T12, T22]]) / (16 * PI)   # t-normalization

    def Gt(self, s):
        return np.diag([-16 * PI * G_oo(s, self.mpi, self.qmax), -16 * PI * G_oo(s, self.mk, self.qmax)])

    def D(self, s):
        return np.eye(2) - self.V(s) @ self.Gt(s)

    def t(self, s):
        return np.linalg.solve(self.D(s), self.V(s))

    def S(self, s):
        sg = np.array([sig(s, self.mpi), sig(s, self.mk)])
        rt = np.sqrt(sg)
        return np.eye(2) + 2j * np.outer(rt, rt) * self.t(s)

    def phases(self, s):
        """delta_pipi (deg, continuous branch handled by caller), eta, and phase of S12."""
        Sm = self.S(s)
        eta = abs(Sm[0, 0])
        d1 = np.angle(Sm[0, 0]) / 2
        return d1, eta, Sm

    # ---- form factors -------------------------------------------------------------------------------
    def _setup_poly(self):
        F0 = NORM * np.array([2 * self.mpi ** 2, 2 * self.mk ** 2])
        F1 = NORM * np.array([self.slope_pi, self.slope_k])
        h = 1e-5
        D0 = self.D(-h).real * 0.5 + self.D(h).real * 0.5 if False else self._Dreal(0.0)
        Dp = (self._Dreal(h) - self._Dreal(-h)) / (2 * h)
        Di0 = np.linalg.inv(D0)
        dDi = -Di0 @ Dp @ Di0
        A = D0 @ F0
        B = D0 @ (F1 - dDi @ A)
        self.A, self.B = A, B

    def _Dreal(self, s):
        """D at real s below threshold (incl. s <= 0), where it is real."""
        if abs(s) < 1e-12:
            s = 1e-12
        if s > 0:
            return self.D(s).real
        # s < 0: G for s<0: use analytic continuation sigma = sqrt(1-4m^2/s) real > 1
        Gs = []
        for m in (self.mpi, self.mk):
            a = np.sqrt(1 + m * m / self.qmax ** 2)
            sg = np.sqrt(1 - 4 * m * m / s)
            val = sg * np.log((sg * a + 1) / (sg * a - 1))
            Gs.append((val - 2 * np.log(self.qmax / m * (1 + a))) / (16 * PI ** 2))
        Gt = np.diag([-16 * PI * Gs[0], -16 * PI * Gs[1]])
        return np.eye(2) - self.V(s) @ Gt

    def F(self, s):
        P = self.A + self.B * s
        return np.linalg.solve(self.D(s), P.astype(complex))

    def theta(self, s):
        Fv = self.F(s)
        return Fv[0] / NORM[0], Fv[1] / NORM[1]
