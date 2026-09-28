"""Robustness of pi^- p -> n phi phi to (a) sign of the s-term in the pi-pi-phi-phi vertex,
(b) dropping the pion-line (D3) or contact (D4) diagram, (c) nucleon-pole terms only.
Only (a0) is the physical, validated rule set; the others show sensitivity."""
import numpy as np, pion
from pion import Gam, Sprop, spinor, g0, dot, MN, mpi

def make_amp(sign_s=+1, use=(1,1,1,1)):
    def amp2(l, p1, p2, q, parts=False):
        s = dot(q, q)
        D = [MN*Sprop(p1+l)@Gam(l), MN*Gam(l)@Sprop(p1-q),
             Gam(l-q)*(2*mpi**2 + sign_s*s)/(dot(l-q,l-q)-mpi**2), Gam(q)-Gam(l)]
        tot = 0.
        for s1 in (0,1):
            u1 = spinor(p1[1:], s1)
            for s2 in (0,1):
                b2 = spinor(p2[1:], s2).conj()@g0
                tot += abs(sum(use[i]*(b2@D[i]@u1) for i in range(4)))**2
        return 0.5*tot
    return amp2

base = None
for lab, kw in [('physical (2m^2+s), all diagrams', dict()),
                ('ppf vertex (2m^2-s)', dict(sign_s=-1)),
                ('no pion-line D3', dict(use=(1,1,0,1))),
                ('no contact D4', dict(use=(1,1,1,0))),
                ('nucleon poles only D1+D2', dict(use=(1,1,0,0)))]:
    pion.amp2 = make_amp(**kw)
    r, dr, wm = pion.pion_rate(30., 0.054, None, Npts=2500, seed=7, blocking=False)
    if base is None: base = r
    print(f"{lab:35s}: rate/physical = {r/base:6.2f}")
