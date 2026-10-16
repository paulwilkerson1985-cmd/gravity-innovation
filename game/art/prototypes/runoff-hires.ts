// RUNOFF PROTOTYPE (scratch worktree, never committed): device-resolution composite for the
// high-resolution kin art of the bake-off (`?kinart=C|D`) and a native-resolution arena
// (`?arenares=native`).
//
//   scene (grid RT, linear HDR, depth texture) ─▶ bloom ─▶ grade (grid RT)
//      ─▶ HybridComposite (canvas at DEVICE px):
//           1. nearest blit of the graded grid (texelFetch, so the pixel grid is untouched)
//           2. per kin, far → near: a soft contact shadow, then the art billboard — screen-aligned,
//              anchored at the CreatureView's feet, following its lunge / hop / squash / lean /
//              hit flash / blink, depth-tested against the GRID depth (2×2 bilinear PCF so the
//              occlusion edge is soft, not a grid staircase), lit by the arena's sprite light
//              (key tint, key-side rim, far-side shade, contact AO), then put through the SAME
//              grade as the world (inverse tone map → arena light → the grade's tone map, CDL,
//              contrast, saturation, split tone, vignette, bottom shade, dither on the grid
//              phase, screen transitions on the grid).
//           3. FX drawn over sprites (renderOrder ≥ 8, additive sparks) are rendered to a small
//              grid-res RT and added to the kin before grading, so impact FX stay in front of
//              the hi-res kin and stay pixel FX.
import * as THREE from 'three';
import type { CreatureView } from '../creature';
import type { SpriteLight } from './sprite';

export type KinArtStyle = 'C' | 'D';
const qs = () => new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
export function kinArtStyle(): KinArtStyle | null {
  const v = qs().get('kinart');
  return v === 'C' || v === 'D' ? v : null;
}
/** RUNOFF native arena: pixel FX (authored in grid px) scale their texels by the tier's grid scale. */
export const nativeFxScale = { k: 1 };
export function arenaNative(): boolean { return qs().get('arenares') === 'native'; }
/** Any runoff variant: the canvas becomes device-res and the composite runs. */
export function hybridRequested(): boolean { return qs().get('gfx') === 'hd2d' && (kinArtStyle() !== null || arenaNative()); }

/** Crop metrics of the prepared art (tools/prep_art.py): solid bbox (alpha > 50%) and foot x, in crop px. */
interface ArtMeta { w: number; h: number; top: number; bottom: number; left: number; right: number; footX: number }
const META: Record<string, ArtMeta> = {
  'C/ashkit': { w: 748, h: 829, top: 7, bottom: 822, left: 39, right: 741, footX: 346.8 },
  'C/stormoth': { w: 843, h: 833, top: 7, bottom: 826, left: 7, right: 837, footX: 428.7 },
  'C/cragmaul': { w: 819, h: 868, top: 85, bottom: 862, left: 6, right: 813, footX: 386.6 },
  'D/ashkit': { w: 670, h: 840, top: 7, bottom: 832, left: 7, right: 663, footX: 276.1 },
  'D/stormoth': { w: 962, h: 833, top: 7, bottom: 826, left: 7, right: 955, footX: 362.2 },
  'D/cragmaul': { w: 684, h: 838, top: 6, bottom: 831, left: 7, right: 677, footX: 341.0 },
};
export function hasKinArt(species?: string): boolean {
  const s = kinArtStyle();
  return !!s && !!species && !!META[`${s}/${species}`];
}
/** Art solid width ÷ solid height (for footprints). */
export function artAspect(species: string): number {
  const m = META[`${kinArtStyle()}/${species}`]!;
  return (m.right - m.left) / (m.bottom - m.top);
}

const texCache = new Map<string, THREE.Texture>();
function artTexture(key: string): THREE.Texture {
  let t = texCache.get(key);
  if (!t) {
    t = new THREE.TextureLoader().load(`./kinart/${key}.png`);
    t.colorSpace = THREE.SRGBColorSpace;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = 4;
    // Edge colours are bled into the transparent texels offline: straight alpha, no halos.
    t.premultiplyAlpha = false;
    texCache.set(key, t);
  }
  return t;
}

