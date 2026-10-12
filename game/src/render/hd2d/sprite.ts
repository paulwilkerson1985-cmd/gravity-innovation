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
varying vec3 vCol;
varying vec3 vViewPos;
void main() {
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
  vec3 c = vCol * (light + uLift) + rim * uRim * vCol + uEmissive;
  gl_FragColor = vec4(c, 1.0);
}`;

const BILL_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const BILL_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uTexel;
uniform vec3 uOutline;
uniform float uDepthEdge;
uniform float uOpacity;
varying vec2 vUv;
vec4 at(vec2 o) { return texture2D(tColor, vUv + o * uTexel); }
float dep(vec2 o) { return texture2D(tDepth, vUv + o * uTexel).r; }
void main() {
  vec4 c = texture2D(tColor, vUv);
  if (c.a < 0.5) {
    // Outside the silhouette: a 1-texel outline where any 4-neighbour is inside. The outline
    // takes a little of the neighbour's hue (selective outlining) so it never looks pasted on.
    vec4 r = at(vec2(1.0, 0.0)), l = at(vec2(-1.0, 0.0)), u = at(vec2(0.0, 1.0)), d = at(vec2(0.0, -1.0));
    float a = r.a + l.a + u.a + d.a;
    if (a < 0.5) discard;
    vec3 nb = (r.rgb * r.a + l.rgb * l.a + u.rgb * u.a + d.rgb * d.a) / a;
    gl_FragColor = vec4(mix(uOutline, nb * 0.22, 0.35), uOpacity);
    if (uOpacity < 0.5) discard;
    return;
  }
  // Inside: inner contour lines where this texel lies well behind a neighbour (a near part
  // overlapping a far one — an ear over the head, a leg in front of the belly).
  float z = dep(vec2(0.0));
  float zn = min(min(dep(vec2(1.0, 0.0)), dep(vec2(-1.0, 0.0))), min(dep(vec2(0.0, 1.0)), dep(vec2(0.0, -1.0))));
  vec3 col = c.rgb;
  if (z - zn > uDepthEdge) col = mix(col * 0.3, uOutline, 0.4);
  if (uOpacity < 0.5) discard;
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
  /** Ambient lift; may be changed live. */
  lift: number;

  constructor(readonly mesh: THREE.Mesh, readonly opts: SpriteOptions = {}) {
    this.px = opts.pxPerTexel ?? 1;
    this.lift = opts.lift ?? 0;
    this.toon = toonMaterial(opts.rig);
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
        uTexel: { value: new THREE.Vector2(1 / 32, 1 / 32) },
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
    this.rt.setSize(n, n);
    (this.billMat.uniforms.uTexel!.value as THREE.Vector2).set(1 / n, 1 / n);
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
