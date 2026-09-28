"""
Relativistic tree-level one-pion-exchange (OPE) calculation of  N N -> N N + h,
h = the phi-phi pair (invariant mass^2 s = K^2), for the universal conformal coupling
A(phi) = 1 + h,  h = phi^2/(2 M^2).  Einstein-frame Lagrangian at O(h), in the field basis
where nucleons are Weyl-rescaled (psi -> A^{-3/2} psi) and the pion is NOT rescaled:
    L_N    = -(1+h) m Nbar N                          -> NN(phiphi) vertex: -i m/M^2
    L_pi   = (1+2h) (d pi)^2/2 - (1+4h) m_pi^2 pi^2/2 -> pi(k)->pi(k') (phiphi): (i/M^2)(2 k.k' - 4 m_pi^2)
    L_piNN = (g_A/2f_pi) Nbar gamma^mu gamma5 tau^a N d_mu pi^a   (h-independent in this basis)
(These reproduce the chiral LO result <pi|theta^mu_mu|pi> = 2m_pi^2 + t and m_N for nucleons.)

Diagrams (t-channel; u-channel = 3<->4 with fermion sign and isospin factors):
 (a),(b): h from outgoing/incoming leg of line 1 ; (c),(d): same on line 2 ; (e): h from pion.
We compute sum_spins |M|^2 numerically with explicit Dirac spinors, and the emissivity in the
non-degenerate limit (NN CM frame; nucleon CM motion neglected).  Compared with:
   SRA-Q : sum|M_NN^el(OPE)|^2 x <|Fhat_Q|^2>/M^4 at the same phase-space point.
Purpose: ratio full/SRA-Q (O(1) 'NLO' terms: recoil, s/(m w), relativistic, pion-emission).
"""
import numpy as np
from sra import HBARC, MN, MEV_PER_GCC, ERG_G_S_PER_MEV

gA, fpi, mpi = 1.27, 92.4, 138.0
gpv = gA / (2 * fpi)

# Dirac matrices (Dirac representation)
I2 = np.eye(2); Z2 = np.zeros((2, 2))
sx = np.array([[0, 1], [1, 0]], complex); sy = np.array([[0, -1j], [1j, 0]]); sz = np.array([[1, 0], [0, -1]], complex)
g0 = np.block([[I2, Z2], [Z2, -I2]]).astype(complex)
gs = [np.block([[Z2, s], [-s, Z2]]) for s in (sx, sy, sz)]
g5 = np.block([[Z2, I2], [I2, Z2]]).astype(complex)
I4 = np.eye(4, dtype=complex)

def slash(p):
    """p: (N,4) contravariant (E, px, py, pz) -> (N,4,4) p_mu gamma^mu = E g0 - p.gvec"""
    return (p[:, 0, None, None] * g0 - p[:, 1, None, None] * gs[0]
            - p[:, 2, None, None] * gs[1] - p[:, 3, None, None] * gs[2])

def dot(a, b):
    return a[:, 0] * b[:, 0] - np.sum(a[:, 1:] * b[:, 1:], axis=1)

def spinors(p, m=MN):
    """u(p,s) for s=0,1 : (N,2,4), normalized ubar u = 2m."""
    E = p[:, 0]; N = len(E)
    chis = [np.array([1, 0], complex), np.array([0, 1], complex)]
    sp = (p[:, 1, None, None] * sx + p[:, 2, None, None] * sy + p[:, 3, None, None] * sz)  # (N,2,2)
    out = np.zeros((N, 2, 4), complex)
    for s, chi in enumerate(chis):
        low = np.einsum('nij,j->ni', sp, chi) / (E + m)[:, None]
        out[:, s, :2] = chi[None, :]
        out[:, s, 2:] = low
        out[:, s] *= np.sqrt(E + m)[:, None]
    return out

def bil(uf, G, ui):
    """ubar_f G u_i for all spin pairs -> (N,2,2) [sf, si]."""
    ubar = np.conj(uf) @ g0  # (N,2,4) row vectors (u^dagger g0)
    return np.einsum('nai,nij,nbj->nab', ubar, G, ui)

