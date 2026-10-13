// Sprite-ification of 3D models for the HD-2D look.
//
// Each subject (a creature or a person mesh) is rendered EVERY FRAME into its own small
// offscreen target with a banded toon shader, from a camera that has the main camera's
// orientation and exactly one target texel per internal screen pixel (`pxPerTexel` = 1) or
// per 2×2 block (= 2, chunkier). The target is then drawn on a camera-facing billboard whose
// centre is snapped to the pixel grid, with a 1-texel dark silhouette outline and depth-based
// inner contour lines added in the billboard shader. The result reads like a hand-drawn pixel
// sprite but keeps every procedural animation (idle bob, rig flaps/blinks, lunge, hit flash,
// faint) because the live mesh is what gets rendered.
//
// The original mesh stays in the scene graph (battle code keeps animating it) with an
// invisible material, so it still casts a real (rig-animated) shadow into the shadow map.
import * as THREE from 'three';
import { VERT_BODY, VERT_HEAD, type CreatureUniforms } from '../creatures/material';
import { detectQuality, postFlags } from './pipeline';

/** Lighting the toon shader applies (world space). Usually derived from the arena's light rig. */
export interface SpriteLight {
  /** Direction from the subject toward the key light (world). */
  keyDir: THREE.Vector3;
  keyColor: THREE.Color;
  sky: THREE.Color;
  ground: THREE.Color;
  /** Rim/back light colour (from the key light, catching silhouette edges). */
  rim: THREE.Color;
}

export interface SpriteOptions {
  /** Rig uniforms of a CreatureView (enables the vertex rig + blink in the sprite pass). */
  rig?: CreatureUniforms;
  /** Source of the hit-flash/pulse emissive colour (CreatureView.material). */
  emissiveFrom?: { emissive: THREE.Color };
  /** Screen px per sprite texel: 1 = crisp 1:1, 2 = chunky. */
  pxPerTexel?: number;
  /** Silhouette outline colour (sRGB hex). */
  outline?: string;
  /** Extra self-lit lift (your own kin, seen from behind). */
  lift?: number;
  /** Render the mesh in-scene with the toon material instead of a billboard (option b, A/B only). */
  inScene?: boolean;
  /**
   * Bake at 2× and downsample with a detail-preserving filter (default 2): eyes, mouths and
   * shines survive on small kin, edges stay 1 texel. 1 = direct bake (cheaper). Default: 2 on
   * the high tier, 1 on low.
   */
  supersample?: 1 | 2;
  /** Snap vertex colours to a palette extracted from the mesh (default true). */
  palette?: boolean;
}

/** Max palette entries per sprite (uniform array size). */
export const SPRITE_PALETTE_MAX = 16;

const srgbOf = (c: THREE.Color) => { const o = c.clone(); o.convertLinearToSRGB(); return o; };

/**
 * A limited palette from a mesh's vertex colours: colours closer than `tol` (sRGB distance) to
 * an earlier, more frequent entry merge into it, then the closest pairs merge until at most
 * `max` remain. Rare but distinct colours (eye black, eye shine, accents) survive because
 * merging is by distance, not frequency. Linear colours out, most frequent first.
 */
