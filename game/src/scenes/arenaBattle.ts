// Arena battle (scene 'arenaBattle'): hotseat, vs CPU and online. Like the adventure
// battle it only plays back engine events — locally from resolveTurn, online from the
// server's event log. Hotseat choices are hidden behind a pass-the-device curtain.
import * as THREE from 'three';
import { BaseScene } from './base';
import { CreatureView } from '../render/creature';
import { burst } from '../render/fx';
import { moveFx } from '../render/movefx';
import { animClock, ease, tween, wait } from '../render/anim';
import { arrowNav, focusFirst, h, hpBar, setHp, typeChip, TYPE_COLORS } from '../ui/dom';
import { audio } from '../audio/audio';
import {
  active, chooseAction, createArenaBattle, resolveTurn, hashSeed, legalActions, move as getMove, species,
  type Action, type BattleEvent, type BattleState, type StageKey, type StatusId,
} from '../engine';
import { SEAT_COLORS, SEAT_DARK, buildArena, frameBattleCamera, type ArenaSet } from './arenaStage';
import { battleSpots, fitKinScale, placeSpots } from './battleStage';
import { TurnCollector, curtainBefore, curtainBeforePlayback, type ArenaMode, type LocalMatchSetup, type MatchSummary, type Seat } from './arenaFlow';
import { abtn, curtain, pips, seatTag } from './arenaUi';
import { ERROR_TEXT, MAX_TIMEOUTS, type RoomView, type ServerMessage } from '../net/protocol';
import { endOnline, existingClient } from '../net/session';
import type { ArenaClient, NetStatus } from '../net/client';

const STAT_NAMES: Record<StageKey, string> = { atk: 'Attack', def: 'Defense', spe: 'Speed' };
const STATUS_TEXT: Record<StatusId, [string, string, string]> = {
  burn: ['BRN', 'was burned!', '#ff6a3d'],
  shock: ['SHK', 'is shocked! It may be unable to move.', '#f2c230'],
  drowsy: ['DRW', 'became drowsy and fell asleep!', '#b98cff'],
};

interface Panel { root: HTMLElement; name: HTMLElement; level: HTMLElement; bar: HTMLElement; nums: HTMLElement; badge: HTMLElement; types: HTMLElement; pips: HTMLElement }

export interface ArenaBattleParams {
  setup?: LocalMatchSetup;
  online?: boolean;
  /** Online: opening events from the server's 'start' message. */
  events?: BattleEvent[];
}

const other = (s: Seat): Seat => (s === 0 ? 1 : 0);

export class ArenaBattleScene extends BaseScene {
  readonly name = 'arenaBattle' as const;
  private mode: ArenaMode = 'hotseat';
  private setup: LocalMatchSetup | null = null;
  private client: ArenaClient | null = null;
  private room: RoomView | null = null;
  private state!: BattleState;
  private names: [string, string] = ['Player 1', 'Player 2'];
  /** The seat drawn on the near platform (the local player online). */
  private near: Seat = 0;
  private spots = battleSpots(innerWidth, innerHeight);
  private views: [CreatureView | null, CreatureView | null] = [null, null];
  private panels!: [Panel, Panel];
  private set!: ArenaSet;
  private text!: HTMLElement;
  private menu!: HTMLElement;
  private banner!: HTMLElement;
  private timerEl!: HTMLElement;
  private oppEl!: HTMLElement;
  private advance: (() => void) | null = null;
  private collector: TurnCollector | null = null;
  private asking: Seat | null = null;
  private curtainUp = false;
  private playing = false;
  private kos: [number, number] = [0, 0];
  private localStep = 0;
  private deadlineAt: number | null = null;
  private queue: Promise<void> = Promise.resolve();
  private unsub: (() => void)[] = [];
  private finished = false;
  private exited = false;
  /** Online: the server dropped our room (restart / expiry). Nothing more to play. */
  private roomGone = false;
  /** The kin currently out on each side (as last sent out). */
  private cur: [{ name: string; species: string } | null, { name: string; species: string } | null] = [null, null];

