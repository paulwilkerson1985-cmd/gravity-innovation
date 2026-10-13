// HD-2D post-processing pipeline and quality tiers.
//
//   scene ─RenderPass─▶ [GTAO (opt-in)] ─▶ UnrealBloom (half / quarter res)
//         ─▶ GradePass (tilt-shift in linear HDR, exposure + hue-preserving filmic tone map,
//            sRGB, CDL grade, luminance-preserving split tone, shadow desaturation,
//            bottom shade, vignette, dither) ─▶ canvas
//
// Everything runs at the LOW internal resolution of the drawing buffer, which is an INTEGER
// pixel grid (Renderer.pixelGrid: 640×360 at 720p, every texel exactly 2×2 / 3×3 / 4×4 device
// px), and the canvas is upscaled by CSS with `image-rendering: pixelated`, so the final image
// stays pixel-crisp: blur only ever happens *inside* the low-res frame (bloom, a 1–2 px
// tilt-shift), never in the upscale. See docs/HD2D.md for the reasoning and numbers.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { warmPrograms } from '../materials';
import { warmPixelFx } from './fx';

export type Quality = 'high' | 'low';

/** URL switches: `?gfx=hd2d`, `?q=high|low`, `?post=nobloom,nograde,notilt,gtao,…` (A/B captures). */
function params(): URLSearchParams {
  return new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
}
export function hd2dRequested(): boolean { return params().get('gfx') === 'hd2d'; }
export function postFlags(): Set<string> { return new Set((params().get('post') ?? '').split(',').filter(Boolean)); }

/**
 * Quality tier: `?q=` wins; otherwise phones/tablets (coarse pointer or a short side under
 * 500 CSS px) and weak CPUs get `low`, everything else `high`.
 */
export function detectQuality(): Quality {
  const q = params().get('q');
  if (q === 'high' || q === 'low') return q;
  if (typeof window === 'undefined') return 'high';
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const short = Math.min(window.innerWidth, window.innerHeight) < 500;
  const weak = (navigator.hardwareConcurrency ?? 8) <= 4;
  return coarse || short || weak ? 'low' : 'high';
}

export interface TierSettings {
  /**
   * Target internal render height (px). The real size is an integer pixel grid: device px per
   * internal px s = round(min(h·dpr / internalHeight, short·dpr / minShort)) (Renderer.pixelGrid).
   */
  internalHeight: number;
  /** Minimum internal size of the short side (portrait phones). */
  minShort: number;
  shadowMapSize: number;
  shadowType: THREE.ShadowMapType;
  bloom: boolean;
  tiltShift: boolean;
  /** Tilt-shift strength multiplier on the grade's tiltTop/tiltBottom (low tier keeps it minimal). */
  tilt: number;
  gtao: boolean;
  /** Dust motes per light beam. */
  dust: number;
  /**
   * Render the shadow map once (static arena only) instead of every frame; kin and people
   * then rely on their blob contact shadows. Phones.
   */
  staticShadows: boolean;
}

export const TIERS: Record<Quality, TierSettings> = {
  // 360 → 640×360 at 720p (2×), 1080p (3×), 1440p (4×).
  high: { internalHeight: 360, minShort: 300, shadowMapSize: 2048, shadowType: THREE.PCFSoftShadowMap, bloom: true, tiltShift: true, tilt: 1, gtao: false, dust: 50, staticShadows: false },
  // 300 / 270 → a 393×851 @2.75 phone renders 270×585 at exactly 4 device px per texel.
  low: { internalHeight: 300, minShort: 270, shadowMapSize: 1024, shadowType: THREE.PCFShadowMap, bloom: true, tiltShift: true, tilt: 0.45, gtao: false, dust: 26, staticShadows: true },
};

