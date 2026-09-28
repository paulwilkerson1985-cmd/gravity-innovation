import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""Fetch Nijmegen PWA93 phase shifts (nuclear-bar convention) from nn-online.org
for pp (r=1) and np (r=2) at a grid of lab energies; save as JSON.
Source: https://nn-online.org (Stoks et al., PRC 48, 792 (1993))."""
import re, html, json, subprocess, sys
E = [1,2,5,10,15,20,25,30,35,40,50,60,70,80,90,100,120,140,160,180,200,225,250,275,300,325,350]
out = {}
for r, lab in [(1,'pp'),(2,'np')]:
    out[lab] = {}
    for T in E:
        url = f"https://nn-online.org/NN/nn.php?program=NNphs1&s=1&r={r}&tlab={T}&bb=0"
        t = subprocess.run(['curl','-sS','-m','60',url],capture_output=True,text=True).stdout
        t = re.sub(r'<script.*?</script>','',t,flags=re.S)
        s = html.unescape(re.sub(r'<[^>]+>',' ',t))
        d = dict((k, float(v)) for k, v in re.findall(r'([13][A-Z]\d|E\d)=\s*(-?\d+\.\d+)', s))
        out[lab][T] = d
        print(lab, T, len(d), d.get('1S0'), d.get('3S1'), flush=True)
json.dump(out, open((_GI + '/supernova/sn_A/data/pwa93_phases.json'),'w'), indent=1)