  enter(params: Record<string, unknown>) {
    const p = params as ArenaBattleParams;
    audio.music('arena');
    this.buildUi();

    if (p.online) {
      const c = existingClient();
      if (!c?.room?.battle) { void this.game.goto('arena', { online: !!c }); return; }
      this.mode = 'online';
      this.client = c;
      this.room = c.room;
      this.near = c.room.you;
      this.state = c.room.battle;
      this.localStep = c.room.step;
      this.names = [c.room.players[0]?.name ?? 'Player 1', c.room.players[1]?.name ?? 'Player 2'];
      this.kos = [...c.room.stats.kos];
    } else {
      const setup = p.setup!;
      this.setup = setup;
      this.mode = setup.mode;
      this.names = setup.names;
      this.state = createArenaBattle(hashSeed(setup.seed, setup.round) >>> 0, setup.names[0], setup.teams[0], setup.names[1], setup.teams[1]).state;
    }

    this.set = buildArena(this.scene, {
      nearColor: SEAT_COLORS[this.near], farColor: SEAT_COLORS[other(this.near)],
      nearDark: SEAT_DARK[this.near], farDark: SEAT_DARK[other(this.near)], spots: this.spots,
    });
    this.resize(this.game.renderer.width, this.game.renderer.height);
    this.decoratePanels();

    if (this.mode === 'online') {
      this.unsub.push(this.client!.on((m) => this.onMessage(m)), this.client!.onStatus((s) => this.onStatus(s)));
      const opening = p.events ?? null;
      void this.run(async () => {
        if (opening) { await this.vsSplash(); await this.play(opening); }
        else this.renderFromState();
        this.afterPlayback();
      });
    } else {
      const { events } = createArenaBattle(hashSeed(this.setup!.seed, this.setup!.round) >>> 0, this.names[0], this.setup!.teams[0], this.names[1], this.setup!.teams[1]);
      void this.run(async () => {
        await this.vsSplash();
        await this.play(events);
        this.promptLocal();
      });
    }
  }

  override exit() {
    this.exited = true;
    for (const u of this.unsub) u();
    this.unsub = [];
    window.removeEventListener('keydown', this.globalKeys);
    super.exit();
  }

  override resize(w: number, hgt: number) {
    if (placeSpots(this.spots, w, hgt) && this.set) {
      this.set.platforms.forEach((p, i) => p.position.copy(this.spots[i]!));
      this.views.forEach((v, seat) => v?.root.position.copy(this.spot(seat as Seat)));
    }
    const panel = this.panels?.[this.near].root.getBoundingClientRect();
    frameBattleCamera(this.camera, this.scene, w, hgt, this.spots, [this.views[this.near], this.views[other(this.near)]], panel && panel.width > 0 ? { x: panel.left, y: panel.top } : null);
  }

  /** Layout checks (debug hook). */
  subjects() {
    return this.views.flatMap((v, i) => (v?.root.visible ? [{ name: i === this.near ? 'mine' : 'foe', obj: v.inner }] : []));
  }

  override update(_dt: number, t: number) {
    this.set?.update(t);
    this.views.forEach((v) => v?.update(t));
    this.tickTimer();
  }

  private spot(seat: Seat) {
    return this.spots[seat === this.near ? 0 : 1];
  }

  /** Serialise async work (playback, prompts) so online messages never interleave. */
  private run(fn: () => Promise<void>) {
    this.queue = this.queue.then(fn).catch((err: unknown) => { console.error(err); });
    return this.queue;
  }

  // ------------------------------------------------------------------ UI

  private buildUi() {
    const panel = (pos: 'near' | 'far'): Panel => {
      const name = h('span', { class: 'pname' });
      const level = h('span', { class: 'plevel' });
      const badge = h('span', { class: 'badge', hidden: true });
      const types = h('span', { class: 'ptypes' });
      const bar = hpBar(1, 1);
      const nums = h('div', { class: 'hpnums' });
      const pipsEl = h('span', { class: 'arena-owner-pips' });
      const root = h('div', { class: `panel arena-panel arena-panel-${pos} ${pos === 'near' ? 'bt-mine' : 'bt-foe'}`, 'data-testid': `arena-panel-${pos}` },
        h('div', { class: 'arena-owner' }, pipsEl),
        h('div', { class: 'prow' }, name, badge, level), h('div', { class: 'prow' }, types, h('span', { class: 'hplabel' }, 'HP'), bar), nums);
      root.style.visibility = 'hidden';
      return { root, name, level, bar, nums, badge, types, pips: pipsEl };
    };
    const near = panel('near');
    const far = panel('far');
    // panels[] is indexed by seat once we know which seat is near (decoratePanels).
    this.panels = [near, far];
    this.text = h('div', { class: 'text', 'data-testid': 'battle-text', 'aria-live': 'polite' });
    this.menu = h('div', { class: 'menu bt-menu arena-menu', 'data-testid': 'arena-menu' });
    arrowNav(this.menu);
    this.banner = h('div', { class: 'arena-banner', hidden: true, role: 'status', 'data-testid': 'arena-banner' });
    this.timerEl = h('div', { class: 'arena-timer', hidden: true, 'data-testid': 'arena-timer' });
    this.oppEl = h('div', { class: 'arena-opp', hidden: true, 'data-testid': 'arena-opp' });
    const textbox = h('div', { class: 'textbox bt-text', onclick: () => this.advance?.() }, this.text);
    this.ui.append(h('div', { class: 'arena-battle-ui' }, far.root, h('div', { class: 'arena-top-right' }, this.timerEl, this.oppEl), this.banner, near.root, textbox, this.menu));
    window.addEventListener('keydown', this.globalKeys);
  }

