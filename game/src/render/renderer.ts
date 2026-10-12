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

  /** Internal resolution policy override (HD-2D pipeline); null = the default ~420 px height. */
  private internal: { height: number; minShort: number } | null = null;

  /** Change the internal-resolution policy (HD-2D tiers) and resize the drawing buffer. */
  setInternal(p: { height: number; minShort: number } | null) {
    this.internal = p;
    this.resize();
  }

  /** Returns true if the size changed. */
  resize(): boolean {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const p = this.internal;
    const ratio = p
      ? Math.min(dpr, Math.max(0.25, p.height / h, p.minShort / Math.min(w, h)))
      : Math.min(dpr, Math.max(0.35, TARGET_INTERNAL_HEIGHT / h));
    const changed = w !== this.width || h !== this.height || this.gl.getPixelRatio() !== ratio;
    this.width = w;
    this.height = h;
    this.gl.setPixelRatio(ratio);
    this.gl.setSize(w, h, true);
    return changed;
  }

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
