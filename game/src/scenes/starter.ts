import * as THREE from 'three';
import { BaseScene } from './base';
import { CreatureView } from '../render/creature';
import { addLights, backdrop, makeSky, platform } from '../render/diorama';
import { arrowNav, focusFirst, h, typeChip } from '../ui/dom';
import { calcStats, species } from '../engine';
import { STARTERS } from '../data/species';
import { chooseStarter } from '../game/state';
import { tween } from '../render/anim';

export class StarterScene extends BaseScene {
  readonly name = 'starter' as const;
  private views: CreatureView[] = [];
  private selected = -1;
  private info!: HTMLElement;
  private cards: HTMLButtonElement[] = [];

  enter() {
    this.scene.add(makeSky('meadow'));
    addLights(this.scene, 'meadow');
    this.scene.fog = new THREE.Fog('#d9f6ff', 16, 40);
    this.scene.add(backdrop('meadow', 5));
    STARTERS.forEach((id, i) => {
      const v = new CreatureView(species(id).look, i);
      v.root.position.set((i - 1) * 2.1, 0, 0);
      v.root.userData.pick = { index: i };
      const p = platform('#f2e6c8', 0.8);
      p.position.copy(v.root.position);
      p.userData.pick = { index: i };
      this.scene.add(p, v.root);
      this.views.push(v);
    });
    this.onPick((o) => this.select((o.userData.pick as { index: number }).index));

    this.info = h('div', { class: 'starter-info', 'data-testid': 'starter-info' }, 'Tap a kin to meet it.');
    const row = h('div', { class: 'starter-cards' }, ...STARTERS.map((id, i) => {
      const s = species(id);
      const b = h('button', { class: 'btn card', 'data-testid': `starter-${id}`, onclick: () => this.select(i) },
        h('span', { class: 'mname' }, s.name), h('span', { class: 'chips' }, ...s.types.map(typeChip)));
      this.cards.push(b);
      return b;
    }));
    arrowNav(row);
    this.ui.append(h('div', { class: 'sheet starter-ui' },
      h('h2', {}, 'Choose your first kin'),
      row,
      this.info,
    ));
    focusFirst(row);
  }

  private select(i: number) {
    if (this.selected === i) return;
    this.selected = i;
    const id = STARTERS[i]!;
    const s = species(id);
    const st = calcStats(id, 5);
    this.cards.forEach((c, j) => c.classList.toggle('selected', j === i));
    this.info.replaceChildren(
      h('p', { class: 'blurb' }, s.blurb),
      h('p', { class: 'stats' }, `HP ${st.hp} · Atk ${st.atk} · Def ${st.def} · Spe ${st.spe}`),
      h('button', { class: 'btn btn-big', 'data-testid': 'btn-confirm-starter', onclick: () => this.confirm() }, `Choose ${s.name}!`),
    );
    const v = this.views[i]!;
    const y0 = v.root.position.y;
    void tween(360, (k) => { v.root.position.y = y0 + Math.sin(k * Math.PI) * 0.5; });
  }

  private confirm() {
    const id = STARTERS[this.selected];
    if (!id) return;
    this.game.player = chooseStarter(this.game.player, id);
    void this.game.goto('route', { route: 'meadow' });
  }

  override resize(w: number, hgt: number) {
    super.resize(w, hgt);
    const aspect = w / hgt;
    const dist = Math.max(6.5, 3.6 / (Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * aspect));
    this.camera.position.set(0, 1.6 + dist * 0.18, dist);
    this.camera.lookAt(0, aspect < 1 ? 0.0 : 0.45, 0);
    this.camera.setViewOffset(w, hgt, 0, hgt * (aspect < 1 ? 0.18 : 0.1), w, hgt);
    this.camera.updateProjectionMatrix();
  }

  override update(_dt: number, t: number) {
    this.views.forEach((v, i) => {
      v.update(t);
      v.root.rotation.y = i === this.selected ? Math.sin(t * 1.5) * 0.5 : 0;
    });
  }
}
