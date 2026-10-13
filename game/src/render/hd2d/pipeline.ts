// HD-2D post-processing pipeline and quality tiers.
//
//   scene ─RenderPass─▶ [GTAO (opt-in)] ─▶ UnrealBloom (half res) ─▶ OutputPass (ACES + sRGB)
//         ─▶ GradePass (warm LUT-style grade, tilt-shift, vignette, dither) ─▶ canvas
//
// Everything runs at the LOW internal resolution of the drawing buffer (Renderer.setInternal),
// and the canvas is upscaled by CSS with `image-rendering: pixelated`, so the final image stays
// pixel-crisp: blur only ever happens *inside* the low-res frame (bloom, a 1–2 px tilt-shift),
// never in the upscale. See docs/HD2D.md for the reasoning and numbers.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';

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
  /** Internal render height (px) the drawing buffer aims for. */
  internalHeight: number;
  /** Minimum internal size of the short side (portrait phones). */
  minShort: number;
  shadowMapSize: number;
  shadowType: THREE.ShadowMapType;
  bloom: boolean;
  tiltShift: boolean;
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
  high: { internalHeight: 480, minShort: 300, shadowMapSize: 2048, shadowType: THREE.PCFSoftShadowMap, bloom: true, tiltShift: true, gtao: false, dust: 50, staticShadows: false },
  low: { internalHeight: 400, minShort: 280, shadowMapSize: 1024, shadowType: THREE.PCFShadowMap, bloom: true, tiltShift: true, gtao: false, dust: 26, staticShadows: true },
};

/** Colour grade, vignette and tilt-shift parameters (sRGB, after tone mapping). */
export interface Grade {
  lift: THREE.Vector3; gamma: THREE.Vector3; gain: THREE.Vector3;
  saturation: number; contrast: number;
  /** Split-tone: shadows pulled toward `shadowTint`, highlights toward `highTint`. */
  shadowTint: THREE.Color; highTint: THREE.Color; splitAmount: number;
  vignette: number; vignetteSoft: number;
  /** Tilt-shift: max blur radius in px at the top / bottom edge and where the sharp band ends. */
  tiltTop: number; tiltBottom: number; focusTop: number; focusBottom: number;
  /** Ordered dither strength (in 8-bit steps) so gradients (beams, bloom) break into pixel dither. */
  dither: number;
  exposure: number;
}

export function warmCaveGrade(): Grade {
  return {
    lift: new THREE.Vector3(0.015, 0.008, 0.0), gamma: new THREE.Vector3(1.0, 1.0, 1.02), gain: new THREE.Vector3(1.03, 1.0, 0.93),
    saturation: 0.92, contrast: 1.06,
    shadowTint: new THREE.Color('#3a1f2e'), highTint: new THREE.Color('#ffe2a8'), splitAmount: 0.14,
    vignette: 0.42, vignetteSoft: 0.55,
    tiltTop: 1.0, tiltBottom: 0.6, focusTop: 0.8, focusBottom: 0.08,
    dither: 2.0,
    exposure: 1.05,
  };
}