  private decoratePanels() {
    // Re-index: panels[seat].
    const [near, far] = this.panels;
    this.panels = this.near === 0 ? [near, far] : [far, near];
    for (const seat of [0, 1] as const) {
      const p = this.panels[seat];
      p.root.style.setProperty('--seat', SEAT_COLORS[seat]);
      const owner = p.root.querySelector('.arena-owner')!;
      owner.prepend(seatTag(seat, this.names[seat], this.mode === 'online' && seat === this.near ? 'you' : ''));
      this.updatePips(seat);
    }
  }

  private updatePips(seat: Seat) {
    this.panels[seat].pips.replaceChildren(pips(this.state.sides[seat].party.map((c) => c.hp > 0)));
  }

  private globalKeys = (e: KeyboardEvent) => {
    if (this.curtainUp) return;
    // Held keys (auto-repeat) never click through prompts.
    if (e.repeat && (e.key === 'Enter' || e.key === ' ' || e.key === 'z')) { e.preventDefault(); return; }
    if (e.target instanceof HTMLInputElement) return;
    if (this.advance && (e.key === 'Enter' || e.key === ' ' || e.key === 'z')) { e.preventDefault(); this.advance(); }
    if (e.key === 'Escape' || e.key === 'x') this.menu.querySelector<HTMLButtonElement>('[data-back]')?.click();
  };

  private setPanel(seat: Seat, ev: { name: string; species: string; level: number; hp: number; maxHp: number; status: StatusId | null }) {
    const p = this.panels[seat];
    p.root.style.visibility = 'visible';
    p.name.textContent = ev.name;
    p.level.textContent = `Lv${ev.level}`;
    p.types.replaceChildren(...species(ev.species).types.map(typeChip));
    this.setStatus(seat, ev.status);
    this.setHpUi(seat, ev.hp, ev.maxHp);
  }

  private setHpUi(seat: Seat, hp: number, max: number) {
    const p = this.panels[seat];
    setHp(p.bar, hp, max);
    p.nums.textContent = `${Math.max(0, Math.round(hp))} / ${max}`;
  }

  private setStatus(seat: Seat, status: StatusId | null) {
    const b = this.panels[seat].badge;
    b.hidden = !status;
    if (status) {
      b.textContent = STATUS_TEXT[status][0];
      b.style.setProperty('--c', STATUS_TEXT[status][2]);
    }
  }

  private async tweenHp(seat: Seat, from: number, to: number, max: number) {
    await tween(Math.min(700, 120 + Math.abs(from - to) * 25), (k) => this.setHpUi(seat, from + (to - from) * ease.outCubic(k), max));
  }

