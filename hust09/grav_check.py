"""Check of the cos(2 psi) approximation Delta K ~= -4 [E(0) - E(pi/2)] on the Newtonian analogue:
uniform quartz block (91.465 x 12.015 x 26.216 mm, 63.384 g) and two point-mass spheres (778.18 g) at +-78.58 mm, same height.
Compare with the exact Delta K = U''(0) - U''(pi/2) and with HUST-09's Delta K_g = I Delta omega^2 = 7.58e-11 N m/rad."""
import numpy as np
G = 6.674e-11; M = 0.77818; m = 0.063384; Rs = 0.07858
L, W, H = 0.091465, 0.012015, 0.026216
n = (121, 21, 31)
xs = (np.arange(n[0]) + 0.5) / n[0] * L - L / 2; ys = (np.arange(n[1]) + 0.5) / n[1] * W - W / 2
zs = (np.arange(n[2]) + 0.5) / n[2] * H - H / 2
X, Y, Z = np.meshgrid(xs, ys, zs, indexing='ij'); dm = m / X.size
def U(psi):
    c, s = np.cos(psi), np.sin(psi)
    xr, yr = c * X - s * Y, s * X + c * Y
    return -G * M * dm * np.sum(1 / np.sqrt((xr - Rs)**2 + yr**2 + Z**2) + 1 / np.sqrt((xr + Rs)**2 + yr**2 + Z**2))
d = 1e-3
Upp = lambda p: (U(p + d) - 2 * U(p) + U(p - d)) / d**2
dK_exact = Upp(0) - Upp(np.pi / 2)
dK_approx = -4 * (U(0) - U(np.pi / 2))
print('exact  Delta K = %.4e N m/rad' % dK_exact)
print('approx -4[U(0)-U(pi/2)] = %.4e N m/rad  (ratio approx/exact = %.3f)' % (dK_approx, dK_approx / dK_exact))
print('HUST-09 I*Delta omega^2 = %.4e N m/rad' % (4.5057e-5 * 1.682245e-6))
