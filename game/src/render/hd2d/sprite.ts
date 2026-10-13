// Sprite-ification of 3D models for the HD-2D look.
//
// Each subject (a creature or a person mesh) is baked into its own small offscreen target with a
// banded toon shader and drawn as a hand-pixeled sprite:
//
//  * NEAR-SIDE VIEW. The bake camera keeps the main camera's yaw but looks down only a little
//    (pitch = 0.3 × the camera's elevation, ≤ 12.6°), like a sprite drawn from the side: no
//    hat-top or head-top views, faces and profiles read. Flat kin can opt into more pitch
//    (`bakePitch`).
//  * FEET ANCHOR, EXACT TEXELS. The sprite's bottom-centre pivot sits on the subject's ground
//    point (projected and snapped to the texel grid). One texel covers exactly px × px internal
//    pixels: the billboard's texel is looked up from gl_FragCoord, so the mapping is exact
//    whatever the perspective. The billboard GEOMETRY is a yaw-only vertical plane through the
//    feet (pulled a little toward the camera), so it depth-tests like a standing card: feet on
//    the floor, never sliced by the ground, hidden only by things really in front of it.
//  * TEXEL DENSITY. `texelHeight` (person ≈ 44, stage-1 kin ≈ 28, final forms ≈ 40) picks the
//    whole internal px per texel from the subject's on-screen height, independent of the
//    internal resolution (px = max(1, round(screenH / texelHeight))).
//  * DRAW ORDER. Billboards are transparent + alpha-tested at renderOrder 7: after the light
//    beams (5), dust (6) and normal-blend FX (≤ 6), before additive sparks (≥ 8); they still
//    depth-test (and write depth) against the set.
//  * TOON RAMP. Fixed value bands (highlight ×1.22 warm, base, shade ×0.68 cool, core ×0.45),
//    a per-species palette snap, a 1-texel 8-neighbour selective outline, inner contour lines and
//    a 1-texel key-side rim. Hit flashes keep a full dark outline.
//  * CONTACT. Every sprite stands on a pixel contact shadow (a dithered-edge ellipse sized from
//    its feet) plus a short skewed drop shadow of its own silhouette (≤ 0.6 × its height, away
//    from the key light), both at renderOrder 3 on the ground. The 3D mesh no longer casts a
//    shadow (its shape never matched the flattened sprite).
//  * RATE. Sprites re-bake at 10 fps (8 on low) with the rig clock quantised, like hand-drawn
//    frames, and every frame while acting (lunge, hit, faint) or when the framing changes
//    (`?post=bakeall` re-bakes every frame, for A/B).
//
// The original mesh stays in the scene graph (battle code keeps animating it) with an invisible
// material; the bake renders it with the toon material for a moment each bake.
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
  /** Sprite outline colour for this set (default a warm near-black; subjects may override). */
  outline?: THREE.ColorRepresentation;
  /** Hue multiplier of the shade band (default a cool violet lean); the core band gets it twice. */
  shade?: THREE.Color;
  /** Hue multiplier of the highlight band (default warm). */
  highlight?: THREE.Color;
  /** Contact / drop shadow colour (default a warm dark). */
  contact?: THREE.ColorRepresentation;
  /**
   * How far the sprite key swings toward the camera (0 = the physical key; default 0.6), so a
   * back-lit set still shows lit faces on the sprites (the rim keeps the real back light).
   */
  front?: number;
}

export interface SpriteOptions {
  /** Rig uniforms of a CreatureView (enables the vertex rig + blink in the sprite pass). */
  rig?: CreatureUniforms;
  /** Source of the hit-flash/pulse emissive colour (CreatureView.material). */
  emissiveFrom?: { emissive: THREE.Color };
  /** Screen px per sprite texel when no `texelHeight` is given: 1 = crisp 1:1, 2 = chunky. */
  pxPerTexel?: number;
  /**
   * Target sprite height in texels (person ≈ 44, stage-1 kin ≈ 28, final forms ≈ 40). The bake
   * picks px = max(1, round(screenHeight / texelHeight)) whole internal px per texel.
   */
  texelHeight?: number;
  /** Rest height of the subject in world units (for `texelHeight`; default geometry × world scale). */
  nominalHeight?: () => number;
  /** Object whose world Y is the ground under the subject (default: the mesh's own origin). */
  ground?: THREE.Object3D;
  /**
   * Fraction of the main camera's elevation the sprite is baked from (default 0.3, capped at
   * 0.22 rad ≈ 12.6°; the cap scales with the fraction). 1 = the camera's own pitch (flat kin).
   */
  bakePitch?: number;
  /** Silhouette outline colour (sRGB hex); default the light's outline. */
  outline?: string;
  /** Extra self-lit lift (your own kin, seen from behind). */
  lift?: number;
  /** Render the mesh in-scene with the toon material instead of a billboard (option b, A/B only). */
  inScene?: boolean;
  /**
   * Bake at 2× and downsample with a detail-preserving filter: eyes, mouths and shines survive
   * on small kin, edges stay 1 texel. 1 = direct bake (cheaper). Default: 2 on high, 1 on low.
   */
  supersample?: 1 | 2;
  /** Snap vertex colours to a palette extracted from the mesh (default true). */
  palette?: boolean;
  /** Contact + drop shadow under the sprite (default true). */
  shadow?: boolean;
  /** Re-bake every frame while this is true (acting, hit, faint); else at the sprite frame rate. */
  live?: () => boolean;
  /** Opacity blink (hit): while this returns true the sprite is not drawn. */
  hidden?: () => boolean;
}

/** Max palette entries per sprite (uniform array size). */
export const SPRITE_PALETTE_MAX = 16;

/** Sprite render order (beams 5, dust 6, normal FX ≤ 6 below; additive FX ≥ 8 above). */
export const SPRITE_ORDER = 7;
/** Contact / drop shadows: on the ground, under everything that stands on it. */
export const SPRITE_SHADOW_ORDER = 3;

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

