// Small DOM building blocks shared by the arena scenes: the pass-the-device curtain, seat
// tags, buttons with sound, and saved player names.
import { audio } from '../audio/audio';
import { h } from '../ui/dom';
import { SEAT_COLORS } from './arenaStage';
import type { Seat } from './arenaFlow';

type Attrs = Parameters<typeof h>[1];

/** A chunky button that unlocks audio and plays a click before running `fn`. */
export function abtn(label: string | Node | (string | Node | null | false)[], attrs: Attrs & { onclick?: () => void; sfx?: 'select' | 'back' | 'denied' } = {}): HTMLButtonElement {
  const { onclick, sfx = 'select', ...rest } = attrs;
  const el = h('button', {
    type: 'button',
    ...rest,
    class: `btn ${rest.class ?? ''}`.trim(),
    onclick: onclick && (() => {
      audio.unlock();
      audio.sfx(sfx);
      onclick();
    }),
  }, ...(Array.isArray(label) ? label : [label]));
  return el;
}

export function seatTag(seat: Seat, name: string, extra = ''): HTMLElement {
  return h('span', { class: `arena-seat ${extra}`.trim(), style: `--seat:${SEAT_COLORS[seat]}` }, h('span', { class: 'arena-seat-dot' }), name);
}

export interface CurtainOptions {
  title: string;
  /** Who should look away (shown under the title). */
  subtitle?: string;
  seat?: Seat;
  button?: string;
  testid?: string;
}

/**
 * Full-screen opaque curtain that hides the whole game (canvas and menus) until tapped.
 * Resolves when the player taps the button (or presses Enter/Space).
 */
export function curtain(host: HTMLElement, o: CurtainOptions): { el: HTMLElement; done: Promise<void>; dismiss(): void } {
  let resolve!: () => void;
  const done = new Promise<void>((r) => { resolve = r; });
  const color = o.seat === undefined ? '#ffcf3f' : SEAT_COLORS[o.seat];
  const go = abtn([o.button ?? 'Tap to continue'], { class: 'btn-big arena-curtain-go', 'data-testid': 'arena-curtain-go', onclick: () => finish() });
  const el = h('div', { class: 'arena-curtain', role: 'dialog', 'aria-modal': 'true', 'data-testid': o.testid ?? 'arena-curtain', style: `--seat:${color}` },
    h('div', { class: 'arena-curtain-card' },
      h('div', { class: 'arena-curtain-badge' }, h('span', {}, '⇄')),
      h('h2', { class: 'arena-curtain-title' }, o.title),
      o.subtitle ? h('p', { class: 'arena-curtain-sub' }, o.subtitle) : null,
      go,
    ));
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); finish(); }
  };
  let closed = false;
  function finish() {
    if (closed) return;
    closed = true;
    window.removeEventListener('keydown', onKey, true);
    el.classList.add('arena-curtain-out');
    setTimeout(() => el.remove(), 180);
    resolve();
  }
  host.append(el);
  // Let the key that triggered the previous choice finish before listening.
  setTimeout(() => { if (!closed) window.addEventListener('keydown', onKey, true); }, 120);
  go.focus({ preventScroll: true });
  return { el, done, dismiss: finish };
}

const NAMES_KEY = 'orbkin.arena.names';

export function loadNames(): [string, string] {
  try {
    const raw = localStorage.getItem(NAMES_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    if (Array.isArray(v) && typeof v[0] === 'string' && typeof v[1] === 'string') return [v[0], v[1]];
  } catch { /* ignore */ }
  return ['Player 1', 'Player 2'];
}

export function saveNames(names: [string, string]) {
  try { localStorage.setItem(NAMES_KEY, JSON.stringify(names)); } catch { /* ignore */ }
}

/** "1 / 3" style team pips: filled for conscious kin, hollow for fainted. */
export function pips(alive: boolean[]): HTMLElement {
  return h('span', { class: 'arena-pips', 'aria-label': `${alive.filter(Boolean).length} of ${alive.length} kin left` },
    ...alive.map((a) => h('span', { class: `arena-pip${a ? '' : ' out'}` })));
}
