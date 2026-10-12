// Pure waveform math: band-limited pulse waves (for PeriodicWave) and LFSR noise like old handheld sound chips.

/**
 * Fourier coefficients of a ±1 pulse wave with the given duty cycle (0..1), DC removed.
 * Index 0 is the DC term and is always 0. Feed into `AudioContext.createPeriodicWave(real, imag)`.
 */
export function pulseCoefficients(duty: number, harmonics = 48): { real: Float32Array; imag: Float32Array } {
  const d = Math.min(0.95, Math.max(0.05, duty));
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  for (let n = 1; n <= harmonics; n++) {
    const k = 2 / (n * Math.PI);
    real[n] = k * Math.sin(2 * Math.PI * n * d);
    imag[n] = k * (1 - Math.cos(2 * Math.PI * n * d));
  }
  return { real, imag };
}

/**
 * Noise from a 15-bit linear-feedback shift register (the classic handheld noise channel).
 * `short` mode uses the 7-bit tap which loops quickly and sounds metallic/tonal.
 * Values are ±1. Deterministic.
 */
export function lfsrNoise(length: number, short = false): Float32Array {
  const out = new Float32Array(length);
  let reg = 0x7fff;
  for (let i = 0; i < length; i++) {
    const bit = (reg ^ (reg >> 1)) & 1;
    reg = (reg >> 1) | (bit << 14);
    if (short) reg = (reg & ~(1 << 6)) | (bit << 6);
    out[i] = reg & 1 ? -1 : 1;
  }
  return out;
}
