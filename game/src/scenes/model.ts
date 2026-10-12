// Debug gallery / creature review tool.
//   ?scene=model                         every species in a grid
//   &species=<id>                        one species, centred, turntable
//   &view=front|q3|side|rear|top|<deg>   fixed angle instead of the turntable
//   &lineup=<line#>|all                  evolution line(s) side by side (all = one row per line)
//   &battle=1&foe=<id>&mine=<id>         battle staging (same camera/spots as the battle scene)
//   &theme=meadow|ridge|coast|summit|title   sky + lights
//   &anim=lunge|hit|crit|faint|appear    loop an action every ~2 s
//   &freeze=<t>                          freeze idle time (deterministic screenshots)
import * as THREE from 'three';
import { BaseScene } from './base';
import { CreatureView, setLegacyModels } from '../render/creature';
import { LINES } from '../render/creatures/designs';
import { addLights, backdrop, makeSky, platform, type Theme } from '../render/diorama';
import { h } from '../ui/dom';
import { species } from '../engine';

const VIEWS: Record<string, number> = { front: 0, q3: 0.7, side: Math.PI / 2, rear: Math.PI - 0.7, back: Math.PI, top: 0.5 };
const BATTLE_SPOTS = [new THREE.Vector3(-1.7, 0, 1.3), new THREE.Vector3(1.75, 0, -1.9)] as const;

export class ModelScene extends BaseScene {
  readonly name = 'model' as const;
  private views: CreatureView[] = [];
  private mode: 'grid' | 'single' | 'lineup' | 'battle' = 'grid';
  private yaw: number | null = null;
  private elev = 0.3;
  private freeze: number | null = null;
  private anim: string | null = null;
  private lastAnim = -10;
  private playing = false;
  private time = 0;
  /** Framing box (world units) for single/lineup modes. */
  private box = new THREE.Box3();

  enter(params: Record<string, unknown>) {
    setLegacyModels(params.legacy === '1');
    const theme = (String(params.theme ?? 'meadow')) as Theme;
    this.scene.add(makeSky(theme));
    addLights(this.scene, theme);
    this.freeze = params.freeze !== undefined ? Number(params.freeze) : null;
    this.anim = params.anim ? String(params.anim) : null;
    const view = params.view ? String(params.view) : null;
    if (view) {
      this.yaw = view in VIEWS ? VIEWS[view]! : (Number(view) * Math.PI) / 180;
      if (view === 'top') this.elev = 1.0;
    }
    if (params.elev !== undefined) this.elev = (Number(params.elev) * Math.PI) / 180;

    let label = '';
    if (params.battle) {
      this.mode = 'battle';
      this.scene.add(backdrop(theme, 11));
      const pad = theme === 'coast' ? '#e9cf86' : theme === 'ridge' ? '#c79560' : theme === 'summit' ? '#e6ecf7' : '#8fdc6a';
      const p0 = platform(pad, 1.25);
      p0.position.copy(BATTLE_SPOTS[0]);
      const p1 = platform(pad, 1.15);
      p1.position.copy(BATTLE_SPOTS[1]);
      this.scene.add(p0, p1);
      const mine = this.add(String(params.mine ?? 'ashkit'), 0);
      const foe = this.add(String(params.foe ?? 'dropple'), 1);
      mine.root.position.copy(BATTLE_SPOTS[0]);
      foe.root.position.copy(BATTLE_SPOTS[1]);
      mine.faceTowards(BATTLE_SPOTS[1]);
      mine.root.rotation.y -= 0.55;
      foe.faceTowards(BATTLE_SPOTS[0].clone().add(new THREE.Vector3(2, 0, 3)));
      label = `${species(String(params.mine ?? 'ashkit')).name} vs ${species(String(params.foe ?? 'dropple')).name}`;
    } else if (params.lineup) {
      this.mode = 'lineup';
      const which = String(params.lineup);
      const lines = which === 'all' ? LINES : [LINES[Number(which)] ?? LINES[0]!];
      lines.forEach((line, row) => {
        const vs = line.map((id, i) => this.add(id, i + row));
        const widths = vs.map((v) => this.footprint(v).x);
        const gap = 0.45;
        const total = widths.reduce((a, b) => a + b, 0) + gap * (vs.length - 1);
        let x = -total / 2;
        vs.forEach((v, i) => {
          v.root.position.set(x + widths[i]! / 2, 0, -row * 3.2);
          x += widths[i]! + gap;
        });
      });
      label = lines.map((l) => l.map((id) => species(id).name).join(' → ')).join(' | ');
      this.addGround();
    } else if (params.species) {
      this.mode = 'single';
      const id = String(params.species);
      const v = this.add(id, 0);
      const tris = (v.mesh.geometry.attributes.position?.count ?? 0) / 3;
      label = `${species(id).name} · ${tris} tris`;
      this.addGround();
    } else {
      const ids = [...this.game.dex().species.keys()];
      const cols = Math.ceil(Math.sqrt(ids.length * 1.6));
      ids.forEach((id, i) => {
        const v = this.add(id, i);
        v.root.position.set(((i % cols) - (cols - 1) / 2) * 2.3, 0, Math.floor(i / cols) * 2.4 - 2);
      });
      label = `${ids.length} species`;
      this.addGround();
    }
    this.computeBox();
    this.resize(this.game.renderer.width, this.game.renderer.height);
    this.ui.append(h('div', { class: 'model-ui', 'data-testid': 'model-label' }, label));
  }

