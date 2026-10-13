// Battle move list helpers: the PP / TYPE info box that follows the highlighted move (keyboard
// focus or mouse hover), plus the per-move effectiveness tag. Shared by the adventure battle and
// the Arena so both move lists look and behave the same.
import { TYPE_COLORS, h } from '../dom';

export interface MoveInfoData {
  name: string; type: string; pp: number; maxPp: number; power: number; category: 'attack' | 'status';
  /** Damage multiplier against the foe on the field (attacks only); omit when unknown. */
  mult?: number;
}

/** Effectiveness tag: long word on roomy screens, a compact ×2 / ×½ on narrow ones (CSS picks). */
export function effTag(mult: number | undefined): HTMLElement | null {
  if (mult === undefined || mult === 1) return null;
  const tag = (cls: string, title: string, long: string, short: string) => h('span', { class: `eff ${cls}`, title },
    h('span', { class: 'eff-long' }, long), h('span', { class: 'eff-short' }, short));
  if (mult > 1) return tag('eff-up', 'Super effective', mult > 2 ? 'Super ×4' : 'Super', mult > 2 ? '×4' : '×2');
  return tag('eff-down', 'Not very effective', 'Weak', mult < 0.5 ? '×¼' : '×½');
}

/** The info box element; fill it with `showMoveInfo`. */
export function moveInfoBox(): HTMLElement {
  return h('div', { class: 'move-info', 'data-testid': 'moveinfo', 'aria-live': 'polite' });
}

export function showMoveInfo(box: HTMLElement, d: MoveInfoData | null) {
  if (!d) { box.replaceChildren(); return; }
  const low = d.pp <= Math.max(1, Math.floor(d.maxPp / 4));
  box.replaceChildren(
    h('div', { class: 'mi-row' },
      h('span', { class: `mi-pp ${low ? 'low' : ''}` }, `PP ${d.pp}/${d.maxPp}`),
      h('span', { class: 'mi-pow' }, d.category === 'attack' ? `POW ${d.power}` : 'STATUS')),
    h('div', { class: 'mi-row' },
      h('span', { class: 'mi-type', style: `--c:${TYPE_COLORS[d.type] ?? '#999'}` }, `Type/${d.type}`),
      effTag(d.mult)),
  );
}

/**
 * Wire a move menu: the info box shows the move under the cursor (focus or hover), and the
 * first move until then. `moves[i]` belongs to the button with data-testid `move-i`.
 */
export function wireMoveInfo(menu: HTMLElement, box: HTMLElement, moves: MoveInfoData[]) {
  const pick = (t: EventTarget | null) => {
    const b = (t as HTMLElement | null)?.closest?.<HTMLElement>('[data-testid^="move-"]');
    const i = b ? Number(b.dataset.testid!.slice(5)) : NaN;
    if (Number.isInteger(i) && moves[i]) showMoveInfo(box, moves[i]!);
  };
  showMoveInfo(box, moves[0] ?? null);
  // The menu element outlives this list: stop listening once the box has been replaced.
  const ac = new AbortController();
  const on = (e: Event) => { if (!menu.contains(box)) ac.abort(); else pick(e.target); };
  menu.addEventListener('focusin', on, { signal: ac.signal });
  menu.addEventListener('pointerover', on, { signal: ac.signal });
}
