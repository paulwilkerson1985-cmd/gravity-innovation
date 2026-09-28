# External data needed

`neff_calc.py` reads the Standard Model effective degrees of freedom g_*ρ(T), g_*s(T) of Saikawa & Shirai (2018), JCAP 05 (2018) 035, arXiv:1803.01038.

The table is not redistributed here. Download it from the authors' page, https://member.ipmu.jp/satoshi.shirai/EOS2018, and save the five-column file (T [GeV], g_*ρ, error, g_*s, error) in this folder as `saikawa_shirai_2018_gstar.dat`.

The tabulated outputs (`scan_results.json`, `freezein_results.json`, `neff_vs_M.png`) are included, so the results can be checked without it.

Run order: `python neff_calc.py 5` (rate table at M = 5 TeV), then `python scan.py`, then `python freezein_and_plot.py`.
