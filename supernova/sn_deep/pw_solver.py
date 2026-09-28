import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""
Exact partial-wave scattering solutions for realistic local NN potentials (AV18, Reid93, Nijm-II;
compiled from the published Fortran sources via f2py -> nnpots) and the finite-omega TRACE-channel
matrix element for phi-pair emission under the universal (conformal) coupling.

Physics (see sn_note/sn_technical_note.md Sec. 2.5, sn_A/derivation_notes.md eq. 3):
  Under A(phi)=1+phi^2/2M^2 every hadronic mass scales by A and every length by 1/A, so
  H_A = sum_a [A m + p_a^2/(2 A m)] + A V(A r).  The pair couples to S = dH/dA|_{A=1}.
  Between exact eigenstates with E_f = E_i - omega:   <f|S|i> = <f| W |i>,   W = 2V + r dV/dr
  (exact to all orders in V, any omega, K->0).  For a coupled channel W acts on the 2x2 matrix.
  At omega->0 this reduces to the Wigner time delay:  F_l -> e^{2 i delta} d delta/dk,  i.e.
  F -> (1/2i) dS/dk  (matrix).

Normalisation: with scattering-amplitude normalisation f = -(mu/2pi)<k'|V|k>,
  F_{ba}(k',k) = -(1/(k k')) Itilde_{ba},   Itilde_{ba} = int dr u^(b)(k')^T U_W(r) u^(a)(k),
  U_W = (2mu/hbar^2) W,  u^(a) real standing waves with an ORTHOGONAL asymptotic amplitude
  matrix (eigenchannel solutions normalised to unit amplitude).  Then
  sigma_tr(k,k') = pi * sum_{channels} w (2J+1) Tr[F^dagger F]      (w = 2 for nn, 1 for np)
and the trace-channel emission rate per nucleon pair is v'(k') sigma_tr(k,k') x pair phase space.
"""
import numpy as np
from scipy.special import spherical_jn, spherical_yn
import nnpots

HBARC = 197.3269804
MN = 938.918                      # average nucleon mass (same as sn_A)
U_FAC = MN / HBARC ** 2           # 2 mu / (hbar c)^2  [MeV^-1 fm^-2]
W_MODE = 'universal'

# ---------------- channel lists ----------------
# (name, l, S, J, T, coupled)   l = lower l for coupled channels
CH_T1 = [('1S0', 0, 0, 0, 1, False), ('3P0', 1, 1, 0, 1, False), ('3P1', 1, 1, 1, 1, False),
         ('3P2', 1, 1, 2, 1, True), ('1D2', 2, 0, 2, 1, False), ('3F3', 3, 1, 3, 1, False),
         ('1G4', 4, 0, 4, 1, False), ('3F4', 3, 1, 4, 1, True)]
CH_T0 = [('3S1', 0, 1, 1, 0, True), ('1P1', 1, 0, 1, 0, False), ('3D2', 2, 1, 2, 0, False),
         ('3D3', 2, 1, 3, 0, True), ('1F3', 3, 0, 3, 0, False), ('3G4', 4, 1, 4, 0, False)]
SYSTEMS = {'nn': CH_T1, 'np': CH_T1 + CH_T0}


def _reid_name(name, coupled, J):
    return f'3C{J}' if coupled else name


def potential(pot, ch, system, r):
    """V matrix (n,2,2) in MeV for potential 'AV18'|'Reid93'|'NijmII' in channel ch of system 'nn'|'np'."""
    name, l, S, J, T, coupled = ch
    if pot == 'AV18':
        tz = (-1, -1) if system == 'nn' else (-1, 1)
        v = nnpots.av18w(l, S, J, T, tz[0], tz[1], r)
    elif pot == 'Reid93':
        v = nnpots.reid93w(_reid_name(name, coupled, J), 'NN' if system == 'nn' else 'NP', r)
    elif pot == 'NijmII':
        v = nnpots.nijmw(2, _reid_name(name, coupled, J), 'NN' if system == 'nn' else 'NP', r)
    else:
        raise ValueError(pot)
    v = np.asarray(v, float)
    if not coupled:
        v[:, 0, 1] = v[:, 1, 0] = v[:, 1, 1] = 0.0
    return v


def riccati(l, x):
    return x * spherical_jn(l, x), x * spherical_yn(l, x)   # jhat -> sin(x-l pi/2), nhat -> -cos(x-l pi/2)


class Channel:
    """Numerov solutions for one partial wave at a set of energies (vectorised over energies)."""

    def __init__(self, pot, ch, system, Ecm, rmax=16.0, h=0.004):
        self.ch = ch; self.pot = pot; self.system = system
        name, l, S, J, T, coupled = ch
        self.ls = (l, l + 2) if coupled else (l,)
        self.nc = 2 if coupled else 1
        self.r = np.arange(h, rmax + h / 2, h); r = self.r; self.h = h
        V = potential(pot, ch, system, r)[:, :self.nc, :self.nc]
        # W = 2V + r dV/dr  (matrix), derivative by central differences
        dV = np.gradient(V, r, axis=0)
        # W_MODE 'universal': S = dH/dA -> <f|2V + r V'|i>  (conformal coupling; all scales rescale)
        # W_MODE 'nucleon' : phi^2 m_N NbarN only (Olive-Pospelov operator) -> <f|S|i> = <f|V|i>
        self.W = (2 * V + r[:, None, None] * dV) if W_MODE == 'universal' else V
        self.UV = U_FAC * V
        self.UW = U_FAC * self.W
        self.E = np.asarray(Ecm, float)
        self.k = np.sqrt(U_FAC * self.E)          # fm^-1
        self._solve()

    def _solve(self):
        r, h, k = self.r, self.h, self.k
        nE, nc, nr = len(k), self.nc, len(r)
        L = np.zeros((nr, nc, nc))
        for i, l in enumerate(self.ls):
            L[:, i, i] = l * (l + 1) / r ** 2
        # Q(r) = k^2 - L/r^2 - U   -> shape (nE, nr, nc, nc)
        Q = (k[:, None, None, None] ** 2) * np.eye(nc)[None, None] - (L + self.UV)[None]
        I = np.eye(nc)
        A = I + h * h * Q / 12.0                   # (nE,nr,nc,nc)
        B = 2 * (I - 5 * h * h * Q / 12.0)
        Ainv = np.linalg.inv(A)
        # u: (nE, nr, nc, nsol) with nsol=nc independent regular solutions
        u = np.zeros((nE, nr, nc, nc))
        for a, l in enumerate(self.ls):
            u[:, 0, a, a] = r[0] ** (l + 1)
            u[:, 1, a, a] = r[1] ** (l + 1)
        for n in range(1, nr - 1):
            rhs = np.einsum('eij,ejk->eik', B[:, n], u[:, n]) - np.einsum('eij,ejk->eik', A[:, n - 1], u[:, n - 1])
            u[:, n + 1] = np.einsum('eij,ejk->eik', Ainv[:, n + 1], rhs)
            if n % 400 == 0:   # renormalise to avoid overflow (only relative normalisation matters)
                sc = np.abs(u[:, n + 1]).max(axis=(1, 2))
                sc = np.where(sc > 0, sc, 1.0)
                u[:, :n + 2] /= sc[:, None, None, None]
        # match at two points near rmax: u_l^(a)(r_m) = jhat_l(k r_m) Aamp_{la} - nhat_l(k r_m) Bamp_{la}
        m1, m2 = nr - 1 - int(1.0 / h), nr - 1      # separated by 1 fm
        Aamp = np.zeros((nE, nc, nc)); Bamp = np.zeros((nE, nc, nc))
        for i, l in enumerate(self.ls):
            j1, n1 = riccati(l, k * r[m1]); j2, n2 = riccati(l, k * r[m2])
            det = -j1 * n2 + n1 * j2
            for a in range(nc):
                u1, u2 = u[:, m1, i, a], u[:, m2, i, a]
                Aamp[:, i, a] = (-u1 * n2 + n1 * u2) / det
                Bamp[:, i, a] = (j1 * u2 - j2 * u1) / det    # so that u = j A - n B  (Cramer; sign fixed)
        K = np.einsum('eij,ejk->eik', Bamp, np.linalg.inv(Aamp))
        K = 0.5 * (K + np.swapaxes(K, 1, 2))
        self.K = K
        # K-matrix standing waves u_K^(a) = sum_b u^(b) (Aamp^-1)_{ba}
        uK = np.einsum('erib,eba->eria', u, np.linalg.inv(Aamp))
        # eigenchannels: K = O^T tan(delta) O  ;  u^(alpha) = cos(delta_alpha) sum_l O_{alpha l} u_K^(l)
        tand, Ot = np.linalg.eigh(K)               # K = Ot diag Ot^T  ->  O = Ot^T
        delta = np.arctan(tand)
        O = np.swapaxes(Ot, 1, 2)
        self.delta_eig = delta                      # (nE, nc) eigenphases (mod pi)
        self.O = O
        ueig = np.einsum('erla,eal->erla'.replace('erla,eal->erla', 'erlb,eab->erla'), uK, O)  # sum_b O_{ab} uK^(b)
        ueig = ueig * np.cos(delta)[:, None, None, :]
        self.u = ueig                               # (nE, nr, nc, nalpha): orthonormal standing waves
        # S matrix and nuclear-bar phases
        Kc = K.astype(complex)
        Ic = np.eye(nc)[None]
        self.S = np.einsum('eij,ejk->eik', Ic + 1j * Kc, np.linalg.inv(Ic - 1j * Kc))

    def bar_phases(self):
        """(delta1, delta2, eps) in degrees, nuclear-bar convention (delta2/eps zero if uncoupled)."""
        S = self.S
        if self.nc == 1:
            return np.degrees(np.angle(S[:, 0, 0]) / 2), None, None
        d1 = np.angle(S[:, 0, 0]) / 2; d2 = np.angle(S[:, 1, 1]) / 2
        s2e = (S[:, 0, 1] / (1j * np.exp(1j * (d1 + d2)))).real
        c2e = np.abs(S[:, 0, 0]) / np.where(np.abs(np.cos(2 * np.arcsin(np.clip(s2e, -1, 1)))) > 0, 1, 1)
        eps = 0.5 * np.arcsin(np.clip(s2e, -1, 1))
        return np.degrees(d1), np.degrees(d2), np.degrees(eps)

    def trace_matrix(self):
        """Itilde_{beta alpha}(k_f, k_i) = int u^(beta)(k_f)^T U_W u^(alpha)(k_i) dr  -> shape (nEf, nEi, nc, nc) [fm^-1].
        Also returns Tr F^dagger F with F = -Itilde/(k_i k_f):  G(k_f,k_i) = sum |Itilde|^2/(k_i k_f)^2  [fm^2]."""
        u = self.u; h = self.h
        # Wu[e, r, l, alpha] = sum_l' UW[r,l,l'] u[e,r,l',alpha]
        Wu = np.einsum('rll,erla->erla'.replace('rll,erla->erla', 'rlm,erma->erla'), self.UW, u)
        # I[f, i, beta, alpha] = sum_r u[f, r, l, beta] Wu[i, r, l, alpha] * h
        I = np.einsum('frlb,irla->fiba', u, Wu) * h
        G = np.sum(I ** 2, axis=(2, 3)) / np.outer(self.k, self.k) ** 2
        return I, G

    def trace_softlimit(self):
        """(1/4) Tr[S'^dagger S'] with S' = dS/dk by finite differences on the energy grid  [fm^2]."""
        dS = np.gradient(self.S, self.k, axis=0)
        return 0.25 * np.sum(np.abs(dS) ** 2, axis=(1, 2))


def sigma_tables(pot, system, Ecm, **kw):
    """Return dict with sigma_tr(kf, ki) [fm^2] (finite omega, exact), its omega->0 diagonal from the
    potential's own S-matrix, elastic sigma from the potential, per channel and summed."""
    w = 2.0 if system == 'nn' else 1.0
    out = {'E': np.asarray(Ecm), 'k': np.sqrt(U_FAC * np.asarray(Ecm)), 'chan': {}}
    G_tot = 0; soft_tot = 0; el_tot = 0
    for ch in SYSTEMS[system]:
        name, l, S, J, T, coupled = ch
        c = Channel(pot, ch, system, Ecm, **kw)
        I, G = c.trace_matrix()
        soft = c.trace_softlimit()
        # elastic: sigma = pi/k^2 sum (2J+1) sum_{ab}|S_ab - delta_ab|^2 /4 ... spin-averaged: (pi/k^2)(2J+1) * (1/4)Tr|S-1|^2
        el = np.pi / c.k ** 2 * 0.25 * np.sum(np.abs(c.S - np.eye(c.nc)[None]) ** 2, axis=(1, 2))
        out['chan'][name] = dict(G=G, soft=soft, el=el, phases=c.bar_phases(), J=J)
        G_tot = G_tot + (2 * J + 1) * G
        soft_tot = soft_tot + (2 * J + 1) * soft
        el_tot = el_tot + (2 * J + 1) * el
    out['sigma_tr'] = w * np.pi * G_tot          # (nEf, nEi)  fm^2
    out['sigma_tr_soft'] = w * np.pi * soft_tot  # (nE,)
    out['sigma_el'] = w * el_tot                 # (nE,)  fm^2 (half-sphere convention for nn)
    return out


if __name__ == '__main__':
    import json, sys
    Ecm = np.array([2.5, 5, 12.5, 25, 50, 75, 100, 150, 175])
    pwa = json.load(open((_GI + '/supernova/sn_A/data/pwa93_phases.json')))
    for pot in ('AV18', 'Reid93', 'NijmII'):
        print(f'==== {pot}: phase shifts (deg) vs PWA93 at T_lab = 2 E_cm ====')
        for system in ('np', 'nn'):
            tab = pwa['np' if system == 'np' else 'pp']
            for ch in SYSTEMS[system]:
                name, l, S, J, T, coupled = ch
                c = Channel(pot, ch, system, Ecm)
                d1, d2, eps = c.bar_phases()
                row = []
                for i, E in enumerate(Ecm):
                    Tl = str(int(round(2 * E)))
                    ref = tab.get(Tl, {}).get(name, None)
                    mine = d1[i] % 180 if name in ('3S1',) else d1[i]
                    if ref is not None and name == '3S1': ref = ref % 180
                    row.append(f"{mine:6.1f}/{ref if ref is not None else float('nan'):6.1f}")
                print(f"  {system} {name}: " + ' '.join(row))
                if coupled:
                    n2 = {'3P2': '3F2', '3S1': '3D1', '3D3': '3G3', '3F4': '3H4'}[name]
                    row = [f"{d2[i]:6.1f}/{tab.get(str(int(round(2*E))),{}).get(n2, float('nan')):6.1f}" for i, E in enumerate(Ecm)]
                    print(f"  {system} {n2}: " + ' '.join(row))
                    row = [f"{eps[i]:6.1f}/{tab.get(str(int(round(2*E))),{}).get('E%d'%J, float('nan')):6.1f}" for i, E in enumerate(Ecm)]
                    print(f"  {system} eps{J}: " + ' '.join(row))
