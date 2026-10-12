// Bestiary: every species in dex order. Unseen = locked "???", seen = silhouette + name,
// caught = full-colour turntable model with types, base stats, blurb, evolution chain and habitats.
import { MetaScene } from './meta';
import { audio } from '../audio/audio';
import { getDex, type SpeciesData } from '../engine';
import { STARTERS } from '../data/species';
import { TYPE_COLORS, arrowNav, h, meter, typeChip } from '../ui/dom';
import { icon } from '../ui/icons';
import { statBars } from '../ui/kin';

type DexState = 'unseen' | 'seen' | 'caught';

export interface Habitat { route: string; spot: string; min: number; max: number; rarity: string }

/** Where a species appears in the wild, derived from the route encounter tables. */
export function habitatsOf(id: string): Habitat[] {
  const out: Habitat[] = [];
  for (const r of getDex().routes.values()) {
    for (const s of r.hotspots) {
      const total = s.table.reduce((n, e) => n + e.weight, 0);
      for (const e of s.table) {
        if (e.species !== id) continue;
        const pct = (e.weight / total) * 100;
        out.push({ route: r.name, spot: s.label, min: e.min, max: e.max, rarity: pct >= 35 ? 'Common' : pct >= 12 ? 'Uncommon' : 'Rare' });
      }
    }
  }
  return out;
}

/** The full evolution line containing `id`, with the level each step happens at. */
export function evolutionChain(id: string): { id: string; level?: number }[] {
  const all = [...getDex().species.values()];
  let root = id;
  for (let guard = 0; guard < 8; guard++) {
    const prev = all.find((s) => s.evolvesTo?.species === root);
    if (!prev) break;
    root = prev.id;
  }
  const chain: { id: string; level?: number }[] = [{ id: root }];
  let cur = getDex().species.get(root);
  for (let guard = 0; cur?.evolvesTo && guard < 8; guard++) {
    chain.push({ id: cur.evolvesTo.species, level: cur.evolvesTo.level });
    cur = getDex().species.get(cur.evolvesTo.species);
  }
  return chain;
}

export class BestiaryScene extends MetaScene {
  readonly name = 'bestiary' as const;
  private grid!: HTMLElement;
  private detail!: HTMLElement;
  private sel = '';
  private all: SpeciesData[] = [];

  private stateOf(id: string): DexState {
    const p = this.game.player;
    return p.caught.includes(id) ? 'caught' : p.seen.includes(id) ? 'seen' : 'unseen';
  }

  enter(params: Record<string, unknown>) {
    this.setupStage(params);
    this.motion = 'spin';
    this.all = [...getDex().species.values()];
    const p = this.game.player;
    const seen = this.all.filter((s) => this.stateOf(s.id) !== 'unseen').length;
    const caught = this.all.filter((s) => this.stateOf(s.id) === 'caught').length;
    this.grid = h('div', { class: 'dex-grid', 'data-testid': 'dex-grid' }, ...this.all.map((s, i) => this.tile(s, i)));
    arrowNav(this.grid);
    this.detail = h('div', { class: 'dex-detail', 'data-testid': 'dex-detail' });
    this.layout(
      h('section', { class: 'meta-panel dex-panel' },
        h('div', { class: 'meta-head' }, h('h2', {}, 'Bestiary'), this.backButton('btn-dex-back')),
        h('div', { class: 'dex-totals' },
          h('span', { class: 'pill' }, 'Seen ', h('strong', { 'data-testid': 'dex-seen-count' }, String(seen)), ` / ${this.all.length}`),
          h('span', { class: 'pill pill-caught' }, 'Caught ', h('strong', { 'data-testid': 'dex-caught-count' }, String(caught)), ` / ${this.all.length}`),
          meter(caught, this.all.length, '#ff5d73', 'meter dex-progress')),
        this.grid),
      h('section', { class: 'meta-panel detail-panel' }, this.detail),
      'meta-dex');
    const first = this.all.find((s) => p.party[0]?.species === s.id) ?? this.all.find((s) => this.stateOf(s.id) !== 'unseen') ?? this.all[0]!;
    this.select(first.id, false);
    this.grid.querySelector<HTMLButtonElement>(`[data-testid="dex-${first.id}"]`)?.focus({ preventScroll: true });
  }

