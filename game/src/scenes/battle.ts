// Battle scene: renders the diorama and plays back the engine's event log. It never
// computes outcomes — it only submits actions to resolveTurn and animates the events.
// After the battle it plays back the progression results (XP, level-ups, move offers,
// trainer rewards, route unlocks) computed by src/game/progress.ts.
import * as THREE from 'three';
import { layoutMode } from './framing';
import { BaseScene } from './base';
import './adventure.css';
import { CreatureView } from '../render/creature';
import { addLights, backdrop, makeSky } from '../render/diorama';
import { PAD_COLORS, battlePad, battleSpots, frameBattle, fitKinScale, kinHeight, placeSpots } from './battleStage';
import { ORB_COLORS, burst, makeOrb, orbCelebrate, orbLockFx, orbShakeFx } from '../render/fx';
import { orbIcon } from '../ui/icons';
import { effTag, moveInfoBox, wireMoveInfo, type MoveInfoData } from '../ui/pixel/moveInfo';
import { ambient, moveFx, statusFx, type StatusCue } from '../render/movefx';
import { personMesh, trainerLook } from '../render/trainer';
import { animClock, ease, tween, wait } from '../render/anim';
import { mark } from '../debug/marks';
import { arrowNav, focusFirst, h, hpBar, setHp, typeChip, TYPE_COLORS } from '../ui/dom';
import { audio, type TrackName } from '../audio/audio';
import {
  ORBS, active, catchProbability, chooseAction, getItem, getTrainer, itemAffects, legalActions,
  move as getMove, needsReplacement, resolveTurn, species, typeMultiplier,
  type Action, type BattleCreature, type BattleEvent, type BattleState, type ItemId, type OrbId, type ProgressEvent,
  type StageKey, type StatusId, type Stats, type TrainerData,
} from '../engine';
import { ITEM_IDS } from '../data/items';
import { applyBattleResult, startWildBattle, useOrb } from '../game/state';
import {
  CHAMPION_ID, applyBattleXp, blackout, consumeBag, evolutionsAfterWin, startTrainerBattle, teachMove, trainerVictory, wildVictory, withSeen,
  type BattleXp, type TrainerVictory,
  xpProgress, type CreatureGain,
} from '../game/progress';
import type { Theme } from '../render/diorama';
import { Hd2dBattleStage, hd2dTerrainFor } from './hd2dBattle';

const STAT_NAMES: Record<StageKey, string> = { atk: 'Attack', def: 'Defense', spe: 'Speed' };
const STATUS_TEXT: Record<StatusId, [string, string, string, string]> = {
  burn: ['BRN', 'was burned!', '#ff6a3d', 'burn'],
  shock: ['SHK', 'is shocked! It may be unable to move.', '#e0a800', 'shock'],
  drowsy: ['DRW', 'became drowsy and fell asleep!', '#9a6cff', 'drowsiness'],
};
const STAT_LABELS: [keyof Stats, string][] = [['hp', 'Max HP'], ['atk', 'Attack'], ['def', 'Defense'], ['spe', 'Speed']];

/** One short line per item for the compact battle bag (the full blurb is in the tooltip). */
function itemShort(id: ItemId): string {
  const e = getItem(id).effect;
  if (e.kind === 'heal') return e.amount === 'full' ? 'Full HP' : `+${e.amount} HP`;
  if (e.kind === 'cure') return 'Cure';
  return 'Revive';
}

/** Height of a resting orb's centre above the pad top (its bottom tip touches the pad). */
const ORB_REST_Y = 0.36;