// ---------------------------------------------------------------- GLSL
const GRADE_GLSL = /* glsl */ `
  uniform vec3 uLift, uGamma, uGain;
  uniform vec2 uToneHi, uDesatRange, uDitherOff;
  uniform float uExposure, uToneHue, uSat, uContrast, uShadowDesat, uSplit, uVig, uVigSoft, uBottom, uBottomH, uDither;
  uniform float uTrMode, uTrK;
  uniform vec2 uTrC;
  uniform vec3 uTrInk;
  uniform vec4 uPulse;
  uniform vec3 uShadowTint, uHighTint;
  uniform vec2 uDev, uGrid;
  uniform float uS;
  const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
  float bayer4(vec2 p) {
    ivec2 i = ivec2(mod(p, 4.0));
    int idx = i.y * 4 + i.x;
    int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
    return (float(m[idx]) + 0.5) / 16.0;
  }
  vec3 rrtOdt(vec3 v) {
    vec3 a = v * (v + 0.0245786) - 0.000090537;
    vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
    return a / b;
  }
  float invRrt(float t) {
    t = clamp(t, 0.0, 0.95);
    float A = t * 0.983729 - 1.0, B = t * 0.4329510 - 0.0245786, C = t * 0.238081 + 0.000090537;
    return (-B - sqrt(max(B * B - 4.0 * A * C, 0.0))) / (2.0 * A);
  }
  vec3 acesChannels(vec3 c) {
    const mat3 IN = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
    const mat3 OUT = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
    return OUT * rrtOdt(IN * c);
  }
  vec3 acesLuma(vec3 c) {
    float l = dot(c, LUMA);
    float t = max(rrtOdt(vec3(max(l, 0.0))).x, 0.0);
    return c * (t / max(l, 1e-5));
  }
  vec3 srgbEnc(vec3 c) {
    c = clamp(c, 0.0, 1.0);
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }
  // Display-referred art colour (linear) -> the scene-linear value the grade's tone map returns it from.
  vec3 untone(vec3 lin) {
    float L = dot(lin, LUMA);
    return lin * (invRrt(L) / max(L, 1e-5)) / (uExposure / 0.6);
  }
  // The world's grade (pipeline.ts GradeShader), pointwise part, on device px.
  vec3 gradeColor(vec3 c) {
    vec2 uv = gl_FragCoord.xy / uDev;
    vec2 d = (uv - 0.5) * vec2(uDev.x / uDev.y, 1.0) * 1.1;
    float v = smoothstep(0.85 - uVigSoft, 0.85 + uVigSoft * 0.4, length(d) / max(1.0, uDev.x / uDev.y * 0.62));
    c *= pow(max(1.0 - uVig * v, 0.0), 1.4);
    c *= uExposure / 0.6;
    float tl = rrtOdt(vec3(max(dot(c, LUMA), 0.0))).x;
    vec3 hp = acesLuma(c);
    float over = max(hp.r, max(hp.g, hp.b));
    c = mix(acesChannels(c), hp, uToneHue * (1.0 - smoothstep(uToneHi.x, uToneHi.y, tl)) * (1.0 - smoothstep(0.98, 1.2, over)));
    c = srgbEnc(c);
    c = max(vec3(0.0), c * uGain + uLift * (1.0 - c));
    c = pow(c, 1.0 / uGamma);
    float l = max(dot(c, LUMA), 1e-5);
    float l2 = clamp(l + (uContrast - 1.0) * (l - 0.5) * 4.0 * l * (1.0 - l), 0.0, 1.0);
    c *= l2 / l;
    l = l2;
    float sat = uSat * (1.0 - uShadowDesat * smoothstep(0.0, 0.04, l) * (1.0 - smoothstep(uDesatRange.x, uDesatRange.y, l)));
    c = mix(vec3(l), c, sat);
    c = mix(c, uShadowTint * l, uSplit * (1.0 - smoothstep(0.0, 0.45, l)));
    c = mix(c, uHighTint * l, uSplit * smoothstep(0.5, 1.0, l));
    c *= 1.0 + uBottom * (1.0 - smoothstep(0.0, uBottomH, uv.y));
    vec2 G = floor(gl_FragCoord.xy / uS);
    c += (bayer4(G + uDitherOff) - 0.5) * uDither / 255.0;
    if (uTrMode > 0.5) {
      vec2 P = G;
      float cover = 0.0;
      if (uTrMode < 1.5) cover = step(bayer4(floor(P / 2.0)), uTrK);
      else if (uTrMode < 2.5 || uTrMode > 4.5) {
        float band = floor(P.y / 30.0);
        float x = (uTrMode > 4.5 && mod(band, 2.0) > 0.5) ? uGrid.x - P.x : P.x;
        cover = step(x + floor(mod(P.y, 30.0) / 2.0) * 2.0, uTrK * (uGrid.x + 70.0) - 10.0);
      } else if (uTrMode < 3.5) {
        float R = floor((1.0 - uTrK) * length(uGrid) / 4.0) * 4.0;
        cover = step(R, length(P - uTrC * uGrid));
      } else cover = step(bayer4(floor(P / 2.0)), (uTrK - 0.6) / 0.4);
      c = mix(c, uTrInk, cover);
    }
    if (uPulse.a > 0.0) {
      vec3 t = mix(c, uPulse.rgb, uPulse.a);
      float dl = abs(dot(pow(t, vec3(2.2)), LUMA) - dot(pow(c, vec3(2.2)), LUMA));
      c = mix(c, t, min(1.0, 0.08 / max(dl, 1e-4)));
    }
    return clamp(c, 0.0, 1.0);
  }`;

