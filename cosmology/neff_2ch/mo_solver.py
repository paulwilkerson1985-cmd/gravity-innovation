"""
Numerical Muskhelishvili-Omnes solver (one or two channels) for the Omnes matrix Omega(s):
    Im Omega(s) = t(s)^* Sigma(s) Omega(s)   on the cut,   Omega(0) = 1,   Omega_ij(s) ~ 1/s at large s,
using the UNSUBTRACTED dispersion relation Omega(s) = (1/pi) int ds' Im Omega(s')/(s' - s), whose solution space
(decaying like 1/s) has dimension = number of channels when every phase reaches pi at s_a (index (1,1)); the
normalization Omega(0) = 1 then fixes it uniquely.  Nystrom discretization on a midpoint grid in u = sqrt(s) with
singularity subtraction; null space from the SVD.  Units GeV.
"""
import numpy as np

MPI, MK = 0.13957, 0.4957
PI = np.pi


class MOSolver:
    def __init__(self, tfun, nch=2, ua=2.0, h=0.001, mth=(MPI, MK)):
        self.tfun, self.nch = tfun, nch
        uth = 2 * mth[0]
        self.sth, self.sa = uth ** 2, ua ** 2
        n = int(round((ua - uth) / h))
        self.u = uth + (np.arange(n) + 0.5) * (ua - uth) / n
        self.h = (ua - uth) / n
        self.s = self.u ** 2
        self.w = 2 * self.u * self.h
        self.sK = (2 * mth[1]) ** 2
        self.mth = mth
        self._build_A()

    def _build_A(self):
        n, c = len(self.s), self.nch
        A = np.zeros((n, c, c), complex)
        for l, s in enumerate(self.s):
            t = np.atleast_2d(self.tfun(s))[:c, :c]
            sg = np.zeros(c)
            sg[0] = np.sqrt(1 - 4 * self.mth[0] ** 2 / s)
            if c > 1 and s > self.sK:
                sg[1] = np.sqrt(1 - 4 * self.mth[1] ** 2 / s)
            A[l] = np.conj(t) @ np.diag(sg)
        self.A = A

    def solve(self):
        s, w, n, c = self.s, self.w, len(self.s), self.nch
        # kernel K (n x n): (K f)_k = sum_{l!=k} w_l (f_l - f_k)/(s_l - s_k) + w_k f'_k + f_k (L_k + i pi)
        ds = s[None, :] - s[:, None]
        np.fill_diagonal(ds, 1.0)
        K = w[None, :] / ds
        np.fill_diagonal(K, 0.0)
        diag = -K.sum(axis=1) + np.log((self.sa - s) / (s - self.sth)) + 1j * PI
        K = K.astype(complex)
        K[np.arange(n), np.arange(n)] = diag
        # derivative term w_k f'_k with central differences
        for k in range(n):
            if 0 < k < n - 1:
                d = s[k + 1] - s[k - 1]
                K[k, k + 1] += w[k] / d
                K[k, k - 1] -= w[k] / d
        K /= PI
        # big matrix  M = I - K (x) A   acting on Omega_l (c-vectors)
        M = np.eye(n * c, dtype=complex)
        for i in range(c):
            for j in range(c):
                # block (i,j): -K_kl A_l[i,j]
                M[i::c, j::c] -= K * self.A[None, :, i, j]
        U, S, Vh = np.linalg.svd(M)
        self.svals = S[-(c + 2):]
        V = Vh.conj().T[:, -c:]          # null vectors (columns), length n*c
        # Omega(0) of each null vector: (1/pi) sum_l w_l (A_l Omega_l)/s_l
        O0 = np.zeros((c, c), complex)
        Om_nodes = []
        for j in range(c):
            Om = V[:, j].reshape(n, c)
            f = np.einsum('lij,lj->li', self.A, Om)
            O0[:, j] = (w[:, None] * f / s[:, None]).sum(axis=0) / PI
            Om_nodes.append(Om)
        Cm = np.linalg.inv(O0)
        # Omega matrix at nodes: Omega[l] (c x c) = [v1 v2] C
        Vn = np.stack(Om_nodes, axis=2)           # n x c x c (rows: channel, cols: null vec)
        self.Om = np.einsum('lij,jk->lik', Vn, Cm)
        self.f = np.einsum('lij,ljk->lik', self.A, self.Om)   # Im Omega at nodes (should be real)
        return self

    def omega(self, s):
        """Omega(s) for s off the cut (s < s_th, or s > s_a) via the dispersion integral; on the cut: interpolation of
        the nodal solution."""
        if self.sth < s < self.sa:
            u = np.sqrt(s)
            out = np.zeros((self.nch, self.nch), complex)
            for i in range(self.nch):
                for j in range(self.nch):
                    out[i, j] = np.interp(u, self.u, self.Om[:, i, j].real) + 1j * np.interp(u, self.u, self.Om[:, i, j].imag)
            return out
        return np.einsum('l,lij->ij', self.w / (self.s - s), self.f) / PI

    def omega_prime0(self):
        return np.einsum('l,lij->ij', self.w / self.s ** 2, self.f) / PI
