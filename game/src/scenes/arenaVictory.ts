// Arena victory screen (scene 'arenaVictory'): the winner's team on a podium under
// confetti, match stats, and Rematch / New teams / Exit.
import * as THREE from 'three';
import { BaseScene } from './base';
import { CreatureView } from '../render/creature';
import { audio } from '../audio/audio';
import { arrowNav, focusFirst, h, hpBar } from '../ui/dom';
import { ARENA_LEVEL, calcStats, species } from '../engine';
import { corners, fitPoints, freeArea, layoutMode } from './framing';
import { Confetti, SEAT_COLORS, SEAT_DARK, buildArena, podium, type ArenaSet } from './arenaStage';
import type { LocalMatchSetup, MatchSummary, Seat } from './arenaFlow';
import { abtn, seatTag } from './arenaUi';
import { ERROR_TEXT, type RoomView, type ServerMessage } from '../net/protocol';
import { endOnline, existingClient } from '../net/session';
import type { ArenaClient } from '../net/client';

export interface ArenaVictoryParams {
  summary: MatchSummary;
  setup?: LocalMatchSetup | null;
  near?: Seat;
}

const REASON: Record<MatchSummary['reason'], string> = {
  ko: 'by knockout', forfeit: 'by forfeit', turnLimit: 'on the turn limit', caught: '', ran: '',
};

export class ArenaVictoryScene extends BaseScene {
  readonly name = 'arenaVictory' as const;
  private set!: ArenaSet;
  private views: CreatureView[] = [];
  private confetti: Confetti | null = null;
  private summary!: MatchSummary;
  private setup: LocalMatchSetup | null = null;
  private client: ArenaClient | null = null;
  private unsub: (() => void)[] = [];
  private actions!: HTMLElement;
  private note!: HTMLElement;
  private requested = false;
  private exited = false;
  private spin = 0;

  enter(params: Record<string, unknown>) {
    const p = params as unknown as ArenaVictoryParams;
    this.summary = p.summary;
    this.setup = p.setup ?? null;
    const s = this.summary;
    const near = p.near ?? 0;
    audio.music('victory');
    this.set = buildArena(this.scene, {
      nearColor: SEAT_COLORS[near], farColor: SEAT_COLORS[near === 0 ? 1 : 0], nearDark: SEAT_DARK[near], farDark: SEAT_DARK[near === 0 ? 1 : 0],
      spots: [new THREE.Vector3(-1.7, 0, 1.3), new THREE.Vector3(1.75, 0, -1.9)],
    });
    for (const pl of this.set.platforms) pl.visible = false;
    this.set.cheer(6);

    const color = s.winner === null ? '#ffcf3f' : SEAT_COLORS[s.winner];
    const pod = podium(color);
    pod.mesh.position.set(0, 0, -0.6);
    this.scene.add(pod.mesh);
    const stand = (speciesId: string, at: THREE.Vector3, i: number, fainted: boolean) => {
      const v = new CreatureView(species(speciesId).look, i);
      v.root.position.copy(at).add(pod.mesh.position).add(new THREE.Vector3(0, 0, at.x === 0 ? 0.2 : 0.1));
      v.root.rotation.y = (at.x === 0 ? 0 : at.x < 0 ? 0.3 : -0.3);
      // The lead (centre, top step) stands a little taller; fainted kin a little smaller.
      v.baseScale *= (at.x === 0 ? 1.18 : 1) * (fainted ? 0.9 : 1);
      // Fliers/swimmers float: settle them closer to their step so they read as "on" the podium.
      if (v.hovering) v.root.position.y -= 0.35 * v.baseScale;
      this.scene.add(v.root);
      this.views.push(v);
      void v.appear();
    };
    if (s.winner !== null) {
      // Lead on the top step, the others on the sides.
      const team = s.teams[s.winner];
      const order = [0, 1, 2];
      order.forEach((ti, slot) => {
        const e = team[ti];
        if (e) stand(e.species, pod.tops[slot]!, slot, (s.hp[s.winner!][ti] ?? 0) <= 0);
      });
      audio.cry(team[0]!.species);
    } else {
      stand(s.teams[0][0]!.species, pod.tops[1], 0, false);
      stand(s.teams[1][0]!.species, pod.tops[2], 1, false);
    }
    this.confetti = new Confetti(200, { x: 6, z: 3.5, top: 7.5 }, s.winner === null ? undefined : [color, '#ffffff', '#ffcf3f', color, SEAT_DARK[s.winner], '#43d36b']);
    this.confetti.mesh.position.set(0, 0, -0.6);
    this.scene.add(this.confetti.mesh);

    this.buildUi();
    this.resize(this.game.renderer.width, this.game.renderer.height);

    if (s.mode === 'online') {
      this.client = existingClient();
      if (this.client) {
        this.unsub.push(this.client.on((m) => this.onMessage(m)), this.client.onStatus(() => this.refresh()));
        this.refresh();
      }
    }
    this.game.idle = true;
  }