/** A soft contact shadow for an orb resting on a pad. */
function orbShadow(): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CircleGeometry(0.2, 14), new THREE.MeshBasicMaterial({ color: 0x1a1030, transparent: true, opacity: 0, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = -0.4;
  return m;
}

const withClass = (el: HTMLElement, cls: string) => { el.classList.add(cls); return el; };

/** "a" / "an" for a name ("an Orb", "a Bright Orb"). */
const article = (name: string) => (/^[aeiou]/i.test(name) ? 'an' : 'a');

/** Text pacing per settings.textSpeed: hold multiplier and typewriter characters per second. */
const PACE = { slow: { hold: 1.6, cps: 40 }, normal: { hold: 1, cps: 75 }, fast: { hold: 0.5, cps: 170 } } as const;

interface Panel {
  root: HTMLElement; name: HTMLElement; level: HTMLElement; bar: HTMLElement; ghost: HTMLElement; nums?: HTMLElement;
  badge: HTMLElement; types: HTMLElement; xp?: HTMLElement; dots: HTMLElement;
}

type BagTab = 'orbs' | 'items';

/** How long a freshly shown battle menu ignores Enter/Space (anti-mash). */
const MENU_ARM_MS = 250;

export class BattleScene extends BaseScene {
  readonly name = 'battle' as const;
  private state!: BattleState;
  private routeId = 'meadow';
  private trainer: TrainerData | null = null;
  private trainerFig: THREE.Mesh | null = null;
  private views: [CreatureView | null, CreatureView | null] = [null, null];
  private spots = battleSpots(innerWidth, innerHeight);
  private pads: THREE.Object3D[] = [];
  private activeSlot: [number, number] = [0, 0];
  private shownHp: [number, number] = [0, 0];
  private panels!: [Panel, Panel];
  private text!: HTMLElement;
  private live!: HTMLElement;
  private menu!: HTMLElement;
  private battleUi!: HTMLElement;
  private advance: (() => void) | null = null;
  private introDone = false;
  private bagTab: BagTab = 'orbs';
  /** HD-2D staging (`?gfx=hd2d` on supported terrains), else null for the default diorama. */
  private hd2d: Hd2dBattleStage | null = null;

  enter(params: Record<string, unknown>) {
    this.routeId = String(params.route ?? 'meadow');
    const g = this.game;
    g.pauseSaves(); // a battle is saved as a whole when it ends (finish)
    if (g.player.party.length === 0) g.debugParty();
    if (!g.player.party.some((c) => c.hp > 0)) g.player = blackout(g.player);
    const route = g.dex().routes.get(this.routeId);
    const hotspotId = String(params.hotspot ?? 'tall-grass');
    const spot = route?.hotspots.find((s) => s.id === hotspotId);
    const trainerId = typeof params.trainer === 'string' ? params.trainer : spot?.kind === 'trainer' ? spot.trainer : undefined;

    let events: BattleEvent[];
    if (trainerId) {
      const setup = startTrainerBattle(g.player, trainerId);
      g.player = setup.player;
      this.state = setup.battle;
      this.trainer = setup.trainer;
      events = setup.events;
      if (getTrainer(trainerId).routeId !== this.routeId) this.routeId = getTrainer(trainerId).routeId;
    } else {
      const debugFoe = typeof params.foe === 'string' && g.dex().species.has(params.foe) ? { species: params.foe, level: Number(params.foeLevel ?? 20) || 20 } : undefined;
      const setup = startWildBattle(g.player, this.routeId, route?.hotspots.some((s) => s.id === hotspotId && s.kind !== 'trainer') ? hotspotId : route?.hotspots.find((s) => s.kind !== 'trainer')?.id ?? 'tall-grass', debugFoe);
      g.player = setup.player;
      this.state = setup.battle;
      events = setup.events;
    }
    this.bagTab = this.trainer ? 'items' : 'orbs';
    const track: TrackName = this.trainer ? (this.trainer.id === CHAMPION_ID ? 'champion' : 'trainer') : 'battle';
    audio.music(track);

    const theme = (g.dex().routes.get(this.routeId)?.theme ?? 'meadow') as Theme;
    const terrain = hd2dTerrainFor({ routeId: this.routeId, hotspotId: spot?.id, hotspotKind: spot?.kind, trainerId: this.trainer?.id });
    if (terrain) {
      this.hd2d = new Hd2dBattleStage(g, this.scene, this.camera, terrain);
      this.spots = this.hd2d.spots;
      this.resize(g.renderer.width, g.renderer.height);
      this.buildUi();
      void this.intro(events);
      return;
    }
    this.scene.add(makeSky(theme));
    addLights(this.scene, theme);
    this.scene.fog = new THREE.Fog(new THREE.Color(theme === 'ridge' ? '#ffd2a8' : theme === 'summit' ? '#c7d4ff' : '#d9f2ff'), 18, 45);
    this.scene.add(backdrop(theme, 11));
    const [padTop, padDark] = PAD_COLORS[theme] ?? PAD_COLORS.meadow!;
    const p0 = battlePad(padTop, 1.2, { dark: padDark });
    p0.position.copy(this.spots[0]);
    const p1 = battlePad(padTop, 1.1, { dark: padDark });
    p1.position.copy(this.spots[1]);
    this.scene.add(p0, p1);
    this.pads = [p0, p1];
    const amb = ambient(theme);
    this.scene.add(amb.points);
    this.ambientUpdate = amb.update;

    this.resize(g.renderer.width, g.renderer.height);
    this.buildUi();
    void this.intro(events);
  }

  override resize(w: number, hgt: number) {
    if (this.hd2d) { this.hd2d.frame(w, hgt); return; }
    if (placeSpots(this.spots, w, hgt)) {
      // Rotated into another layout: move the pads, kin and trainer to the new spots.
      this.pads.forEach((p, i) => p.position.copy(this.spots[i]!));
      this.views.forEach((v, i) => v?.root.position.copy(this.spots[i]!));
      if (this.trainerFig?.visible) this.trainerFig.position.copy(this.spots[1]);
    }
    const panel = this.panels?.[0].root.getBoundingClientRect();
    frameBattle(this.camera, this.scene, w, hgt, this.spots, this.views, panel && panel.width > 0 ? { x: panel.left, y: panel.top } : null);
  }

  /** HD-2D pipeline stats (debug hook), or null on the default renderer. */
  perf() { return this.hd2d?.perf() ?? null; }

  /** Layout checks (debug hook): the kin on the field and the trainer. */
  subjects() {
    const out: { name: string; obj: THREE.Object3D }[] = [];
    this.views.forEach((v, i) => { if (v?.root.visible) out.push({ name: i === 0 ? 'mine' : 'foe', obj: v.inner }); });
    if (this.trainerFig?.visible) out.push({ name: 'trainer', obj: this.trainerFig });
    if (this.hd2d) out.push({ name: 'player', obj: this.hd2d.heroMesh });
    return out;
  }

  private ambientUpdate: ((t: number) => void) | null = null;

  override update(_dt: number, t: number) {
    this.ambientUpdate?.(t);
    this.views.forEach((v) => v?.update(t));
    if (this.hd2d) { this.hd2d.update(t); return; }
    if (this.trainerFig?.visible) this.trainerFig.position.y = Math.abs(Math.sin(t * 2.4)) * 0.03;
  }

  // ------------------------------------------------------------------ UI

  private buildUi() {
    const panel = (mine: boolean): Panel => {
      const name = h('span', { class: 'pname' });
      const level = h('span', { class: 'plevel' });
      const badge = h('span', { class: 'badge', hidden: true });
      const types = h('span', { class: 'ptypes' });
      const bar = hpBar(1, 1);
      const ghost = h('div', { class: 'hpghost' });
      bar.append(ghost);
      const nums = mine ? h('div', { class: 'hpnums', 'data-testid': 'hp-mine' }) : undefined;
      const xp = mine ? h('div', { class: 'xpbar', 'data-testid': 'xp-bar' }, h('div', { class: 'xpfill' })) : undefined;
      const dots = h('span', { class: 'pdots', 'aria-hidden': 'true' });
      const root = h('div', { class: `panel ${mine ? 'panel-mine bt-mine' : 'panel-foe bt-foe'}`, 'data-testid': mine ? 'panel-mine' : 'panel-foe' },
        h('div', { class: 'prow' }, name, dots, level), h('div', { class: 'prow' }, types, badge, h('span', { class: 'hplabel' }, 'HP'), bar),
        mine ? h('div', { class: 'prow prow-sub' }, h('span', { class: 'xplabel' }, 'XP'), xp, nums) : null);
      root.style.visibility = 'hidden';
      return { root, name, level, bar, ghost, badge, types, dots, ...(nums ? { nums } : {}), ...(xp ? { xp } : {}) };
    };
    this.panels = [panel(true), panel(false)];
    this.text = h('div', { class: 'text', 'data-testid': 'battle-text', 'aria-hidden': 'true' });
    this.live = h('div', { class: 'sr-only', 'aria-live': 'polite' });
    this.menu = h('div', { class: 'menu bt-menu' });
    arrowNav(this.menu);
    const textbox = h('div', { class: 'textbox bt-text', onclick: () => this.advance?.() }, this.text, h('span', { class: 'text-next', 'aria-hidden': 'true' }));
    this.battleUi = h('div', { class: 'battle-ui' }, this.panels[1].root, this.panels[0].root, textbox, this.menu, this.live);
    this.ui.append(this.battleUi);
    // Menu sounds: one delegated listener for every button the menu ever shows.
    this.menu.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      if (b.classList.contains('is-off')) audio.sfx('denied');
      else audio.sfx(b.hasAttribute('data-back') ? 'back' : 'select');
    });
    this.menu.addEventListener('keydown', (e) => { if (e.key.startsWith('Arrow')) audio.sfx('cursor'); });
    window.addEventListener('keydown', this.globalKeys);
  }

  private globalKeys = (e: KeyboardEvent) => {
    // A held key (auto-repeat) must never click through prompts: swallow repeats of every
    // activation key, including the browser's own Enter/Space-on-focused-button default.
    if (e.repeat && (e.key === 'Enter' || e.key === ' ' || e.key === 'z' || /^[1-9]$/.test(e.key))) { e.preventDefault(); return; }
    if (this.advance && (e.key === 'Enter' || e.key === ' ' || e.key === 'z')) { e.preventDefault(); this.advance(); return; }
    // Mashing through text must not fall straight into Fight → first move: a fresh menu
    // ignores confirm keys for a beat (separate presses, not only held ones).
    if ((e.key === 'Enter' || e.key === ' ') && performance.now() - this.menuAt < MENU_ARM_MS) { e.preventDefault(); return; }
    if (e.key === 'Escape' || e.key === 'x' || e.key === 'Backspace') {
      const back = this.menu.querySelector<HTMLButtonElement>('[data-back]');
      if (back) { e.preventDefault(); back.click(); }
      return;
    }
    if (/^[1-9]$/.test(e.key)) {
      const picks = [...this.menu.querySelectorAll<HTMLButtonElement>('button[data-pick]')];
      const b = picks[Number(e.key) - 1];
      if (b && !b.disabled) { e.preventDefault(); b.focus(); b.click(); }
    }
  };

  override exit() {
    window.removeEventListener('keydown', this.globalKeys);
    this.game.resumeSaves();
    this.hd2d?.dispose();
    super.exit();
  }

  private setPanel(side: 0 | 1, ev: Extract<BattleEvent, { t: 'send' }>) {
    const p = this.panels[side];
    p.root.style.visibility = 'visible';
    p.root.classList.remove('panel-in');
    void p.root.offsetWidth;
    p.root.classList.add('panel-in');
    p.name.textContent = ev.name;
    p.level.textContent = `Lv${ev.level}`;
    p.types.replaceChildren(...species(ev.species).types.map(typeChip));
    this.setStatus(side, ev.status);
    this.shownHp[side] = ev.hp;
    this.setHpUi(side, ev.hp, ev.maxHp);
    p.ghost.style.transition = 'none';
    p.ghost.style.width = `${(ev.hp / ev.maxHp) * 100}%`;
    if (side === 0 && p.xp) {
      const uid = this.state.sides[0].party[ev.slot]?.uid;
      const owned = this.game.player.party.find((c) => c.uid === uid);
      this.setXpUi(owned ? xpProgress(owned.level, owned.xp) : 0);
    }
    this.renderDots();
  }

  /** Party indicator: one pip per kin (filled = can fight). Trainer foes and your own side. */
  private renderDots() {
    ([0, 1] as const).forEach((side) => {
      const s = this.state.sides[side];
      const show = side === 0 ? s.party.length > 1 : !s.isWild;
      const p = this.panels[side];
      p.dots.replaceChildren(...(show ? s.party.map((c) => h('span', { class: `pdot ${c.hp > 0 ? 'on' : ''}` })) : []));
    });
  }

  private setXpUi(k: number) {
    const fill = this.panels[0].xp?.firstElementChild as HTMLElement | undefined;
    if (fill) fill.style.width = `${Math.max(0, Math.min(1, k)) * 100}%`;
  }

  private setHpUi(side: 0 | 1, hp: number, max: number) {
    const p = this.panels[side];
    setHp(p.bar, hp, max);
    if (p.nums) p.nums.textContent = `${Math.max(0, Math.round(hp))} / ${max}`;
  }

  private setStatus(side: 0 | 1, status: StatusId | null) {
    const b = this.panels[side].badge;
    b.hidden = !status;
    if (status) {
      b.textContent = STATUS_TEXT[status][0];
      b.style.setProperty('--c', STATUS_TEXT[status][2]);
      b.title = STATUS_TEXT[status][3];
    }
  }

  private async tweenHp(side: 0 | 1, from: number, to: number, max: number) {
    const p = this.panels[side];
    if (to < from) {
      // White "ghost" chunk lingers then drains — shows how much a hit took.
      p.ghost.style.transition = 'none';
      p.ghost.style.width = `${(from / max) * 100}%`;
      void p.ghost.offsetWidth;
      p.ghost.style.transition = animClock.instant ? 'none' : 'width .45s ease-in .35s';
      p.ghost.style.width = `${(to / max) * 100}%`;
    } else {
      p.ghost.style.transition = 'none';
      p.ghost.style.width = `${(to / max) * 100}%`;
    }
    this.shownHp[side] = to;
    await tween(Math.min(700, 120 + Math.abs(from - to) * 25), (k) => this.setHpUi(side, from + (to - from) * ease.outCubic(k), max));
  }

  private pace() {
    return PACE[this.game.player.settings?.textSpeed ?? 'normal'] ?? PACE.normal;
  }

  /**
   * Show a line of text (typewriter); resolves after a short hold or when the player taps /
   * presses a key. A line too long for the text box (even grown into the free menu slot) is
   * split into pages, each shown in turn.
   */
  private async say(msg: string, hold = 700): Promise<void> {
    this.menu.replaceChildren();
    this.live.textContent = msg;
    this.game.idle = false;
    if (animClock.instant) { this.text.textContent = msg; return; }
    for (const page of this.paginate(msg)) await this.sayPage(page, hold);
  }

  /** Split `msg` at word boundaries into chunks that each fit the text box as laid out now. */
  private paginate(msg: string): string[] {
    const box = this.text.parentElement;
    if (!box || box.offsetParent === null) return [msg];
    const fits = (t: string) => { this.text.textContent = t; return box.scrollHeight <= box.clientHeight + 1; };
    if (fits(msg)) return [msg];
    const out: string[] = [];
    let cur = '';
    for (const w of msg.split(' ')) {
      const t = cur ? `${cur} ${w}` : w;
      if (cur && !fits(`${t} …`)) { out.push(`${cur} …`); cur = w; } else cur = t;
    }
    out.push(cur);
    this.text.textContent = '';
    return out;
  }

  private sayPage(msg: string, hold: number): Promise<void> {
    const pace = this.pace();
    // The untyped rest is laid out (transparent) from the start: words never jump to the next
    // line mid-typing and the box has its final size at once.
    const rest = h('span', { class: 'untyped' });
    const typed = document.createTextNode('');
    this.text.replaceChildren(typed, rest);
    this.text.classList.remove('waiting');
    return new Promise((resolve) => {
      let full = false;
      let done = false;
      const finish = () => { if (!done) { done = true; this.advance = null; this.text.classList.remove('waiting'); resolve(); } };
      const showAll = () => { full = true; this.text.textContent = msg; this.text.classList.add('waiting'); };
      this.advance = () => { if (!full) showAll(); else finish(); };
      let shown = -1;
      void tween((msg.length / pace.cps) * 1000, (k) => {
        const n = Math.ceil(k * msg.length);
        if (!full && n !== shown) { shown = n; typed.data = msg.slice(0, n); rest.textContent = msg.slice(n); }
      }).then(() => {
        if (!full) showAll();
        return wait((hold + msg.length * 14) * pace.hold);
      }).then(finish);
    });
  }

  private label(side: 0 | 1, name: string) {
    if (side === 0) return name;
    if (this.state.sides[1].isWild) return `Wild ${name}`;
    return this.trainer ? `${this.trainer.name}'s ${name}` : `Foe ${name}`;
  }

  private trainerName() {
    return this.trainer ? `${this.trainer.title} ${this.trainer.name}` : '';
  }

  // ------------------------------------------------------------------ flow

  private async intro(events: BattleEvent[]) {
    if (this.trainer) {
      let fig: THREE.Mesh;
      if (this.hd2d) fig = this.hd2d.trainer(this.trainer.id);
      else {
        fig = personMesh(trainerLook(this.trainer.id));
        fig.scale.setScalar(1.55);
        fig.position.copy(this.spots[1]);
        fig.lookAt(this.spots[0].x, 0, this.spots[0].z + 2);
        this.scene.add(fig);
      }
      this.trainerFig = fig;
      audio.sfx('encounter');
      await this.say(`${this.trainerName()} wants to battle!`, 500);
      await this.say(`${this.trainer.name}: “${this.trainer.intro}”`, 900);
      await this.trainerWalk(false);
    } else {
      audio.sfx('encounter');
    }
    await this.play(events);
    this.introDone = true;
    this.prompt();
  }

  /** Slide the trainer figure off to the back-right (out) or back onto the foe platform (in). */
  private async trainerWalk(entering: boolean) {
    const fig = this.trainerFig;
    if (!fig) return;
    if (this.hd2d) {
      // HD-2D: the trainer never leaves — they step back to their post behind the foe kin.
      const [from, to] = this.hd2d.trainerPath(entering);
      this.hd2d.setTrainerWalking(true);
      await tween(entering ? 520 : 480, (k) => fig.position.lerpVectors(from, to, ease.inOut(k)));
      this.hd2d.setTrainerWalking(false);
      return;
    }
    const on = this.spots[1].clone();
    const off = this.spots[1].clone().add(new THREE.Vector3(4.2, 0, -1.2));
    fig.visible = true;
    await tween(entering ? 420 : 380, (k) => {
      const e = entering ? ease.outCubic(k) : ease.inCubic(k);
      fig.position.lerpVectors(entering ? off : on, entering ? on : off, e);
    });
    if (!entering) fig.visible = false;
  }

  private prompt() {
    const s = this.state;
    if (s.phase === 'over') return void this.finish();
    if (s.phase === 'replace') {
      if (needsReplacement(s, 0)) return this.showParty(true);
      return void this.submit({ type: 'pass' });
    }
    this.showMain();
  }

  private showMain() {
    const me = active(this.state, 0);
    this.text.textContent = `What will ${me.name} do?`;
    this.text.classList.remove('waiting');
    const legal = legalActions(this.state, 0);
    const canRun = legal.some((a) => a.type === 'run');
    this.setMenu('main', [
      h('button', { class: 'btn btn-fight', 'data-testid': 'btn-fight', 'data-pick': 1, onclick: () => this.showMoves() }, 'Fight'),
      h('button', { class: 'btn btn-bag', 'data-testid': 'btn-bag', 'data-pick': 2, onclick: () => this.showBag(this.bagTab) }, 'Bag'),
      h('button', { class: 'btn btn-kin', 'data-testid': 'btn-kin', 'data-pick': 3, onclick: () => this.showParty(false) }, 'Kin'),
      h('button', {
        class: `btn btn-run ${canRun ? '' : 'is-off'}`, 'data-testid': 'btn-run', 'data-pick': 4, 'aria-disabled': canRun ? undefined : 'true',
        onclick: () => (canRun ? void this.submit({ type: 'run' }) : this.flash("No! There's no running from a trainer battle!")),
      }, 'Run'),
    ]);
  }

  /** A short message in the text box without leaving the current menu. */
  private flash(msg: string) {
    this.text.textContent = msg;
    this.live.textContent = msg;
  }

  private menuAt = 0;

  private setMenu(kind: string, buttons: HTMLElement[], back: (() => void) | null = null, focus = true) {
    this.menu.className = `menu bt-menu menu-${kind}`;
    this.menuAt = performance.now();
    this.menu.replaceChildren(...buttons);
    if (back) this.menu.append(h('button', { class: 'btn btn-back', 'data-back': true, 'data-testid': 'btn-back', onclick: back }, 'Back'));
    this.game.idle = true;
    if (focus) focusFirst(this.menu);
  }

  private showMoves() {
    const me = active(this.state, 0);
    const foe = active(this.state, 1);
    const legal = legalActions(this.state, 0);
    if (legal.some((a) => a.type === 'move' && a.index === -1)) {
      void this.submit({ type: 'move', index: -1 });
      return;
    }
    const infos: MoveInfoData[] = me.moves.map((m) => {
      const data = getMove(m.id);
      return {
        name: data.name, type: data.type, pp: m.pp, maxPp: m.maxPp, power: data.power, category: data.category,
        mult: data.category === 'attack' ? typeMultiplier(data.type, foe.types) : undefined,
      };
    });
    const info = moveInfoBox();
    this.setMenu('moves', [...me.moves.map((m, i) => {
      const data = getMove(m.id);
      // Effectiveness hint against the foe on the field (attacks only) rides beside the name;
      // PP / type / power live in the info box (and a short meta line on phones).
      return h('button', {
        class: 'btn btn-move', style: `--c:${TYPE_COLORS[data.type]}`, 'data-testid': `move-${i}`, 'data-pick': i + 1, disabled: m.pp <= 0,
        title: `${data.type} · ${data.blurb}`, 'aria-label': `${data.name}, ${data.type}, ${data.category === 'attack' ? `power ${data.power}` : 'status move'}, ${m.pp} of ${m.maxPp} PP`,
        onclick: () => this.submit({ type: 'move', index: i }),
      }, h('span', { class: 'mname' }, h('span', { class: 'mn' }, data.name), effTag(infos[i]!.mult)),
      h('span', { class: 'mmeta' }, `${data.type} · ${m.pp}/${m.maxPp} PP`, effTag(infos[i]!.mult)));
    }), info], () => this.showMain());
    wireMoveInfo(this.menu, info, infos);
    this.text.textContent = 'Choose a move.';
  }

  // ------------------------------------------------------------------ bag

  private showBag(tab: BagTab) {
    this.bagTab = tab;
    const tabs = (['orbs', 'items'] as const).map((t) => h('button', {
      class: `btn tab-btn ${t === tab ? 'on' : ''}`, 'data-testid': `tab-${t}`, role: 'tab', 'aria-selected': t === tab ? 'true' : 'false',
      onclick: () => this.showBag(t),
    }, t === 'orbs' ? 'Orbs' : 'Items'));
    const body = tab === 'orbs' ? this.orbButtons() : this.itemButtons();
    this.setMenu(`bag menu-bag-${tab}`, [...tabs, ...body], () => this.showMain(), false);
    const first = this.menu.querySelector<HTMLButtonElement>('button[data-pick]:not([disabled])') ?? this.menu.querySelector<HTMLButtonElement>('.tab-btn.on');
    first?.focus({ preventScroll: true });
  }

  private orbButtons(): HTMLElement[] {
    const foe = active(this.state, 1);
    const sp = species(foe.species);
    const legal = legalActions(this.state, 0);
    const canCatch = legal.some((a) => a.type === 'catch');
    this.flash(canCatch ? `Throw an orb at the ${this.label(1, foe.name)}?` : "You can't catch another trainer's kin!");
    return (Object.keys(ORBS) as OrbId[]).map((id, i) => {
      const p = catchProbability(foe.stats.hp, foe.hp, sp.catchRate, ORBS[id].bonus, foe.status);
      const have = this.game.player.bag[id] ?? 0;
      return h('button', {
        class: 'btn btn-orb', style: `--c:${ORB_COLORS[id]}`, 'data-testid': `orb-${id}`, 'data-pick': i + 1, disabled: have <= 0 || !canCatch,
        onclick: () => this.submit({ type: 'catch', orb: id }),
        title: `${ORBS[id].name} · ${have} left${canCatch ? ` · about ${Math.round(p * 100)}% to catch` : ''}`,
      }, h('span', { class: 'mname' }, orbIcon(id, 'orb-ico'), h('span', { class: 'mn' }, ORBS[id].name)),
      h('span', { class: 'mmeta' }, h('b', { class: 'mcount' }, `×${have}`), canCatch ? ` · ${Math.round(p * 100)}%` : ''));
    });
  }

  private itemButtons(): HTMLElement[] {
    const legal = legalActions(this.state, 0);
    const owned = ITEM_IDS.filter((id) => (this.game.player.bag[id] ?? 0) > 0);
    if (owned.length === 0) {
      this.flash('Your bag has no items. Buy some at the shop!');
      return [h('button', { class: 'btn btn-item', disabled: true }, h('span', { class: 'mname' }, 'No items'))];
    }
    this.flash(this.state.rules.items ? 'Use which item?' : "Items can't be used in this battle.");
    return owned.map((id, i) => {
      const it = getItem(id);
      const usable = legal.some((a) => a.type === 'item' && a.item === id);
      return h('button', {
        class: 'btn btn-item', 'data-testid': `item-${id}`, 'data-pick': i + 1, disabled: !usable, title: it.blurb,
        onclick: () => this.showItemTargets(id),
      }, h('span', { class: 'mname' }, h('span', { class: 'mn' }, it.name)), h('span', { class: 'mmeta' }, h('b', { class: 'mcount' }, `×${this.game.player.bag[id] ?? 0}`), ` · ${usable ? itemShort(id) : 'No need'}`));
    });
  }

  private showItemTargets(item: ItemId) {
    const s = this.state.sides[0];
    const legal = legalActions(this.state, 0);
    const it = getItem(item);
    this.flash(`Use the ${it.name} on which kin?`);
    this.setMenu('party', s.party.map((c, i) => {
      const ok = legal.some((a) => a.type === 'item' && a.item === item && a.target === i);
      return this.kinButton(c, i, `target-${i}`, ok, () => {
        this.game.player = consumeBag(this.game.player, item);
        void this.submit({ type: 'item', item, target: i });
      }, ok ? '' : itemAffects({ hp: c.hp, maxHp: c.stats.hp, status: c.status }, item) ? '' : 'No effect');
    }), () => this.showBag('items'));
  }

  private kinButton(c: BattleCreature, i: number, testid: string, enabled: boolean, onclick: () => void, note = '', current = false) {
    // Row 1: name + status/FNT badge. Row 2: level, HP bar and numbers (or a note) — the same
    // shape for every tile, so a status never pushes the bar out.
    const bar = hpBar(Math.max(0, c.hp), c.stats.hp);
    const st = c.hp <= 0 ? h('span', { class: 'badge badge-fnt' }, 'FNT')
      : c.status ? h('span', { class: 'badge', style: `--c:${STATUS_TEXT[c.status][2]}` }, STATUS_TEXT[c.status][0]) : null;
    const tail = note ? h('span', { class: 'mmeta knote' }, note) : h('span', { class: 'mmeta hpnums-k' }, `${Math.max(0, c.hp)}/${c.stats.hp}`);
    const lv = h('span', { class: 'plevel' }, `Lv${c.level}`);
    // The badge sits by the name where there is room, beside the level on tight tiles (CSS picks).
    const stLow = st ? withClass(st.cloneNode(true) as HTMLElement, 'st-low') : null;
    const stTop = st ? withClass(st, 'st-top') : null;
    return h('button', {
      class: `btn btn-kinpick ${c.hp <= 0 ? 'fainted' : ''} ${current ? 'current' : ''}`, 'data-testid': testid, 'data-pick': i + 1, disabled: !enabled, onclick,
      title: `${c.name} Lv${c.level} · ${Math.max(0, c.hp)}/${c.stats.hp} HP${c.status ? ` · ${STATUS_TEXT[c.status][3]}` : ''}`,
    },
    h('span', { class: 'kin-row' }, h('span', { class: `mname ${c.name.length >= 10 ? 'long' : ''}` }, c.name), stTop),
    h('span', { class: 'kin-row' }, lv, stLow, note ? null : bar, tail));
  }

  private showParty(forced: boolean) {
    const s = this.state;
    const side = s.sides[0];
    this.flash(forced ? 'Choose your next kin.' : 'Switch to which kin?');
    const legal = legalActions(s, 0);
    this.setMenu('party', side.party.map((c, i) => {
      const ok = legal.some((a) => a.type === 'switch' && a.to === i);
      const cur = i === side.active && c.hp > 0;
      return this.kinButton(c, i, `kin-${i}`, ok, () => void this.submit({ type: 'switch', to: i }), cur ? 'In battle' : '', cur);
    }), forced ? null : () => this.showMain());
  }

  private busyGuard = false;
  /** Animations left running after their beat (an attacker's recovery); settled before the next move and at turn end. */
  private tails: Promise<unknown>[] = [];
  /** The hit reaction a move started on its impact frame, picked up by the matching `damage` event. */
  private reaction: { ev: BattleEvent; done: Promise<void> } | null = null;

  async submit(action: Action) {
    if (this.busyGuard || !this.introDone) return;
    this.busyGuard = true;
    this.game.idle = false;
    this.menu.replaceChildren();
    if (action.type === 'catch') this.game.player = useOrb(this.game.player, action.orb);
    const foe = this.state.phase === 'over' ? { type: 'pass' as const } : chooseAction(this.state, 1, this.state.sides[1].ai ?? 'rookie');
    const r = resolveTurn(this.state, [action, foe]);
    this.state = r.state;
    await this.play(r.events);
    this.busyGuard = false;
    this.prompt();
  }

  private async play(events: BattleEvent[]) {
    // The next event is passed along: a move followed by its `miss` plays a whiff, not a hit,
    // and a move followed by its `damage` starts the hit reaction on the impact frame.
    for (let i = 0; i < events.length; i++) await this.playOne(events[i]!, events[i + 1]);
    await this.settleTails();
  }

  private async settleTails() {
    while (this.tails.length) await Promise.all(this.tails.splice(0));
  }

  private disposeView(side: 0 | 1) {
    const old = this.views[side];
    if (!old) return;
    this.hd2d?.detachKin(side);
    this.scene.remove(old.root);
    old.mesh.geometry.dispose();
    old.material.dispose();
    old.shadow.geometry.dispose();
    (old.shadow.material as THREE.Material).dispose();
    this.views[side] = null;
  }

  private async playOne(e: BattleEvent, next?: BattleEvent) {
    const v = (side: 0 | 1) => this.views[side];
    switch (e.t) {
      case 'turn': return;
      case 'send': {
        const prev = this.views[e.side];
        if (prev && prev.root.visible && this.introDone) {
          // Recall the outgoing kin with a quick shrink.
          const old = this.state.sides[e.side].party[this.activeSlot[e.side]]?.name ?? '';
          audio.sfx('switch');
          await this.say(e.side === 0 ? `${old}, come back!` : `${this.trainerName() || 'The foe'} withdrew ${old}!`, 250);
          prev.setBusy(true);
          await tween(220, (k) => prev.inner.scale.setScalar(prev.baseScale * (1 - k * 0.98)));
        }
        this.disposeView(e.side);
        this.activeSlot[e.side] = e.slot;
        const view = new CreatureView(species(e.species).look, e.side);
        view.root.position.copy(this.spots[e.side]);
        view.faceTowards(e.side === 0 ? this.spots[1] : this.spots[0].clone().add(new THREE.Vector3(2, 0, 3)));
        // Turn your own kin a little toward the camera: a readable 3/4 back view, not a rear end.
        if (e.side === 0) {
          if (this.hd2d) {
            // HD-2D: a clean side / 3-4 profile facing the foe across the screen (near eye shows).
            view.root.rotation.y = this.hd2d.partnerYaw(e.species);
          } else {
            view.root.rotation.y -= 0.55;
            // Flat kin (rays) read as a sliver edge-on: turn them further to show their top/side.
            const bb = view.mesh.geometry.boundingBox;
            if (bb && bb.max.y - bb.min.y < 0.55 * Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z)) view.root.rotation.y -= 0.4;
          }
          // Lit a touch brighter than the foe, so a brown kin never melts into a brown pad.
          view.setAmbientLift(0.3);
        }
        this.scene.add(view.root);
        view.inner.scale.setScalar(0.001);
        this.views[e.side] = view;
        if (this.hd2d) { this.hd2d.fitKin(view, e.side); this.hd2d.attachKin(view, e.side); } else fitKinScale(view, e.side);
        this.setPanel(e.side, e); // filled first: the framing measures the panel at its final size
        this.resize(this.game.renderer.width, this.game.renderer.height); // re-frame for this kin's size
        if (e.side === 1) this.game.player = withSeen(this.game.player, e.species);
        // Your own kin arrives in an orb: a short arc in from the lower left and a pop.
        const appear = e.side === 0 ? this.throwIn(e.species).then(() => view.appear()) : view.appear();
        audio.cry(e.species);
        if (e.side === 1 && this.state.sides[1].isWild && !this.introDone) await this.say(`A wild ${e.name} appeared!`);
        else if (e.side === 1) await this.say(this.trainer ? `${this.trainerName()} sent out ${e.name}!` : `Foe sent out ${e.name}!`);
        else await this.say(`Go, ${e.name}!`, 400);
        await appear;
        return;
      }
      case 'move': {
        await this.settleTails();
        await this.say(`${this.label(e.side, e.name)} used ${e.moveName}!`, 250);
        const data = getMove(e.move);
        const me = v(e.side);
        audio.move(data.type);
        if (data.category === 'attack') {
          const foe = e.side === 0 ? 1 : 0;
          const from = this.spots[e.side].clone().lerp(this.spots[foe], 0.28).add(new THREE.Vector3(0, 0.8, 0));
          const to = this.spots[foe].clone().add(new THREE.Vector3(0, 0.6, 0));
          // Only the strike gates the beat; the hop back and landing run on under the reaction.
          let struck!: () => void;
          const strike = new Promise<void>((r) => { struck = r; });
          if (me) this.tails.push(me.lunge(this.spots[foe], struck).finally(struck)); else struck();
          await wait(140);
          const miss = next?.t === 'miss' && next.side === e.side;
          const dodge = miss ? wait(330).then(() => v(foe)?.dodge()) : null;
          // The engine always follows a connecting attack with its `damage` event: play its hit
          // reaction (flash, SFX, shake, HP drain) on the impact frame, not after the effect's tail.
          const hit = next?.t === 'damage' && next.source === 'move' && next.side === foe ? next : null;
          const onImpact = hit ? () => { mark('impact'); this.reaction = { ev: hit, done: this.react(hit) }; } : undefined;
          await Promise.all([strike, moveFx(this.scene, data.type, from, to, { power: data.power, camera: this.camera, miss, onImpact }), dodge]);
        } else await me?.pulse(TYPE_COLORS[data.type]!);
        return;
      }
      case 'miss':
        audio.sfx('miss');
        return this.say(`But ${this.label(e.side, e.name)}'s attack missed!`);
      case 'damage': {
        const target = v(e.side);
        const from = e.hp + e.amount;
        if (e.source === 'move') {
          const r = this.reaction?.ev === e ? this.reaction.done : this.react(e);
          this.reaction = null;
          await r;
          if (e.crit) await this.say('A critical hit!', 400);
          if (e.mult > 1) await this.say("It's super effective!", 450);
          else if (e.mult < 1) await this.say("It's not very effective…", 450);
        } else {
          audio.sfx('weakHit');
          await Promise.all([target?.pulse(e.source === 'burn' ? '#ff6a3d' : '#ffffff'), this.tweenHp(e.side, from, e.hp, e.maxHp)]);
          await this.say(e.source === 'burn' ? `${this.label(e.side, e.name)} is hurt by its burn!` : `${this.label(e.side, e.name)} is hit with recoil!`, 350);
        }
        return;
      }
      case 'item':
        audio.sfx('item');
        return this.say(`You used ${article(e.itemName)} ${e.itemName} on ${e.name}!`, 350);
      case 'heal': {
        audio.sfx('heal');
        const onField = e.slot === undefined || e.slot === this.activeSlot[e.side];
        if (onField) {
          await Promise.all([v(e.side)?.pulse('#7dff8a'), this.tweenHp(e.side, e.hp - e.amount, e.hp, e.maxHp), this.cue(e.side, 'heal')]);
        }
        this.renderDots();
        return this.say(e.slot !== undefined ? `${e.name} recovered ${e.amount} HP!` : `${this.label(e.side, e.name)} recovered some HP!`, 400);
      }
      case 'cure': {
        audio.sfx('heal');
        if (e.slot === this.activeSlot[e.side]) {
          this.setStatus(e.side, null);
          await Promise.all([v(e.side)?.pulse('#bfffe0'), this.cue(e.side, 'cure')]);
        }
        return this.say(`${e.name} was cured of its ${STATUS_TEXT[e.status][3]}!`, 400);
      }
      case 'revive':
        audio.sfx('heal');
        this.renderDots();
        return this.say(`${e.name} was revived with ${e.hp} HP!`, 450);
      case 'status': {
        audio.sfx('status');
        this.setStatus(e.side, e.status);
        await Promise.all([v(e.side)?.pulse(STATUS_TEXT[e.status][2]), this.cue(e.side, e.status)]);
        return this.say(`${this.label(e.side, e.name)} ${STATUS_TEXT[e.status][1]}`);
      }
      case 'statusFail':
        audio.sfx('denied');
        return this.say('But it failed!', 400);
      case 'stage': {
        const n = STAT_NAMES[e.stat];
        if (e.capped) return this.say(`${this.label(e.side, e.name)}'s ${n} won't go any ${e.value > 0 ? 'higher' : 'lower'}!`);
        audio.sfx(e.delta > 0 ? 'statUp' : 'statDown');
        await Promise.all([v(e.side)?.pulse(e.delta > 0 ? '#7ad0ff' : '#ff7a9a'), this.cue(e.side, e.delta > 0 ? 'buff' : 'debuff')]);
        const amt = Math.abs(e.delta) >= 2 ? (e.delta > 0 ? 'sharply rose' : 'harshly fell') : e.delta > 0 ? 'rose' : 'fell';
        return this.say(`${this.label(e.side, e.name)}'s ${n} ${amt}!`, 450);
      }
      case 'cantMove': return this.say(e.reason === 'asleep' ? `${this.label(e.side, e.name)} is fast asleep.` : `${this.label(e.side, e.name)} is shocked and can't move!`);
      case 'wake': this.setStatus(e.side, null); return this.say(`${this.label(e.side, e.name)} woke up!`, 400);
      case 'faint': {
        const sp = this.state.sides[e.side].party[this.activeSlot[e.side]]?.species;
        if (sp) audio.cry(sp, 0.8);
        audio.sfx('faint');
        await v(e.side)?.faint();
        this.renderDots();
        if (e.side === 1) this.panels[1].root.style.visibility = 'hidden';
        return this.say(`${this.label(e.side, e.name)} fainted!`);
      }
      case 'catch': return this.playCatch(e);
      case 'run':
        if (e.success) audio.sfx('run');
        return this.say(e.success ? 'Got away safely!' : "Couldn't get away!");
      case 'forfeit': return this.say('The battle was forfeited.');
      case 'needReplace': return;
      case 'end': {
        if (e.reason === 'ko' && e.winner !== 0) return this.say('You have no kin left that can fight…');
        return;
      }
    }
  }

  /** A move's hit landing on its target: SFX, flash and recoil, shake, HP drain (all from frame 1). */
  private react(e: Extract<BattleEvent, { t: 'damage' }>): Promise<void> {
    mark('react');
    const target = this.views[e.side];
    audio.sfx(e.crit ? 'crit' : e.mult > 1 ? 'superHit' : e.mult < 1 ? 'weakHit' : 'hit');
    if (e.mult > 1 || e.crit) {
      void burst(this.scene, this.spots[e.side].clone().add(new THREE.Vector3(0, 0.6, 0)), '#fff27a', 1.4);
      this.shake(e.crit && e.mult > 1 ? 0.16 : 0.1);
    }
    return Promise.all([target?.hit(e.mult > 1 || e.crit, e.crit), this.tweenHp(e.side, e.hp + e.amount, e.hp, e.maxHp)]).then(() => {});
  }

  /** Status/heal/stat cue (render/movefx statusFx) around the kin on `side`, sized to it. */
  private cue(side: 0 | 1, type: StatusCue): Promise<void> {
    const v = this.views[side];
    if (!v?.root.visible) return Promise.resolve();
    return statusFx(this.scene, type, this.spots[side].clone(), kinHeight(v), layoutMode(innerWidth, innerHeight) === 'portrait' ? 1.5 : 1);
  }

  /** Send-out flourish for your side: an orb arcs onto the pad and bursts open. */
  private async throwIn(speciesId: string) {
    const orb = makeOrb(ORB_COLORS.orb);
    // Never bigger than the kin it carries: a small kin on a big screen gets a smaller orb.
    const mine = this.views[0];
    const sc = mine ? THREE.MathUtils.clamp(kinHeight(mine) / 1.5, 0.5, 1) : 1;
    orb.scale.setScalar(sc);
    const land = this.spots[0].clone().add(new THREE.Vector3(0, ORB_REST_Y * sc + 0.1, 0));
    const from = this.hd2d?.throwOrigin() ?? this.spots[0].clone().add(new THREE.Vector3(-1.4, 1.2, 2.2));
    orb.position.copy(from);
    this.scene.add(orb);
    audio.sfx('throw');
    await tween(300, (k) => {
      orb.position.lerpVectors(from, land, k);
      orb.position.y += Math.sin(k * Math.PI) * 0.9;
      orb.rotation.x = -k * 9;
    });
    this.scene.remove(orb);
    orb.geometry.dispose();
    (orb.material as THREE.Material).dispose();
    const type = species(speciesId).types[0];
    void burst(this.scene, land, TYPE_COLORS[type ?? 'Neutral'] ?? '#ffffff', 1.1, 12);
    void burst(this.scene, land, '#ffffff', 0.7, 8);
  }

  /** Brief camera shake for big hits. */
  private shake(amount: number) {
    if (animClock.instant) return;
    const hd = this.hd2d;
    if (hd) {
      // HD-2D: shake in whole internal pixels (view offset), so the pixel grid never smears.
      const a0 = Math.max(1, Math.round(amount * 28));
      void tween(260, (k) => {
        const a = k >= 1 ? 0 : a0 * (1 - k);
        hd.shake(Math.sin(k * 40) * a, Math.cos(k * 33) * a * 0.6);
      });
      return;
    }
    const cam = this.camera;
    const base = cam.position.clone();
    void tween(260, (k) => {
      const a = amount * (1 - k);
      cam.position.set(base.x + Math.sin(k * 40) * a, base.y + Math.cos(k * 33) * a * 0.6, base.z);
      if (k >= 1) cam.position.copy(base);
    });
  }

  private async sparkleAt(side: 0 | 1, color: string) {
    await burst(this.scene, this.spots[side].clone().add(new THREE.Vector3(0, 1.0, 0)), color, 0.8, 10);
  }

  private async playCatch(e: Extract<BattleEvent, { t: 'catch' }>) {
    await this.say(`You threw ${article(ORBS[e.orb].name)} ${ORBS[e.orb].name}!`, 200);
    audio.sfx('throw');
    const orb = makeOrb(ORB_COLORS[e.orb], e.orb);
    const from = this.spots[0].clone().add(new THREE.Vector3(0.3, 1.0, 0.2));
    const target = this.spots[1].clone().add(new THREE.Vector3(0, 0.75, 0.35));
    // The orb rests ON the pad (its bottom tip at the pad top), with a little contact shadow,
    // and is lit a touch so it doesn't go dull against the pad in the shade.
    const ground = this.spots[1].clone().add(new THREE.Vector3(0, ORB_REST_Y, 0.35));
    orb.position.copy(from);
    this.scene.add(orb);
    const shadow = orbShadow();
    shadow.position.set(ground.x, this.spots[1].y + 0.012, ground.z);
    // Arc throw.
    await tween(520, (k) => {
      orb.position.lerpVectors(from, target, k);
      orb.position.y += Math.sin(k * Math.PI) * 1.6;
      orb.rotation.x = k * 12;
    });
    const foe = this.views[1];
    void burst(this.scene, target, '#ffffff', 0.9);
    if (foe) {
      foe.setBusy(true);
      await tween(260, (k) => {
        foe.inner.scale.setScalar(foe.baseScale * (1 - k * 0.98));
        foe.material.emissive.setScalar(k);
      });
      foe.root.visible = false;
    }
    this.scene.add(shadow);
    const shadowMat = shadow.material as THREE.MeshBasicMaterial;
    await tween(260, (k) => {
      orb.position.lerpVectors(target, ground, ease.inCubic(k));
      orb.rotation.x = 0;
      shadowMat.opacity = 0.32 * k;
      shadow.scale.setScalar(0.6 + 0.4 * k);
    });
    (orb.material as THREE.MeshLambertMaterial).emissive.setScalar(0.1);
    await tween(140, (k) => { orb.position.y = ground.y + Math.sin(k * Math.PI) * 0.18; });
    // Shakes.
    for (let i = 0; i < e.shakes; i++) {
      await wait(260);
      audio.sfx('shake');
      orbShakeFx(orb);
      await tween(380, (k) => { orb.rotation.z = Math.sin(k * Math.PI * 2) * 0.45; });
      this.text.textContent = `${'• '.repeat(i + 1).trim()}`;
    }
    await wait(300);
    const mat = orb.material as THREE.MeshLambertMaterial;
    if (e.caught) {
      audio.sfx('click');
      orbLockFx(orb);
      void orbCelebrate(this.scene, ground.clone().add(new THREE.Vector3(0, 0.3, 0)), e.orb);
      await tween(200, (k) => mat.emissive.setScalar(0.1 + 0.5 * (1 - k)));
      void burst(this.scene, ground.clone().add(new THREE.Vector3(0, 0.2, 0)), '#ffe14d', 1.2, 10);
      this.panels[1].root.style.visibility = 'hidden';
      audio.sfx('caught');
      await this.say(`Gotcha! ${e.name} was caught!`, 900);
      // The orb hops once and blinks away with the new friend inside.
      const y0 = orb.position.y;
      await tween(320, (k) => {
        orb.position.y = y0 + Math.sin(k * Math.PI) * 0.35;
        orb.scale.setScalar(Math.max(0.001, 1 - ease.inCubic(k)));
        shadowMat.opacity = 0.32 * (1 - k);
      });
      void this.sparkleAt(1, '#ffe14d');
      this.scene.remove(orb, shadow);
      shadow.geometry.dispose();
      shadowMat.dispose();
      orb.geometry.dispose();
      mat.dispose();
    } else {
      audio.sfx('breakFree');
      void burst(this.scene, ground, '#ffffff', 1);
      this.scene.remove(orb, shadow);
      shadow.geometry.dispose();
      shadowMat.dispose();
      orb.geometry.dispose();
      mat.dispose();
      if (foe) {
        foe.reset();
        await foe.appear();
      }
      const lines = ['Oh no! It broke free!', 'Argh! Almost had it!', 'Gah! So close!'];
      await this.say(lines[Math.min(2, e.shakes)]!);
    }
  }

  // ------------------------------------------------------------------ after the battle

  private save() {
    void this.game.save();
  }

  private async finish() {
    const g = this.game;
    this.game.idle = false;
    // Apply every result to the player up front and save it at once (see DECISIONS: "Battles
    // and saves"); the messages below only play it back, so an autosave can never land halfway.
    const res = applyBattleResult(g.player, this.state);
    const o = this.state.outcome!;
    const won = o.reason === 'ko' && o.winner === 0;
    let p = res.player;
    let xp: BattleXp | null = null;
    let victory: TrainerVictory | null = null;
    let wildCoins = 0;
    if (won) {
      xp = applyBattleXp(p, this.state);
      p = xp.player;
      if (this.trainer) {
        victory = trainerVictory(p, this.trainer.id);
        p = victory.player;
      } else {
        const w = wildVictory(p, this.state);
        p = w.player;
        wildCoins = w.coins;
      }
    } else if (o.reason === 'ko') {
      p = blackout(p);
    }
    g.player = p;
    g.resumeSaves();
    void g.save({ now: true });
    const unlocked = victory?.unlocked ?? [];
    const crowned = victory?.crowned ?? false;

    if (o.reason === 'caught') {
      const c = active(this.state, 1);
      await this.say(res.caughtInto === 'box' ? `${c.name} was sent to your storage box.` : `${c.name} joined your party!`, 700);
    }
    if (won && xp) {
      audio.music('victory');
      await this.playGains(xp.gains);
      if (wildCoins > 0) {
        audio.sfx('item');
        await this.say(`You found ${wildCoins} coins!`, 500);
      }
      if (this.trainer && victory) {
        const t = this.trainer;
        await this.trainerWalk(true);
        await this.say(`You defeated ${this.trainerName()}!`, 500);
        await this.say(`${t.name}: “${t.defeat}”`, 1000);
        if (victory.reward > 0) {
          audio.sfx('item');
          await this.say(`You received ${victory.reward} coins for winning!`, 600);
        }
        for (const id of unlocked) {
          audio.sfx('levelUp');
          await this.say(`A new route is open: ${g.dex().routes.get(id)?.name ?? id}!`, 800);
        }
      }
    } else if (o.reason === 'ko') {
      if (this.trainer) {
        await this.trainerWalk(true);
        await this.say(`${this.trainer.name}: “Not bad, but not enough! Come back when your kin are stronger.”`, 800);
      }
      this.panels[0].root.style.visibility = 'hidden';
      await this.say('You hurried back to the spring to rest. Your kin are healed.', 900);
    }
    this.save(); // move choices made during playback

    // After a win, every kin that can evolve gets the chance — also one that was stopped
    // earlier and is already at its evolution level (it may not level up again).
    const queue = won ? evolutionsAfterWin(g.player) : [];
    if (crowned || queue.length) {
      await wait(250);
      if (queue.length) return void g.goto('evolution', { queue: queue.join(','), route: this.routeId, next: crowned ? 'victory' : 'route' });
      return void g.goto('victory', { route: this.routeId });
    }

    this.text.textContent = o.reason === 'caught' ? 'Nice catch!' : won ? (this.trainer ? 'Victory!' : 'Your kin look pleased with themselves.') : o.reason === 'ran' ? 'Phew, that was close.' : 'Take a breather.';
    const buttons = [
      h('button', { class: 'btn btn-fight', 'data-testid': 'btn-continue', 'data-pick': 1, onclick: () => void g.goto('route', { route: this.routeId }) }, 'Continue'),
      h('button', { class: 'btn btn-kin', 'data-testid': 'btn-view-party', 'data-pick': 2, onclick: () => void g.goto('party', { from: 'route', route: this.routeId }) }, 'View party'),
    ];
    for (const id of unlocked) {
      const r = g.dex().routes.get(id);
      if (r) buttons.push(h('button', { class: 'btn btn-bag btn-travel', 'data-testid': `btn-go-${id}`, onclick: () => void g.goto('route', { route: id }) }, `Travel to ${r.name}`));
    }
    this.setMenu('end', buttons);
  }

  /** Play back XP gains: text, animated XP bar for the kin on the field, level-up cards, moves. */
  private async playGains(gains: CreatureGain[]) {
    const fieldUid = this.state.sides[0].party[this.activeSlot[0]]?.uid;
    const fill = async (from: number, to: number) => {
      let lastTick = -1;
      await tween(Math.max(160, (to - from) * 900), (k) => {
        this.setXpUi(from + (to - from) * k);
        const step = Math.floor(k * 10);
        if (step !== lastTick) { lastTick = step; audio.sfx('xpTick'); }
      });
    };
    // The kin on the field gets its own line; the bench shares one line, and only bench kin
    // with something to show (level-ups, moves) get individual attention afterwards.
    const ordered = [...gains.filter((g) => g.uid === fieldUid), ...gains.filter((g) => g.uid !== fieldUid)];
    const bench = ordered.filter((g) => g.uid !== fieldUid && g.amount > 0);
    let benchSaid = false;
    for (const gain of ordered) {
      const onField = gain.uid === fieldUid && (this.views[0]?.root.visible ?? false);
      const name = gain.before.nickname ?? species(gain.before.species).name;
      let k0 = xpProgress(gain.before.level, gain.before.xp);
      if (gain.uid === fieldUid || bench.length === 1) await this.say(`${name} gained ${gain.amount} XP!`, 300);
      else if (!benchSaid) {
        benchSaid = true;
        const amounts = new Set(bench.map((b) => b.amount));
        await this.say(amounts.size === 1 ? `The rest of your team gained ${bench[0]!.amount} XP!` : 'The rest of your team gained XP too!', 300);
      }
      for (const ev of gain.events) {
        if (ev.t === 'levelUp') {
          if (onField) {
            await fill(k0, 1);
            k0 = 0;
            this.setXpUi(0);
            this.panels[0].level.textContent = `Lv${ev.level}`;
            const hp = this.shownHp[0] > 0 ? Math.min(ev.after.hp, this.shownHp[0] + (ev.after.hp - ev.before.hp)) : 0;
            this.shownHp[0] = hp;
            this.setHpUi(0, hp, ev.after.hp);
            this.panels[0].ghost.style.transition = 'none';
            this.panels[0].ghost.style.width = `${(hp / ev.after.hp) * 100}%`;
            this.panels[0].root.classList.remove('lvl-flash');
            void this.panels[0].root.offsetWidth;
            this.panels[0].root.classList.add('lvl-flash');
            void this.sparkleAt(0, '#ffe14d');
          }
          audio.sfx('levelUp');
          await this.levelCard(name, ev);
        } else if (ev.t === 'learned') {
          audio.sfx('statUp');
          await this.say(`${name} learned ${ev.moveName}!`, 600);
        } else if (ev.t === 'moveOffer') {
          await this.offerMove(gain.uid, name, ev);
        }
      }
      if (onField) {
        const target = xpProgress(gain.after.level, gain.after.xp);
        await fill(k0, target);
        this.setXpUi(target);
      }
    }
  }

  /** A pop-up card listing stat gains; dismissed by tap/key or after a hold. */
  private levelCard(name: string, ev: Extract<ProgressEvent, { t: 'levelUp' }>): Promise<void> {
    const rows = STAT_LABELS.map(([k, label]) => h('div', { class: 'lvl-row' },
      h('span', {}, label), h('span', { class: 'lvl-num' }, String(ev.after[k])), h('span', { class: 'lvl-delta' }, `+${ev.after[k] - ev.before[k]}`)));
    const card = h('div', { class: 'lvl-card', 'data-testid': 'level-card', role: 'status' },
      h('div', { class: 'lvl-title' }, `${name} grew to `, h('strong', {}, `Lv ${ev.level}`), '!'), ...rows);
    this.battleUi.append(card);
    const done = this.say(`${name} grew to level ${ev.level}!`, 1100);
    return done.then(() => {
      card.classList.add('out');
      return wait(160).then(() => card.remove());
    });
  }

  /**
   * Forget-a-move prompt. Resolves once the player picked a move to forget or skipped.
   * "Don't learn" gets the focus and forgetting needs a Yes/No confirmation, so mashing
   * Enter (or a digit) through a level-up can never silently drop a move.
   */
  private offerMove(uid: string, name: string, ev: Extract<ProgressEvent, { t: 'moveOffer' }>): Promise<void> {
    const m = getMove(ev.move);
    const meta = (d: ReturnType<typeof getMove>) => `${d.type} · ${d.category === 'attack' ? `${d.power} pow` : 'Status'}`;
    return new Promise((resolve) => {
      const list = () => {
        const c = this.game.player.party.find((x) => x.uid === uid);
        if (!c) return resolve();
        this.flash(`Forget which move to learn ${m.name} (${meta(m)})?`);
        this.setMenu('moves menu-forget', [
          ...c.moves.map((mv, i) => {
            const d = getMove(mv.id);
            return h('button', {
              class: 'btn btn-move', style: `--c:${TYPE_COLORS[d.type]}`, 'data-testid': `forget-${i}`, 'data-pick': i + 1, title: d.blurb,
              onclick: () => confirm(i, d.name),
            }, h('span', { class: 'mname' }, d.name), h('span', { class: 'mmeta' }, meta(d)));
          }),
          h('button', { class: 'btn btn-back btn-skip', 'data-testid': 'btn-skip-move', 'data-back': true, onclick: () => void pick(null, '') }, `Don't learn ${m.name}`),
        ], null, false);
        this.menu.querySelector<HTMLButtonElement>('[data-testid="btn-skip-move"]')?.focus({ preventScroll: true });
      };
      const confirm = (slot: number, old: string) => {
        this.flash(`Forget ${old} to learn ${m.name}?`);
        this.setMenu('confirm', [
          h('button', { class: 'btn btn-back', 'data-testid': 'btn-forget-no', 'data-back': true, onclick: () => list() }, 'No'),
          h('button', { class: 'btn btn-fight', 'data-testid': 'btn-forget-yes', onclick: () => void pick(slot, old) }, `Yes, forget ${old}`),
        ]);
      };
      const ask = async () => {
        await this.say(`${name} wants to learn ${m.name}! But ${name} already knows four moves.`, 500);
        list();
      };
      let done = false;
      const pick = async (slot: number | null, old: string) => {
        if (done) return;
        done = true;
        this.menu.replaceChildren();
        this.game.player = teachMove(this.game.player, uid, ev.move, slot);
        if (slot === null) await this.say(`${name} did not learn ${m.name}.`, 500);
        else {
          await this.say(`1, 2 and… Poof! ${name} forgot ${old}…`, 400);
          audio.sfx('levelUp');
          await this.say(`…and learned ${m.name}!`, 600);
        }
        resolve();
      };
      void ask();
    });
  }

  /** Test hook: the visible battle state. */
  snapshot() {
    return this.state;
  }
}