const OCCLUDE_GLSL = /* glsl */ `
  uniform sampler2D tDepth;
  uniform float uNear, uFar, uRefZ;
  float visAt(ivec2 p) {
    p = clamp(p, ivec2(0), ivec2(uGrid) - 1);
    float d = texelFetch(tDepth, p, 0).r;
    if (d >= 0.99999) return 1.0;
    float dist = uNear * uFar / (uFar - d * (uFar - uNear));
    return step(uRefZ, dist);
  }
  // Visibility against the grid depth, bilinear over the 4 nearest grid texels (soft edge).
  float visibility() {
    vec2 g = gl_FragCoord.xy / uS - 0.5;
    vec2 f = fract(g);
    ivec2 i = ivec2(floor(g));
    float a = visAt(i), b = visAt(i + ivec2(1, 0)), c = visAt(i + ivec2(0, 1)), e = visAt(i + ivec2(1, 1));
    return mix(mix(a, b, f.x), mix(c, e, f.x), f.y);
  }`;

const QUAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const BLIT_FRAG = /* glsl */ `
  uniform sampler2D tGraded;
  uniform float uS;
  void main() { gl_FragColor = vec4(texelFetch(tGraded, ivec2(floor(gl_FragCoord.xy / uS)), 0).rgb, 1.0); }`;

const KIN_FRAG = /* glsl */ `
  uniform sampler2D tArt, tFx;
  uniform float uFxOn, uFlash, uRimK, uShadeK, uAo, uFootV, uOpacity;
  uniform vec3 uLight, uRimCol;
  uniform vec2 uRimUv, uOutUv;
  uniform float uOutline;
  uniform vec3 uInk;
  varying vec2 vUv;
  ${GRADE_GLSL}
  ${OCCLUDE_GLSL}
  void main() {
    vec4 t = texture2D(tArt, vUv);
    // Optional screen-space ink line (D: its 6-px Freestyle contour drops below 1 device px at game size).
    float ao = t.a;
    if (uOutline > 0.0) {
      float dil = 0.0;
      for (int i = 0; i < 8; i++) {
        float an = float(i) * 0.785398;
        dil = max(dil, texture2D(tArt, vUv + vec2(cos(an), sin(an)) * uOutUv).a);
      }
      ao = max(t.a, dil * uOutline);
    }
    float a = ao * uOpacity;
    if (a < 0.003) discard;
    a *= visibility();
    if (a < 0.003) discard;
    vec3 art = mix(uInk, t.rgb, t.a / max(ao, 1e-4));
    float L = dot(art, LUMA);
    vec3 c = untone(art) * uLight;
    // Key-side rim (light catching the silhouette) and far-side shade, from the art's own alpha.
    float rim = t.a * (1.0 - texture2D(tArt, vUv + uRimUv).a);
    float shade = t.a * (1.0 - texture2D(tArt, vUv - uRimUv * 1.6).a);
    c *= 1.0 + uRimK * rim * uRimCol;
    c *= 1.0 - uShadeK * shade;
    // Contact occlusion toward the feet.
    c *= 1.0 - uAo * (1.0 - smoothstep(uFootV, uFootV + 0.14, vUv.y));
    // Hit flash: the fills go white, the ink stays dark.
    c = mix(c, vec3(2.6), uFlash * smoothstep(0.03, 0.12, L));
    if (uFxOn > 0.5) c += texelFetch(tFx, ivec2(floor(gl_FragCoord.xy / uS)), 0).rgb;
    vec3 g = gradeColor(c);
    gl_FragColor = vec4(g * a, a);
  }`;

