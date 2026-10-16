// PRERENDER PROTOTYPE (scratch worktree, never committed): pre-rendered Blender-toon sprite sheets
// for a kin (today: Ashkit), played by the HybridComposite in place of its static D art.
//
// Sheets live in public/kinsheets/{full,half}/<kin>_<clip>_<view>.{webp,json} (Blender renders, see
// the prerender notes). `back` = back 3/4 (your kin), `front` = front 3/4 (the foe, mirrored to face
// left). Clips: idle (loop), attack, hit, faint at 12 fps. The JSON gives each frame's atlas rect, the
// feet anchor (the same cell pixel in every frame of a clip), the rest height in px, the per-frame
// in-sheet travel (rootOffsetPx) and key frames (attack contact, hit recoil, faint down).
import * as THREE from 'three';
import { tween, wait } from '../anim';
import type { CreatureView, KinActor } from '../creature';

export type ClipName = 'idle' | 'attack' | 'hit' | 'faint';
export type SheetView = 'front' | 'back';
export type SheetSet = 'full' | 'half';
const CLIPS: ClipName[] = ['idle', 'attack', 'hit', 'faint'];

export interface SheetClip {
  name: ClipName;
  fps: number;
  loop: boolean;
  n: number;
  atlasW: number;
  atlasH: number;
  cellW: number;
  cellH: number;
  /** Feet anchor in cell px (y down). */
  ax: number;
  ay: number;
  restHeightPx: number;
  /** Atlas rect per frame (px, y down). */
  frames: { x: number; y: number }[];
  /** In-sheet travel per frame (sheet px, x right, y down). */
  root: [number, number][];
  /** Opaque extents per frame rel. to the anchor: [left x, right x, top y] (sheet px, y up). */
  ext: [number, number, number][];
  events: Record<string, number>;
  tex: THREE.Texture;
}

export interface SheetBundle { set: SheetSet; view: SheetView; clips: Record<ClipName, SheetClip>; ready: boolean; bytes: number }

const qs = () => new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
const KINS = new Set(['ashkit']);
/** Sheets are on with the D art (`?kinart=D`); `?kinsheet=0` falls back to the static still. */
export function hasKinSheet(species?: string): boolean {
  return !!species && KINS.has(species) && qs().get('kinart') === 'D' && qs().get('kinsheet') !== '0';
}
/** `?sheetset=full|half` forces a set; default picks by on-screen size. */
export function forcedSheetSet(): SheetSet | null {
  const v = qs().get('sheetset');
  return v === 'full' || v === 'half' ? v : null;
}

const bundles = new Map<string, SheetBundle>();
/** Load (once) the four clips of one kin / view / set; textures upload as soon as they decode. */
export function loadSheets(kin: string, view: SheetView, set: SheetSet, renderer: THREE.WebGLRenderer): SheetBundle {
  const key = `${kin}/${view}/${set}`;
  let b = bundles.get(key);
  if (b) return b;
  const clips = {} as Record<ClipName, SheetClip>;
  b = { set, view, clips, ready: false, bytes: 0 };
  bundles.set(key, b);
  const bundle = b;
  let left = CLIPS.length;
  for (const name of CLIPS) {
    const base = `./kinsheets/${set}/${kin}_${name}_${view}`;
    void fetch(`${base}.json`).then((r) => r.json()).then((j: SheetJson) => {
      const tex = new THREE.TextureLoader().load(`./kinsheets/${set}/${j.image}`, (t) => {
        renderer.initTexture(t); // upload now, not on the frame the clip first plays
        bundle.bytes += j.atlasSize.w * j.atlasSize.h * 4 * (4 / 3);
        if (--left === 0) bundle.ready = true;
      });
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.anisotropy = 4;
      // Blender's transparent texels carry no colour: filter premultiplied, unpremultiply in the shader.
      tex.premultiplyAlpha = true;
      const f0 = j.frames[0]!;
      clips[name] = {
        name, fps: j.fps, loop: j.loop, n: j.frameCount, atlasW: j.atlasSize.w, atlasH: j.atlasSize.h,
        cellW: f0.w, cellH: f0.h, ax: j.anchor.x, ay: j.anchor.y, restHeightPx: j.restHeightPx,
        frames: j.frames.map((f) => ({ x: f.x, y: f.y })), root: j.rootOffsetPx, ext: j.opaqueExt, events: j.events, tex,
      };
    });
  }
  return b;
}

interface SheetJson {
  image: string; fps: number; loop: boolean; frameCount: number; atlasSize: { w: number; h: number };
  anchor: { x: number; y: number }; restHeightPx: number; frames: { x: number; y: number; w: number; h: number }[];
  rootOffsetPx: [number, number][]; opaqueExt: [number, number, number][]; events: Record<string, number>;
}

/** GPU bytes (RGBA8 + mips) of every sheet bundle loaded so far. */
export function sheetBytes(): number { let s = 0; for (const b of bundles.values()) s += b.bytes; return s; }

// ---------------------------------------------------------------- the actor

/**
 * Nominal time from moveFx() start to its impact frame, per element, on the HD-2D pixel
 * FX path (movefx.ts: neutral pops at once; flame/terra fly 340/380 ms; tide/flora/gale volleys
 * 320/360/300 ms for the first shot; spark charges 110 ms then strikes at 20 % of 380 ms).
 */
const FX_LEAD: Record<string, number> = { Neutral: 0, Flame: 340, Terra: 380, Tide: 320, Flora: 360, Spark: 186, Gale: 300 };

