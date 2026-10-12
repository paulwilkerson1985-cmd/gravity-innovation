// Camera framing helpers shared by the scenes: put 3D subjects into the screen area the HTML
// UI leaves free, for any viewport. All solving is a few dozen projections at resize time.
//
// The trick for every helper: keep the camera's viewing direction, solve the distance for the
// size we want, then slide the image with setViewOffset (a pure 2D shift of the perspective
// image, so nothing distorts) to land the subject exactly where the layout wants it.
import * as THREE from 'three';

/** A screen rectangle in CSS px. */
export interface Rect { x: number; y: number; w: number; h: number }

const v = new THREE.Vector3();

function place(cam: THREE.PerspectiveCamera, target: THREE.Vector3, dir: THREE.Vector3, dist: number) {
  cam.position.copy(target).addScaledVector(dir, dist);
  cam.lookAt(target);
  cam.clearViewOffset();
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
}

function toPx(p: THREE.Vector3, cam: THREE.PerspectiveCamera, w: number, h: number): [number, number] {
  v.copy(p).project(cam);
  return [(v.x * 0.5 + 0.5) * w, (-v.y * 0.5 + 0.5) * h];
}

function bounds(points: THREE.Vector3[], cam: THREE.PerspectiveCamera, w: number, h: number) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of points) {
    const [x, y] = toPx(p, cam, w, h);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return { x0, y0, x1, y1 };
}

function shift(cam: THREE.PerspectiveCamera, w: number, h: number, dx: number, dy: number) {
  cam.setViewOffset(w, h, dx, dy, w, h);
  cam.updateProjectionMatrix();
}

/** The eight corners of an axis-aligned box. */
export function corners(min: THREE.Vector3, max: THREE.Vector3): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < 8; i++) out.push(new THREE.Vector3(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z));
  return out;
}

/**
 * Fit a set of world points into `rect` (as large as possible, centred), looking at `target`
 * from direction `dir`. `fill` < 1 leaves a margin. Returns the solved distance.
 */
export function fitPoints(cam: THREE.PerspectiveCamera, w: number, h: number, points: THREE.Vector3[], rect: Rect,
  opts: { dir: THREE.Vector3; target: THREE.Vector3; fill?: number; minDist?: number; maxDist?: number; alignY?: 'center' | 'bottom' }): number {
  const dir = opts.dir.clone().normalize();
  const fill = opts.fill ?? 1;
  let lo = opts.minDist ?? 1, hi = opts.maxDist ?? 400;
  const over = (d: number) => {
    place(cam, opts.target, dir, d);
    const b = bounds(points, cam, w, h);
    return Math.max((b.x1 - b.x0) / (rect.w * fill), (b.y1 - b.y0) / (rect.h * fill));
  };
  if (over(lo) <= 1) hi = lo;
  else for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (over(mid) > 1) lo = mid; else hi = mid; }
  place(cam, opts.target, dir, hi);
  const b = bounds(points, cam, w, h);
  const cx = rect.x + rect.w / 2;
  const dy = opts.alignY === 'bottom' ? b.y1 - (rect.y + rect.h) + (rect.h * (1 - fill)) / 2 : (b.y0 + b.y1) / 2 - (rect.y + rect.h / 2);
  shift(cam, w, h, (b.x0 + b.x1) / 2 - cx, dy);
  return hi;
}

/**
 * Two-anchor framing (battles): find the yaw and distance that put world point `a` at screen
 * px `ta` and `b` at `tb`. The yaw is searched within ±`yawRange` of `dir`; the image is then
 * slid so the midpoint lands exactly. Returns the residual error in px.
 */