export function extractPalette(geo: THREE.BufferGeometry, max = SPRITE_PALETTE_MAX, tol = 0.09): THREE.Color[] {
  const col = geo.getAttribute('color');
  if (!col) return [];
  const counts = new Map<string, { c: THREE.Color; n: number }>();
  const tmp = new THREE.Color();
  for (let i = 0; i < col.count; i++) {
    tmp.setRGB(col.getX(i), col.getY(i), col.getZ(i));
    const s = srgbOf(tmp);
    const k = `${Math.round(s.r * 64)},${Math.round(s.g * 64)},${Math.round(s.b * 64)}`;
    const e = counts.get(k);
    if (e) e.n++; else counts.set(k, { c: s, n: 1 });
  }
  const sorted = [...counts.values()].sort((a, b) => b.n - a.n);
  const pal: { c: THREE.Color; n: number; sum: THREE.Color }[] = [];
  const dist = (a: THREE.Color, b: THREE.Color) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
  for (const e of sorted) {
    let best = -1, bd = tol;
    pal.forEach((p, i) => { const d = dist(p.c, e.c); if (d < bd) { bd = d; best = i; } });
    if (best >= 0) { const p = pal[best]!; p.n += e.n; p.sum.add(e.c.clone().multiplyScalar(e.n)); }
    else pal.push({ c: e.c.clone(), n: e.n, sum: e.c.clone().multiplyScalar(e.n) });
  }
  // Representative = the weighted mean of what merged into it.
  for (const p of pal) p.c.copy(p.sum).multiplyScalar(1 / p.n);
  while (pal.length > max) {
    let bi = 0, bj = 1, bd = Infinity;
    for (let i = 0; i < pal.length; i++) for (let j = i + 1; j < pal.length; j++) {
      const d = dist(pal[i]!.c, pal[j]!.c);
      if (d < bd) { bd = d; bi = i; bj = j; }
    }
    const a = pal[bi]!, b = pal[bj]!;
    a.c.multiplyScalar(a.n).add(b.c.clone().multiplyScalar(b.n)).multiplyScalar(1 / (a.n + b.n));
    a.n += b.n;
    pal.splice(bj, 1);
  }
  return pal.sort((a, b) => b.n - a.n).map((p) => { const c = p.c.clone(); c.convertSRGBToLinear(); return c; });
}

const paletteCache = new WeakMap<THREE.BufferGeometry, THREE.Color[]>();
function paletteFor(geo: THREE.BufferGeometry): THREE.Color[] {
  let p = paletteCache.get(geo);
  if (!p) { p = extractPalette(geo); paletteCache.set(geo, p); }
  return p;
}

const TOON_VERT = /* glsl */ `
#ifdef USE_RIG
${VERT_HEAD}
#endif
varying vec3 vCol;
varying vec3 vViewPos;
void main() {
#ifdef USE_RIG
${VERT_BODY.replace('#include <begin_vertex>', 'vec3 transformed = vec3(position);')}
#else
  vec3 transformed = vec3(position);
#endif
  vec4 mv = modelViewMatrix * vec4(transformed, 1.0);
  vViewPos = mv.xyz;
#ifdef USE_COLOR
  vCol = color;
#else
  vCol = vec3(1.0);
#endif
  gl_Position = projectionMatrix * mv;
}`;

const TOON_FRAG = /* glsl */ `
uniform vec3 uKeyDir;
uniform vec3 uKeyCol;
uniform vec3 uSky;
uniform vec3 uGround;
uniform vec3 uRim;
uniform mat3 uViewToWorld;
uniform vec3 uEmissive;
uniform float uLift;
uniform vec3 uPal[${SPRITE_PALETTE_MAX}];
uniform int uPalN;
varying vec3 vCol;
varying vec3 vViewPos;
void main() {
  // Per-species palette: snap the (jittered, countershaded) vertex colour to the mesh's own
  // limited palette, compared in a roughly perceptual (sqrt) space.
  vec3 base = vCol;
  if (uPalN > 0) {
    vec3 sv = sqrt(max(vCol, vec3(0.0)));
    float bd = 1e9;
    for (int i = 0; i < ${SPRITE_PALETTE_MAX}; i++) {
      if (i >= uPalN) break;
      vec3 d = sqrt(uPal[i]) - sv;
      float dd = dot(d, d);
      if (dd < bd) { bd = dd; base = uPal[i]; }
    }
  }
  // Flat faces from screen derivatives (the rig bends parts, so stored normals would lie).
  vec3 n = normalize(cross(dFdx(vViewPos), dFdy(vViewPos)));
  vec3 nw = normalize(uViewToWorld * n);
  float ndl = dot(n, uKeyDir);
  // Three hard bands: lit, half, core shadow — the classic pixel-sprite ramp.
  float band = ndl > 0.42 ? 1.0 : ndl > 0.02 ? 0.55 : 0.18;
  // Hemisphere fill, quantised to two steps so it never turns into a smooth gradient.
  float up = nw.y > 0.25 ? 1.0 : nw.y > -0.35 ? 0.62 : 0.35;
  vec3 hemi = mix(uGround, uSky, up);
  vec3 light = hemi + uKeyCol * band;
  // Rim: silhouette faces turned toward the key light get a thin bright edge.
  vec2 kd = normalize(uKeyDir.xy + vec2(1e-4));
  float rim = step(0.55, 1.0 - n.z) * step(0.35, dot(normalize(n.xy + vec2(1e-4)), kd));
  vec3 c = base * (light + uLift) + rim * uRim * base;
  // Hue-shifted ramp: the core shadow leans cool/violet, the top-lit highlight warm — the
  // hand-pixeled way to shade (never just darker/lighter of the same hue).
  if (band < 0.2) c = mix(c, c * vec3(0.86, 0.84, 1.18), 0.55);
  if (ndl > 0.78 && nw.y > 0.2) c *= vec3(1.16, 1.12, 1.0);
  gl_FragColor = vec4(c + uEmissive, 1.0);
}`;