/** Where a model touches the ground: the extent of its lowest 14% (feet, paws, belly). */
interface Footprint { minY: number; height: number; x0: number; x1: number; z0: number; z1: number }
const footCache = new WeakMap<THREE.BufferGeometry, Footprint>();
function footprintOf(geo: THREE.BufferGeometry): Footprint {
  let f = footCache.get(geo);
  if (f) return f;
  const pos = geo.getAttribute('position');
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const cut = minY + (maxY - minY) * 0.14;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > cut) continue;
    const x = pos.getX(i), z = pos.getZ(i);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
  }
  if (!Number.isFinite(x0)) { x0 = -0.1; x1 = 0.1; z0 = -0.1; z1 = 0.1; }
  f = { minY, height: Math.max(1e-3, maxY - minY), x0, x1, z0, z1 };
  footCache.set(geo, f);
  return f;
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
uniform vec3 uShadeTint;
uniform vec3 uHiTint;
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
  // A FIXED value ramp, the hand-pixeled way: highlight (warm), base, shade (cool), core.
  float k = ndl > 0.75 ? 1.22 : ndl > 0.2 ? 1.0 : ndl > -0.3 ? 0.68 : 0.45;
  // Undersides never take the highlight or the base: they face the dim ground.
  if (nw.y < -0.55) k = min(k, 0.68);
  vec3 tint = k > 1.1 ? uHiTint : k > 0.9 ? vec3(1.0) : k > 0.5 ? uShadeTint : uShadeTint * uShadeTint;
  vec3 lit = uSky * 0.55 + uKeyCol * 1.35;
  vec3 c = base * (lit * k * tint + uLift);
  // A touch of ground bounce in the shadow bands (warm floors warm the undersides).
  if (k < 0.9) c += base * uGround * 0.18;
  // Rim: silhouette faces turned toward the key light get a thin bright edge.
  vec2 kd = normalize(uKeyDir.xy + vec2(1e-4));
  float rim = step(0.55, 1.0 - n.z) * step(0.35, dot(normalize(n.xy + vec2(1e-4)), kd));
  c += rim * uRim * base * 0.8;
  gl_FragColor = vec4(c + uEmissive, 1.0);
}`;

const BILL_VERT = /* glsl */ `
void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

/**
 * Downsample pass: the bake (ss × ss bake px per output texel, ss = 1, 2 or 4) → one texel,
 * with a detail-preserving pick — a strong highlight in a dark cell wins (eye shine), else a
 * much darker sample (eyes, mouths, inner lines), else a much brighter one (shines, sparks),
 * else the sample closest to the mean. Always an actual baked colour, so the sprite stays on its
 * palette. Alpha packs coverage and depth: 0 = empty, else 0.5 + 0.5 × the cell's nearest depth.
 */