  private say(msg: string, hold = 700): Promise<void> {
    this.text.textContent = msg;
    this.menu.replaceChildren();
    if (animClock.instant) return Promise.resolve();
    return new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; this.advance = null; resolve(); } };
      this.advance = finish;
      void wait(hold + msg.length * 16).then(finish);
    });
  }

  /** Kin name, disambiguated with the owner when both actives share a name. */
  private label(seat: Seat, name: string) {
    return this.cur[other(seat)]?.name === name ? `${this.names[seat]}'s ${name}` : name;
  }

  private setMenu(kind: string, buttons: HTMLElement[]) {
    this.menu.className = `menu bt-menu arena-menu menu-${kind}`;
    this.menu.replaceChildren(...buttons);
    this.game.idle = true;
    focusFirst(this.menu);
  }

  private async vsSplash() {
    if (animClock.instant) return;
    const el = h('div', { class: 'arena-vs', 'aria-hidden': 'true' },
      h('div', { class: 'arena-vs-side a', style: `--seat:${SEAT_COLORS[this.near]}` }, h('span', {}, this.names[this.near])),
      h('div', { class: 'arena-vs-mid' }, 'VS'),
      h('div', { class: 'arena-vs-side b', style: `--seat:${SEAT_COLORS[other(this.near)]}` }, h('span', {}, this.names[other(this.near)])));
    this.ui.append(el);
    audio.sfx('encounter');
    this.set.cheer(2);
    await wait(1500);
    el.classList.add('out');
    await wait(260);
    el.remove();
  }

  // ------------------------------------------------------------------ local flow

  private humans(): Seat[] {
    return this.mode === 'hotseat' ? [0, 1] : this.mode === 'cpu' ? [0] : [this.near];
  }

  private promptLocal() {
    if (this.state.phase === 'over') { void this.finish(); return; }
    this.collector = new TurnCollector(this.state, this.humans(), (s, seat) => chooseAction(s, seat, 'ace'));
    void this.askNextLocal();
  }

  private async askNextLocal() {
    const c = this.collector!;
    const seat = c.next();
    if (seat === null) {
      if (curtainBeforePlayback(this.mode, c)) {
        await this.showCurtain({
          title: this.state.phase === 'replace' ? 'Both kin chosen!' : `Turn ${this.state.turn + 1}: both locked in!`,
          subtitle: 'Put the device where you can both see, then watch the turn play out.',
          button: 'Watch the turn ▶',
        });
      }
      void this.run(() => this.resolveLocal());
      return;
    }
    if (curtainBefore(this.mode, c, seat)) {
      await this.showCurtain({ title: `Pass to ${this.names[seat]}`, subtitle: `${this.names[other(seat)]}, no peeking!`, seat, button: `I'm ${this.names[seat]} — choose` });
    }
    this.showPrompt(seat);
  }

  private async showCurtain(o: Parameters<typeof curtain>[1]) {
    this.asking = null;
    this.menu.replaceChildren();
    this.text.textContent = '';
    this.curtainUp = true;
    this.game.idle = true;
    const c = curtain(this.ui, o);
    await c.done;
    this.curtainUp = false;
  }

  private async resolveLocal() {
    const actions = this.collector!.result();
    this.collector = null;
    this.game.idle = false;
    const r = resolveTurn(this.state, actions);
    this.state = r.state;
    await this.play(r.events);
    this.promptLocal();
  }

  /** A human seat picks an action (local or online). */
  private choose(seat: Seat, action: Action) {
    if (this.asking !== seat) return;
    this.asking = null;
    this.menu.replaceChildren();
    if (this.mode === 'online') {
      const ok = this.client!.send({ t: 'action', step: this.localStep, action });
      if (!ok) {
        this.text.textContent = 'Not connected — your choice was not sent. Reconnecting…';
        this.client!.retryNow();
        return;
      }
      this.text.textContent = `Waiting for ${this.names[other(seat)]}…`;
      return;
    }
    const c = this.collector!;
    c.submit(seat, action);
    if (action.type === 'forfeit') {
      // Ends the match at once; the other seat's slot gets a placeholder (forfeit resolves first).
      const o = other(seat);
      if (!c.actions[o]) c.actions[o] = legalActions(this.state, o).find((a) => a.type !== 'forfeit')!;
      void this.run(() => this.resolveLocal());
      return;
    }
    void this.askNextLocal();
  }

  // ------------------------------------------------------------------ menus

  private showPrompt(seat: Seat) {
    if (this.roomGone) return;
    this.asking = seat;
    if (this.state.phase === 'replace') return this.showParty(seat, true);
    this.showMain(seat);
  }

  private who(seat: Seat) {
    return this.mode === 'hotseat' ? `${this.names[seat]}: ` : '';
  }

  private showMain(seat: Seat) {
    const me = active(this.state, seat);
    const hint = this.mode === 'hotseat' ? ` (${this.names[other(seat)]}, look away!)` : '';
    this.text.textContent = `${this.who(seat)}What will ${me.name} do?${hint}`;
    this.menu.style.setProperty('--seat', SEAT_COLORS[seat]);
    this.setMenu('main', [
      abtn('Fight', { class: 'btn-fight', 'data-testid': 'btn-fight', onclick: () => this.showMoves(seat) }),
      abtn('Kin', { class: 'btn-kin', 'data-testid': 'btn-kin', onclick: () => this.showParty(seat, false) }),
      abtn('Forfeit', { class: 'btn-run arena-forfeit', 'data-testid': 'btn-forfeit', onclick: () => this.confirmForfeit(seat) }),
    ]);
  }

  private backBtn(seat: Seat) {
    return abtn('Back', { class: 'btn-back', 'data-back': true, 'data-testid': 'btn-back', sfx: 'back', onclick: () => this.showMain(seat) });
  }

  private showMoves(seat: Seat) {
    const me = active(this.state, seat);
    const legal = legalActions(this.state, seat);
    if (legal.some((a) => a.type === 'move' && a.index === -1)) {
      this.text.textContent = `${me.name} has no PP left — it will struggle on with Desperation!`;
      this.setMenu('moves', [abtn('Desperation!', { class: 'btn-fight', 'data-testid': 'move-desperation', onclick: () => this.choose(seat, { type: 'move', index: -1 }) }), this.backBtn(seat)]);
      return;
    }
    this.text.textContent = `${this.who(seat)}Choose a move for ${me.name}.`;
    this.setMenu('moves', [...me.moves.map((m, i) => {
      const data = getMove(m.id);
      return abtn([h('span', { class: 'mname' }, data.name), h('span', { class: 'mmeta' }, `${data.type} · ${data.category === 'attack' ? `Pow ${data.power}` : 'Status'} · PP ${m.pp}/${m.maxPp}`)], {
        class: 'btn-move', style: `--c:${TYPE_COLORS[data.type]}`, 'data-testid': `move-${i}`, disabled: m.pp <= 0, title: data.blurb,
        onclick: () => this.choose(seat, { type: 'move', index: i }),
      });
    }), this.backBtn(seat)]);
  }

  private showParty(seat: Seat, forced: boolean) {
    const side = this.state.sides[seat];
    this.text.textContent = forced ? `${this.who(seat)}Choose your next kin.` : `${this.who(seat)}Switch to which kin?`;
    const legal = legalActions(this.state, seat);
    const buttons = side.party.map((c, i) => {
      const ok = legal.some((a) => a.type === 'switch' && a.to === i);
      const meta = c.hp <= 0 ? 'Fainted' : i === side.active ? 'In battle' : `HP ${c.hp}/${c.stats.hp}${c.status ? ` · ${STATUS_TEXT[c.status][0]}` : ''}`;
      return abtn([h('span', { class: 'mname' }, c.name), h('span', { class: 'chips' }, ...c.types.map(typeChip)), h('span', { class: 'mmeta' }, meta)], {
        class: 'btn-kinpick', 'data-testid': `kin-${i}`, disabled: !ok, onclick: () => this.choose(seat, { type: 'switch', to: i }),
      });
    });
    if (!forced) buttons.push(this.backBtn(seat));
    this.menu.style.setProperty('--seat', SEAT_COLORS[seat]);
    this.setMenu('party', buttons);
  }

  private confirmForfeit(seat: Seat) {
    this.text.textContent = `${this.who(seat)}Forfeit the match? ${this.names[other(seat)]} will win.`;
    this.setMenu('confirm', [
      abtn('Yes, forfeit', { class: 'btn-fight', 'data-testid': 'btn-forfeit-yes', sfx: 'back', onclick: () => this.choose(seat, { type: 'forfeit' }) }),
      abtn('Keep fighting', { class: 'btn-kin', 'data-back': true, 'data-testid': 'btn-forfeit-no', onclick: () => this.showMain(seat) }),
    ]);
    // The safe choice gets the focus: a stray Enter must not forfeit.
    this.menu.querySelector<HTMLButtonElement>('[data-testid="btn-forfeit-no"]')?.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------------ online flow

  private onMessage(m: ServerMessage) {
    if (this.exited) return;
    switch (m.t) {
      case 'turn':
        this.room = m.room;
        this.asking = null;
        void this.run(async () => {
          this.state = m.room.battle ?? this.state;
          this.localStep = m.step;
          this.kosFromRoom(m.room);
          if (m.timedOut[this.near]) await this.say('Time ran out — a move was picked for you!', 600);
          else if (m.timedOut[other(this.near)]) await this.say(`${this.names[other(this.near)]} ran out of time!`, 500);
          await this.play(m.events);
          this.afterPlayback();
        });
        return;
      case 'room':
        this.room = m.room;
        this.setDeadline(m.room);
        if (m.room.phase === 'lobby') { void this.game.goto('arena', { online: true }); return; }
        void this.run(async () => {
          // Missed a step while disconnected: jump to the server's state.
          if (m.room.battle && m.room.step !== this.localStep) {
            this.state = m.room.battle;
            this.localStep = m.room.step;
            this.kosFromRoom(m.room);
            this.renderFromState();
            this.afterPlayback();
            return;
          }
          this.refreshOnline();
        });
        return;
      case 'start':
        void this.game.goto('arenaBattle', { online: true, events: m.events });
        return;
      case 'closed':
        if (this.client!.seatLost) this.onRoomGone();
        return;
      case 'error':
        if (this.client!.seatLost || m.code === 'no-room' || m.code === 'bad-token') { this.onRoomGone(); return; }
        audio.sfx('denied');
        this.flash(ERROR_TEXT[m.code] ?? m.message);
        if (this.room?.mustAct && this.asking === null && !this.playing) this.showPrompt(this.near);
        return;
      default:
    }
  }

  /** The server no longer has our room: stop prompting and offer the way back to the lobby. */
  private onRoomGone() {
    if (this.roomGone || this.finished) return;
    this.roomGone = true;
    audio.sfx('denied');
    this.asking = null;
    this.room = null;
    this.deadlineAt = null;
    this.menu.replaceChildren();
    this.oppEl.hidden = true;
    this.text.textContent = 'This match can\'t continue.';
    this.game.idle = true;
    const leave = abtn('Leave', { class: 'btn-back', 'data-testid': 'arena-leave', onclick: () => { endOnline(); void this.game.goto('arena', { online: false }); } });
    this.showBanner('The room closed (the server restarted or the match expired).', 'error', leave);
    leave.focus({ preventScroll: true });
  }

  private kosFromRoom(room: RoomView) {
    this.kos = [...room.stats.kos];
  }

  private onStatus(s: NetStatus) {
    if (this.exited || this.roomGone) return;
    if (s === 'reconnecting') this.showBanner('Connection lost — reconnecting…', 'warn');
    else if (s === 'open') this.showBanner(null);
    else if (s === 'failed' || s === 'closed') {
      this.showBanner('Disconnected from the arena server.', 'error', abtn('Leave', { class: 'btn-back', 'data-testid': 'arena-leave', onclick: () => { endOnline(); void this.game.goto('arena'); } }));
    }
  }

  private showBanner(text: string | null, kind: 'warn' | 'error' | 'info' = 'info', extra?: HTMLElement) {
    this.banner.hidden = !text;
    this.banner.className = `arena-banner ${kind}`;
    this.banner.replaceChildren(...(text ? [h('span', {}, text)] : []), ...(extra ? [extra] : []));
  }

  private flash(text: string) {
    this.showBanner(text, 'warn');
    void wait(2200).then(() => { if (this.banner.textContent === text) this.showBanner(null); });
  }

  private afterPlayback() {
    if (this.mode !== 'online' || this.exited) return;
    if (this.state.phase === 'over') { void this.finish(); return; }
    this.client!.send({ t: 'ready', step: this.localStep });
    this.refreshOnline();
  }

  /** Online: reflect the room (prompt, opponent status, timer). */
  private refreshOnline() {
    const room = this.room;
    if (!room || this.playing || this.finished || this.roomGone) return;
    this.setDeadline(room);
    const oppSeat = other(this.near);
    const opp = room.players[oppSeat];
    const oppActs = !!room.battle && legalActions(room.battle, oppSeat).some((a) => a.type !== 'pass');
    let oppText = '';
    if (opp && !opp.connected) oppText = opp.left ? `${opp.name} left the arena` : `${opp.name} is reconnecting…`;
    else if (opp && oppActs) oppText = opp.committed ? `${opp.name} is ready ✓` : `${opp.name} is choosing…`;
    this.oppEl.hidden = !oppText;
    this.oppEl.textContent = oppText;
    this.oppEl.classList.toggle('away', !!opp && !opp.connected);
    if (room.mustAct) {
      if (this.asking === null) this.showPrompt(this.near);
    } else if (this.asking === null) {
      this.menu.replaceChildren();
      this.game.idle = true;
      this.text.textContent = room.yourAction ? `Waiting for ${this.names[oppSeat]}…` : `${this.names[oppSeat]} is choosing their next kin…`;
    }
  }

  private setDeadline(room: RoomView) {
    this.deadlineAt = room.deadlineIn === null ? null : performance.now() + room.deadlineIn;
  }

  private tickTimer() {
    if (!this.timerEl) return;
    if (this.mode !== 'online' || this.deadlineAt === null || this.finished || this.playing) { this.timerEl.hidden = true; return; }
    const secs = Math.max(0, Math.ceil((this.deadlineAt - performance.now()) / 1000));
    const turnSecs = this.room?.turnSeconds ?? 45;
    const shown = Math.min(secs, turnSecs);
    this.timerEl.hidden = false;
    const txt = `⏱ ${shown}s`;
    if (this.timerEl.textContent !== txt) this.timerEl.textContent = txt;
    this.timerEl.classList.toggle('low', shown <= 10);
    const strikes = this.room?.players[this.near]?.timeouts ?? 0;
    this.timerEl.title = strikes ? `${strikes}/${MAX_TIMEOUTS} timeouts — at ${MAX_TIMEOUTS} you forfeit` : 'Time left to choose';
  }

  /** Draw the current state without events (resume / resync). */
  private renderFromState() {
    for (const seat of [0, 1] as const) {
      const c = active(this.state, seat);
      const old = this.views[seat];
      if (old) this.removeView(old);
      this.views[seat] = null;
      this.updatePips(seat);
      this.cur[seat] = c.hp > 0 ? { name: c.name, species: c.species } : null;
      if (c.hp > 0) {
        const view = this.makeView(seat, c.species);
        view.reset();
        this.setPanel(seat, { name: c.name, species: c.species, level: c.level, hp: c.hp, maxHp: c.stats.hp, status: c.status });
      } else {
        this.panels[seat].root.style.visibility = 'hidden';
      }
    }
  }

  // ------------------------------------------------------------------ playback

  private makeView(seat: Seat, speciesId: string) {
    const view = new CreatureView(species(speciesId).look, seat);
    view.root.position.copy(this.spot(seat));
    view.faceTowards(seat === this.near ? this.spots[1] : this.spots[0].clone().add(new THREE.Vector3(2, 0, 3)));
    this.scene.add(view.root);
    this.views[seat] = view;
    fitKinScale(view, seat === this.near ? 0 : 1);
    this.resize(this.game.renderer.width, this.game.renderer.height); // re-frame for this kin's size
    return view;
  }

  private removeView(v: CreatureView) {
    this.scene.remove(v.root);
    v.mesh.geometry.dispose();
    v.material.dispose();
    v.shadow.geometry.dispose();
    (v.shadow.material as THREE.Material).dispose();
  }

  private async play(events: BattleEvent[]) {
    this.playing = true;
    this.game.idle = false;
    this.menu.replaceChildren();
    this.timerEl.hidden = true;
    for (const e of events) {
      if (this.exited) return;
      await this.playOne(e);
    }
    for (const seat of [0, 1] as const) this.updatePips(seat);
    this.playing = false;
  }

  private async playOne(e: BattleEvent) {
    const v = (seat: Seat) => this.views[seat];
    switch (e.t) {
      case 'turn': return;
      case 'send': {
        const old = this.views[e.side];
        if (old) this.removeView(old);
        const view = this.makeView(e.side, e.species);
        this.cur[e.side] = { name: e.name, species: e.species };
        this.setPanel(e.side, e);
        audio.sfx('switch');
        const appear = view.appear();
        audio.cry(e.species);
        await this.say(`${this.names[e.side]} sent out ${e.name}!`, 450);
        await appear;
        return;
      }
      case 'move': {
        await this.say(`${this.label(e.side, e.name)} used ${e.moveName}!`, 250);
        const data = getMove(e.move);
        const me = v(e.side);
        const foe = other(e.side);
        audio.move(data.type);
        if (data.category === 'attack') {
          const from = this.spot(e.side).clone().lerp(this.spot(foe), 0.28).add(new THREE.Vector3(0, 0.8, 0));
          const to = this.spot(foe).clone().add(new THREE.Vector3(0, 0.6, 0));
          const lunge = me?.lunge(this.spot(foe));
          await wait(140);
          await Promise.all([lunge, moveFx(this.scene, data.type, from, to)]);
        } else {
          await me?.pulse(TYPE_COLORS[data.type]!);
        }
        return;
      }
      case 'miss':
        audio.sfx('miss');
        return this.say(`But ${this.label(e.side, e.name)}'s attack missed!`);
      case 'damage': {
        const target = v(e.side);
        const from = e.hp + e.amount;
        if (e.source === 'move') {
          audio.sfx(e.crit ? 'crit' : e.mult > 1 ? 'superHit' : e.mult < 1 ? 'weakHit' : 'hit');
          if (e.mult > 1 || e.crit) { void burst(this.scene, this.spot(e.side).clone().add(new THREE.Vector3(0, 0.6, 0)), '#fff27a', 1.4); this.set.cheer(1.2); }
          await Promise.all([target?.hit(e.mult > 1 || e.crit, e.crit), this.tweenHp(e.side, from, e.hp, e.maxHp)]);
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
      case 'heal': {
        audio.sfx('heal');
        await Promise.all([v(e.side)?.pulse('#7dff8a'), this.tweenHp(e.side, e.hp - e.amount, e.hp, e.maxHp)]);
        return this.say(`${this.label(e.side, e.name)} recovered some HP!`, 400);
      }
      case 'status': {
        audio.sfx('status');
        this.setStatus(e.side, e.status);
        await v(e.side)?.pulse(STATUS_TEXT[e.status][2]);
        return this.say(`${this.label(e.side, e.name)} ${STATUS_TEXT[e.status][1]}`);
      }
      case 'statusFail':
        audio.sfx('denied');
        return this.say('But it failed!', 400);
      case 'stage': {
        const n = STAT_NAMES[e.stat];
        if (e.capped) return this.say(`${this.label(e.side, e.name)}'s ${n} won't go any ${e.value > 0 ? 'higher' : 'lower'}!`);
        audio.sfx(e.delta > 0 ? 'statUp' : 'statDown');
        await v(e.side)?.pulse(e.delta > 0 ? '#7ad0ff' : '#ff7a9a');
        const amt = Math.abs(e.delta) >= 2 ? (e.delta > 0 ? 'sharply rose' : 'harshly fell') : e.delta > 0 ? 'rose' : 'fell';
        return this.say(`${this.label(e.side, e.name)}'s ${n} ${amt}!`, 450);
      }
      case 'cantMove': return this.say(e.reason === 'asleep' ? `${this.label(e.side, e.name)} is fast asleep.` : `${this.label(e.side, e.name)} is shocked and can't move!`);
      case 'wake': this.setStatus(e.side, null); return this.say(`${this.label(e.side, e.name)} woke up!`, 400);
      case 'faint': {
        const sp = this.cur[e.side]?.species;
        if (sp) audio.cry(sp, 0.8);
        audio.sfx('faint');
        await v(e.side)?.faint();
        this.panels[e.side].root.style.visibility = 'hidden';
        if (this.mode !== 'online') this.kos[other(e.side)]++;
        const left = this.state.sides[e.side].party.filter((k) => k.hp > 0).length;
        this.updatePips(e.side);
        this.set.cheer(2.2);
        await this.say(`${this.label(e.side, e.name)} fainted!`);
        if (left > 0) await this.say(`${this.names[e.side]} has ${left} kin left.`, 350);
        return;
      }
      case 'forfeit':
        return this.say(`${this.names[e.side]} forfeited the match!`);
      case 'needReplace': return;
      case 'end': {
        this.set.cheer(4);
        if (e.winner === null) return this.say('The match ends in a draw!', 900);
        audio.sfx('levelUp');
        return this.say(`${this.names[e.winner]} wins the match!`, 900);
      }
      default: return;
    }
  }

  // ------------------------------------------------------------------ end

  private async finish() {
    if (this.finished) return;
    this.finished = true;
    this.timerEl.hidden = true;
    this.oppEl.hidden = true;
    const o = this.state.outcome!;
    const summary: MatchSummary = {
      mode: this.mode,
      names: this.names,
      teams: [0, 1].map((s) => this.state.sides[s]!.party.map((c) => ({ species: c.species, moves: c.moves.map((m) => m.id), uid: c.uid, nickname: c.name }))) as MatchSummary['teams'],
      winner: o.winner,
      reason: o.reason,
      turns: this.state.turn,
      kos: [...this.kos],
      hp: [0, 1].map((s) => this.state.sides[s]!.party.map((c) => c.hp / c.stats.hp)) as MatchSummary['hp'],
    };
    await wait(animClock.instant ? 0 : 700);
    if (this.exited) return;
    void this.game.goto('arenaVictory', { summary, setup: this.setup, near: this.near });
  }

  /** Test hook. */
  arenaSnapshot() {
    return {
      scene: 'arenaBattle', mode: this.mode, phase: this.state?.phase ?? null, turn: this.state?.turn ?? 0,
      asking: this.asking, curtain: this.curtainUp, playing: this.playing, near: this.near,
      outcome: this.state?.outcome ?? null, step: this.localStep, kos: this.kos, roomGone: this.roomGone,
      menuButtons: [...this.menu.querySelectorAll('button')].map((b) => b.dataset.testid ?? ''),
    };
  }
}
