import * as THREE from 'three';
import { BaseScene } from './base';
import { CreatureView } from '../render/creature';
import { addLights, makeSky, platform } from '../render/diorama';
import { arrowNav, focusFirst, h, hpBar, typeChip, TYPE_COLORS } from '../ui/dom';
import { calcStats, move, species, xpForLevel } from '../engine';

export class PartyScene extends BaseScene {
  readonly name = 'party' as const;
  private view: CreatureView | null = null;
  private detail!: HTMLElement;
  private stand!: THREE.Mesh;
  private back: { scene: 'route'; route: string } = { scene: 'route', route: 'meadow' };

  enter(params: Record<string, unknown>) {
    const g = this.game;
    if (g.player.party.length === 0) g.debugParty();
    this.back = { scene: 'route', route: String(params.route ?? 'meadow') };
    this.scene.add(makeSky('title'));
    addLights(this.scene, 'meadow');
    this.stand = platform('#ffffff', 1.1);
    this.scene.add(this.stand);

    this.detail = h('div', { class: 'party-detail', 'data-testid': 'party-detail' });
    const list = h('div', { class: 'party-list', 'data-testid': 'party-list' }, ...g.player.party.map((c, i) => {
      const s = species(c.species);
      const max = calcStats(c.species, c.level).hp;
      return h('button', { class: 'btn party-card', 'data-testid': `party-${i}`, onclick: () => this.show(i) },
        h('span', { class: 'prow' }, h('span', { class: 'mname' }, c.nickname ?? s.name), h('span', { class: 'plevel' }, `Lv${c.level}`)),
        h('span', { class: 'prow' }, h('span', { class: 'chips' }, ...s.types.map(typeChip)), hpBar(c.hp, max), h('span', { class: 'hpnums small' }, `${c.hp}/${max}`)));
    }));
    arrowNav(list);
    this.ui.append(h('div', { class: 'sheet party-ui' },
      h('div', { class: 'party-head' }, h('h2', {}, `Your party (${g.player.party.length}/6)`),
        h('button', { class: 'btn btn-back', 'data-testid': 'btn-party-back', onclick: () => void g.goto(this.back.scene, { route: this.back.route }) }, 'Back')),
      list, this.detail));
    this.show(0);
    focusFirst(list);
  }

  private show(i: number) {
    const c = this.game.player.party[i];
    if (!c) return;
    const s = species(c.species);
    const st = calcStats(c.species, c.level);
    if (this.view) { this.scene.remove(this.view.root); this.view.mesh.geometry.dispose(); this.view.material.dispose(); }
    this.view = new CreatureView(s.look, i);
    this.scene.add(this.view.root);
    void this.view.appear();
    this.ui.querySelectorAll('.party-card').forEach((el, j) => el.classList.toggle('selected', i === j));
    const next = c.level < 30 ? xpForLevel(c.level + 1) - c.xp : 0;
    this.detail.replaceChildren(
      h('p', { class: 'blurb' }, s.blurb),
      h('p', { class: 'stats' }, `HP ${c.hp}/${st.hp} · Atk ${st.atk} · Def ${st.def} · Spe ${st.spe}${c.status ? ` · ${c.status.toUpperCase()}` : ''}`),
      h('p', { class: 'stats small' }, c.level < 30 ? `${next} XP to next level` : 'Max level'),
      h('div', { class: 'move-list' }, ...c.moves.map((m) => {
        const d = move(m.id);
        return h('div', { class: 'move-pill', style: `--c:${TYPE_COLORS[d.type]}` }, h('strong', {}, d.name), h('span', {}, ` ${m.pp}/${d.pp} PP`));
      })),
    );
  }

  override resize(w: number, hgt: number) {
    super.resize(w, hgt);
    const portrait = w < hgt;
    this.camera.position.set(0, 1.6, portrait ? 6.5 : 5.2);
    this.camera.lookAt(0, 0.7, 0);
    // Landscape: creature on the right of the list. Portrait: creature at the top.
    if (portrait) this.camera.setViewOffset(w, hgt, 0, hgt * 0.28, w, hgt);
    else this.camera.setViewOffset(w, hgt, -w * 0.22, 0, w, hgt);
    this.camera.updateProjectionMatrix();
  }

  override update(_dt: number, t: number) {
    if (this.view) {
      this.view.update(t);
      this.view.root.rotation.y = Math.sin(t * 0.6) * 0.7;
    }
  }
}