const DOWN_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const DOWN_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform float uN;
uniform float uSS;
varying vec2 vUv;
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec2 c = floor(vUv * uN);
  int k = int(uSS + 0.5);
  vec4 s[16];
  float l[16];
  float cov = 0.0, zmin = 1.0;
  vec3 sum = vec3(0.0);
  for (int j = 0; j < 4; j++) for (int i = 0; i < 4; i++) {
    int id = j * 4 + i;
    s[id] = vec4(0.0); l[id] = 0.0;
    if (i >= k || j >= k) continue;
    vec2 uv = (c + (vec2(float(i), float(j)) + 0.5) / uSS) / uN;
    vec4 v = texture2D(tColor, uv);
    if (v.a < 0.5) continue;
    s[id] = vec4(v.rgb, 1.0); l[id] = luma(v.rgb);
    cov += 1.0; sum += v.rgb; zmin = min(zmin, texture2D(tDepth, uv).r);
  }
  float total = uSS * uSS;
  if (cov < max(1.0, floor(total * 0.375 + 0.5))) { gl_FragColor = vec4(0.0); return; }
  vec3 avg = sum / cov;
  float la = luma(avg);
  vec3 pick = avg;
  if (k <= 2) {
    // 2×2: a much darker sample wins (eyes, lines), else a much brighter one (shine), else the
    // sample nearest the mean.
    vec3 dark = avg, bright = avg, near = avg;
    float ld = 1e3, lb = -1.0, nd = 1e3;
    for (int id = 0; id < 16; id++) {
      if (s[id].a < 0.5) continue;
      if (l[id] < ld) { ld = l[id]; dark = s[id].rgb; }
      if (l[id] > lb) { lb = l[id]; bright = s[id].rgb; }
      vec3 d = s[id].rgb - avg;
      float dd = dot(d, d);
      if (dd < nd) { nd = dd; near = s[id].rgb; }
    }
    pick = ld < la * 0.6 ? dark : lb > la * 1.45 && lb > 0.35 ? bright : near;
  } else {
    // 4×4: the colour covering most of the cell, except a dark feature covering ≥ 6/16 (eyes,
    // mouths and inner lines stay ≥ 1 texel without growing into their neighbours) or a small
    // bright spot alone in a dark cell (shine).
    float best = -1.0, ld = 1e3, lb = -1.0;
    vec3 mode = avg, dark = avg, bright = avg;
    for (int a = 0; a < 16; a++) {
      if (s[a].a < 0.5) continue;
      float n = 0.0;
      for (int b = 0; b < 16; b++) {
        if (s[b].a < 0.5) continue;
        vec3 d = s[a].rgb - s[b].rgb;
        n += dot(d, d) < 0.0016 ? 1.0 : 0.0;
      }
      if (n > best) { best = n; mode = s[a].rgb; }
      if (l[a] < ld) { ld = l[a]; dark = s[a].rgb; }
      if (l[a] > lb) { lb = l[a]; bright = s[a].rgb; }
    }
    float nDark = 0.0, nBright = 0.0, restL = 0.0;
    for (int a = 0; a < 16; a++) {
      if (s[a].a < 0.5) continue;
      if (l[a] < ld * 1.25 + 0.01 && l[a] < la * 0.6) nDark += 1.0;
      if (l[a] > lb * 0.8 && l[a] > 0.4) nBright += 1.0; else restL += l[a];
    }
    restL /= max(1.0, cov - nBright);
    pick = mode;
    if (nDark >= 6.0) pick = dark;
    if (nBright >= 1.0 && nBright <= 4.0 && restL < 0.1 && lb > restL * 3.0) pick = bright;
  }
  gl_FragColor = vec4(pick, 0.5 + 0.5 * zmin);
}`;

const BILL_FRAG = /* glsl */ `
uniform sampler2D tSprite; // downsampled sprite: rgb colour, a = 0 (empty) or 0.5 + 0.5 depth
uniform float uN;        // output texels across the sprite
uniform vec2 uOrigin;    // internal px of texel (0, 0)'s bottom-left corner
uniform float uPx;       // internal px per texel
uniform vec3 uOutline;
uniform float uDepthEdge;
uniform float uOpacity;
uniform float uFlash;    // hit flash: keep the full dark outline
uniform float uLightRim; // dark kin: a light rim inside the outline (reads on dark floors)
uniform vec2 uRimDir;    // screen direction toward the key light
uniform vec3 uRimK;      // rim multiplier
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec4 cell(vec2 c) {
  vec4 v = texture2D(tSprite, (c + 0.5) / uN);
  return vec4(v.rgb, step(0.25, v.a));
}
float cellDepth(vec2 c) {
  float a = texture2D(tSprite, (c + 0.5) / uN).a;
  return a > 0.25 ? a * 2.0 - 1.0 : 1.0;
}
void main() {
  if (uOpacity < 0.5) discard;
  // The texel under this internal pixel: exact, whatever the billboard's perspective.
  vec2 c0 = floor((gl_FragCoord.xy - uOrigin) / uPx);
  if (c0.x < 0.0 || c0.y < 0.0 || c0.x > uN - 1.0 || c0.y > uN - 1.0) discard;
  vec4 c = cell(c0);
  vec4 r = cell(c0 + vec2(1.0, 0.0)), l = cell(c0 + vec2(-1.0, 0.0)), u = cell(c0 + vec2(0.0, 1.0)), d = cell(c0 + vec2(0.0, -1.0));
  if (c.a < 0.5) {
    // Outside: a 1-texel 8-neighbour outline (diagonal corners filled), in a deep, slightly
    // more saturated shade of the neighbour's colour (selective outline) pulled toward uOutline.
    float a = r.a + l.a + u.a + d.a;
    vec3 nb;
    if (a > 0.5) nb = (r.rgb * r.a + l.rgb * l.a + u.rgb * u.a + d.rgb * d.a) / a;
    else {
      vec4 ur = cell(c0 + vec2(1.0, 1.0)), ul = cell(c0 + vec2(-1.0, 1.0)), dr = cell(c0 + vec2(1.0, -1.0)), dl = cell(c0 + vec2(-1.0, -1.0));
      a = ur.a + ul.a + dr.a + dl.a;
      if (a < 0.5) discard;
      nb = (ur.rgb * ur.a + ul.rgb * ul.a + dr.rgb * dr.a + dl.rgb * dl.a) / a;
    }
    float m = luma(nb);
    vec3 deep = max(vec3(0.0), mix(vec3(m), nb, 1.35)) * 0.26;
    vec3 o = mix(deep, uOutline, 0.45);
    gl_FragColor = vec4(mix(o, uOutline, step(0.2, uFlash)), 1.0);
    return;
  }
  vec3 col = c.rgb;
  // Inner contour: this texel lies well behind a neighbour (an ear over the head, a leg over the
  // belly) → a darker shade of the local colour, not black (keeps small faces readable).
  float z = cellDepth(c0);
  float zn = min(min(cellDepth(c0 + vec2(1.0, 0.0)), cellDepth(c0 + vec2(-1.0, 0.0))), min(cellDepth(c0 + vec2(0.0, 1.0)), cellDepth(c0 + vec2(0.0, -1.0))));
  bool edge = r.a < 0.5 || l.a < 0.5 || u.a < 0.5 || d.a < 0.5;
  if (z - zn > uDepthEdge) col *= 0.52;
  else {
    // 1-texel rim on the silhouette edge that faces the key light.
    vec2 rd = uRimDir;
    vec4 toward = cell(c0 + vec2(rd.x > 0.38 ? 1.0 : rd.x < -0.38 ? -1.0 : 0.0, rd.y > 0.38 ? 1.0 : rd.y < -0.38 ? -1.0 : 0.0));
    if (toward.a < 0.5) col = col * uRimK + vec3(0.03);
    // Dark kin: every silhouette texel lifts a little, so the shape reads on a dark floor.
    else if (edge && uLightRim > 0.0) col = col + vec3(uLightRim) * (vec3(0.1) + col);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

/**
 * Contact + drop shadow, drawn on the ground in the SPRITE'S texel grid (screen space): a
 * pixel ellipse under the feet with a 2-step dithered edge, plus the sprite's own silhouette
 * flipped onto the floor away from the key light (≤ 0.6 × its height), a little lighter.
 */
const SHADOW_FRAG = /* glsl */ `
uniform sampler2D tSprite;
uniform float uN;
uniform vec2 uOrigin;
uniform float uPx;
uniform vec2 uCenter;    // ellipse centre (texels, sprite grid)
uniform vec2 uRadius;    // ellipse radii (texels)
uniform vec2 uAnchor;    // feet (texels, sprite grid)
uniform vec2 uSkew;      // drop shadow: screen texels per texel of height (y < 0: toward the camera)
uniform float uDrop;     // drop shadow strength (0 = off)
uniform vec3 uColor;
uniform float uOpacity;
void main() {
  vec2 t = floor((gl_FragCoord.xy - uOrigin) / uPx);
  vec2 e = (t + 0.5 - uCenter) / uRadius;
  float r2 = dot(e, e);
  float a = 0.0;
  if (r2 <= 0.68) a = 1.0;
  else if (r2 <= 1.0) a = mod(t.x + t.y, 2.0) < 0.5 ? 1.0 : 0.0;
  if (a < 0.5 && uDrop > 0.0) {
    vec2 d = t + 0.5 - uAnchor;
    float v = d.y / uSkew.y;
    if (v > 0.5) {
      vec2 src = floor(vec2(d.x - v * uSkew.x, v) + uAnchor);
      if (src.x >= 0.0 && src.y >= 0.0 && src.x < uN && src.y < uN && texture2D(tSprite, (src + 0.5) / uN).a > 0.25) a = uDrop;
    }
  }
  if (a < 0.05) discard;
  gl_FragColor = vec4(uColor, uOpacity * a);
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
      uShadeTint: { value: new THREE.Vector3(0.9, 0.9, 1.12) },
      uHiTint: { value: new THREE.Vector3(1.08, 1.03, 0.9) },
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

/** Invisible in the colour pass and casts no shadow. Shared. */
let hiddenMat: THREE.MeshBasicMaterial | null = null;
function hiddenMaterial(): THREE.MeshBasicMaterial {
  if (!hiddenMat) {
    hiddenMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    hiddenMat.userData.persistent = true;
    hiddenMat.dispose = () => {};
  }
  return hiddenMat;
}

const UP = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const fwd = new THREE.Vector3();
const hz = new THREE.Vector3();
const toward = new THREE.Vector3();
const right = new THREE.Vector3();
const bakeFwd = new THREE.Vector3();
const bakeUp = new THREE.Vector3();
const anchor = new THREE.Vector3();
const snapped = new THREE.Vector3();
const DEFAULT_SHADE = new THREE.Vector3(0.9, 0.9, 1.12);
const DEFAULT_HI = new THREE.Vector3(1.08, 1.03, 0.9);
const DEFAULT_OUTLINE = '#1a0d08';
const DEFAULT_CONTACT = '#2a1409';

function worldVisible(o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

/** Internal px (y up) → NDC → world point on the camera ray, at NDC depth z. */
function unprojectPx(cam: THREE.Camera, buffer: THREE.Vector2, x: number, y: number, z: number, out: THREE.Vector3) {
  return out.set((x / buffer.x) * 2 - 1, (y / buffer.y) * 2 - 1, z).unproject(cam);
}

/** Where the camera ray through internal px (x, y) meets the plane through p with normal n. */
const rayDir = new THREE.Vector3();
const rayTo = new THREE.Vector3();
function rayPlane(cam: THREE.PerspectiveCamera, buffer: THREE.Vector2, x: number, y: number, p: THREE.Vector3, n: THREE.Vector3, out: THREE.Vector3): boolean {
  unprojectPx(cam, buffer, x, y, 0.5, rayDir).sub(cam.position);
  const den = rayDir.dot(n);
  if (Math.abs(den) < 1e-6) return false;
  const t = rayTo.copy(p).sub(cam.position).dot(n) / den;
  if (t <= 0) return false;
  out.copy(cam.position).addScaledVector(rayDir, t);
  return true;
}

/** Shared full-target pass for the bake → texel downsample. */
let downPass: { scene: THREE.Scene; cam: THREE.OrthographicCamera; mat: THREE.ShaderMaterial } | null = null;
function downsample(renderer: THREE.WebGLRenderer, from: THREE.WebGLRenderTarget, to: THREE.WebGLRenderTarget, n: number, ss: number) {
  if (!downPass) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: DOWN_VERT, fragmentShader: DOWN_FRAG, depthTest: false, depthWrite: false,
      uniforms: { tColor: { value: null }, tDepth: { value: null }, uN: { value: 32 }, uSS: { value: 2 } },
    });
    mat.name = 'hd2d-sprite-down';
    mat.userData.persistent = true;
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false;
    const scene = new THREE.Scene();
    scene.add(quad);
    downPass = { scene, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), mat };
  }
  const u = downPass.mat.uniforms;
  u.tColor!.value = from.texture;
  u.tDepth!.value = from.depthTexture;
  u.uN!.value = n;
  u.uSS!.value = ss;
  renderer.setRenderTarget(to);
  renderer.render(downPass.scene, downPass.cam);
}

/** A 4-vertex quad whose corners are rewritten every bake (local to the mesh position). */
function dynamicQuad(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(new Float32Array(12), 3);
  pos.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', pos);
  g.setIndex([0, 1, 2, 2, 1, 3]);
  return g;
}

/** Frame-to-frame bake bookkeeping (what the last bake was made for). */
interface BakeKey { n: number; px: number; mb: number; tw: number; beta: number; qx: number; qy: number; qz: number; qw: number; tick: number }

/** One sprite-ified mesh. */
export class SpriteSubject {
  readonly billboard: THREE.Mesh;
  /** Contact + drop shadow on the ground (null with `shadow: false`). */
  readonly shadow: THREE.Mesh | null;
  readonly toon: THREE.ShaderMaterial;
  private rt: THREE.WebGLRenderTarget;
  /** The downsampled sprite (n × n texels; alpha packs coverage + depth). */
  private small: THREE.WebGLRenderTarget;
  private ssEff = 0;
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
  private source: THREE.Material | THREE.Material[];
  private castShadow: boolean;
  private billMat: THREE.ShaderMaterial;
  private shadowMat: THREE.ShaderMaterial | null = null;
  private size = 0;
  private mb = 2;
  private pxCur = 0;
  private last: BakeKey | null = null;
  private readonly ss: number;
  private readonly fps: number;
  private readonly foot: Footprint;
  /** Ambient lift; may be changed live. */
  lift: number;
  /** Internal px per texel used by the last bake (debug / layout checks). */
  px = 1;
  /** The subject's rest height in sprite texels at the last bake (debug / captures). */
  texels = 0;
  /** Texel size of the last bake (screen rect in internal px: origin, n·px square). */
  readonly rect = { x: 0, y: 0, n: 0, px: 1 };

  constructor(readonly mesh: THREE.Mesh, readonly opts: SpriteOptions = {}) {
    const low = detectQuality() === 'low';
    // 2× bake on the high tier only: the low tier (phones) keeps the cheap 1:1 bake.
    this.ss = opts.supersample ?? (postFlags().has('ss1') || low ? 1 : 2);
    this.fps = postFlags().has('bakeall') ? 0 : low ? 8 : 10;
    this.lift = opts.lift ?? 0;
    this.toon = toonMaterial(opts.rig);
    if (opts.palette ?? !postFlags().has('nosnap')) {
      const pal = paletteFor(mesh.geometry);
      const u = this.toon.uniforms;
      pal.forEach((c, i) => (u.uPal!.value as THREE.Color[])[i]!.copy(c));
      u.uPalN!.value = pal.length;
    }
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
    this.foot = footprintOf(mesh.geometry);
    this.source = mesh.material;
    this.castShadow = mesh.castShadow;
    if (opts.inScene) {
      mesh.material = this.toon;
      mesh.castShadow = true;
    } else {
      mesh.material = hiddenMaterial();
      mesh.castShadow = false;
    }
    const rtOpts = { type: THREE.HalfFloatType, magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter, generateMipmaps: false } as const;
    this.rt = new THREE.WebGLRenderTarget(32, 32, rtOpts);
    this.rt.depthTexture = new THREE.DepthTexture(32, 32);
    this.small = new THREE.WebGLRenderTarget(32, 32, rtOpts);
    this.billMat = new THREE.ShaderMaterial({
      vertexShader: BILL_VERT,
      fragmentShader: BILL_FRAG,
      transparent: true,
      alphaTest: 0.5,
      depthWrite: true,
      uniforms: {
        tSprite: { value: this.small.texture },
        uN: { value: 32 },
        uOrigin: { value: new THREE.Vector2() },
        uPx: { value: 1 },
        uRimDir: { value: new THREE.Vector2(0, 1) },
        uRimK: { value: new THREE.Vector3(1.22, 1.18, 1.08) },
        uOutline: { value: new THREE.Color(opts.outline ?? DEFAULT_OUTLINE) },
        uDepthEdge: { value: 0.08 },
        uOpacity: { value: 1 },
        uFlash: { value: 0 },
        uLightRim: { value: 0 },
      },
    });
    this.billMat.name = 'hd2d-sprite';
    this.billboard = new THREE.Mesh(dynamicQuad(), this.billMat);
    this.billboard.frustumCulled = false;
    this.billboard.renderOrder = SPRITE_ORDER;
    this.billboard.name = 'hd2d-sprite';
    this.billboard.visible = false;
    if (opts.shadow === false || opts.inScene) this.shadow = null;
    else {
      this.shadowMat = new THREE.ShaderMaterial({
        vertexShader: BILL_VERT,
        fragmentShader: SHADOW_FRAG,
        transparent: true,
        depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
        uniforms: {
          tSprite: { value: this.small.texture },
          uN: { value: 32 },
          uOrigin: { value: new THREE.Vector2() },
          uPx: { value: 1 },
          uCenter: { value: new THREE.Vector2() },
          uRadius: { value: new THREE.Vector2(4, 1.5) },
          uAnchor: { value: new THREE.Vector2() },
          uSkew: { value: new THREE.Vector2(0, -0.4) },
          uDrop: { value: 0.72 },
          uColor: { value: new THREE.Color(DEFAULT_CONTACT) },
          uOpacity: { value: low ? 0.6 : 0.58 },
        },
      });
      this.shadowMat.name = 'hd2d-sprite-shadow';
      this.shadow = new THREE.Mesh(dynamicQuad(), this.shadowMat);
      this.shadow.frustumCulled = false;
      this.shadow.renderOrder = SPRITE_SHADOW_ORDER;
      this.shadow.name = 'hd2d-sprite-shadow';
      this.shadow.visible = false;
    }
    if (opts.inScene) this.billboard.visible = false;
  }

  private hide() {
    this.billboard.visible = false;
    if (this.shadow) this.shadow.visible = false;
  }

  /**
   * Grow (or, far below, shrink) the bake target; returns true when it changed. The bake has
   * `ss` bake px per INTERNAL px (so ss × px per texel, ≤ 4): chunky 2-px texels still pick
   * their colour from enough samples to keep eye shines and 1-px features.
   */
  private ensureSize(s: number, px: number): boolean {
    const ssEff = Math.min(4, this.ss * px);
    if (s <= this.size && s > this.size * 0.55 && ssEff === this.ssEff) return false;
    const n = s <= this.size && s > this.size * 0.55 ? this.size : Math.max(32, Math.ceil(s / 16) * 16);
    if (n === this.size && ssEff === this.ssEff) return false;
    this.size = n;
    this.ssEff = ssEff;
    this.rt.setSize(n * ssEff, n * ssEff);
    this.small.setSize(n, n);
    return true;
  }

  private applyLight(light: SpriteLight, cam: THREE.Camera, towardCam: THREE.Vector3, rightCam: THREE.Vector3) {
    const u = this.toon.uniforms;
    // Sprite key: the set's key blended toward a frontal "sprite light" (from above, the camera
    // side and the key's own side), so faces read lit even in a back-lit set; view space.
    tmpQ.copy(cam.quaternion).invert();
    const L = tmpV.copy(light.keyDir).normalize();
    const kr = L.dot(rightCam);
    const frontal = new THREE.Vector3().addScaledVector(rightCam, kr * 0.6).addScaledVector(UP, 0.8).addScaledVector(towardCam, 0.7).normalize();
    (u.uKeyDir!.value as THREE.Vector3).copy(L).lerp(frontal, light.front ?? 0.6).normalize().applyQuaternion(tmpQ);
    (u.uKeyCol!.value as THREE.Color).copy(light.keyColor);
    (u.uSky!.value as THREE.Color).copy(light.sky);
    (u.uGround!.value as THREE.Color).copy(light.ground);
    (u.uRim!.value as THREE.Color).copy(light.rim);
    const sh = light.shade, hi = light.highlight;
    (u.uShadeTint!.value as THREE.Vector3).copy(sh ? new THREE.Vector3(sh.r, sh.g, sh.b) : DEFAULT_SHADE);
    (u.uHiTint!.value as THREE.Vector3).copy(hi ? new THREE.Vector3(hi.r, hi.g, hi.b) : DEFAULT_HI);
    (u.uViewToWorld!.value as THREE.Matrix3).setFromMatrix4(cam.matrixWorld);
    (u.uEmissive!.value as THREE.Color).copy(this.opts.emissiveFrom?.emissive ?? new THREE.Color(0, 0, 0));
    u.uLift!.value = this.lift;
  }

  /**
   * Whole internal px per texel for this subject: the scene's shared value (SpriteBaker, so
   * every sprite on screen has the same pixel size), else its own (texelHeight, hysteresis).
   */
  private pickPx(screenH: number, shared: number): number {
    const th = this.opts.texelHeight;
    if (!th) { this.ratio = 0; return this.opts.pxPerTexel ?? 1; }
    const ratio = screenH / th;
    this.ratio = ratio;
    if (shared > 0) return shared;
    const want = Math.max(1, Math.round(ratio));
    if (this.pxCur && want !== this.pxCur && Math.abs(ratio - (Math.min(want, this.pxCur) + 0.5)) < 0.12) return this.pxCur;
    this.pxCur = want;
    return want;
  }

  /** On-screen height ÷ texelHeight at the last bake (0 = no texel target). */
  ratio = 0;

  /** Re-bake the sprite if due and place its billboard (and shadow) for this frame. */
  bake(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, light: SpriteLight, buffer: THREE.Vector2, sharedPx = 0) {
    const mesh = this.mesh;
    if (this.opts.inScene) {
      camera.getWorldDirection(fwd);
      toward.set(-fwd.x, 0, -fwd.z).normalize();
      right.crossVectors(toward, UP).negate().normalize();
      this.applyLight(light, camera, toward, right);
      return;
    }
    if (!worldVisible(mesh)) { this.hide(); return; }
    mesh.updateWorldMatrix(true, false);
    const geo = mesh.geometry;
    // ---- camera basis: yaw from the main camera, a much lower pitch for the bake.
    camera.getWorldDirection(fwd);
    hz.set(fwd.x, 0, fwd.z);
    if (hz.lengthSq() < 1e-8) hz.set(0, 0, -1);
    hz.normalize();
    toward.copy(hz).negate();
    right.crossVectors(hz, UP).normalize();
    const elev = Math.asin(THREE.MathUtils.clamp(-fwd.y, -1, 1));
    const f = this.opts.bakePitch ?? 0.3;
    const beta = THREE.MathUtils.clamp(elev * f, 0, f >= 1 ? Math.max(0, elev) : (0.22 * f) / 0.3);
    bakeFwd.copy(hz).multiplyScalar(Math.cos(beta)).addScaledVector(UP, -Math.sin(beta));
    bakeUp.crossVectors(right, bakeFwd).normalize();
    // ---- the feet: the mesh origin's floor point (x, z of the model's origin, y of the ground).
    anchor.setFromMatrixPosition(mesh.matrixWorld);
    const lift = anchor.y;
    if (this.opts.ground) { this.opts.ground.updateWorldMatrix(true, false); anchor.y = tmpV.setFromMatrixPosition(this.opts.ground.matrixWorld).y; }
    const liftAbove = Math.max(0, lift - anchor.y);
    const depth = tmpV.copy(anchor).sub(camera.position).dot(fwd);
    if (depth <= camera.near) { this.hide(); return; }
    const wpp = (2 * depth * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / (buffer.y * camera.zoom);
    const scaleY = tmpV.setFromMatrixScale(mesh.matrixWorld).y;
    const nominal = this.opts.nominalHeight?.() ?? (geo.boundingBox!.max.y - geo.boundingBox!.min.y) * scaleY;
    const px = this.pickPx((nominal * Math.cos(beta)) / wpp, sharedPx);
    this.px = px;
    this.texels = (nominal * Math.cos(beta)) / wpp / px;
    const tw = wpp * px;
    // ---- snap the feet to the texel grid (whole internal px, multiples of px).
    const ndc = tmpV.copy(anchor).project(camera);
    const ax = Math.round((((ndc.x * 0.5 + 0.5) * buffer.x)) / px) * px;
    const ay = Math.round((((ndc.y * 0.5 + 0.5) * buffer.y)) / px) * px;
    unprojectPx(camera, buffer, ax, ay, ndc.z, snapped);
    // ---- the subject's extent in bake coordinates (box corners), relative to the feet.
    const bb = geo.boundingBox!;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      tmpV.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).applyMatrix4(mesh.matrixWorld).sub(snapped);
      const u = tmpV.dot(right), v = tmpV.dot(bakeUp);
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    const hw = (Math.max(-u0, u1) * 1.06) / tw + 3;
    // Room under the feet for the outline (and anything that dips below the floor, e.g. a faint).
    const mbNeed = Math.max(2, Math.ceil((-Math.min(0, v0) * 1.06) / tw) + 2);
    if (mbNeed > this.mb || mbNeed < this.mb - 3) this.mb = mbNeed;
    const top = (Math.max(0, v1) * 1.06) / tw + 3;
    const resized = this.ensureSize(Math.ceil(Math.max(2 * hw, this.mb + top)), px);
    const n = this.size;
    const mb = this.mb;
    const ox = ax - (n / 2) * px, oy = ay - mb * px;
    this.rect.x = ox; this.rect.y = oy; this.rect.n = n; this.rect.px = px;
    // ---- bake (if due).
    const rig = this.opts.rig;
    const tick = this.fps > 0 && rig ? Math.floor(rig.uTime.value * this.fps) : -1;
    const q = camera.quaternion;
    const k = this.last;
    const due = !k || resized || tick < 0 || k.tick !== tick || this.opts.live?.() === true
      || k.n !== n || k.px !== px || k.mb !== mb || Math.abs(k.tw - tw) > tw * 0.004 || Math.abs(k.beta - beta) > 1e-4
      || Math.abs(k.qx - q.x) + Math.abs(k.qy - q.y) + Math.abs(k.qz - q.z) + Math.abs(k.qw - q.w) > 1e-5;
    if (due) {
      this.last = { n, px, mb, tw, beta, qx: q.x, qy: q.y, qz: q.z, qw: q.w, tick };
      const sphere = geo.boundingSphere!;
      const reach = snapped.distanceTo(tmpV.copy(sphere.center).applyMatrix4(mesh.matrixWorld)) + sphere.radius * Math.max(scaleY, 1e-3) * 1.5 + 0.5;
      const cam = this.cam;
      cam.position.copy(snapped).addScaledVector(bakeFwd, -reach);
      cam.up.copy(UP);
      cam.lookAt(snapped);
      cam.left = -(n / 2) * tw; cam.right = (n / 2) * tw; cam.bottom = -mb * tw; cam.top = (n - mb) * tw;
      cam.near = 0.01; cam.far = reach * 2;
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      this.billMat.uniforms.uN!.value = n;
      this.billMat.uniforms.uDepthEdge!.value = Math.max(0.05, 0.12 * sphere.radius * scaleY) / (cam.far - cam.near);
      this.applyLight(light, cam, toward, right);
      // Rim side: the (real) key light direction in the bake's screen space.
      const kv = tmpV.copy(light.keyDir).applyQuaternion(tmpQ.copy(cam.quaternion).invert());
      (this.billMat.uniforms.uRimDir!.value as THREE.Vector2).set(kv.x, kv.y).normalize();
      // Bake, with the rig clock on the sprite frame (hand-drawn frames, not a smooth tween).
      const prevTarget = renderer.getRenderTarget();
      const prevClear = renderer.getClearColor(new THREE.Color());
      const prevAlpha = renderer.getClearAlpha();
      const prevShadow = renderer.shadowMap.autoUpdate;
      const t0 = rig?.uTime.value ?? 0;
      if (rig && tick >= 0 && !this.opts.live?.()) rig.uTime.value = tick / this.fps;
      renderer.shadowMap.autoUpdate = false;
      mesh.material = this.toon;
      renderer.setRenderTarget(this.rt);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, true, false);
      renderer.render(mesh, cam);
      mesh.material = hiddenMaterial();
      if (rig) rig.uTime.value = t0;
      downsample(renderer, this.rt, this.small, n, this.ssEff);
      renderer.setRenderTarget(prevTarget);
      renderer.setClearColor(prevClear, prevAlpha);
      renderer.shadowMap.autoUpdate = prevShadow;
    }
    // ---- per-frame uniforms (flash, blink, outline).
    const bu = this.billMat.uniforms;
    (bu.uOrigin!.value as THREE.Vector2).set(ox, oy);
    bu.uPx!.value = px;
    const em = this.opts.emissiveFrom?.emissive;
    bu.uFlash!.value = em ? Math.max(em.r, em.g, em.b) : 0;
    bu.uOpacity!.value = this.opts.hidden?.() ? 0 : 1;
    if (!this.opts.outline) (bu.uOutline!.value as THREE.Color).set(light.outline ?? DEFAULT_OUTLINE);
    // ---- the billboard: a vertical card through the feet, pulled toward the camera by the
    // front of the footprint, covering exactly the sprite's screen rect.
    const fp = this.foot;
    let front = 0;
    for (let i = 0; i < 4; i++) {
      tmpV.set(i & 1 ? fp.x1 : fp.x0, fp.minY, i & 2 ? fp.z1 : fp.z0).applyMatrix4(mesh.matrixWorld).sub(anchor);
      front = Math.max(front, tmpV.dot(toward));
    }
    const pull = THREE.MathUtils.clamp(front, 0.12, 0.45);
    const plane = new THREE.Vector3().copy(snapped).addScaledVector(toward, pull);
    const b = this.billboard;
    b.position.copy(snapped);
    const bpos = b.geometry.getAttribute('position') as THREE.BufferAttribute;
    const corner = new THREE.Vector3();
    let ok = true;
    for (let i = 0; i < 4; i++) {
      const sx = ox + (i & 1 ? n * px : 0), sy = oy + (i & 2 ? n * px : 0);
      if (!rayPlane(camera, buffer, sx, sy, plane, toward, corner)) { ok = false; break; }
      corner.sub(snapped);
      bpos.setXYZ(i, corner.x, corner.y, corner.z);
    }
    if (!ok) { this.hide(); return; }
    bpos.needsUpdate = true;
    b.geometry.computeBoundingSphere();
    b.updateMatrixWorld();
    b.visible = true;
    this.placeShadow(camera, light, buffer, { ax, ay, ox, oy, n, px, mb, tw, beta, liftAbove, nominal });
  }

  /** Contact ellipse under the feet + skewed drop shadow, on the ground, in the sprite's grid. */
  private placeShadow(camera: THREE.PerspectiveCamera, light: SpriteLight, buffer: THREE.Vector2,
    s: { ax: number; ay: number; ox: number; oy: number; n: number; px: number; mb: number; tw: number; beta: number; liftAbove: number; nominal: number }) {
    const sh = this.shadow;
    if (!sh) return;
    const mesh = this.mesh;
    const u = this.shadowMat!.uniforms;
    // Feet span along the screen, and its centre (projected on the floor).
    const fp = this.foot;
    let a0 = Infinity, a1 = -Infinity;
    const c = new THREE.Vector3();
    for (let i = 0; i < 4; i++) {
      tmpV.set(i & 1 ? fp.x1 : fp.x0, fp.minY, i & 2 ? fp.z1 : fp.z0).applyMatrix4(mesh.matrixWorld);
      tmpV.y = anchor.y;
      c.add(tmpV);
      const a = tmpV.sub(anchor).dot(right);
      a0 = Math.min(a0, a); a1 = Math.max(a1, a);
    }
    c.multiplyScalar(0.25);
    const cn = c.project(camera);
    const cx = (cn.x * 0.5 + 0.5) * buffer.x, cy = (cn.y * 0.5 + 0.5) * buffer.y;
    // Hovering kin: a smaller shadow the higher they float.
    const k = THREE.MathUtils.clamp(1 - (s.liftAbove / Math.max(0.3, s.nominal)) * 0.9, 0.55, 1);
    const rx = Math.max(3, ((a1 - a0) / 2 / s.tw + 2.5) * k);
    const ry = Math.max(1.6, rx * 0.34 + 0.4);
    (u.uCenter!.value as THREE.Vector2).set((cx - s.ox) / s.px, (cy - s.oy) / s.px);
    (u.uRadius!.value as THREE.Vector2).set(rx, ry);
    (u.uAnchor!.value as THREE.Vector2).set(s.n / 2, s.mb);
    (u.uOrigin!.value as THREE.Vector2).set(s.ox, s.oy);
    u.uPx!.value = s.px;
    u.uN!.value = s.n;
    (u.uColor!.value as THREE.Color).set(light.contact ?? DEFAULT_CONTACT);
    // Drop shadow: where a point of the sprite at height h lands on the floor (≤ 0.6 h away).
    const L = light.keyDir;
    let skx = 0, sky = -0.35, drop = 0;
    if (L.y > 0.12 && s.liftAbove < s.nominal * 0.25) {
      const s3 = new THREE.Vector3(-L.x / L.y, 0, -L.z / L.y);
      const len = s3.length();
      if (len > 0.6) s3.multiplyScalar(0.6 / len);
      const p0 = tmpV.copy(anchor).project(camera);
      const nx0 = p0.x, ny0 = p0.y;
      const p1 = c.copy(anchor).add(s3).project(camera);
      const dx = ((p1.x - nx0) * 0.5 * buffer.x), dy = ((p1.y - ny0) * 0.5 * buffer.y);
      const per = s.tw / Math.cos(s.beta) / s.px; // screen texels per (texel of height · unit offset)
      skx = dx * per; sky = dy * per;
      // Short and squat on screen: a sprite's shadow is a smudge at its feet, not a second figure.
      const m = Math.hypot(skx, sky * 1.6);
      if (m > 0.32) { skx *= 0.32 / m; sky *= 0.32 / m; }
      if (Math.abs(sky) < 0.14) sky = sky < 0 || toward.dot(s3) > -0.05 ? -0.14 : 0.14;
      drop = 0.75;
    }
    (u.uSkew!.value as THREE.Vector2).set(skx, sky);
    u.uDrop!.value = drop;
    // The decal quad: the screen bbox of the ellipse and the drop shadow, laid on the floor.
    const H = s.n - s.mb;
    const ex = [cx - s.px * (rx + 1), cx + s.px * (rx + 1)];
    const ey = [cy - s.px * (ry + 1), cy + s.px * (ry + 1)];
    let x0 = Math.min(ex[0]!, s.ax + s.px * Math.min(0, skx * H) - s.n * s.px * 0.5);
    let x1 = Math.max(ex[1]!, s.ax + s.px * Math.max(0, skx * H) + s.n * s.px * 0.5);
    let y0 = Math.min(ey[0]!, s.ay + s.px * Math.min(0, sky * H));
    let y1 = Math.max(ey[1]!, s.ay + s.px * Math.max(0, sky * H));
    if (!drop) { x0 = ex[0]!; x1 = ex[1]!; y0 = ey[0]!; y1 = ey[1]!; }
    const ground = new THREE.Vector3(anchor.x, anchor.y + 0.01, anchor.z);
    sh.position.copy(ground);
    const spos = sh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const corner = new THREE.Vector3();
    for (let i = 0; i < 4; i++) {
      const px = i & 1 ? x1 : x0, py = i & 2 ? y1 : y0;
      if (!rayPlane(camera, buffer, px, py, ground, UP, corner)) { sh.visible = false; return; }
      corner.sub(ground);
      spos.setXYZ(i, corner.x, corner.y, corner.z);
    }
    spos.needsUpdate = true;
    sh.geometry.computeBoundingSphere();
    sh.updateMatrixWorld();
    sh.visible = true;
  }

  /** Light rim inside the outline (dark kin on dark floors), 0 = off. */
  setLightRim(k: number) { this.billMat.uniforms.uLightRim!.value = k; }

  /** Restore the mesh's own material (e.g. if the subject is handed back to a default scene). */
  release() {
    this.mesh.material = this.source;
    this.mesh.castShadow = this.castShadow;
    this.billboard.removeFromParent();
    this.shadow?.removeFromParent();
  }

  dispose() {
    this.release();
    this.rt.dispose();
    this.rt.depthTexture?.dispose();
    this.small.dispose();
    this.toon.dispose();
    this.billMat.dispose();
    this.billboard.geometry.dispose();
    this.shadowMat?.dispose();
    this.shadow?.geometry.dispose();
  }
}

/** Keeps the scene's sprite subjects and bakes them each frame (Hd2dPipeline.beforeRender). */
export class SpriteBaker {
  readonly subjects = new Set<SpriteSubject>();
  private buffer = new THREE.Vector2();
  /**
   * The scene's sprite pixel size (internal px per texel), shared by every sprite with a
   * texelHeight so all sprites on screen have the same pixel: max(1, round(r)) with r the
   * largest screenHeight / texelHeight on screen (the nearest person sets the density, like a
   * sprite artist drawing the hero at ≈ 44 texels), with hysteresis. 0 = unknown.
   */
  px = 0;

  constructor(readonly scene: THREE.Scene, readonly camera: THREE.PerspectiveCamera, public light: SpriteLight) {}

  /** Sprite-ify `mesh`; the billboard (and its ground shadow) are added to the scene. */
  add(mesh: THREE.Mesh, opts: SpriteOptions = {}): SpriteSubject {
    const s = new SpriteSubject(mesh, opts);
    this.scene.add(s.billboard);
    if (s.shadow) this.scene.add(s.shadow);
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
    let r = 0;
    for (const s of this.subjects) {
      s.bake(renderer, this.camera, this.light, this.buffer, this.px);
      if (s.billboard.visible) r = Math.max(r, s.ratio);
    }
    if (r > 0) {
      const want = Math.max(1, Math.round(r));
      if (!this.px || (want !== this.px && Math.abs(r - (Math.min(want, this.px) + 0.5)) > 0.08)) this.px = want;
    }
  }

  dispose() {
    for (const s of this.subjects) s.dispose();
    this.subjects.clear();
  }
}