const BILL_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const BILL_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform float uN;        // output texels across the sprite
uniform float uSS;       // bake supersampling (1 or 2)
uniform vec3 uOutline;
uniform float uDepthEdge;
uniform float uOpacity;
uniform vec2 uRimDir;    // screen direction toward the key light
uniform vec3 uRimK;      // rim multiplier
varying vec2 vUv;
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
// One OUTPUT texel (cell c): with 2× supersampling, a 2×2 block is reduced with a detail-
// preserving pick — a much darker sample wins (eyes, mouths, inner lines), else a much brighter
// one (eye shine, sparks), else the sample closest to the mean. Always an actual baked colour,
// so the sprite stays on its palette.
vec4 cell(vec2 c) {
  if (uSS < 1.5) return texture2D(tColor, (c + 0.5) / uN);
  vec2 b = (c + 0.25) / uN;
  float h = 0.5 / uN;
  vec4 s[4];
  s[0] = texture2D(tColor, b);
  s[1] = texture2D(tColor, b + vec2(h, 0.0));
  s[2] = texture2D(tColor, b + vec2(0.0, h));
  s[3] = texture2D(tColor, b + vec2(h, h));
  float cov = 0.0;
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 4; i++) { float a = step(0.5, s[i].a); cov += a; sum += s[i].rgb * a; }
  if (cov < 1.5) return vec4(0.0);
  vec3 avg = sum / cov;
  float la = luma(avg);
  vec3 dark = avg, bright = avg, near = avg;
  float ld = 1e3, lb = -1.0, nd = 1e3;
  for (int i = 0; i < 4; i++) {
    if (s[i].a < 0.5) continue;
    float l = luma(s[i].rgb);
    if (l < ld) { ld = l; dark = s[i].rgb; }
    if (l > lb) { lb = l; bright = s[i].rgb; }
    vec3 d = s[i].rgb - avg;
    float dd = dot(d, d);
    if (dd < nd) { nd = dd; near = s[i].rgb; }
  }
  if (ld < la * 0.6) return vec4(dark, 1.0);
  if (lb > la * 1.45 && lb > 0.35) return vec4(bright, 1.0);
  return vec4(near, 1.0);
}
float cellDepth(vec2 c) {
  if (uSS < 1.5) return texture2D(tDepth, (c + 0.5) / uN).r;
  vec2 b = (c + 0.25) / uN;
  float h = 0.5 / uN;
  return min(min(texture2D(tDepth, b).r, texture2D(tDepth, b + vec2(h, 0.0)).r), min(texture2D(tDepth, b + vec2(0.0, h)).r, texture2D(tDepth, b + vec2(h, h)).r));
}
void main() {
  vec2 c0 = floor(vUv * uN);
  vec4 c = cell(c0);
  vec4 r = cell(c0 + vec2(1.0, 0.0)), l = cell(c0 + vec2(-1.0, 0.0)), u = cell(c0 + vec2(0.0, 1.0)), d = cell(c0 + vec2(0.0, -1.0));
  if (c.a < 0.5) {
    // Outside: a 1-texel outline wherever a 4-neighbour is inside, in a deep, slightly more
    // saturated shade of that neighbour's colour (selective outline), pulled toward uOutline.
    float a = r.a + l.a + u.a + d.a;
    if (a < 0.5 || uOpacity < 0.5) discard;
    vec3 nb = (r.rgb * r.a + l.rgb * l.a + u.rgb * u.a + d.rgb * d.a) / a;
    float m = luma(nb);
    vec3 deep = max(vec3(0.0), mix(vec3(m), nb, 1.35)) * 0.26;
    gl_FragColor = vec4(mix(deep, uOutline, 0.45), 1.0);
    return;
  }
  if (uOpacity < 0.5) discard;
  vec3 col = c.rgb;
  // Inner contour: this texel lies well behind a neighbour (an ear over the head, a leg over the
  // belly) → a darker shade of the local colour, not black (keeps small faces readable).
  float z = cellDepth(c0);
  float zn = min(min(cellDepth(c0 + vec2(1.0, 0.0)), cellDepth(c0 + vec2(-1.0, 0.0))), min(cellDepth(c0 + vec2(0.0, 1.0)), cellDepth(c0 + vec2(0.0, -1.0))));
  if (z - zn > uDepthEdge) col *= 0.52;
  else {
    // 1-texel rim on the silhouette edge that faces the key light.
    vec2 rd = uRimDir;
    vec4 toward = cell(c0 + vec2(rd.x > 0.38 ? 1.0 : rd.x < -0.38 ? -1.0 : 0.0, rd.y > 0.38 ? 1.0 : rd.y < -0.38 ? -1.0 : 0.0));
    if (toward.a < 0.5) col = col * uRimK + vec3(0.03);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

let toonId = 0;

/** The banded toon material used to bake sprites (or, with inScene, to draw the mesh directly). */
export function toonMaterial(rig?: CreatureUniforms): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    vertexShader: TOON_VERT,
    fragmentShader: TOON_FRAG,
    vertexColors: true,
    defines: rig ? { USE_RIG: '' } : {},
    uniforms: {
      uKeyDir: { value: new THREE.Vector3(0, 1, 0) },
      uKeyCol: { value: new THREE.Color(1, 1, 1) },
      uSky: { value: new THREE.Color(0.5, 0.5, 0.5) },
      uGround: { value: new THREE.Color(0.2, 0.2, 0.2) },
      uRim: { value: new THREE.Color(0, 0, 0) },
      uViewToWorld: { value: new THREE.Matrix3() },
      uEmissive: { value: new THREE.Color(0, 0, 0) },
      uLift: { value: 0 },
      uPal: { value: Array.from({ length: SPRITE_PALETTE_MAX }, () => new THREE.Color()) },
      uPalN: { value: 0 },
      ...(rig ? { uTime: rig.uTime, uBlink: rig.uBlink, uAct: rig.uAct } : {}),
    },
  });
  m.name = `hd2d-toon-${toonId++}`;
  return m;
}

