"""Lateral-gradient convection in the gas-switch on-state (Batchelor slot flow, conduction regime), Stokes drag torque
on the dumbbell, vs Tier-1/2 torques.  The Rayleigh-Benard criterion (Ra < 1700 -> no flow) applies only to bottom
heating; a LATERAL temperature difference drives flow at any Grashof number."""
import numpy as np
g0, T = 9.81, 293.0
eta = {'He': 1.96e-5, 'Xe': 2.28e-5}     # Pa s at 293 K
b = 0.06; a = 0.03                        # dumbbell arm, body radius
tier1_tau = 3e-11 * 0.47 * b; tier2_tau = 3e-13 * 0.47 * b
print('Tier-1 torque (2w amplitude, 0.47 F b) = %.2e N m ; Tier-2 = %.2e N m' % (tier1_tau, tier2_tau))
for gas in ['He', 'Xe']:
    for rho in [8.4e-3, 5.3e-2, 1.2e-1]:     # rho_off at 10 cm for M = 4, 10, 15 TeV
        nu = eta[gas] / rho
        for L, dT in [(1.0, 1e-3), (1.0, 1e-2), (0.3, 3e-4)]:
            Gr = g0 * (1 / T) * dT * L**3 / nu**2
            u = g0 * (1 / T) * dT * L**2 / (125 * nu)          # Batchelor slot max velocity, conduction regime
            u_in = np.sqrt(g0 * dT / T * L)                     # inertial cap
            u = min(u, u_in)
            F = 6 * np.pi * eta[gas] * a * u                    # Stokes drag on one body
            tau = F * (2 * b / L) * b                           # differential drag across the arm x arm
            print('%s rho=%.1e kg/m3 nu=%.1e  L=%.1f m dT_lateral=%.0e K: Gr=%.0f u=%.1e m/s  drag/body=%.1e N  torque~%.1e N m  (Tier1 x%.0f, Tier2 x%.0f)' % (
                gas, rho, nu, L, dT, Gr, u, F, tau, tau / tier1_tau, tau / tier2_tau))