export function frameTwo(cam: THREE.PerspectiveCamera, w: number, h: number, a: THREE.Vector3, b: THREE.Vector3,
  ta: [number, number], tb: [number, number], opts: { dir: THREE.Vector3; yawRange?: number; target?: THREE.Vector3 }): number {
  const target = opts.target ?? a.clone().add(b).multiplyScalar(0.5);
  const want = Math.hypot(tb[0] - ta[0], tb[1] - ta[1]);
  const wantAng = Math.atan2(tb[1] - ta[1], tb[0] - ta[0]);
  const base = opts.dir.clone().normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const sep = (dir: THREE.Vector3, d: number) => {
    place(cam, target, dir, d);
    const pa = toPx(a, cam, w, h), pb = toPx(b, cam, w, h);
    return { len: Math.hypot(pb[0] - pa[0], pb[1] - pa[1]), ang: Math.atan2(pb[1] - pa[1], pb[0] - pa[0]) };
  };
  const solveDist = (dir: THREE.Vector3) => {
    let lo = 1, hi = 400;
    for (let i = 0; i < 36; i++) { const mid = (lo + hi) / 2; if (sep(dir, mid).len > want) lo = mid; else hi = mid; }
    return hi;
  };
  const range = opts.yawRange ?? 0.35;
  let best = { err: Infinity, dir: base, d: 10 };
  for (let i = 0; i <= 20; i++) {
    const dir = base.clone().applyAxisAngle(up, -range + (2 * range * i) / 20);
    const d = solveDist(dir);
    const s = sep(dir, d);
    let e = Math.abs(s.ang - wantAng);
    if (e > Math.PI) e = 2 * Math.PI - e;
    if (e < best.err) best = { err: e, dir, d };
  }
  place(cam, target, best.dir, best.d);
  const pa = toPx(a, cam, w, h), pb = toPx(b, cam, w, h);
  const mx = (pa[0] + pb[0]) / 2, my = (pa[1] + pb[1]) / 2;
  shift(cam, w, h, mx - (ta[0] + tb[0]) / 2, my - (ta[1] + tb[1]) / 2);
  const qa = toPx(a, cam, w, h);
  return Math.hypot(qa[0] - ta[0], qa[1] - ta[1]);
}

/** Layout family used by the CSS breakpoints (keep in sync with style.css). */
export type LayoutMode = 'wide' | 'portrait' | 'land';
export function layoutMode(w: number, h: number): LayoutMode {
  if (h <= 500 && w > h) return 'land';
  if (w / h < 1 || w <= 640) return 'portrait';
  return 'wide';
}

/** Big screens zoom the whole HTML UI (style.css: `.scene-ui { zoom }`); keep in sync. */
export function uiZoom(w: number, h: number): number {
  return w >= 1600 && h >= 900 ? 1.35 : 1;
}

/**
 * The screen area left free by the HTML UI: below every `top` element, above every `bottom`
 * element, right of every `left` element and left of every `right` element (CSS px).
 * Hidden/missing elements are ignored, so one call works for every breakpoint.
 */
export function freeArea(w: number, h: number, edges: { top?: (Element | null | undefined)[]; bottom?: (Element | null | undefined)[]; left?: (Element | null | undefined)[]; right?: (Element | null | undefined)[] }, pad = 8): Rect {
  const rects = (els?: (Element | null | undefined)[]) => (els ?? []).flatMap((e) => {
    if (!e || !(e instanceof HTMLElement) || e.offsetParent === null) return [];
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? [r] : [];
  });
  const x0 = Math.max(0, ...rects(edges.left).map((r) => r.right));
  const x1 = Math.min(w, ...rects(edges.right).map((r) => r.left));
  const y0 = Math.max(0, ...rects(edges.top).map((r) => r.bottom));
  const y1 = Math.min(h, ...rects(edges.bottom).map((r) => r.top));
  return { x: x0 + pad, y: y0 + pad, w: Math.max(40, x1 - x0 - pad * 2), h: Math.max(40, y1 - y0 - pad * 2) };
}

/** World-space corner points of objects' bounding boxes (for fitPoints). */
export function boxPoints(objs: THREE.Object3D[], grow = 0): THREE.Vector3[] {
  const box = new THREE.Box3();
  for (const o of objs) { o.updateWorldMatrix(true, true); box.expandByObject(o, true); }
  if (box.isEmpty()) return [new THREE.Vector3()];
  box.expandByScalar(grow);
  return corners(box.min, box.max);
}
