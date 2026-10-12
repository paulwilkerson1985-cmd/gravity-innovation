// The in-adventure menu hub: a modal over the route screen linking to every meta screen.
import { audio } from '../audio/audio';
import { formatPlayTime } from '../game/state';
import type { Game } from '../game/game';
import type { SceneName } from '../scenes/base';
import { anyModalOpen, closeAllModals, confirmDialog, h, openModal, toast, type ModalHandle } from './dom';
import { coin, icon, type IconName } from './icons';
import { openSettings } from './settings';

let current: ModalHandle | null = null;

interface Tile { id: string; label: string; sub: string; icon: IconName; color: string; act: () => void }

/** Scenes opened from the menu get `{ from: 'menu', route }` so Back returns to the route and reopens the menu. */
function openScene(game: Game, scene: SceneName) {
  audio.sfx('select');
  current?.close();
  void game.goto(scene, { from: 'menu', route: game.player.lastRoute });
}

/** Back out of a meta scene: return to the route it was opened from (reopening the menu if it came from there). */
export async function returnToRoute(game: Game, params: Record<string, unknown>) {
  audio.sfx('back');
  const route = typeof params.route === 'string' ? params.route : game.player.lastRoute;
  await game.goto('route', { route });
  if (params.from === 'menu') openGameMenu(game);
}

export function isGameMenuOpen(): boolean {
  return !!current?.isOpen();
}

/** Open the game menu (idempotent: returns the open one if already showing). */
export function openGameMenu(game: Game): ModalHandle {
  if (current?.isOpen()) return current;
  const p = game.player;
  const items = Object.entries(p.bag).reduce((n, [, v]) => n + (v ?? 0), 0);
  const fainted = p.party.filter((c) => c.hp <= 0).length;
  const tiles: Tile[] = [
    { id: 'party', label: 'Party', sub: `${p.party.length}/6${fainted ? ` · ${fainted} fainted` : ''}`, icon: 'party', color: '#43b85c', act: () => openScene(game, 'party') },
    { id: 'bestiary', label: 'Bestiary', sub: `${p.caught.length} caught`, icon: 'bestiary', color: '#ff5d73', act: () => openScene(game, 'bestiary') },
    { id: 'bag', label: 'Bag', sub: `${items} item${items === 1 ? '' : 's'}`, icon: 'bag', color: '#f29a2e', act: () => openScene(game, 'bag') },
    { id: 'box', label: 'Box', sub: `${p.box.length} stored`, icon: 'box', color: '#3d9bff', act: () => openScene(game, 'box') },
    { id: 'shop', label: 'Shop', sub: 'Orbs & tonics', icon: 'shop', color: '#a463e8', act: () => openScene(game, 'shop') },
    { id: 'save', label: 'Save', sub: 'Write to slot', icon: 'save', color: '#22a99a', act: () => void doSave(game) },
    { id: 'settings', label: 'Settings', sub: 'Text & sound', icon: 'settings', color: '#6a63a8', act: () => { audio.sfx('select'); openSettings(game); } },
    { id: 'export', label: 'Export', sub: 'Download file', icon: 'export', color: '#4f7fd8', act: () => doExport(game) },
    { id: 'quit', label: 'Title', sub: 'Quit to title', icon: 'quit', color: '#8a7bb8', act: () => void doQuit(game) },
  ];
  const grid = h('div', { class: 'menu-grid' }, ...tiles.map((t) =>
    h('button', { class: 'menu-tile', style: `--c:${t.color}`, 'data-testid': `menu-${t.id}`, onclick: t.act },
      h('span', { class: 'menu-ico' }, icon(t.icon)),
      h('span', { class: 'menu-label' }, t.label),
      h('span', { class: 'menu-sub' }, t.sub))));
  gridNav(grid, 3);
  const head = h('div', { class: 'menu-stats' },
    h('span', { class: 'pill', 'data-testid': 'menu-money' }, coin(), `${p.money}`),
    h('span', { class: 'pill' }, formatPlayTime(p.playTime)));
  audio.sfx('select');
  const m = openModal({ title: 'Menu', className: 'modal-menu', testid: 'game-menu', headerExtra: head, onClose: () => { if (current === m) current = null; audio.sfx('back'); } });
  m.body.append(grid);
  current = m;
  (grid.firstElementChild as HTMLElement).focus({ preventScroll: true });
  return m;
}

/** Arrow-key navigation over a fixed-column grid (keeps working in portrait 3-col layout). */
function gridNav(grid: HTMLElement, cols: number) {
  grid.addEventListener('keydown', (e) => {
    const btns = [...grid.querySelectorAll<HTMLButtonElement>('button')];
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[e.key];
    if (d === undefined) return;
    const j = Math.max(0, Math.min(btns.length - 1, i + d));
    if (j !== i) { btns[j]!.focus(); audio.sfx('cursor'); }
    e.preventDefault();
  });
}

async function doSave(game: Game) {
  game.saveEnabled = true; // an explicit save always counts, even from a debug entry point
  const ok = await game.save({ now: true });
  if (ok) { audio.sfx('item'); toast('Game saved!', 'good'); } else { audio.sfx('denied'); toast('Couldn\'t save right now.', 'bad'); }
}

function doExport(game: Game) {
  const name = game.exportSave();
  if (name) { audio.sfx('select'); toast(`Exported ${name}`, 'good', 3200); } else { audio.sfx('denied'); toast('Export failed.', 'bad'); }
}

async function doQuit(game: Game) {
  audio.sfx('select');
  const ok = await confirmDialog({ title: 'Return to title?', message: 'Your adventure will be saved first.', confirmLabel: 'Save & quit', cancelLabel: 'Stay' });
  if (!ok) return;
  await game.save({ now: true });
  closeAllModals();
  void game.goto('title');
}

/** Esc or M on the route screen opens the menu. */
export function installMenuHotkey(game: Game) {
  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || anyModalOpen() || game.current?.name !== 'route' || e.repeat) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (e.key === 'Escape' || e.key === 'm' || e.key === 'M') {
      e.preventDefault();
      openGameMenu(game);
    }
  });
}