const SHADOW_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  ${GRADE_GLSL}
  ${OCCLUDE_GLSL}
  void main() {
    float r = length(vUv * 2.0 - 1.0);
    // A dense core under the feet and a wide soft penumbra.
    float a = uOpacity * (0.55 * (1.0 - smoothstep(0.0, 1.0, r)) + 0.45 * (1.0 - smoothstep(0.0, 0.55, r)));
    if (a < 0.003) discard;
    a *= visibility();
    gl_FragColor = vec4(uColor * a, a);
  }`;

const GRADE_NAMES = ['uLift', 'uGamma', 'uGain', 'uToneHi', 'uDesatRange', 'uDitherOff', 'uExposure', 'uToneHue', 'uSat', 'uContrast', 'uShadowDesat', 'uSplit', 'uVig', 'uVigSoft', 'uBottom', 'uBottomH', 'uDither', 'uTrMode', 'uTrK', 'uTrC', 'uTrInk', 'uPulse', 'uShadowTint', 'uHighTint'] as const;

function quadGeo(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

function worldVisible(o: THREE.Object3D | null): boolean {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

interface Kin {
  view: CreatureView;
  side: 0 | 1;
  meta: ArtMeta;
  flip: boolean;
  /** Creature (solid art) height in world units at rest. */
  height: number;
  mat: THREE.ShaderMaterial;
  mesh: THREE.Mesh;
  shadowMat: THREE.ShaderMaterial;
  shadow: THREE.Mesh;
}

const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

export class HybridComposite {
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private blit: THREE.Mesh;
  private blitMat: THREE.ShaderMaterial;
  private kin: [Kin | null, Kin | null] = [null, null];
  private fxRT: THREE.WebGLRenderTarget;
  private fxOn = { value: 0 };
  private shared: Record<string, THREE.IUniform>;
  private light = { tint: new THREE.Vector3(1, 1, 1), rim: new THREE.Color(1, 0.95, 0.85), keyScreen: new THREE.Vector2(-0.6, 0.8), contact: new THREE.Color('#24161e') };
  /** Calls drawn by the composite in the last frame (cost notes). */
  calls = 0;

  constructor(private renderer: THREE.WebGLRenderer, gradeUniforms: Record<string, THREE.IUniform>, private sceneMain: THREE.Scene, private camera: THREE.PerspectiveCamera) {
    this.shared = {
      uDev: { value: new THREE.Vector2(1, 1) }, uGrid: { value: new THREE.Vector2(1, 1) }, uS: { value: 1 },
      uNear: { value: 0.5 }, uFar: { value: 90 },
    };
    for (const n of GRADE_NAMES) this.shared[n] = gradeUniforms[n]!;
    this.blitMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT, fragmentShader: BLIT_FRAG, depthTest: false, depthWrite: false,
      uniforms: { tGraded: { value: null }, uS: this.shared.uS! },
    });
    this.blit = new THREE.Mesh(quadGeo(), this.blitMat);
    (this.blit.geometry.getAttribute('position') as THREE.BufferAttribute).set([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
    this.blit.frustumCulled = false;
    this.blit.renderOrder = 0;
    this.scene.add(this.blit);
    this.fxRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter });
  }

  /** Arena light for the art: key tint + level, rim colour and the key's screen direction. */
  setLight(l: SpriteLight, camera: THREE.Camera) {
    const lum = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    const key = l.keyColor.clone();
    const kl = Math.max(lum(key), 1e-3);
    const hue = key.clone().multiplyScalar(1 / kl);
    // Key hue at 45%, sky hue at 20%; level from how bright the set lights its sprites.
    const sky = l.sky.clone().multiplyScalar(1 / Math.max(lum(l.sky), 1e-3));
    const tint = new THREE.Color(1, 1, 1).lerp(hue, 0.45).lerp(sky, 0.2);
    const level = THREE.MathUtils.clamp(0.62 + 0.55 * (kl + 0.5 * lum(l.sky)) * (l.spriteGain ?? 1), 0.8, 1.15) * Number(qs().get('artgain') ?? 1);
    this.light.tint.set(tint.r * level, tint.g * level, tint.b * level);
    this.light.rim.copy(l.rim).multiplyScalar(1 / Math.max(lum(l.rim), 1e-3)).lerp(new THREE.Color(1, 1, 1), 0.3);
    if (l.contact) this.light.contact.set(l.contact);
    camera.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const kx = l.keyDir.dot(right), ky = l.keyDir.dot(up);
    // A sprite key always comes from above (the art is lit from above): keep the side, lift it.
    this.light.keyScreen.set(Math.abs(kx) < 0.15 ? -0.4 : Math.sign(kx) * 0.7, Math.max(0.6, ky)).normalize();
  }

  addKin(view: CreatureView, side: 0 | 1, species: string, height: number) {
    this.removeKin(side);
    const style = kinArtStyle()!;
    const key = `${style}/${species}`;
    const meta = META[key]!;
    const unis = (extra: Record<string, THREE.IUniform>) => ({ ...this.shared, tDepth: { value: null }, uRefZ: { value: 0 }, ...extra });
    const mat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT, fragmentShader: KIN_FRAG, transparent: true, depthTest: false, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      uniforms: unis({
        tArt: { value: artTexture(key) }, tFx: { value: this.fxRT.texture }, uFxOn: this.fxOn,
        uFlash: { value: 0 }, uRimK: { value: 0.45 }, uShadeK: { value: 0.1 }, uAo: { value: 0.16 },
        uFootV: { value: 1 - meta.bottom / meta.h }, uOpacity: { value: 1 },
        uLight: { value: this.light.tint },
        uOutline: { value: style === 'D' ? Number(qs().get('artline') ?? 1) : 0 }, uOutUv: { value: new THREE.Vector2() },
        uInk: { value: new THREE.Color('#2a1c1e').convertSRGBToLinear() }, uRimCol: { value: this.light.rim }, uRimUv: { value: new THREE.Vector2() },
      }),
    });
    const shadowMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT, fragmentShader: SHADOW_FRAG, transparent: true, depthTest: false, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      uniforms: unis({ uColor: { value: this.light.contact }, uOpacity: { value: 0.5 } }),
    });
    const mesh = new THREE.Mesh(quadGeo(), mat);
    const shadow = new THREE.Mesh(quadGeo(), shadowMat);
    for (const m of [mesh, shadow]) { m.frustumCulled = false; m.visible = false; this.scene.add(m); }
    // Art faces screen-right: your kin uses it as drawn, the foe is mirrored to face left.
    this.kin[side] = { view, side, meta, flip: side === 1, height, mat, mesh, shadowMat, shadow };
  }

  removeKin(side: 0 | 1) {
    const k = this.kin[side];
    if (!k) return;
    this.scene.remove(k.mesh, k.shadow);
    k.mesh.geometry.dispose(); k.shadow.geometry.dispose(); k.mat.dispose(); k.shadowMat.dispose();
    this.kin[side] = null;
  }

  /** Footprint half-width (world) of a kin's art at a given creature height. */
  static halfWidth(species: string, height: number): number { return 0.5 * height * artAspect(species); }

  /** Run after the composer: blit the graded grid at device res, then the kin over it. */
  render(graded: THREE.Texture, depth: THREE.DepthTexture | null) {
    const r = this.renderer;
    const ctx = r.getContext();
    const dev = new THREE.Vector2(ctx.drawingBufferWidth, ctx.drawingBufferHeight);
    const grid = r.getDrawingBufferSize(new THREE.Vector2());
    const s = Math.max(1, Math.round(dev.y / grid.y));
    (this.shared.uDev!.value as THREE.Vector2).copy(dev);
    (this.shared.uGrid!.value as THREE.Vector2).copy(grid);
    this.shared.uS!.value = s;
    this.shared.uNear!.value = this.camera.near;
    this.shared.uFar!.value = this.camera.far;
    this.blitMat.uniforms.tGraded!.value = graded;
    const live = this.kin.filter((k): k is Kin => !!k && this.place(k, dev, depth));
    for (const k of this.kin) if (k && !live.includes(k)) { k.mesh.visible = false; k.shadow.visible = false; }
    if (live.length) this.renderFx(grid);
    // Far kin first; all shadows under all kin.
    live.sort((a, b) => b.mat.uniforms.uRefZ!.value - a.mat.uniforms.uRefZ!.value);
    live.forEach((k, i) => { k.shadow.renderOrder = 1 + i; k.mesh.renderOrder = 10 + i; });
    const before = r.info.render.calls;
    const prevAuto = r.autoClear;
    r.autoClear = false;
    r.setRenderTarget(null);
    r.render(this.scene, this.cam);
    r.autoClear = prevAuto;
    this.calls = r.info.render.calls - before;
  }

  /** Over-sprite FX (renderOrder ≥ 8) into a grid RT, added to the kin before grading. */
  private renderFx(grid: THREE.Vector2) {
    const fx: THREE.Object3D[] = [];
    this.sceneMain.traverse((o) => {
      const m = o as THREE.Mesh;
      if ((m.isMesh || (o as THREE.Points).isPoints || (o as THREE.Sprite).isSprite) && o.renderOrder >= 8 && worldVisible(o)) fx.push(o);
    });
    this.fxOn.value = fx.length ? 1 : 0;
    if (!fx.length) return;
    const r = this.renderer;
    if (this.fxRT.width !== grid.x || this.fxRT.height !== grid.y) this.fxRT.setSize(grid.x, grid.y);
    const LAYER = 7;
    for (const o of fx) o.layers.enable(LAYER);
    const mask = this.camera.layers.mask;
    const bg = this.sceneMain.background;
    const auto = r.shadowMap.autoUpdate;
    const cc = r.getClearColor(new THREE.Color()), ca = r.getClearAlpha();
    this.camera.layers.set(LAYER);
    this.sceneMain.background = null;
    r.shadowMap.autoUpdate = false;
    r.setRenderTarget(this.fxRT);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, false);
    r.render(this.sceneMain, this.camera);
    r.setClearColor(cc, ca);
    r.shadowMap.autoUpdate = auto;
    this.sceneMain.background = bg;
    this.camera.layers.mask = mask;
    for (const o of fx) o.layers.disable(LAYER);
  }

  /** Place one kin's billboard + shadow for this frame; false = not drawn. */
  private place(k: Kin, dev: THREE.Vector2, depth: THREE.DepthTexture | null): boolean {
    const v = k.view;
    if (!worldVisible(v.body) || v.blinkOff) return false;
    const cam = this.camera;
    v.mesh.updateWorldMatrix(true, false);
    // The feet: the mesh origin (idle bob, hover, lunge, hop); the ground under the root.
    const feet = _a.setFromMatrixPosition(v.mesh.matrixWorld);
    v.root.updateWorldMatrix(true, false);
    const groundY = _v.setFromMatrixPosition(v.root.matrixWorld).y;
    const ground = _b.set(feet.x, groundY, feet.z);
    const camRight = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const camUp = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    const toPx = (p: THREE.Vector3) => { const n = p.clone().project(cam); return new THREE.Vector2((n.x * 0.5 + 0.5) * dev.x, (n.y * 0.5 + 0.5) * dev.y); };
    const scaleK = v.inner.scale.y / Math.max(1e-4, v.baseScale);
    const sq = v.body.scale;
    const H = k.height * scaleK;
    const fp = toPx(feet);
    const heightPx = toPx(feet.clone().addScaledVector(camUp, H)).distanceTo(fp);
    if (!(heightPx > 1)) return false;
    // Lean: the body's up axis projected on the screen.
    v.body.getWorldQuaternion(_q);
    const upW = UP.clone().applyQuaternion(_q);
    const roll = -Math.atan2(upW.dot(camRight), upW.dot(camUp));
    const m = k.meta;
    const ppx = heightPx / (m.bottom - m.top); // device px per art px
    const sx = ppx * sq.x, sy = ppx * sq.y;
    // Quad corners in art px relative to the feet point (art y down), mirrored for the foe.
    const fx = k.flip ? m.w - m.footX : m.footX;
    const corners = [[0, m.h], [m.w, m.h], [m.w, 0], [0, 0]] as const; // uv (0,0),(1,0),(1,1),(0,1)
    const cr = Math.cos(roll), sr = Math.sin(roll);
    const pos = k.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const uv = k.mesh.geometry.getAttribute('uv') as THREE.BufferAttribute;
    corners.forEach(([ax, ay], i) => {
      const x = (ax - fx) * sx, y = (m.bottom - ay) * sy;
      const X = fp.x + x * cr - y * sr, Y = fp.y + x * sr + y * cr;
      pos.setXYZ(i, (X / dev.x) * 2 - 1, (Y / dev.y) * 2 - 1, 0);
    });
    pos.needsUpdate = true;
    uv.set(k.flip ? [1, 0, 0, 0, 0, 1, 1, 1] : [0, 0, 1, 0, 1, 1, 0, 1]);
    uv.needsUpdate = true;
    // Depth reference: the feet, pulled toward the camera by the footprint (things must really be
    // in front of the kin to hide it; the floor under its feet never does).
    const halfW = 0.5 * H * (m.right - m.left) / (m.bottom - m.top);
    const dist = (p: THREE.Vector3) => -p.clone().applyMatrix4(cam.matrixWorldInverse).z;
    // The art stands for a body of radius ≈ halfW: only things in front of that volume hide it.
    const refZ = dist(ground) - Math.min(1.2, 0.9 * halfW + 0.15);
    const u = k.mat.uniforms;
    u.tDepth!.value = depth;
    u.uRefZ!.value = depth ? refZ : 0;
    u.uFlash!.value = Math.min(1, v.material.emissive.r * 0.9);
    // Rim: ≈ 3 device px wide, toward the key on screen (mirrored in texture space for the foe).
    const texPerPx = 1 / ppx;
    const ks = this.light.keyScreen;
    (u.uRimUv!.value as THREE.Vector2).set(((k.flip ? -ks.x : ks.x) * 3.2 * texPerPx) / m.w, (ks.y * 3.2 * texPerPx) / m.h);
    (u.uOutUv!.value as THREE.Vector2).set((1.1 * texPerPx) / m.w, (1.1 * texPerPx) / m.h);
    k.mesh.visible = true;
    // Contact shadow: an ellipse on the floor under the feet, fading as the kin leaves the ground.
    const hop = Math.max(0, feet.y - groundY - (v.hover ?? 0) * v.root.scale.y * v.baseScale);
    const gp = toPx(ground);
    const toward = new THREE.Vector3(camRight.z, 0, -camRight.x).normalize();
    // Make `toward` point at the camera.
    if (toward.dot(_v.copy(cam.position).sub(ground)) < 0) toward.negate();
    const rx = halfW * 0.92 * Math.max(0.5, 1 - hop * 0.6);
    const ex = toPx(ground.clone().addScaledVector(camRight, rx)).distanceTo(gp);
    const ey = Math.max(3, toPx(ground.clone().addScaledVector(toward, rx * 0.5)).distanceTo(gp));
    const sp = k.shadow.geometry.getAttribute('position') as THREE.BufferAttribute;
    const cx = gp.x + (fp.x - gp.x) * 0, cy = gp.y;
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b], i) => sp.setXYZ(i, ((cx + a! * ex) / dev.x) * 2 - 1, ((cy + b! * ey) / dev.y) * 2 - 1, 0));
    sp.needsUpdate = true;
    const su = k.shadowMat.uniforms;
    su.tDepth!.value = depth;
    su.uRefZ!.value = depth ? dist(ground) - 0.35 : 0;
    su.uOpacity!.value = 0.75 * Math.max(0, 1 - hop * 0.5) * Math.min(1, scaleK);
    k.shadow.visible = true;
    return true;
  }

  dispose() {
    this.removeKin(0); this.removeKin(1);
    this.blit.geometry.dispose(); this.blitMat.dispose(); this.fxRT.dispose();
  }
}

/** Native arena: smooth texture sampling (linear + mips + aniso) instead of nearest texels. */
export function smoothTextures(root: THREE.Object3D) {
  const seen = new Set<THREE.Texture>();
  root.traverse((o) => {
    const mats = (o as THREE.Mesh).material;
    if (!mats) return;
    for (const m of Array.isArray(mats) ? mats : [mats]) {
      for (const v of Object.values(m as unknown as Record<string, unknown>)) {
        const t = v as THREE.Texture;
        if (!t || !(t as THREE.Texture).isTexture || seen.has(t) || (t as THREE.DataTexture).isDataTexture && !(t.image as { data?: unknown })?.data) continue;
        seen.add(t);
        t.magFilter = THREE.LinearFilter;
        t.minFilter = t.mipmaps?.length || t.generateMipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
        t.anisotropy = 4;
        t.needsUpdate = true;
      }
    }
  });
}