  private tile(s: SpeciesData, i: number): HTMLButtonElement {
    const st = this.stateOf(s.id);
    const num = `#${String(i + 1).padStart(3, '0')}`;
    return h('button', {
      class: `dex-tile ${st}`, style: `--tc:${TYPE_COLORS[s.types[0]!]}`, 'data-testid': `dex-${s.id}`, 'data-state': st,
      'aria-label': st === 'unseen' ? `${num} unknown` : `${num} ${s.name}, ${st}`,
      onclick: () => { audio.sfx('cursor'); this.select(s.id); },
    },
    h('span', { class: 'dt-num' }, num),
    st === 'unseen' ? h('span', { class: 'dt-lock' }, icon('lock')) : h('span', { class: 'dt-dot', 'aria-hidden': 'true' }),
    h('span', { class: 'dt-name' }, st === 'unseen' ? '???' : s.name),
    st === 'caught' ? h('span', { class: 'dt-caught', title: 'Caught', 'aria-hidden': 'true' }) : null) as HTMLButtonElement;
  }

  private select(id: string, animate = true) {
    if (this.sel === id && animate) return;
    this.sel = id;
    this.grid.querySelectorAll('.dex-tile').forEach((el) => el.classList.toggle('selected', (el as HTMLElement).dataset.testid === `dex-${id}`));
    const s = getDex().species.get(id)!;
    const i = this.all.indexOf(s);
    const num = `#${String(i + 1).padStart(3, '0')}`;
    const st = this.stateOf(id);
    if (st === 'unseen') {
      this.clearModel();
      this.setCaption('???', num);
      this.detail.replaceChildren(
        h('div', { class: 'ks-title' }, h('span', { class: 'dex-num' }, num), h('h3', {}, '???')),
        h('p', { class: 'empty-note', 'data-testid': 'dex-unknown' }, 'You haven\'t met this kin yet. Explore routes and battle trainers to fill your bestiary!'),
      );
      return;
    }
    this.showKin(id, st === 'caught' ? 'color' : 'silhouette', animate);
    this.setCaption(s.name, `${num} · ${st === 'caught' ? 'Caught' : 'Seen'}`);
    const habitats = habitatsOf(id);
    const where = habitats.length
      ? h('ul', { class: 'habitats' }, ...habitats.map((x) => h('li', {}, h('strong', {}, x.route), ` · ${x.spot}`, h('span', { class: 'small' }, ` Lv${x.min}–${x.max} · ${x.rarity}`))))
      : h('p', { class: 'small habitat-none' }, (STARTERS as readonly string[]).includes(id)
        ? 'A first-partner kin — never found in the wild.'
        : 'Not found in the wild. Raise its earlier form to meet it.');
    if (st === 'seen') {
      this.detail.replaceChildren(
        h('div', { class: 'ks-title' }, h('span', { class: 'dex-num' }, num), h('h3', {}, s.name), h('span', { class: 'seen-tag' }, 'Seen')),
        h('p', { class: 'empty-note', 'data-testid': 'dex-seen-note' }, 'Catch one to learn its types, stats and story.'),
        h('h4', { class: 'ks-h' }, 'Spotted in'), where,
      );
      return;
    }
    const chain = evolutionChain(id);
    const chainEl = chain.length > 1 ? h('div', { class: 'evo-chain', 'data-testid': 'dex-evo' }, ...chain.flatMap((e, k) => {
      const es = this.stateOf(e.id);
      const node = h('span', { class: `evo-node ${e.id === id ? 'current' : ''} ${es}` }, es === 'unseen' ? '???' : getDex().species.get(e.id)!.name);
      return k === 0 ? [node] : [h('span', { class: 'evo-arrow' }, `Lv${e.level} ›`), node];
    })) : h('p', { class: 'small' }, 'This kin does not evolve.');
    this.detail.replaceChildren(
      h('div', { class: 'ks-title' }, h('span', { class: 'dex-num' }, num), h('h3', {}, s.name), h('span', { class: 'caught-tag' }, 'Caught')),
      h('div', { class: 'ks-chips' }, ...s.types.map(typeChip)),
      h('p', { class: 'blurb' }, s.blurb),
      h('h4', { class: 'ks-h' }, 'Base stats'),
      statBars(s),
      h('h4', { class: 'ks-h' }, 'Evolution'),
      chainEl,
      h('h4', { class: 'ks-h' }, 'Habitat'),
      where,
    );
  }
}
