import numpy as np, json, sys
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
import _gi_path  # noqa: F401  (adds cosmology/neff_proper to sys.path)
from neff_model import omnes_sq
MPI, MK = 0.13957, 0.4957
fig, axs = plt.subplots(1, 2, figsize=(12, 4.6))
ax = axs[0]
rs = np.linspace(0.28, 2.0, 1500)
ax.plot(rs, (rs**2 + 2*MPI**2)**2, color="0.6", ls=":", label=r"LO $(s+2m_\pi^2)^2$")
ax.plot(rs, [(r*r + 2*MPI**2)**2*omnes_sq(r*r) for r in rs], color="0.3", ls="--", label="old central: 1-channel Omnès")
cols = {"A": "#1f77b4", "B": "#ff7f0e"}
for n in ("A", "B"):
    d = np.load(f"ffcache/{n}.npz")
    m = d["rs"] <= 2.0
    ax.plot(d["rs"][m], d["thpi2"][m], color=cols[n], lw=1.8, label=rf"2-channel model {n}: $|\theta_\pi|^2$")
    mk = (d["rs"] >= 2*MK) & m
    ax.plot(d["rs"][mk], d["thk2"][mk], color=cols[n], lw=1.2, ls="-.", label=rf"model {n}: $|\theta_K|^2$")
ax.set_yscale("log"); ax.set_xlabel(r"$\sqrt{s}$ [GeV]"); ax.set_ylabel(r"$|\theta(s)|^2$ [GeV$^4$]")
ax.set_ylim(1e-2, 50); ax.legend(fontsize=7.5); ax.set_title("Trace form factors (pairs annihilating to φφ)")
ax = axs[1]
b = json.load(open("bands2ch.json")); MS = b["MS"]
ax.fill_between(MS, b["lo"], b["hi"], color=cols["A"], alpha=0.25, label="new band (2-channel; quadrature)")
ax.plot(MS, b["central"], color=cols["A"], lw=2, label="new central (2-channel, model A)")
oldM = [3, 4, 5, 6, 8, 10]; oc = [0.35, 0.30, 0.24, 0.17, 0.094, 0.067]
ol = [0.30, 0.21, 0.14, 0.10, 0.07, 0.056]; oh = [0.38, 0.35, 0.32, 0.27, 0.16, 0.10]
ax.plot(oldM, oc, color="0.3", ls="--", label="old central (27 Sep)"); ax.plot(oldM, ol, color="0.6", ls=":"); ax.plot(oldM, oh, color="0.6", ls=":", label="old band")
ax.axhline(0.107, color="crimson", lw=1, label=r"$\Delta N_{\rm eff}<0.107$ (Goldstein–Hill 2026)")
ax.set_xlabel("M [TeV]"); ax.set_ylabel(r"$\Delta N_{\rm eff}$"); ax.set_yscale("log"); ax.legend(fontsize=7.5)
ax.set_title(r"Thermal-relic $\Delta N_{\rm eff}$ (T$_{\rm RH}\gtrsim$ few GeV)")
plt.tight_layout(); plt.savefig("q4_neff_2channel.png", dpi=130)
print("ok")