/** Colour grade, vignette and tilt-shift parameters (sRGB, after tone mapping). */
export interface Grade {
  lift: THREE.Vector3; gamma: THREE.Vector3; gain: THREE.Vector3;
  /** Saturation, and contrast around mid grey (applied to luminance, so nothing clips to black). */
  saturation: number; contrast: number;
  /**
   * Split tone: shadows pulled toward `shadowTint`, highlights toward `highTint`, both at the
   * pixel's OWN luminance (only the hue/chroma moves, nothing darkens or brightens).
   */
  shadowTint: THREE.Color; highTint: THREE.Color; splitAmount: number;
  vignette: number; vignetteSoft: number;
  /**
   * Tilt-shift: max blur radius in px at the top / bottom edge and where the sharp band ends
   * (× TierSettings.tilt). Defaults (warmCaveGrade): 1.8 px from 72% up, 0.6 px under 8%.
   */
  tiltTop: number; tiltBottom: number; focusTop: number; focusBottom: number;
  /** Ordered dither strength (in 8-bit steps) so gradients (beams, bloom) break into pixel dither. */
  dither: number;
  exposure: number;
  // ---- optional (defaults in GRADE_DEFAULTS; arena files may omit them)
  /**
   * Bottom-edge shade for foreground occluders: brightness change at the very bottom row
   * (e.g. -0.25 = 25% darker), fading out over `bottomShadeHeight` of the frame. Default 0 (off).
   */
  bottomShade?: number;
  /** Fraction of the frame height the bottom shade covers. Default 0.22. */
  bottomShadeHeight?: number;
  /**
   * Saturation taken out of the shadows (0..1; full from display luminance ≈ 0.04, fading out by
   * 0.36; the very darkest crevices keep their colour), so shadowed rock reads as muted earth
   * instead of saturated red-black. Default 0.3 (night sets keep their colour); the cave 0.5.
   */
  shadowDesat?: number;
  /**
   * Tone mapping: 0 = per-channel ACES (hue skews, saturated darks clip to pure red/black),
   * 1 = ACES curve on luminance only (hues and chroma ratios kept); fades back to per-channel
   * ACES in the highlights (fire and sunlit panes roll to yellow/white). Default 0.7; the cave 0.85.
   */
  toneHue?: number;
  /** Bloom threshold (linear HDR luminance) and strength. Defaults 0.9 / 0.35. */
  bloomThreshold?: number;
  bloomStrength?: number;
}

/** Defaults of the optional Grade fields. */
export const GRADE_DEFAULTS = {
  bottomShade: 0, bottomShadeHeight: 0.22, shadowDesat: 0.3, toneHue: 0.7, bloomThreshold: 0.9, bloomStrength: 0.35,
} as const satisfies Required<Pick<Grade, 'bottomShade' | 'bottomShadeHeight' | 'shadowDesat' | 'toneHue' | 'bloomThreshold' | 'bloomStrength'>>;

export function warmCaveGrade(): Grade {
  return {
    lift: new THREE.Vector3(0.015, 0.008, 0.0), gamma: new THREE.Vector3(1.0, 1.0, 1.02), gain: new THREE.Vector3(1.03, 1.0, 0.93),
    saturation: 0.92, contrast: 1.06,
    shadowTint: new THREE.Color('#3a1f2e'), highTint: new THREE.Color('#ffe2a8'), splitAmount: 0.14,
    vignette: 0.42, vignetteSoft: 0.55,
    tiltTop: 1.8, tiltBottom: 0.6, focusTop: 0.72, focusBottom: 0.08,
    dither: 2.0,
    exposure: 1.05,
    shadowDesat: 0.5, toneHue: 0.85,
  };
}

const LUMA = new THREE.Vector3(0.2126, 0.7152, 0.0722);
/** A tint's sRGB colour divided by its luminance (so `tint × l` has luminance l). */
function lumaNormalized(c: THREE.Color, out: THREE.Vector3): THREE.Vector3 {
  const s = c.clone().convertLinearToSRGB();
  out.set(s.r, s.g, s.b);
  const l = out.dot(LUMA);
  return l > 1e-4 ? out.multiplyScalar(1 / l) : out.set(1, 1, 1);
}

