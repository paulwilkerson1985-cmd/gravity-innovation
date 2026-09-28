import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""Figure 1 of the v2 note: escaping phi-pair luminosity L_esc(M) from the Monte Carlo transport
(fable/sn_deep/transport_mc.json) for the cold and hot parametrised 1-s profiles, NN-only and NN+pi(1%),
against the luminosity criterion. Dashed: free-streaming L_prod/M^4 (f_esc = 1). Also writes fig1_data_v2.json."""
import json, numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

SRC = (_GI + '/supernova/sn_deep/transport_mc.json')
OUT = (_GI + '/figures/')
d = json.load(open(SRC))

# validated categorical palette (dataviz reference instance, light mode); identity also carried by line style + labels
COL = {'cold_Y0.01': '#2a78d6', 'hot_Y0.01': '#eb6834', 'cold_Y0.0': '#1baf7a', 'hot_Y0.0': '#4a3aa7'}
LAB = {'cold_Y0.01': 'cold, NN + $\\pi$ (1%)', 'hot_Y0.01': 'hot, NN + $\\pi$ (1%)',
       'cold_Y0.0': 'cold, NN only', 'hot_Y0.0': 'hot, NN only'}
LS = {'cold_Y0.01': '-', 'hot_Y0.01': '-', 'cold_Y0.0': '-', 'hot_Y0.0': '-'}
L_CRIT, L_ALT = 3e52, 5.7e52

def mmin(M, L, Lc):
    M, L = np.asarray(M), np.asarray(L)
    if not (L.min() < Lc < L.max()):
        return None
    return float(np.exp(np.interp(-np.log(Lc), -np.log(L), np.log(M))))

data_out = {}
fig, (ax, ax2) = plt.subplots(1, 2, figsize=(10.2, 4.3), gridspec_kw=dict(width_ratios=[1.55, 1]))
for key in ('hot_Y0.01', 'cold_Y0.01', 'hot_Y0.0', 'cold_Y0.0'):
    rows = d[key]
    M = np.array([r['M'] for r in rows]); L = np.array([r['Lesc'] for r in rows]); f = np.array([r['f_esc'] for r in rows])
    Lprod1 = L[-1] * M[-1] ** 4 / f[-1]          # L_prod at 1 TeV (free streaming), from the M=10 point
    Mfine = np.linspace(2.5, 10, 200)
    ax.plot(Mfine, Lprod1 / Mfine ** 4, ls='--', lw=1.2, color=COL[key], alpha=0.55)
    ax.plot(M, L, ls=LS[key], lw=2, color=COL[key], marker='o', ms=4.5, mfc='white', mew=1.5, label=LAB[key])
    ax2.plot(M, f, lw=2, color=COL[key], marker='o', ms=4.5, mfc='white', mew=1.5)
    data_out[key] = dict(M=M.tolist(), L_esc=L.tolist(), f_esc=f.tolist(), L_prod_1TeV=float(Lprod1),
                         Mmin_3e52_MC=mmin(M, L, L_CRIT), Mmin_5p7e52_MC=mmin(M, L, L_ALT),
                         Mmin_3e52_free=float((Lprod1 / L_CRIT) ** 0.25), Mmin_5p7e52_free=float((Lprod1 / L_ALT) ** 0.25))
    mm = data_out[key]['Mmin_3e52_MC']
    if mm:
        ax.plot([mm], [L_CRIT], marker='v', ms=7, color=COL[key], zorder=5)
        ax.annotate(f'{mm:.1f}', (mm, L_CRIT), xytext=(0, 9), textcoords='offset points', ha='center', fontsize=8.5, color='#333')

ax.axhline(L_CRIT, color='#444', lw=1.2)
ax.axhline(L_ALT, color='#444', lw=1.0, ls=':')
ax.text(1.22, L_CRIT * 0.93, '$L_\\phi<3\\times10^{52}$ erg/s', va='top', ha='left', fontsize=8, color='#333')
ax.text(1.22, L_ALT * 1.07, 'alt. $5.7\\times10^{52}$', va='bottom', ha='left', fontsize=8, color='#333')
ax.axvspan(0, 2.5, color='#ddd', alpha=0.5, lw=0)
ax.text(1.95, 1.6e51, 'not computed\n(< 2.5 TeV);\nband edge\n1–2 TeV\n(diffusion)', ha='center', va='bottom', fontsize=8, color='#333')
ax.set_yscale('log'); ax.set_xlim(1.15, 10.4); ax.set_ylim(1e51, 5e53)
ax.set_xlabel('$M$ [TeV]'); ax.set_ylabel('$L_{\\rm esc}$ at 1 s [erg s$^{-1}$]')
ax.set_title('(a) Escaping $\\phi\\phi$ luminosity: Monte Carlo transport (solid) vs free streaming (dashed)', fontsize=9.5, loc='left')
ax.legend(frameon=False, fontsize=8.5, loc='upper right')
ax.grid(True, which='major', color='#eee', lw=0.8); ax.set_axisbelow(True)
for s in ('top', 'right'):
    ax.spines[s].set_visible(False); ax2.spines[s].set_visible(False)

ax2.set_xlim(2.2, 10.5); ax2.set_ylim(0, 1.02)
ax2.set_xlabel('$M$ [TeV]'); ax2.set_ylabel('$f_{\\rm esc}=L_{\\rm esc}/L_{\\rm prod}$')
ax2.set_title('(b) Escape fraction (same colours as (a))', fontsize=9.5, loc='left')
ax2.grid(True, color='#eee', lw=0.8); ax2.set_axisbelow(True)
ax2.set_xticks([3, 4, 5, 6, 7, 8, 10])
fig.tight_layout()
fig.savefig(OUT + 'fig1_Lesc_vs_M.png', dpi=170)
json.dump(data_out, open(OUT + 'fig1_data_v2.json', 'w'), indent=1)
for k, v in data_out.items():
    print(k, 'M_min(3e52): MC %.2f free %.2f | (5.7e52): MC %s free %.2f' % (
        v['Mmin_3e52_MC'] or float('nan'), v['Mmin_3e52_free'],
        f"{v['Mmin_5p7e52_MC']:.2f}" if v['Mmin_5p7e52_MC'] else 'none (L_esc<5.7e52 for all M>=2.5)', v['Mmin_5p7e52_free']))
