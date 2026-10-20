"""Put the repository's cosmology/neff_proper on sys.path (finds the repo root via the GI_REPO_ROOT marker)."""
import os, sys
def _root():
    d = os.path.dirname(os.path.abspath(__file__))
    while not os.path.exists(os.path.join(d, 'GI_REPO_ROOT')) and os.path.dirname(d) != d:
        d = os.path.dirname(d)
    return d
NEFF = os.path.join(_root(), 'cosmology', 'neff_proper')
if NEFF not in sys.path:
    sys.path.insert(0, NEFF)