const GradeShader = {
  name: 'Hd2dGrade',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uExposure: { value: 1 }, uToneHue: { value: 0 }, uToneHi: { value: new THREE.Vector2(0.3, 0.8) },
    uLift: { value: new THREE.Vector3() }, uGamma: { value: new THREE.Vector3(1, 1, 1) }, uGain: { value: new THREE.Vector3(1, 1, 1) },
    uSat: { value: 1 }, uContrast: { value: 1 }, uShadowDesat: { value: 0 }, uDesatRange: { value: new THREE.Vector2(0.0, 0.36) },
    uShadowTint: { value: new THREE.Vector3(1, 1, 1) }, uHighTint: { value: new THREE.Vector3(1, 1, 1) }, uSplit: { value: 0 },
    uVig: { value: 0 }, uVigSoft: { value: 0.5 },
    uBottom: { value: 0 }, uBottomH: { value: 0.22 },
    uTiltTop: { value: 0 }, uTiltBottom: { value: 0 }, uFocusTop: { value: 0.6 }, uFocusBottom: { value: 0.15 },
    uDither: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uRes;
    uniform vec3 uLift, uGamma, uGain;
    uniform vec2 uToneHi, uDesatRange;
    uniform float uExposure, uToneHue, uSat, uContrast, uShadowDesat, uSplit, uVig, uVigSoft, uBottom, uBottomH;
    uniform float uTiltTop, uTiltBottom, uFocusTop, uFocusBottom, uDither;
    uniform vec3 uShadowTint, uHighTint;
    varying vec2 vUv;
    const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
    float bayer4(vec2 p) {
      ivec2 i = ivec2(mod(p, 4.0));
      int idx = i.y * 4 + i.x;
      int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
      return (float(m[idx]) + 0.5) / 16.0;
    }
    // ACES fit (same curve as three's ACESFilmicToneMapping).
    vec3 rrtOdt(vec3 v) {
      vec3 a = v * (v + 0.0245786) - 0.000090537;
      vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
      return a / b;
    }
    vec3 acesChannels(vec3 c) {
      const mat3 IN = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
      const mat3 OUT = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
      return OUT * rrtOdt(IN * c);
    }
    // Hue-preserving filmic: the ACES curve on luminance, chroma ratios kept; channels that
    // would exceed 1 roll toward white (bright light desaturates instead of clipping in hue).
    vec3 acesLuma(vec3 c) {
      float l = dot(c, LUMA);
      float t = max(rrtOdt(vec3(max(l, 0.0))).x, 0.0);
      vec3 o = c * (t / max(l, 1e-5));
      float m = max(o.r, max(o.g, o.b));
      if (m > 1.0) o = mix(vec3(t), o, clamp((1.0 - t) / max(m - t, 1e-4), 0.0, 1.0));
      return o;
    }
    vec3 srgb(vec3 c) {
      c = clamp(c, 0.0, 1.0);
      return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
    }
    void main() {
      // Tilt-shift (linear HDR): a sharp band around the action, a 1–2 px disc blur toward the
      // top (far wall) and bottom (foreground ledge) edges.
      float y = vUv.y;
      float r = uTiltTop * smoothstep(uFocusTop, 1.0, y) + uTiltBottom * (1.0 - smoothstep(0.0, uFocusBottom, y));
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      if (r > 0.25) {
        vec2 px = r / uRes;
        vec3 acc = c * 2.0;
        float wsum = 2.0;
        for (int i = 0; i < 6; i++) {
          float a = float(i) * 1.0471976;
          vec2 o = vec2(cos(a), sin(a));
          acc += texture2D(tDiffuse, vUv + o * px * 0.5).rgb * 1.5;
          acc += texture2D(tDiffuse, vUv + vec2(cos(a + 0.5235988), sin(a + 0.5235988)) * px).rgb;
          wsum += 2.5;
        }
        c = acc / wsum;
      }
      // Vignette (elliptical, aspect-aware), applied in linear HDR before the tone map with the
      // ^2.2 that makes it read like a display-space vignette on mids and shadows, while light
      // sources at the edges (windows, lava, lamps) stay hot instead of turning grey.
      vec2 d = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0) * 1.1;
      float v = smoothstep(0.85 - uVigSoft, 0.85 + uVigSoft * 0.4, length(d) / max(1.0, uRes.x / uRes.y * 0.62));
      c *= pow(max(1.0 - uVig * v, 0.0), 1.4);
      // Exposure + filmic tone map (mix of per-channel ACES and hue-preserving ACES), sRGB.
      c *= uExposure / 0.6;
      // Hue-preserving in the shadows and mids (no crushed, clipped channels there); plain
      // per-channel ACES in the highlights, where its roll toward yellow/white is what makes
      // fire, lava and sunlit panes read hot.
      float tl = rrtOdt(vec3(max(dot(c, LUMA), 0.0))).x;
      c = mix(acesChannels(c), acesLuma(c), uToneHue * (1.0 - smoothstep(uToneHi.x, uToneHi.y, tl)));
      c = srgb(c);
      // Lift / gamma / gain (ASC-CDL-like).
      c = max(vec3(0.0), c * uGain + uLift * (1.0 - c));
      c = pow(c, 1.0 / uGamma);
      // Contrast on luminance with fixed black and white points: an S-curve with slope
      // uContrast at mid grey that never clips a channel (no crushed, hue-flipped shadows).
      float l = max(dot(c, LUMA), 1e-5);
      float l2 = clamp(l + (uContrast - 1.0) * (l - 0.5) * 4.0 * l * (1.0 - l), 0.0, 1.0);
      c *= l2 / l;
      l = l2;
      // Saturation, with chroma taken out of deep shadows (they read as muted earth tones).
      float sat = uSat * (1.0 - uShadowDesat * smoothstep(0.0, 0.04, l) * (1.0 - smoothstep(uDesatRange.x, uDesatRange.y, l)));
      c = mix(vec3(l), c, sat);
      // Luminance-preserving split tone: shadows toward the plum tint, highlights toward the
      // warm tint, both AT the pixel's luminance (tints are pre-divided by their own luminance).
      c = mix(c, uShadowTint * l, uSplit * (1.0 - smoothstep(0.0, 0.45, l)));
      c = mix(c, uHighTint * l, uSplit * smoothstep(0.5, 1.0, l));
      // Bottom-edge shade (foreground occluders), opt-in per arena.
      c *= 1.0 + uBottom * (1.0 - smoothstep(0.0, uBottomH, y));
      // Ordered dither, so smooth gradients (light beams, bloom halos) read as pixel dither.
      c += (bayer4(gl_FragCoord.xy) - 0.5) * uDither / 255.0;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

/** Phone tier: the same bloom from a mip chain at half the usual resolution (¼ of the frame). */
class LowBloomPass extends UnrealBloomPass {
  override setSize(width: number, height: number) { super.setSize(Math.round(width / 2), Math.round(height / 2)); }
}

/** Stats kept for `__game.perf()`: CPU ms of the last frames (render + post). */
export interface PerfStats { quality: Quality; frameMs: number; calls: number; triangles: number; internal: [number, number] }

export class Hd2dPipeline {
  readonly composer: EffectComposer;
  readonly settings: TierSettings;
  readonly grade: Grade;
  private bloom: UnrealBloomPass | null = null;
  private gradePass: ShaderPass;
  private gtao: GTAOPass | null = null;
  private ms: number[] = [];
  private frames = 0;
  /** Hooks run right before the composer renders (sprite baking). */
  readonly beforeRender: ((renderer: THREE.WebGLRenderer) => void)[] = [];

  constructor(readonly renderer: THREE.WebGLRenderer, readonly scene: THREE.Scene, readonly camera: THREE.PerspectiveCamera, readonly quality: Quality, grade: Grade = warmCaveGrade()) {
    const flags = postFlags();
    this.settings = { ...TIERS[quality] };
    if (flags.has('gtao')) this.settings.gtao = true;
    if (flags.has('nobloom')) this.settings.bloom = false;
    if (flags.has('notilt')) this.settings.tiltShift = false;
    if (flags.has('pcf')) this.settings.shadowType = THREE.PCFShadowMap;
    this.grade = grade;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 0 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.setPixelRatio(1);
    this.composer.setSize(size.x, size.y);
    this.composer.addPass(new RenderPass(scene, camera));
    if (this.settings.gtao) {
      this.gtao = new GTAOPass(scene, camera, size.x, size.y);
      this.gtao.blendIntensity = 0.8;
      this.composer.addPass(this.gtao);
    }
    if (this.settings.bloom) {
      // Threshold is in linear HDR luminance: windows, sunlit patches, beams, embers and FX
      // glows get a faint halo; the lit floor itself stays under it.
      const th = grade.bloomThreshold ?? GRADE_DEFAULTS.bloomThreshold, st = grade.bloomStrength ?? GRADE_DEFAULTS.bloomStrength;
      this.bloom = quality === 'high'
        ? new UnrealBloomPass(new THREE.Vector2(size.x, size.y), st, 0.5, th)
        : new LowBloomPass(new THREE.Vector2(size.x, size.y), st, 0.45, th);
      this.composer.addPass(this.bloom);
    }
    // One pass does tone mapping, sRGB output and the grade (no separate OutputPass).
    this.gradePass = new ShaderPass(GradeShader);
    this.composer.addPass(this.gradePass);
    this.applyGrade(flags.has('nograde'));
  }

  private applyGrade(off = false) {
    const u = this.gradePass.uniforms as typeof GradeShader.uniforms;
    const g = this.grade;
    u.uExposure.value = g.exposure;
    if (off) {
      // Plain per-channel ACES + sRGB (what OutputPass did), no grade.
      u.uToneHue.value = 0;
      u.uGain.value.set(1, 1, 1); u.uLift.value.set(0, 0, 0); u.uGamma.value.set(1, 1, 1); u.uSat.value = 1; u.uContrast.value = 1; u.uSplit.value = 0; u.uVig.value = 0; u.uDither.value = 0;
      u.uShadowDesat.value = 0; u.uBottom.value = 0;
    } else {
      u.uToneHue.value = g.toneHue ?? GRADE_DEFAULTS.toneHue;
      u.uLift.value.copy(g.lift); u.uGamma.value.copy(g.gamma); u.uGain.value.copy(g.gain);
      u.uSat.value = g.saturation; u.uContrast.value = g.contrast;
      u.uShadowDesat.value = g.shadowDesat ?? GRADE_DEFAULTS.shadowDesat;
      lumaNormalized(g.shadowTint, u.uShadowTint.value); lumaNormalized(g.highTint, u.uHighTint.value); u.uSplit.value = g.splitAmount;
      u.uVig.value = g.vignette; u.uVigSoft.value = g.vignetteSoft; u.uDither.value = g.dither;
      u.uBottom.value = g.bottomShade ?? GRADE_DEFAULTS.bottomShade; u.uBottomH.value = g.bottomShadeHeight ?? GRADE_DEFAULTS.bottomShadeHeight;
    }
    const tilt = this.settings.tiltShift && !off ? this.settings.tilt : 0;
    u.uTiltTop.value = g.tiltTop * tilt; u.uTiltBottom.value = g.tiltBottom * tilt;
    u.uFocusTop.value = g.focusTop; u.uFocusBottom.value = g.focusBottom;
  }

  /** Re-apply the grade after editing `this.grade` (A/B tools, live tuning). */
  regrade() { this.applyGrade(postFlags().has('nograde')); }

  /** Call after the renderer's drawing buffer changed size. */
  setSize() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.composer.setSize(size.x, size.y);
    (this.gradePass.uniforms as typeof GradeShader.uniforms).uRes.value.set(size.x, size.y);
    this.gtao?.setSize(size.x, size.y);
  }

  render() {
    const t0 = performance.now();
    const r = this.renderer;
    r.info.reset();
    const prevTone = r.toneMapping, prevExp = r.toneMappingExposure;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = this.grade.exposure;
    for (const f of this.beforeRender) f(r);
    if (this.settings.staticShadows) {
      // Two refreshes after the arena is built (lights settle), then frozen.
      r.shadowMap.autoUpdate = false;
      if (this.frames < 2) r.shadowMap.needsUpdate = true;
    }
    if (this.frames === 0 || this.frames === 30) this.warm();
    this.frames++;
    this.composer.render();
    r.toneMapping = prevTone; r.toneMappingExposure = prevExp;
    this.ms.push(performance.now() - t0);
    if (this.ms.length > 60) this.ms.shift();
  }

  /**
   * Link the FX programs (pooled FX materials, pixel flipbooks/points/glows) against this
   * scene's lights WITH the composer's linear render target bound — the variant they are
   * actually drawn with — so the first attack of a battle links nothing.
   */
  private warm() {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.composer.readBuffer);
    try {
      warmPrograms(r, this.scene, this.camera);
      warmPixelFx(r, this.scene, this.camera);
    } catch { /* warming is best-effort */ }
    r.setRenderTarget(prev);
  }

  stats(): PerfStats {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const sorted = [...this.ms].sort((a, b) => a - b);
    return { quality: this.quality, frameMs: sorted[Math.floor(sorted.length / 2)] ?? 0, calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, internal: [size.x, size.y] };
  }

  dispose() {
    this.composer.dispose();
    this.bloom?.dispose();
    this.gtao?.dispose();
  }
}

/**
 * Install a pipeline on the renderer for one scene: shadows on, info counted over the whole
 * frame (shadow + sprite + post passes), the internal resolution policy of the tier. Returns
 * an uninstall function that restores the default renderer state (call it on scene exit).
 */
export function installPipeline(r: { gl: THREE.WebGLRenderer; setInternal(p: { height: number; minShort: number } | null): void }, p: Hd2dPipeline): () => void {
  const gl = r.gl;
  gl.shadowMap.enabled = true;
  gl.shadowMap.type = p.settings.shadowType;
  gl.info.autoReset = false;
  r.setInternal({ height: p.settings.internalHeight, minShort: p.settings.minShort });
  p.setSize();
  return () => {
    gl.shadowMap.enabled = false;
    gl.shadowMap.autoUpdate = true;
    gl.info.autoReset = true;
    r.setInternal(null);
    p.dispose();
  };
}