  override exit() {
    this.exited = true;
    for (const u of this.unsub) u();
    super.exit();
  }

  override resize(w: number, hgt: number) {
    const cam = this.camera;
    cam.aspect = w / hgt;
    cam.fov = 40;
    // The podium fills the space between the winner's name and the stats card (left of the
    // card on a landscape phone).
    const q = (sel: string) => this.ui.querySelector(sel);
    const land = layoutMode(w, hgt) === 'land';
    const area = freeArea(w, hgt, land ? { top: [q('.arena-win-top')], right: [q('.arena-vcard')] } : { top: [q('.arena-win-top')], bottom: [q('.arena-vcard')] }, 6);
    const pts = corners(new THREE.Vector3(-2.65, 0, -1.5), new THREE.Vector3(2.65, 2.9, 0.4));
    fitPoints(cam, w, hgt, pts, area, { dir: new THREE.Vector3(0, 0.3, 1), target: new THREE.Vector3(0, 1.2, -0.6), fill: 0.98 });
  }

  /** Layout checks (debug hook). */
  subjects() {
    return this.views.map((v, i) => ({ name: `kin${i}`, obj: v.inner }));
  }

  override update(_dt: number, t: number) {
    this.set.update(t);
    this.confetti?.update(t);
    this.spin = t;
    this.views.forEach((v, i) => {
      v.update(t);
      if (i === 0) v.root.rotation.y = Math.sin(this.spin * 0.8) * 0.25;
    });
  }