  private add(id: string, seed: number): CreatureView {
    const v = new CreatureView(species(id).look, seed);
    this.scene.add(v.root);
    this.views.push(v);
    return v;
  }

  private addGround() {
    const g = new THREE.Mesh(new THREE.CircleGeometry(30, 40), new THREE.MeshLambertMaterial({ color: '#cfd6e4' }));
    g.rotation.x = -Math.PI / 2;
    g.position.y = -0.002;
    this.scene.add(g);
    const grid = new THREE.GridHelper(30, 30, '#aab4c8', '#bcc5d6');
    grid.position.y = 0.001;
    this.scene.add(grid);
  }

  private footprint(v: CreatureView): THREE.Vector3 {
    const bb = v.mesh.geometry.boundingBox!;
    return new THREE.Vector3(bb.max.x - bb.min.x, bb.max.y - bb.min.y + v.hover, bb.max.z - bb.min.z).multiplyScalar(v.baseScale);
  }

  private computeBox() {
    this.box.makeEmpty();
    for (const v of this.views) {
      const bb = v.mesh.geometry.boundingBox!.clone();
      bb.max.y += v.hover;
      bb.min.multiplyScalar(v.baseScale);
      bb.max.multiplyScalar(v.baseScale);
      if (this.mode === 'single') {
        if (this.yaw === null) {
          // Turntable: rotation-agnostic horizontal radius.
          const r = Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x), Math.abs(bb.min.z), Math.abs(bb.max.z));
          bb.min.x = bb.min.z = -r; bb.max.x = bb.max.z = r;
        } else {
          // Fixed view: frame the model as actually rotated.
          const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -this.yaw);
          const rb = new THREE.Box3();
          for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) rb.expandByPoint(new THREE.Vector3(x, y, z).applyQuaternion(q));
          bb.copy(rb);
        }
      }
      bb.translate(v.root.position);
      this.box.union(bb);
    }
  }

  override resize(w: number, hgt: number) {
    super.resize(w, hgt);
    const aspect = w / hgt;
    const cam = this.camera;
    if (this.mode === 'battle') {
      cam.fov = 38;
      cam.aspect = aspect;
      const target = new THREE.Vector3(0.05, 0.55, -0.3);
      const halfWidth = aspect < 1 ? 2.75 : 3.6;
      const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
      const dist = Math.max(7.2, halfWidth / (tanV * aspect));
      cam.position.copy(target).addScaledVector(new THREE.Vector3(-0.28, 0.34, 1).normalize(), dist);
      cam.lookAt(target);
      cam.setViewOffset(w, hgt, 0, hgt * (aspect < 1 ? 0.14 : 0.1), w, hgt);
      cam.updateProjectionMatrix();
      return;
    }
    cam.clearViewOffset();
    cam.fov = 30;
    cam.updateProjectionMatrix();
    if (this.mode === 'grid') {
      const d = Math.max(14, 10 / aspect);
      cam.position.set(0, d * 0.55, d);
      cam.lookAt(0, 0, 1);
      return;
    }
    const size = this.box.getSize(new THREE.Vector3());
    const center = this.box.getCenter(new THREE.Vector3());
    const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const fitH = (size.y * 0.5 + 0.1) / tanV;
    const fitW = (size.x * 0.5 + 0.12) / (tanV * aspect);
    const d = Math.max(fitH, fitW) * 1.04 + size.z * 0.5;
    const dir = new THREE.Vector3(0, Math.sin(this.elev), Math.cos(this.elev));
    cam.position.copy(center).addScaledVector(dir, d);
    cam.lookAt(center);
  }

  override exit() {
    setLegacyModels(false);
    super.exit();
  }

  override update(_dt: number, t: number) {
    const time = this.freeze ?? t;
    this.views.forEach((v, i) => {
      v.update(time);
      if (this.mode === 'battle') return;
      if (this.mode === 'grid') v.root.rotation.y = Math.sin(t * 0.5 + i) * 0.5;
      else if (this.yaw !== null) v.root.rotation.y = -this.yaw;
      else v.root.rotation.y = this.mode === 'single' ? t * 0.6 : 0.45;
    });
    if (this.anim && !this.playing && t - this.lastAnim > 1.2) {
      const v = this.views[this.mode === 'battle' ? 1 : 0];
      if (!v) return;
      const target = v.root.position.clone().add(new THREE.Vector3(Math.sin(v.root.rotation.y), 0, Math.cos(v.root.rotation.y)).multiplyScalar(3));
      const run = this.anim === 'lunge' ? v.lunge(target)
        : this.anim === 'hit' ? v.hit(false)
          : this.anim === 'crit' ? v.hit(true)
            : this.anim === 'appear' ? v.appear()
              : this.anim === 'faint' ? v.faint().then(() => v.reset())
                : Promise.resolve();
      this.playing = true;
      void run.then(() => { this.playing = false; this.lastAnim = this.time; });
    }
    this.time = t;
  }
}
