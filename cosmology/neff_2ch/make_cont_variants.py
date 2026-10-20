"""High-s continuation variants: above sqrt(s) = 1.3 GeV replace |theta|^2 by (i) its 1.3 GeV value (frozen),
(ii) |theta(1.3)|^2 * (1.69/s) (falling), (iii) LO growth matched at 1.3 GeV."""
import numpy as np
MPI, MK = 0.13957, 0.4957
for base in ("A", "B"):
    d = dict(np.load(f"ffcache/{base}.npz")); rs = d["rs"]; s = rs ** 2
    i0 = np.argmin(abs(rs - 1.3)); s0 = s[i0]
    for tag in ("frozen", "falling", "LOgrowth"):
        out = dict(d)
        for key, m in (("thpi2", MPI), ("thk2", MK)):
            v = d[key].copy(); hi = rs > 1.3
            if tag == "frozen": v[hi] = d[key][i0]
            if tag == "falling": v[hi] = d[key][i0] * s0 / s[hi]
            if tag == "LOgrowth": v[hi] = d[key][i0] * ((s[hi] + 2 * m * m) / (s0 + 2 * m * m)) ** 2
            out[key] = v
        np.savez(f"ffcache/{base}-{tag}.npz", **out)
print("ok")
