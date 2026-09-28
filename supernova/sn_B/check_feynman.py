"""
Cross-check of (i) the Einstein-frame Feynman rules for the conformally coupled phi^2 and
(ii) the exact identity O = (k_i k_j/w^2 - delta_ij) T^ij evaluated in NR Born approximation,
for p p -> p p (phi phi) via DIRECT pi0 exchange (pseudovector coupling).

Feynman rules (derived from A(phi)=1+phi^2/2M^2, Jordan->Einstein field rescaling):
  NN(phi phi)      : -i m / M^2
  pi pi (phi phi)  : -i (2 m_pi^2 + s)/M^2          (s = q^2 of the pair)
  piNN             : Gamma(x) = -G xslash g5          (x = pion momentum absorbed at vertex)
  piNN(phi phi)    : (Gamma(q) - Gamma(x))/M^2       (contact; q = pair momentum)
NR identity side:
  O_fi = P_ij X_ij,  P = (k k/w^2 - 1),
  X_ij = V(qt) (k'_i k'_j - k_i k_j)/(mu w) + sym d/dqt_i ( qt_j V(qt) )
  with V(qt) = -G^2 (s1.qt)(s2.qt)/(qt^2+mpi^2)   (spin operator), qt = p1 - p3
Expect |M_rel|^2 -> (2m)^4 |O_fi|^2 / M^4 at leading order in v.
"""
import numpy as np

m = 938.92; mpi = 138.0; G = 1.0; Mphi = 1.0
I2 = np.eye(2); Z2 = np.zeros((2, 2))
sx = np.array([[0, 1], [1, 0]], complex); sy = np.array([[0, -1j], [1j, 0]]); sz = np.array([[1, 0], [0, -1]], complex)
sig = [sx, sy, sz]
g0 = np.block([[I2, Z2], [Z2, -I2]]).astype(complex)
gi = [np.block([[Z2, s], [-s, Z2]]) for s in sig]
g5 = np.block([[Z2, I2], [I2, Z2]]).astype(complex)
gam = [g0] + gi
metric = np.diag([1., -1, -1, -1])


def slash(p):
    return p[0] * g0 - p[1] * gi[0] - p[2] * gi[1] - p[3] * gi[2]


def dot(a, b):
    return a[0] * b[0] - a[1:] @ b[1:]


def u(p3v, s):
    E = np.sqrt(m * m + p3v @ p3v)
    chi = np.array([1, 0], complex) if s == 0 else np.array([0, 1], complex)
    sp = sum(p3v[i] * sig[i] for i in range(3))
    return np.sqrt(E + m) * np.concatenate([chi, sp @ chi / (E + m)])


def four(p3v, mass=m):
    return np.concatenate([[np.sqrt(mass ** 2 + p3v @ p3v)], p3v])


def Gam(x):
    return -G * slash(x) @ g5


def Sprop(P):
    return (slash(P) + m * np.eye(4)) / (dot(P, P) - m * m)


def M_rel(p1, p2, p3, p4, q, s1, s2, s3, s4):
    """direct pi0 exchange, nucleon line A: p1->p3, line B: p2->p4; returns amplitude (i factors stripped consistently)"""
    u1, u2, u3, u4 = u(p1[1:], s1), u(p2[1:], s2), u(p3[1:], s3), u(p4[1:], s4)
    b3 = u3.conj() @ g0; b4 = u4.conj() @ g0
    s = dot(q, q)
    tot = 0
    # pion momentum flowing A->B.  Case (a): pair from line A (legs or contact): pion momentum kB = p4 - p2
    kB = p4 - p2
    kA = p1 - p3
    DB = 1.0 / (dot(kB, kB) - mpi ** 2)
    DA = 1.0 / (dot(kA, kA) - mpi ** 2)
    # line B plain vertex absorbing kB; line A emitting pion kB => absorbs -kB
    JB = b4 @ Gam(kB) @ u2
    # pair from p1 leg (before vertex): intermediate p1-q
    JA1 = b3 @ Gam(-kB) @ Sprop(p1 - q) @ u1 * m
    # pair from p3 leg (after vertex): intermediate p3+q
    JA3 = b3 @ Sprop(p3 + q) @ Gam(-kB) @ u1 * m
    # contact on line A: (Gamma(q) - Gamma(x)), x=-kB
    JAc = b3 @ (Gam(q) - Gam(-kB)) @ u1
    tot += (JA1 + JA3 + JAc) * JB * DB
    # Case (b): pair from line B: pion momentum kA = p1-p3
    JA = b3 @ Gam(-kA) @ u1
    JB2 = b4 @ Gam(kA) @ Sprop(p2 - q) @ u2 * m
    JB4 = b4 @ Sprop(p4 + q) @ Gam(kA) @ u2 * m
    JBc = b4 @ (Gam(q) - Gam(kA)) @ u2
    tot += JA * (JB2 + JB4 + JBc) * DA
    # Case (c): pair from pion line: pion kA leaves A, emits pair, arrives at B with kA - q = kB
    tot += JA * (b4 @ Gam(kB) @ u2) * DA * DB * (2 * mpi ** 2 + s)
    # overall: each diagram carries the same net phase with these conventions (checked by NR limit)
    return tot