const GradeShader = {
  name: 'Hd2dGrade',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uLift: { value: new THREE.Vector3() }, uGamma: { value: new THREE.Vector3(1, 1, 1) }, uGain: { value: new THREE.Vector3(1, 1, 1) },
    uSat: { value: 1 }, uContrast: { value: 1 },
    uShadowTint: { value: new THREE.Color() }, uHighTint: { value: new THREE.Color() }, uSplit: { value: 0 },
    uVig: { value: 0 }, uVigSoft: { value: 0.5 },
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
    uniform float uSat, uContrast, uSplit, uVig, uVigSoft, uTiltTop, uTiltBottom, uFocusTop, uFocusBottom, uDither;
    uniform vec3 uShadowTint, uHighTint;
    varying vec2 vUv;
    float bayer4(vec2 p) {
      ivec2 i = ivec2(mod(p, 4.0));
      int idx = i.y * 4 + i.x;
      int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
      return (float(m[idx]) + 0.5) / 16.0;
    }
    void main() {
      // Tilt-shift: a sharp horizontal band around the action, a 1–2 px blur toward the edges.
      float y = vUv.y;
      float r = uTiltTop * smoothstep(uFocusTop, 1.0, y) + uTiltBottom * (1.0 - smoothstep(0.0, uFocusBottom, y));
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      if (r > 0.2) {
        vec2 px = r / uRes;
        vec3 acc = c * 2.0;
        acc += texture2D(tDiffuse, vUv + vec2(px.x, 0.0)).rgb + texture2D(tDiffuse, vUv - vec2(px.x, 0.0)).rgb;
        acc += texture2D(tDiffuse, vUv + vec2(0.0, px.y)).rgb + texture2D(tDiffuse, vUv - vec2(0.0, px.y)).rgb;
        acc += texture2D(tDiffuse, vUv + px * 0.7).rgb + texture2D(tDiffuse, vUv - px * 0.7).rgb;
        acc += texture2D(tDiffuse, vUv + vec2(px.x, -px.y) * 0.7).rgb + texture2D(tDiffuse, vUv + vec2(-px.x, px.y) * 0.7).rgb;
        c = acc / 10.0;
      }
      // Lift / gamma / gain (ASC-CDL-like), contrast around mid grey, saturation.
      c = max(vec3(0.0), c * uGain + uLift * (1.0 - c));
      c = pow(c, 1.0 / uGamma);
      c = (c - 0.5) * uContrast + 0.5;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      // Split tone: warm highlights, plum shadows.
      float lum = clamp(l, 0.0, 1.0);
      c = mix(c, c * uShadowTint * 2.2, uSplit * (1.0 - smoothstep(0.0, 0.45, lum)));
      c = mix(c, c * uHighTint * 1.15, uSplit * smoothstep(0.5, 1.0, lum));
      // Vignette (elliptical, aspect-aware).
      vec2 d = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0) * 1.1;
      float v = smoothstep(0.85 - uVigSoft, 0.85 + uVigSoft * 0.4, length(d) / max(1.0, uRes.x / uRes.y * 0.62));
      c *= 1.0 - uVig * v;
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
      // Threshold is in linear HDR: only the window, beams, embers and FX glows bloom.
      this.bloom = quality === 'high'
        ? new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.5, 0.5, 1.05)
        : new LowBloomPass(new THREE.Vector2(size.x, size.y), 0.5, 0.45, 1.05);
      this.composer.addPass(this.bloom);
    }
    this.composer.addPass(new OutputPass());
    this.gradePass = new ShaderPass(GradeShader);
    this.composer.addPass(this.gradePass);
    this.applyGrade(flags.has('nograde'));
  }

  private applyGrade(off = false) {
    const u = this.gradePass.uniforms as typeof GradeShader.uniforms;
    const g = this.grade;
    if (off) {
      u.uGain.value.set(1, 1, 1); u.uLift.value.set(0, 0, 0); u.uGamma.value.set(1, 1, 1); u.uSat.value = 1; u.uContrast.value = 1; u.uSplit.value = 0; u.uVig.value = 0; u.uDither.value = 0;
    } else {
      u.uLift.value.copy(g.lift); u.uGamma.value.copy(g.gamma); u.uGain.value.copy(g.gain);
      u.uSat.value = g.saturation; u.uContrast.value = g.contrast;
      u.uShadowTint.value.copy(g.shadowTint); u.uHighTint.value.copy(g.highTint); u.uSplit.value = g.splitAmount;
      u.uVig.value = g.vignette; u.uVigSoft.value = g.vignetteSoft; u.uDither.value = g.dither;
    }
    const tilt = this.settings.tiltShift && !off;
    u.uTiltTop.value = tilt ? g.tiltTop : 0; u.uTiltBottom.value = tilt ? g.tiltBottom : 0;
    u.uFocusTop.value = g.focusTop; u.uFocusBottom.value = g.focusBottom;
  }

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
    this.frames++;
    this.composer.render();
    r.toneMapping = prevTone; r.toneMappingExposure = prevExp;
    this.ms.push(performance.now() - t0);
    if (this.ms.length > 60) this.ms.shift();
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