def amp_line_sets(p1, p2, p3, p4, K, m=MN, with_h=True):
    """Return list of (coef (N,), G1 (N,4,4) for line 1->3, G2 (N,4,4) for line 2->4)
    for the direct (t-channel) amplitude, M_t = sum coef * [u3bar G1 u1][u4bar G2 u2].
    If with_h=False: elastic OPE amplitude (K ignored)."""
    q5 = lambda q: slash(q) @ g5
    if not with_h:
        q = p1 - p3
        D = dot(q, q) - mpi ** 2
        return [(-gpv ** 2 / D, q5(q), q5(q))]  # M = -(g/2f)^2 [..][..]/D
    terms = []
    qa = p1 - p3 - K          # pion momentum for (a),(b)
    qc = p1 - p3              # for (c),(d); (e): q1=qc, q2=qa
    Da, Dc = dot(qa, qa) - mpi ** 2, dot(qc, qc) - mpi ** 2
    P3 = dot(p3 + K, p3 + K) - m ** 2; P1 = dot(p1 - K, p1 - K) - m ** 2
    P4 = dot(p4 + K, p4 + K) - m ** 2; P2 = dot(p2 - K, p2 - K) - m ** 2
    mI = m * I4[None]
    pref = -gpv ** 2 * m   # times 1/M^2 (dropped; restored outside)
    terms.append((pref / (P3 * Da), (slash(p3 + K) + mI) @ q5(qa), q5(qa)))       # (a)
    terms.append((pref / (P1 * Da), q5(qa) @ (slash(p1 - K) + mI), q5(qa)))       # (b)
    terms.append((pref / (P4 * Dc), q5(qc), (slash(p4 + K) + mI) @ q5(qc)))       # (c)
    terms.append((pref / (P2 * Dc), q5(qc), q5(qc) @ (slash(p2 - K) + mI)))       # (d)
    ce = gpv ** 2 * (2 * dot(qc, qa) - 4 * mpi ** 2) / (Dc * Da)
    terms.append((ce, q5(qc), q5(qa)))                                               # (e)
    return terms

def sum_M2(p1, p2, p3, p4, K, chan, parts=('a', 'b', 'c', 'd', 'e'), with_h=True):
    """sum over all 16 spin configurations of |M|^2 (units: M^2 factor removed)."""
    u1, u2, u3, u4 = spinors(p1), spinors(p2), spinors(p3), spinors(p4)
    names = ['a', 'b', 'c', 'd', 'e'] if with_h else ['el']
    # direct
    Mt = 0
    for nm, (c, G1, G2) in zip(names, amp_line_sets(p1, p2, p3, p4, K, with_h=with_h)):
        if with_h and nm not in parts: continue
        B1 = bil(u3, G1, u1); B2 = bil(u4, G2, u2)          # [s3,s1], [s4,s2]
        Mt = Mt + c[:, None, None, None, None] * B1[:, :, :, None, None] * B2[:, None, None, :, :]
        # index order: n, s3, s1, s4, s2
    # exchange (3<->4): line 1 -> 4, line 2 -> 3
    Mu = 0
    for nm, (c, G1, G2) in zip(names, amp_line_sets(p1, p2, p4, p3, K, with_h=with_h)):
        if with_h and nm not in parts: continue
        B1 = bil(u4, G1, u1); B2 = bil(u3, G2, u2)          # [s4,s1], [s3,s2]
        Mu = Mu + c[:, None, None, None, None] * np.transpose(
            B1[:, :, :, None, None] * B2[:, None, None, :, :], (0, 3, 2, 1, 4))
        # B1*B2 order: n, s4, s1, s3, s2 -> transpose to n, s3, s1, s4, s2
    if chan == 'nn':
        M = Mt - Mu
    else:  # np: direct pi0 (tau3 tau3 = -1), exchange charged (factor 2), fermion sign -
        M = -Mt - 2 * Mu
    return np.sum(np.abs(M) ** 2, axis=(1, 2, 3, 4))

def boost(p4v, beta):
    """boost 4-vectors p4v (N,4) by velocity beta (N,3)."""
    b2 = np.sum(beta ** 2, 1); g = 1 / np.sqrt(1 - b2)
    bp = np.sum(beta * p4v[:, 1:], 1)
    E = g * (p4v[:, 0] + bp)
    coef = np.where(b2 > 0, (g - 1) * bp / np.where(b2 > 0, b2, 1), 0) + g * p4v[:, 0]
    return np.column_stack([E, p4v[:, 1:] + coef[:, None] * beta])

