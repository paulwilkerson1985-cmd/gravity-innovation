import * as THREE from 'three';
import { bootWarmScene, warmPrograms } from './materials';

/** Target internal render height in pixels for the chunky, pixel-crisp look. */
const TARGET_INTERNAL_HEIGHT = 420;

export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  width = 1;
  height = 1;

  constructor(parent: HTMLElement) {
    this.gl = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'default', preserveDrawingBuffer: false });
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.canvas = this.gl.domElement;
    this.canvas.id = 'view';
    parent.appendChild(this.canvas);
    this.resize();
    // Link the common programs up front (hemisphere + sun + fog is the usual diorama rig).
    try { warmPrograms(this.gl, bootWarmScene(), new THREE.PerspectiveCamera()); } catch { /* no GL in tests */ }
  }

  /** Scenes whose programs were warmed, with the number of frames rendered so far. */
  private warmed = new WeakMap<THREE.Scene, number>();

  /**
   * Internal resolution policy override (HD-2D pipeline): `height` = target internal height,
   * `minShort` = minimum internal short side; the actual size is an integer pixel grid
   * (see pixelGrid). null = the default ~420 px height (fractional ratio, unchanged).
   */
  private internal: { height: number; minShort: number } | null = null;

  /** Change the internal-resolution policy (HD-2D tiers) and resize the drawing buffer. */
  setInternal(p: { height: number; minShort: number } | null) {
    this.internal = p;
    this.resize();
  }

  /**
   * HD-2D integer pixel grid for a policy `p`: the whole-number number of DEVICE pixels per
   * internal pixel `s` (so every texel is exactly s×s device px, no 1/2-px column alternation)
   * and the internal (drawing-buffer) size. s = round(min(h·dpr / p.height, short·dpr / p.minShort)),
   * so 1280×720 → 640×360 @2×, 1920×1080 → @3×, 2560×1440 → @4×; a 393×851 @2.75 phone with the
   * low tier (300 / 270) → 270×585 @4 device px. Uses the real devicePixelRatio (no cap) so the
   * device-px ratio is an integer on high-DPR phones too.
   */
  static pixelGrid(w: number, h: number, dpr: number, p: { height: number; minShort: number }): { scale: number; bw: number; bh: number } {
    const scale = Math.max(1, Math.round(Math.min((h * dpr) / p.height, (Math.min(w, h) * dpr) / p.minShort)));
    // Cover the window (ceil): the canvas overhangs the right/bottom edge by < 1 texel (clipped).
    return { scale, bw: Math.max(1, Math.ceil((w * dpr) / scale - 1e-6)), bh: Math.max(1, Math.ceil((h * dpr) / scale - 1e-6)) };
  }

  /** Returns true if the size changed. */
  resize(): boolean {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const p = this.internal;
    if (p) {
      // HD-2D: the drawing buffer is the internal pixel grid itself (pixel ratio 1) and the
      // canvas is shown at exactly bw·s / dpr CSS px, upscaled nearest-neighbour by CSS.
      const dpr = window.devicePixelRatio || 1;
      const { scale, bw, bh } = Renderer.pixelGrid(w, h, dpr, p);
      const changed = w !== this.width || h !== this.height || this.gl.getPixelRatio() !== 1 || this.grid[0] !== bw || this.grid[1] !== bh || this.grid[2] !== scale;
      this.width = w;
      this.height = h;
      this.grid = [bw, bh, scale];
      this.gl.setPixelRatio(1);
      this.gl.setSize(bw, bh, false);
      this.canvas.style.width = `${(bw * scale) / dpr}px`;
      this.canvas.style.height = `${(bh * scale) / dpr}px`;
      return changed;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const ratio = Math.min(dpr, Math.max(0.35, TARGET_INTERNAL_HEIGHT / h));
    const changed = w !== this.width || h !== this.height || this.gl.getPixelRatio() !== ratio || this.grid[2] !== 0;
    this.width = w;
    this.height = h;
    this.grid = [0, 0, 0];
    this.gl.setPixelRatio(ratio);
    this.gl.setSize(w, h, true);
    return changed;
  }

  /** HD-2D pixel grid in effect: [buffer w, buffer h, device px per internal px]; zeros on the default path. */
  private grid: [number, number, number] = [0, 0, 0];

  /** Device px per internal px of the HD-2D grid (0 when the default policy is active). */
  get pixelScale(): number { return this.grid[2]; }

  render(scene: THREE.Scene, camera: THREE.Camera) {
    // Compile the shared material shapes against this scene's lights/fog on its first frame
    // (hidden behind the scene fade) and once more after it settles, so FX never link mid-turn.
    const n = this.warmed.get(scene) ?? 0;
    if (n === 0 || n === 30) warmPrograms(this.gl, scene, camera);
    if (n <= 30) this.warmed.set(scene, n + 1);
    const custom = scene.userData.render as ((camera: THREE.Camera) => void) | undefined;
    if (custom) custom(camera);
    else this.gl.render(scene, camera);
  }

  /** Render and sample pixels — used by tests to detect a blank canvas. */
  sample(scene: THREE.Scene, camera: THREE.Camera): { distinct: number; nonBlack: number; samples: number } {
    const custom = scene.userData.render as ((camera: THREE.Camera) => void) | undefined;
    if (custom) custom(camera);
    else this.gl.render(scene, camera);
    const ctx = this.gl.getContext();
    const w = ctx.drawingBufferWidth;
    const h = ctx.drawingBufferHeight;
    const px = new Uint8Array(4);
    const colors = new Set<string>();
    let nonBlack = 0;
    let samples = 0;
    for (let y = 0; y < 12; y++) {
      for (let x = 0; x < 12; x++) {
        ctx.readPixels(Math.floor(((x + 0.5) / 12) * w), Math.floor(((y + 0.5) / 12) * h), 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px);
        colors.add(`${px[0]},${px[1]},${px[2]}`);
        if (px[0]! + px[1]! + px[2]! > 30) nonBlack++;
        samples++;
      }
    }
    return { distinct: colors.size, nonBlack, samples };
  }
}
