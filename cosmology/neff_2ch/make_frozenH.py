import numpy as np
d = dict(np.load("ffcache/H.npz")); rs = d["rs"]; i0 = np.argmin(abs(rs - 1.47))
out = dict(d)
for k in ("thpi2", "thk2"):
    v = d[k].copy(); v[rs > 1.47] = d[k][i0]; out[k] = v
np.savez("ffcache/H-frozen.npz", **out); print("ok")