def run(T=30.0, chan='nn', N=100000, seed=0, parts=('a', 'b', 'c', 'd', 'e'), m=MN, wfrac=1.0):
    """MC over: relative momentum p (Maxwellian ~exp(-p^2/mT)), omega, |K|, directions,
    final NN direction.  Returns <integrand> for full and SRA-Q (per n1 n2, per M^-4)."""
    rng = np.random.default_rng(seed)
    sp = np.sqrt(m * T / 2)
    pv = rng.normal(0, sp, (N, 3)); pm = np.linalg.norm(pv, axis=1)
    E1 = np.sqrt(m ** 2 + pm ** 2)
    p1 = np.column_stack([E1, pv]); p2 = np.column_stack([E1, -pv])
    Ecm = 2 * E1
    wmax = (Ecm - 2 * m) * wfrac
    w = rng.random(N) * wmax
    Kmax = np.sqrt(np.maximum((Ecm - w) ** 2 - 4 * m ** 2, 0))  # final NN needs W>=2m
    Kmax = np.minimum(Kmax, w)
    Km = rng.random(N) * Kmax
    cK = rng.uniform(-1, 1, N); fK = rng.uniform(0, 2 * np.pi, N); sK = np.sqrt(1 - cK ** 2)
    Kv = Km[:, None] * np.column_stack([sK * np.cos(fK), sK * np.sin(fK), cK])
    K = np.column_stack([w, Kv])
    # final NN system: total 4-mom (Ecm - w, -Kv)
    Pf = np.column_stack([Ecm - w, -Kv])
    W = np.sqrt(np.maximum(dot(Pf, Pf), 4 * m ** 2))
    ps = np.sqrt(np.maximum(W ** 2 / 4 - m ** 2, 0))
    c3 = rng.uniform(-1, 1, N); f3 = rng.uniform(0, 2 * np.pi, N); s3 = np.sqrt(1 - c3 ** 2)
    n3 = np.column_stack([s3 * np.cos(f3), s3 * np.sin(f3), c3])
    E3s = W / 2
    p3s = np.column_stack([E3s, ps[:, None] * n3]); p4s = np.column_stack([E3s, -ps[:, None] * n3])
    beta = Pf[:, 1:] / Pf[:, [0]]
    p3 = boost(p3s, beta); p4 = boost(p4s, beta)
    # phase space weight: (1/(16 E1^2)) * d^4K/(2pi)^4 * beta_phi/(16pi) * omega * Phi2
    # Phi2 = ps/(16 pi^2 W) dOmega* -> sampled uniformly: 4pi * ps/(16 pi^2 W) = ps/(4 pi W)
    Phi2 = ps / (4 * np.pi * W)
    wK = wmax * Kmax * 4 * np.pi * Km ** 2 / (2 * np.pi) ** 4 / (16 * np.pi)
    ok = (Kmax > 0) & (W > 2 * m)
    base = ok * (1 / (16 * E1 ** 2)) * wK * w * Phi2
    Mfull = sum_M2(p1, p2, p3, p4, K, chan, parts=parts)
    # SRA-Q: elastic OPE at initial energy, final relative direction from (p3-p4)
    rel = 0.5 * (p3[:, 1:] - p4[:, 1:]); nrel = rel / np.linalg.norm(rel, axis=1)[:, None]
    p3e = np.column_stack([E1, pm[:, None] * nrel]); p4e = np.column_stack([E1, -pm[:, None] * nrel])
    Mel = sum_M2(p1, p2, p3e, p4e, K, chan, with_h=False)
    pfm = np.linalg.norm(rel, axis=1)
    cth = np.sum(pv * nrel, 1) / pm
    TrA = pfm ** 2 - pm ** 2
    AA = pfm ** 4 + pm ** 4 - 2 * (pm * pfm * cth) ** 2
    # direct (not K-averaged) quadrupole factor with actual K:
    KA = (np.sum(Kv * rel, 1)) ** 2 - (np.sum(Kv * pv, 1)) ** 2
    FQ2 = (2 / (m * w ** 3) * KA) ** 2
    FQ2avg = 4 / (15 * m ** 2 * w ** 6) * Km ** 4 * (TrA ** 2 + 2 * AA)
    res = {'full': base * Mfull, 'sraQ': base * Mel * FQ2, 'sraQavg': base * Mel * FQ2avg,
           'el_rate': ok * Mel}
    return {k: (np.mean(v), np.std(v) / np.sqrt(N)) for k, v in res.items()}

if __name__ == '__main__':
    import sys
    for T in (20.0, 30.0, 40.0):
        for ch in ('nn', 'np'):
            r = run(T, ch, N=60000, seed=1)
            rr = {p: run(T, ch, N=60000, seed=1, parts=p)['full'][0] for p in (('a', 'b', 'c', 'd'), ('e',))}
            print(f"T={T} {ch}: full={r['full'][0]:.3e}+-{r['full'][1]:.1e}  SRA-Q={r['sraQ'][0]:.3e}+-{r['sraQ'][1]:.1e}"
                  f" (Kavg {r['sraQavg'][0]:.3e})  ratio full/SRA-Q = {r['full'][0]/r['sraQ'][0]:.2f} | "
                  f"external-only/SRA-Q = {rr[('a','b','c','d')]/r['sraQ'][0]:.2f}, pion-only/SRA-Q = {rr[('e',)]/r['sraQ'][0]:.2f}",
                  flush=True)