def O_nr(k, kp, q, sA, sB, s3, s4):
    """NR identity amplitude O_fi = P_ij X_ij for spin states (direct term). k, kp: relative momenta; q: pair 4-mom"""
    w = q[0]; kv = q[1:]
    mu = m / 2
    qt = k - kp
    P = np.outer(kv, kv) / w ** 2 - np.eye(3)
    chis = [np.array([1, 0], complex), np.array([0, 1], complex)]
    c1, c2, c3, c4 = chis[sA], chis[sB], chis[s3], chis[s4]
    # spin matrix elements <3|s1_a|1><4|s2_b|2>
    S1 = np.array([c3.conj() @ sig[a] @ c1 for a in range(3)])
    S2 = np.array([c4.conj() @ sig[b] @ c2 for b in range(3)])
    q2 = qt @ qt
    f = -G ** 2 / (q2 + mpi ** 2)
    fp = G ** 2 / (q2 + mpi ** 2) ** 2 * 2  # d f / d(q^2) * 2  -> df/dq_i = fp*q_i ... (f = -G^2/(q2+m2), df/dq_i = 2 q_i G^2/(q2+m2)^2)
    Vs = (S1 @ qt) * (S2 @ qt) * f
    # pole part
    X = Vs * (np.outer(kp, kp) - np.outer(k, k)) / (mu * w)
    # potential stress: sym d/dq_i (q_j V),  V = (S1.q)(S2.q) f(q)
    # d/dq_i V = S1_i (S2.q) f + (S1.q) S2_i f + (S1.q)(S2.q) fp q_i
    dV = S1 * (S2 @ qt) * f + (S1 @ qt) * S2 * f + (S1 @ qt) * (S2 @ qt) * fp * qt
    Xpot = np.eye(3) * Vs + 0.5 * (np.outer(dV, qt) + np.outer(qt, dV))
    return np.sum(P * (X + Xpot))


def compare(pscale, wfrac, seed=1, kappa=0.6):
    rng = np.random.default_rng(seed)
    k = rng.normal(size=3); k *= pscale / np.linalg.norm(k)
    E = k @ k / m                      # relative KE (NR)
    w = wfrac * E
    kvq = rng.normal(size=3); kvq *= kappa * w / np.linalg.norm(kvq)
    q = np.concatenate([[w], kvq])
    # choose final relative direction; then solve |kp| from exact relativistic energy conservation
    nh = rng.normal(size=3); nh /= np.linalg.norm(nh)
    p1v, p2v = k, -k
    Ein = four(p1v)[0] + four(p2v)[0]

    def resid(a):
        p3v = a * nh + 0.0; p4v = -a * nh - kvq
        return four(p3v)[0] + four(p4v)[0] + w - Ein
    from scipy.optimize import brentq
    a = brentq(resid, 1e-6, 2 * pscale)
    p3v = a * nh; p4v = -a * nh - kvq
    p1, p2, p3, p4 = four(p1v), four(p2v), four(p3v), four(p4v)
    Mr2 = 0; On2 = 0
    for s1 in (0, 1):
        for s2 in (0, 1):
            for s3 in (0, 1):
                for s4 in (0, 1):
                    Mr2 += abs(M_rel(p1, p2, p3, p4, q, s1, s2, s3, s4)) ** 2
                    kp_rel = 0.5 * (p3v - p4v)
                    On2 += abs(O_nr(k, kp_rel, q, s1, s2, s3, s4)) ** 2
    # naive single-leg monopole scale for reference: (m/w)*|V|*(2m)^2
    return Mr2, (2 * m) ** 4 * On2


if __name__ == '__main__':
    print(" p[MeV]  w/E   |M_rel|^2 / (2m)^4|O_NR|^2   (several random geometries)")
    for p in (30., 60., 120., 250., 350.):
        for wf in (0.2, 0.6):
            rs = []
            for seed in range(5):
                a, b = compare(p, wf, seed=seed)
                rs.append(a / b)
            print(f"{p:6.0f}  {wf:.1f}   " + "  ".join(f"{r:6.3f}" for r in rs))