/** Attack translation toward the target (fraction of REACH) at each frame START; linear in between. */
const ATTACK_FWD = [0, -0.03, -0.06, -0.08, -0.08, 0.55, 1, 1, 0.75, 0.45, 0.15, 0.03, 0, 0, 0];
const REACH = 0.95;
const UP = new THREE.Vector3(0, 1, 0);

export interface SheetState { clip: ClipName; frame: number; opacity: number; flash: number }

/**
 * Plays a kin's sheet clips in place of CreatureView's procedural lunge / hit / faint. The view's
 * own transforms stay at rest (idle gain 0, body untouched) except the attack's travel toward the
 * target, which replaces the sheet's own in-frame travel (the composite subtracts rootOffsetPx).
 */
export class SheetActor implements KinActor {
  readonly state: SheetState = { clip: 'idle', frame: 0, opacity: 1, flash: 0 };
  private armed = false;
  private contacted: (() => void) | null = null;
  private gen = 0;

  constructor(private view: CreatureView, private clipOf: (c: ClipName) => SheetClip | undefined) {}

  /** ms to wait after the attack starts before starting moveFx, so its impact lands on the contact frame. */
  strikeLeadMs(element: string): number {
    const a = this.clipOf('attack');
    const contactMs = ((a?.events.contact ?? 6) * 1000) / (a?.fps ?? 12);
    return Math.max(0, contactMs - (FX_LEAD[element] ?? 0));
  }

  /** The battle expects an impact: hold the airborne frame until `contact()` (cap 450 ms). */
  armContact() { this.armed = true; }

  /** The move's impact frame: show the contact frame now. */
  contact() { const c = this.contacted; this.contacted = null; c?.(); }

  async lunge(towards: THREE.Vector3, onStrike?: () => void): Promise<void> {
    const v = this.view;
    const a = this.clipOf('attack');
    if (!a) { onStrike?.(); return; }
    const g = ++this.gen;
    const fpsMs = 1000 / a.fps;
    const contactF = a.events.contact ?? 6;
    const start = v.inner.position.clone();
    const dir = towards.clone().sub(v.root.position).setY(0).normalize().applyAxisAngle(UP, -v.root.rotation.y);
    const at = (t: number) => { // t in frames
      const i = Math.max(0, Math.min(ATTACK_FWD.length - 2, Math.floor(t)));
      const f = THREE.MathUtils.clamp(t - i, 0, 1);
      const fwd = ATTACK_FWD[i]! + (ATTACK_FWD[i + 1]! - ATTACK_FWD[i]!) * f;
      v.inner.position.copy(start).addScaledVector(dir, fwd * REACH);
      this.state.frame = Math.min(a.n - 1, Math.floor(t));
    };
    this.state.clip = 'attack';
    this.state.frame = 0;
    const armed = this.armed;
    this.armed = false;
    let hit = false;
    const contactP = new Promise<void>((r) => { this.contacted = () => { hit = true; r(); }; });
    // Frames 0 .. contact-1 (crouch, launch, air); an early impact cuts straight to contact.
    let phaseA = true;
    await Promise.race([tween(contactF * fpsMs, (k) => { if (phaseA && g === this.gen) at(Math.min(k * contactF, contactF - 1e-3)); }), contactP]);
    phaseA = false;
    // Late impact: hold the last airborne frame (cap 450 ms, a miss never stalls the clip).
    if (armed && !hit) await Promise.race([contactP, wait(450)]);
    this.contacted = null;
    if (g !== this.gen) return;
    at(contactF);
    onStrike?.();
    await tween((a.n - contactF) * fpsMs, (k) => { if (g === this.gen) at(contactF + k * (a.n - contactF)); });
    if (g !== this.gen) return;
    v.inner.position.copy(start);
    this.state.clip = 'idle';
  }

  async hit(_strong: boolean, o: { crit?: boolean; calm?: boolean } = {}): Promise<void> {
    const h = this.clipOf('hit');
    if (!h) return;
    const g = ++this.gen;
    const fpsMs = 1000 / h.fps;
    const f0 = h.events.recoil ?? 1; // the reaction starts ON the recoil drawing (impact frame)
    this.state.clip = 'hit';
    this.state.frame = f0;
    const peak = o.calm ? 0.6 : 1;
    await tween((h.n - f0) * fpsMs, (k) => {
      if (g !== this.gen) return;
      const t = k * (h.n - f0);
      this.state.frame = Math.min(h.n - 1, f0 + Math.floor(t));
      // White for 3 frames at 60 on the recoil drawing, then only a faint glow: the flash mixes toward
      // HDR white (2.6), so even 0.3 washes the drawing out and the squint / head snap would not read.
      const ms = k * (h.n - f0) * fpsMs;
      this.state.flash = ms < 50 ? peak * 0.85 : peak * 0.1 * Math.max(0, 1 - (ms - 50) / 120);
    });
    this.state.flash = 0;
    if (g === this.gen) this.state.clip = 'idle';
  }

  async faint(): Promise<void> {
    const f = this.clipOf('faint');
    const v = this.view;
    const g = ++this.gen;
    if (f) {
      this.state.clip = 'faint';
      this.state.frame = 0;
      this.state.flash = 0;
      await tween(f.n * (1000 / f.fps), (k) => { if (g === this.gen) this.state.frame = Math.min(f.n - 1, Math.floor(k * f.n)); });
      await wait(450); // lie still a beat
      await tween(300, (k) => { if (g === this.gen) this.state.opacity = 1 - k; });
    }
    v.root.visible = false;
  }

  /** Back to rest (recall / reset). */
  reset() { this.gen++; this.state.clip = 'idle'; this.state.frame = 0; this.state.opacity = 1; this.state.flash = 0; }
}