  private buildUi() {
    const s = this.summary;
    const win = s.winner;
    const title = win === null
      ? h('h1', { class: 'arena-win-name', 'data-testid': 'arena-winner' }, 'Draw!')
      : h('h1', { class: 'arena-win-name', 'data-testid': 'arena-winner', style: `--seat:${SEAT_COLORS[win]}` }, `${s.names[win]} wins!`);
    const top = h('div', { class: 'arena-win-top' },
      h('div', { class: 'arena-win-crown' }, win === null ? 'Arena' : 'Champion of the Arena'),
      title,
      h('div', { class: 'arena-win-sub' }, REASON[s.reason]),
    );

    const team = (seat: Seat) => h('div', { class: 'arena-vteam', style: `--seat:${SEAT_COLORS[seat]}` },
      h('div', { class: 'arena-vteam-head' }, seatTag(seat, s.names[seat]), h('span', { class: 'arena-vkos' }, `${s.kos[seat]} KO${s.kos[seat] === 1 ? '' : 's'}`)),
      ...s.teams[seat].map((e, i) => {
        const frac = Math.max(0, s.hp[seat][i] ?? 0);
        const max = calcStats(e.species, ARENA_LEVEL).hp;
        return h('div', { class: `arena-vkin${frac <= 0 ? ' out' : ''}` },
          h('span', { class: 'arena-vkin-name' }, e.nickname ?? species(e.species).name), hpBar(frac, 1),
          h('span', { class: 'arena-vkin-hp' }, `${Math.round(frac * max)}/${max}`));
      }));

    this.note = h('p', { class: 'arena-note info', hidden: true, 'data-testid': 'arena-victory-note', role: 'status' });
    this.actions = h('div', { class: 'arena-row arena-vactions' },
      abtn('Rematch', { class: 'btn-fight', 'data-testid': 'arena-rematch', onclick: () => this.rematch() }),
      abtn('New teams', { class: 'btn-kin', 'data-testid': 'arena-newteams', onclick: () => this.newTeams() }),
      abtn('Exit', { class: 'btn-back', 'data-back': true, 'data-testid': 'arena-exit', sfx: 'back', onclick: () => this.leave() }),
    );
    const card = h('div', { class: 'arena-card arena-vcard', 'data-testid': 'arena-victory' },
      h('div', { class: 'arena-vstats' },
        h('div', { class: 'arena-vstat' }, h('span', { class: 'arena-vstat-v' }, String(s.turns)), h('span', { class: 'small' }, 'turns')),
        h('div', { class: 'arena-vstat' }, h('span', { class: 'arena-vstat-v' }, `${s.kos[0]}–${s.kos[1]}`), h('span', { class: 'small' }, 'KOs')),
        h('div', { class: 'arena-vstat' }, h('span', { class: 'arena-vstat-v' }, s.mode === 'online' ? 'Online' : s.mode === 'cpu' ? 'vs CPU' : 'Hotseat'), h('span', { class: 'small' }, 'mode')),
      ),
      h('div', { class: 'arena-vteams' }, team(0), team(1)),
      this.note,
      this.actions,
    );
    arrowNav(card);
    this.ui.append(h('div', { class: 'arena-victory-ui' }, top, card));
    this.ui.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.leave(); });
    focusFirst(this.actions);
  }

  private say(text: string | null, kind: 'info' | 'error' | 'good' = 'info') {
    this.note.hidden = !text;
    this.note.className = `arena-note ${kind}`;
    this.note.textContent = text ?? '';
  }

  private rematch() {
    if (this.summary.mode !== 'online') {
      const setup = this.setup!;
      void this.game.goto('arenaBattle', { setup: { ...setup, round: setup.round + 1 } });
      return;
    }
    if (!this.client?.send({ t: 'rematch' })) { this.say('Not connected to the arena server.', 'error'); return; }
    this.requested = true;
    this.refresh();
  }

  private newTeams() {
    if (this.summary.mode !== 'online') {
      const setup = this.setup!;
      void this.game.goto('arena', { builder: { mode: setup.mode, names: setup.names, teams: setup.teams } });
      return;
    }
    if (!this.client?.send({ t: 'newTeams' })) this.say('Not connected to the arena server.', 'error');
  }

  private leave() {
    if (this.summary.mode === 'online') endOnline();
    void this.game.goto('title');
  }

  private onMessage(m: ServerMessage) {
    if (this.exited) return;
    if (m.t === 'start') { void this.game.goto('arenaBattle', { online: true, events: m.events }); return; }
    if (m.t === 'room') {
      if (m.room.phase === 'lobby') { void this.game.goto('arena', { online: true }); return; }
      this.refresh(m.room);
    }
    if (this.client?.seatLost && (m.t === 'error' || m.t === 'closed')) { this.onRoomGone(); return; }
    if (m.t === 'error') this.say(ERROR_TEXT[m.code] ?? m.message, 'error');
  }

  /** The server dropped the room: no rematch possible, only Exit. */
  private onRoomGone() {
    for (const id of ['arena-rematch', 'arena-newteams']) {
      const b = this.actions.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`);
      if (b) b.disabled = true;
    }
    this.say('The room closed (the server restarted or it expired).', 'error');
    this.actions.querySelector<HTMLButtonElement>('[data-testid="arena-exit"]')?.focus({ preventScroll: true });
  }

  private refresh(room: RoomView | null = this.client?.room ?? null) {
    if (this.client?.seatLost) { this.onRoomGone(); return; }
    if (!room) return;
    const opp = room.players[room.you === 0 ? 1 : 0];
    const me = room.players[room.you];
    const rematchBtn = this.actions.querySelector<HTMLButtonElement>('[data-testid="arena-rematch"]')!;
    if (!opp || opp.left) {
      rematchBtn.disabled = true;
      this.say(`${opp?.name ?? 'Your opponent'} left the arena.`, 'info');
      return;
    }
    if (me?.wantsRematch || this.requested) {
      rematchBtn.disabled = true;
      rematchBtn.textContent = 'Rematch requested';
      this.say(opp.connected ? `Waiting for ${opp.name} to accept…` : `${opp.name} is reconnecting…`, 'info');
    } else if (opp.wantsRematch) {
      rematchBtn.textContent = 'Accept rematch!';
      rematchBtn.classList.add('arena-pulse');
      this.say(`${opp.name} wants a rematch!`, 'good');
    } else if (!opp.connected) {
      this.say(`${opp.name} is reconnecting…`, 'info');
    } else {
      this.say(null);
    }
  }

  /** Test hook. */
  arenaSnapshot() {
    return { scene: 'arenaVictory', mode: this.summary.mode, winner: this.summary.winner, reason: this.summary.reason, turns: this.summary.turns, kos: this.summary.kos };
  }
}
