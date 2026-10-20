"""Q2b validation: (1) exact 1D-slab Liouville solution; (2) cross-check against the repo cut-cell solver (sphere source).
Run from models/q2b/ inside the repo, or set GI_REPO to the repo root."""
import numpy as np, sys
from scipy.optimize import brentq
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from dilaton_atoms import Grid, solve, axis_g, kinv_m
# (1) 1D slab Liouville exact: x''=-k^2 e^{-x}, x(+-H)=0; wide cylinder Rc>>H approximates slab near axis
for lam,H in [(1e27,0.02),(1e28,0.02),(2.5e28,0.01)]:
    k=1/kinv_m(lam)
    f=lambda A: np.cos(k*np.sqrt(A/2)*H)-np.sqrt(A)
    A=brentq(f,1e-12,1-1e-15); xc=-np.log(A)
    g=Grid(0.40,H,2.5e-4); x,res=solve(g,k)
    print('slab lam=%.1e H=%.0f mm: exact x_c=%.5f  numeric (r=0)=%.5f  rel.err=%.1e'%(lam,H*1e3,xc,x[0,len(g.z)//2],x[0,len(g.z)//2]/xc-1))
# (2) cross-check D against the repo's validated cut-cell Liouville solver for an on-axis SPHERE source
import os
def _gi_root():  # repo root = first parent containing GI_REPO_ROOT (or $GI_REPO)
    d = os.environ.get('GI_REPO') or os.path.dirname(os.path.abspath(__file__))
    while not os.path.exists(os.path.join(d, 'GI_REPO_ROOT')) and os.path.dirname(d) != d:
        d = os.path.dirname(d)
    return d
_GI = _gi_root()
sys.path.insert(0, _GI + '/solver'); sys.path.insert(0, _GI + '/solver/validation'); sys.path.insert(0, _GI + '/models')
from symm_sw import GridSW
import dilaton_reach as dr
lam=3e27; k=1/kinv_m(lam); Rc=0.035; Hc=0.061; a=0.0127; za=a+0.004
# repo solver works in units of 1/k
kk=k
for h in [4e-4,2e-4]:
    g=GridSW(Rc*kk, Hc*kk, h*kk); g.sphere(0.0,a*kk); psi,res=dr.solve_liouville(g)
    g0=GridSW(Rc*kk, Hc*kk, h*kk); psi0,res0=dr.solve_liouville(g0)
    q=0.5*psi[0,:]**2; q0=0.5*psi0[0,:]**2
    D_repo=(np.interp(za*kk,g.z,np.gradient(q,g.h))-np.interp(za*kk,g0.z,np.gradient(q0,g0.h)))*kk
    # mine: sphere via mask
    gm=Grid(Rc,Hc,h); gm.fixed|=(gm.R**2+gm.Z**2<=a**2); xm,_=solve(gm,k)
    g0m=Grid(Rc,Hc,h); x0m,_=solve(g0m,k)
    D_me=axis_g(gm,xm,za)[0]-axis_g(g0m,x0m,za)[0]
    print('sphere cross-check h=%.1f mm: repo cut-cell D=%.4f  this code (staircase) D=%.4f  ratio=%.3f'%(h*1e3,D_repo,D_me,D_me/D_repo))
