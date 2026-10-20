"""Sign check: LO chiral amplitude pi^a pi^a -> K Kbar (I=0) in the 'field-bilinear' basis where
<K+K-| K+(x)K-(x) |0> = +1 (the same basis in which <KKbar|Theta|0> = +(s + 2 mK^2))."""
import sympy as sp, itertools
f, Bc, mh, ms = sp.symbols('f B mh ms', positive=True)
I = sp.I
names = ['p1','p2','p3','kp','km','k0','k0b','eta']
F  = {n: sp.Symbol(n) for n in names}
D1 = {n: sp.Symbol('d1_'+n) for n in names}
D2 = {n: sp.Symbol('d2_'+n) for n in names}
def Phi(S):
    r2, r6 = sp.sqrt(2), sp.sqrt(6)
    return sp.Matrix([[S['p3']/r2 + S['eta']/r6, (S['p1'] - I*S['p2'])/r2, S['kp']],
                      [(S['p1'] + I*S['p2'])/r2, -S['p3']/r2 + S['eta']/r6, S['k0']],
                      [S['km'], S['k0b'], -2*S['eta']/r6]])
A  = sp.sqrt(2)*Phi(F)/f
dA1 = sp.sqrt(2)*Phi(D1)/f
dA2 = sp.sqrt(2)*Phi(D2)/f
def dU_order(n, dA, sign):
    # d(U) at order n in A: (i sign)^n/n! sum_k A^k dA A^(n-1-k); U^dagger has sign=-1
    tot = sp.zeros(3,3)
    for k in range(n):
        tot += A**k * dA * A**(n-1-k)
    return (I*sign)**n/sp.factorial(n) * tot
Lkin = 0
for m in range(1,4):
    n = 4-m
    Lkin += (f**2/4)*(dU_order(m, dA1, +1)*dU_order(n, dA2, -1)).trace()
Mq = sp.diag(mh, mh, ms)
Lmass = (f**2*Bc/2)*(Mq*A**4).trace()*sp.Rational(2,24)   # (f^2 B/2) Tr M(U+U^dag), A^4 term 2A^4/24
Lkin = sp.expand(Lkin); Lmass = sp.expand(Lmass)
s, t, u, mpi2, mK2 = sp.symbols('s t u mpi2 mK2')
def amplitude(legs):
    """legs: list of (field_name, momentum label 1..4), all incoming. Returns M (i M = i * vertex)."""
    # momenta products: k_i.k_j in terms of s,t,u for 1+2 -> 3+4 with k3=-p3,k4=-p4, all masses on shell
    m2 = {1: mpi2, 2: mpi2, 3: mK2, 4: mK2}
    def dot(i, j):
        if i == j: return m2[i]
        pair = tuple(sorted((i, j)))
        # incoming k: s = (k1+k2)^2, t = (k1+k3)^2, u = (k1+k4)^2
        if pair in [(1,2),(3,4)]: return (s - m2[pair[0]] - m2[pair[1]])/2
        if pair in [(1,3),(2,4)]: return (t - m2[pair[0]] - m2[pair[1]])/2
        if pair in [(1,4),(2,3)]: return (u - m2[pair[0]] - m2[pair[1]])/2
    total = 0
    for term in (Lkin + Lmass).as_ordered_terms():
        coeff, factors = term.as_coeff_mul()
        syms = []; c = coeff
        for fac in factors:
            b, e = fac.as_base_exp()
            if b.is_Symbol and b.name.replace('d1_','').replace('d2_','') in names:
                syms += [b]*int(e)
            else:
                c *= fac
        if len(syms) != 4: continue
        # slots: (field, deriv)
        slots = []
        for sy in syms:
            nm = sy.name
            if nm.startswith('d1_'): slots.append((nm[3:], 1))
            elif nm.startswith('d2_'): slots.append((nm[3:], 2))
            else: slots.append((nm, 0))
        for perm in itertools.permutations(range(4)):
            ok = all(slots[perm[i]][0] == legs[i][0] for i in range(4))
            if not ok: continue
            # momentum factor: derivative slots get (-i k)
            dslots = {slots[perm[i]][1]: legs[i][1] for i in range(4) if slots[perm[i]][1] > 0}
            mom = 1
            if dslots:
                mom = -dot(dslots[1], dslots[2])     # (-i k_a).(-i k_b) = -k_a.k_b
            total += c * mom
    return sp.simplify(total)
subs = {Bc*mh: mpi2/2, Bc*ms: mK2 - mpi2/2}
res = {}
for a in ('p1','p2','p3'):
    Mpp = amplitude([(a,1),(a,2),('km',3),('kp',4)])   # out K+ <-> km field, out K- <-> kp field
    M00 = amplitude([(a,1),(a,2),('k0b',3),('k0',4)])
    res[a] = (sp.simplify(sp.expand(Mpp).subs(subs)), sp.simplify(sp.expand(M00).subs(subs)))
    print(a, "M(aa->K+K-) =", res[a][0], "   M(aa->K0K0bar) =", res[a][1])
tot = sum(r[0] + r[1] for r in res.values())
M12 = sp.simplify(tot/(sp.sqrt(2)*sp.sqrt(3)*sp.sqrt(2)))
M12 = sp.simplify(M12.subs(u, 2*mpi2 + 2*mK2 - s - t))
print("I=0 (unitary-normalized) M12 =", M12)
# S-wave: t-dependence averaged; print s-wave as function of s if t drops out
print("depends on t?", sp.diff(M12, t) != 0)
# also pi pi -> pi pi I=0 check (Weinberg): M(p1 p1 -> p3 p3) etc.
Mw = amplitude([('p1',1),('p1',2),('p3',3),('p3',4)])
print("M(11->33) =", sp.simplify(sp.expand(Mw).subs(subs)), " (Weinberg A(s,t,u)=(s-mpi^2)/f^2 expected)")