/** Depth material that follows the creature rig, so flapping wings flap in the cast shadow too. */
function riggedDepth(rig: CreatureUniforms): THREE.MeshDepthMaterial {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, { uTime: rig.uTime, uBlink: rig.uBlink, uAct: rig.uAct });
    s.vertexShader = VERT_HEAD + s.vertexShader.replace('#include <begin_vertex>', VERT_BODY);
  };
  m.customProgramCacheKey = () => 'hd2d-rig-depth';
  return m;
}

/** Invisible in the colour pass (still drawn for its shadow). Shared. */
let shadowOnly: THREE.MeshBasicMaterial | null = null;
function shadowOnlyMaterial(): THREE.MeshBasicMaterial {
  if (!shadowOnly) {
    shadowOnly = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    shadowOnly.userData.persistent = true;
    shadowOnly.dispose = () => {};
  }
  return shadowOnly;
}

const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const fwd = new THREE.Vector3();
const lin = (hex: string) => new THREE.Color(hex);

function worldVisible(o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

/** One sprite-ified mesh. */
export class SpriteSubject {
  readonly billboard: THREE.Mesh;
  readonly toon: THREE.ShaderMaterial;
  private rt: THREE.WebGLRenderTarget;
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
  private source: THREE.Material | THREE.Material[];
  private billMat: THREE.ShaderMaterial;
  private size = 0;
  private readonly px: number;
  private readonly ss: number;
  /** Ambient lift; may be changed live. */
  lift: number;

  constructor(readonly mesh: THREE.Mesh, readonly opts: SpriteOptions = {}) {
    this.px = opts.pxPerTexel ?? 1;
    // 2× bake on the high tier only: the low tier (phones) keeps the cheap 1:1 bake.
    this.ss = opts.supersample ?? (postFlags().has('ss1') || detectQuality() === 'low' ? 1 : 2);
    this.lift = opts.lift ?? 0;
    this.toon = toonMaterial(opts.rig);
    if (opts.palette ?? !postFlags().has('nosnap')) {
      const pal = paletteFor(mesh.geometry);
      const u = this.toon.uniforms;
      pal.forEach((c, i) => (u.uPal!.value as THREE.Color[])[i]!.copy(c));
      u.uPalN!.value = pal.length;
    }
    this.source = mesh.material;
    mesh.castShadow = true;
    if (opts.inScene) {
      mesh.material = this.toon;
    } else {
      mesh.material = shadowOnlyMaterial();
      if (opts.rig) mesh.customDepthMaterial = riggedDepth(opts.rig);
    }
    this.rt = new THREE.WebGLRenderTarget(32, 32, { type: THREE.HalfFloatType, magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter, generateMipmaps: false });
    this.rt.depthTexture = new THREE.DepthTexture(32, 32);
    this.billMat = new THREE.ShaderMaterial({
      vertexShader: BILL_VERT,
      fragmentShader: BILL_FRAG,
      uniforms: {
        tColor: { value: this.rt.texture },
        tDepth: { value: this.rt.depthTexture },
        uN: { value: 32 },
        uSS: { value: this.ss },
        uRimDir: { value: new THREE.Vector2(0, 1) },
        uRimK: { value: new THREE.Vector3(1.22, 1.18, 1.08) },
        uOutline: { value: lin(opts.outline ?? '#1a0d08') },
        uDepthEdge: { value: 0.08 },
        uOpacity: { value: 1 },
      },
    });
    this.billboard = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.billMat);
    this.billboard.visible = false;
    this.billboard.frustumCulled = false;
    this.billboard.name = 'hd2d-sprite';
    this.billboard.visible = !opts.inScene;
  }

  private ensureSize(s: number) {
    if (s <= this.size && s > this.size * 0.55) return;
    const n = Math.max(32, Math.ceil(s / 16) * 16);
    if (n === this.size) return;
    this.size = n;
    this.rt.setSize(n * this.ss, n * this.ss);
    this.billMat.uniforms.uN!.value = n;
  }

  private applyLight(light: SpriteLight, cam: THREE.Camera) {
    const u = this.toon.uniforms;
    // View-space key direction for this camera (rotation only).
    tmpQ.copy(cam.quaternion).invert();
    (u.uKeyDir!.value as THREE.Vector3).copy(light.keyDir).normalize().applyQuaternion(tmpQ);
    (u.uKeyCol!.value as THREE.Color).copy(light.keyColor);
    (u.uSky!.value as THREE.Color).copy(light.sky);
    (u.uGround!.value as THREE.Color).copy(light.ground);
    (u.uRim!.value as THREE.Color).copy(light.rim);
    (u.uViewToWorld!.value as THREE.Matrix3).setFromMatrix4(cam.matrixWorld);
    (u.uEmissive!.value as THREE.Color).copy(this.opts.emissiveFrom?.emissive ?? new THREE.Color(0, 0, 0));
    u.uLift!.value = this.lift;
  }

  /** Re-render the sprite for this frame and place its billboard. */
  bake(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, light: SpriteLight, buffer: THREE.Vector2) {
    if (this.opts.inScene) { this.applyLight(light, camera); return; }
    const mesh = this.mesh;
    if (!worldVisible(mesh)) { this.billboard.visible = false; return; }
    mesh.updateWorldMatrix(true, false);
    const geo = mesh.geometry;
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    const sphere = geo.boundingSphere!.clone().applyMatrix4(mesh.matrixWorld);
    camera.getWorldDirection(fwd);
    const depth = tmpV.copy(sphere.center).sub(camera.position).dot(fwd);
    if (depth <= camera.near) { this.billboard.visible = false; return; }
    const wpp = (2 * depth * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / (buffer.y * camera.zoom);
    const texelWorld = wpp * this.px;
    // Generous margin: squash/stretch, lunges and the 1-texel outline must stay inside.
    this.ensureSize(Math.ceil((sphere.radius * 2 * 1.35) / texelWorld) + 4);
    const n = this.size;
    // Snap the centre so texel edges land on (px-sized) pixel edges.
    const ndc = sphere.center.clone().project(camera);
    const grid = this.px;
    const sx = Math.round((((ndc.x * 0.5 + 0.5) * buffer.x)) / grid) * grid;
    const sy = Math.round((((ndc.y * 0.5 + 0.5) * buffer.y)) / grid) * grid;
    const center = new THREE.Vector3((sx / buffer.x) * 2 - 1, (sy / buffer.y) * 2 - 1, ndc.z).unproject(camera);
    const half = (n / 2) * texelWorld;
    const cam = this.cam;
    cam.quaternion.copy(camera.quaternion);
    cam.position.copy(center).addScaledVector(fwd, -(sphere.radius * 2 + 0.5));
    cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
    cam.near = 0.01; cam.far = sphere.radius * 4 + 1;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    this.billMat.uniforms.uDepthEdge!.value = Math.max(0.05, 0.12 * sphere.radius) / (cam.far - cam.near);
    this.applyLight(light, cam);
    // Rim side: the key light direction in screen space.
    const kv = light.keyDir.clone().applyQuaternion(tmpQ.copy(camera.quaternion).invert());
    (this.billMat.uniforms.uRimDir!.value as THREE.Vector2).set(kv.x, kv.y).normalize();
    // Bake.
    const prevTarget = renderer.getRenderTarget();
    const prevClear = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    const prevShadow = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    mesh.material = this.toon;
    const castShadow = mesh.castShadow;
    renderer.setRenderTarget(this.rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, false);
    renderer.render(mesh, cam);
    mesh.material = shadowOnlyMaterial();
    mesh.castShadow = castShadow;
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevClear, prevAlpha);
    renderer.shadowMap.autoUpdate = prevShadow;
    // Place the billboard exactly over the baked area.
    const b = this.billboard;
    b.visible = true;
    b.position.copy(center);
    b.quaternion.copy(camera.quaternion);
    b.scale.set(half * 2, half * 2, 1);
  }

  /** Restore the mesh's own material (e.g. if the subject is handed back to a default scene). */
  release() {
    this.mesh.material = this.source;
    this.mesh.customDepthMaterial = undefined;
    this.billboard.removeFromParent();
  }

  dispose() {
    this.release();
    this.rt.dispose();
    this.rt.depthTexture?.dispose();
    this.toon.dispose();
    this.billMat.dispose();
    this.billboard.geometry.dispose();
  }
}

/** Keeps the scene's sprite subjects and bakes them each frame (Hd2dPipeline.beforeRender). */
export class SpriteBaker {
  readonly subjects = new Set<SpriteSubject>();
  private buffer = new THREE.Vector2();

  constructor(readonly scene: THREE.Scene, readonly camera: THREE.PerspectiveCamera, public light: SpriteLight) {}

  /** Sprite-ify `mesh`; the billboard is added to the scene. */
  add(mesh: THREE.Mesh, opts: SpriteOptions = {}): SpriteSubject {
    const s = new SpriteSubject(mesh, opts);
    this.scene.add(s.billboard);
    this.subjects.add(s);
    return s;
  }

  remove(s: SpriteSubject | null | undefined) {
    if (!s) return;
    this.subjects.delete(s);
    s.dispose();
  }

  bake(renderer: THREE.WebGLRenderer) {
    renderer.getDrawingBufferSize(this.buffer);
    this.scene.updateMatrixWorld();
    this.camera.updateMatrixWorld();
    for (const s of this.subjects) s.bake(renderer, this.camera, this.light, this.buffer);
  }

  dispose() {
    for (const s of this.subjects) s.dispose();
    this.subjects.clear();
  }
}
