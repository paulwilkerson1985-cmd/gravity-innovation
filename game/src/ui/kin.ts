// Shared HTML renderers for creature cards and summaries (party, box, bestiary).
import { LEVEL_CAP, calcStats, move, species, xpForLevel, type OwnedCreature, type SpeciesData, type StatKey, type StatusId } from '../engine';
import { TYPE_COLORS, h, hpBar, meter, typeChip } from './dom';
import { inkSafeFill } from './contrast';

export const STAT_LABEL: Record<StatKey, string> = { hp: 'HP', atk: 'Attack', def: 'Defense', spe: 'Speed' };
export const STAT_COLOR: Record<StatKey, string> = { hp: '#43d36b', atk: '#ff6a3d', def: '#3d9bff', spe: '#f2c230' };
const STATUS_LABEL: Record<StatusId, [string, string]> = { burn: ['BRN', '#ff6a3d'], shock: ['SHK', '#f2c230'], drowsy: ['ZZZ', '#8a7bb8'] };
const STAT_KEYS: StatKey[] = ['hp', 'atk', 'def', 'spe'];

export function kinName(c: OwnedCreature): string {
  return c.nickname ?? species(c.species).name;
}

export function statusBadge(c: OwnedCreature): HTMLElement | null {
  if (c.hp <= 0) return h('span', { class: 'badge', style: `--c:#5a5480;--cf:${inkSafeFill('#5a5480')}` }, 'FNT');
  if (!c.status) return null;
  const [t, col] = STATUS_LABEL[c.status];
  return h('span', { class: 'badge', style: `--c:${col};--cf:${inkSafeFill(col)}` }, t);
}

/** Compact list card: name, level, types, HP bar. */
export function kinCard(c: OwnedCreature, attrs: Record<string, string | ((e: Event) => void)>, extra?: Node): HTMLButtonElement {
  const s = species(c.species);
  const max = calcStats(c.species, c.level).hp;
  const cls = `btn kin-card ${c.hp <= 0 ? 'fainted' : ''} ${attrs.class ?? ''}`;
  return h('button', { ...attrs, class: cls, style: `--tc:${TYPE_COLORS[s.types[0]!]}` },
    h('span', { class: 'kc-dot', 'aria-hidden': 'true' }),
    h('span', { class: 'kc-main' },
      h('span', { class: 'prow' }, h('span', { class: 'mname' }, kinName(c)), statusBadge(c), h('span', { class: 'plevel' }, `Lv${c.level}`)),
      h('span', { class: 'prow' }, hpBar(c.hp, max), h('span', { class: 'hpnums small' }, `${c.hp}/${max}`))),
    extra ?? null) as HTMLButtonElement;
}

export function statBars(s: SpeciesData, values?: Record<StatKey, number>): HTMLElement {
  return h('div', { class: 'stat-grid' }, ...STAT_KEYS.flatMap((k) => [
    h('span', { class: 'stat-k' }, STAT_LABEL[k]),
    meter(s.base[k], 110, STAT_COLOR[k], 'meter stat-meter'),
    h('span', { class: 'stat-v' }, String(values ? values[k] : s.base[k])),
  ]));
}

export function xpLine(c: OwnedCreature): HTMLElement {
  if (c.level >= LEVEL_CAP) return h('div', { class: 'xp-row' }, h('span', { class: 'xp-k' }, 'XP'), meter(1, 1, '#7ee0ff', 'meter xp-meter'), h('span', { class: 'xp-v' }, 'Max level'));
  const lo = xpForLevel(c.level);
  const hi = xpForLevel(c.level + 1);
  return h('div', { class: 'xp-row', 'data-testid': 'xp-row' },
    h('span', { class: 'xp-k' }, 'XP'),
    meter(c.xp - lo, hi - lo, '#7ee0ff', 'meter xp-meter'),
    h('span', { class: 'xp-v' }, `${hi - c.xp} to Lv${c.level + 1}`));
}

export function moveRows(c: OwnedCreature): HTMLElement {
  return h('div', { class: 'move-rows' }, ...c.moves.map((m) => {
    const d = move(m.id);
    return h('div', { class: 'move-row', style: `--c:${TYPE_COLORS[d.type]}` },
      h('div', { class: 'mr-top' },
        h('strong', { class: 'mr-name' }, d.name), typeChip(d.type),
        h('span', { class: 'mr-pp' }, `${m.pp}/${d.pp} PP`)),
      h('div', { class: 'mr-meta' },
        d.category === 'attack' ? `Power ${d.power}` : 'Status', ` · Acc ${d.accuracy}`, d.priority > 0 ? ' · Strikes first' : ''),
      h('div', { class: 'mr-blurb' }, d.blurb));
  }));
}

/** Full summary used by the party and box screens. */
export function kinSummary(c: OwnedCreature): HTMLElement {
  const s = species(c.species);
  const st = calcStats(c.species, c.level);
  const evo = s.evolvesTo;
  return h('div', { class: 'kin-summary' },
    h('div', { class: 'ks-title' },
      h('h3', {}, kinName(c)),
      c.nickname ? h('span', { class: 'ks-sub' }, s.name) : null,
      h('span', { class: 'plevel ks-level' }, `Lv${c.level}`)),
    h('div', { class: 'ks-chips' }, ...s.types.map(typeChip), statusBadge(c)),
    h('div', { class: 'prow ks-hp' }, h('span', { class: 'hplabel' }, 'HP'), hpBar(c.hp, st.hp), h('span', { class: 'hpnums small' }, `${c.hp}/${st.hp}`)),
    xpLine(c),
    statBars(s, st),
    h('h4', { class: 'ks-h' }, 'Moves'),
    moveRows(c),
    h('p', { class: 'blurb ks-blurb' }, s.blurb),
    evo && c.level < evo.level ? h('p', { class: 'ks-evo small' }, `Something stirs inside… it may change at Lv${evo.level}.`) : null,
  );
}
