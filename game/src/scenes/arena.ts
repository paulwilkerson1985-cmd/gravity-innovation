// Arena lobby + team builder (scene 'arena'). Modes: Hotseat (2 players, one device),
// vs CPU (Arena Ace) and Online (room codes). The builder normalises every kin to the
// arena level and validates the team with the engine before it can be locked in.
import * as THREE from 'three';
import { BaseScene } from './base';
import { CreatureView } from '../render/creature';
import { audio } from '../audio/audio';
import { arrowNav, focusFirst, h, typeChip, TYPE_COLORS } from '../ui/dom';
import {
  ARENA_LEVEL, ARENA_TEAM_SIZE, hashSeed, learnableMoves, move as getMove, species, type ArenaEntry, type OwnedCreature,
} from '../engine';
import { RENTALS } from '../data/rentals';
import { SEAT_COLORS, SEAT_DARK, buildArena, arenaPlatform, type ArenaSet } from './arenaStage';
import {
  addToTeam, arenaStats, displayName, moveSlot, ownedPicks, randomRentalTeam, removeFromTeam, rentalPicks, setMoves, teamProblems, toggleMove,
  type Pick,
} from './arenaTeam';
import type { ArenaMode, LocalMatchSetup, Seat } from './arenaFlow';
import { abtn, curtain, loadNames, saveNames, seatTag } from './arenaUi';
import { ERROR_TEXT, NAME_MAX, PROTOCOL_VERSION, ROOM_CODE_LENGTH, cleanName, isRoomCode, normalizeCode, type RoomView, type ServerMessage } from '../net/protocol';
import { endOnline, existingClient, onlineClient, savedSeatStorage, serverUrl } from '../net/session';
import { loadSavedSeat, type ArenaClient, type NetStatus } from '../net/client';

type View = 'menu' | 'names' | 'online' | 'builder';

interface Builder {
  mode: ArenaMode;
  seat: Seat;
  team: ArenaEntry[];
  selected: number;
  tab: 'rental' | 'owned';
  note: { text: string; kind: 'info' | 'error' } | null;
  /** Online: team sent, waiting for the opponent. */
  locked: boolean;
}

export interface ArenaSceneParams {
  /** Jump straight into team building (used by "New teams" on the victory screen). */
  builder?: { mode: 'hotseat' | 'cpu'; names: [string, string]; teams: [ArenaEntry[], ArenaEntry[]] };
  /** Continue an online session (the client lives in src/net/session.ts). */
  online?: boolean;
}

const STAT_LABELS: [keyof ReturnType<typeof arenaStats>, string][] = [['hp', 'HP'], ['atk', 'ATK'], ['def', 'DEF'], ['spe', 'SPE']];
const CENTER = new THREE.Vector3(0, 0.16, -0.3);
let matchCounter = 0;

export class ArenaScene extends BaseScene {
  readonly name = 'arena' as const;
  private set!: ArenaSet;
  private spots = [new THREE.Vector3(-1.7, 0, 1.3), new THREE.Vector3(1.75, 0, -1.9)] as const;
  private showcase: CreatureView[] = [];
  private preview: CreatureView | null = null;
  private previewSpecies: string | null = null;
  private pedestal: THREE.Mesh | null = null;
  private view: View = 'menu';
  private root!: HTMLElement;
  private caption!: HTMLElement;
  private names: [string, string] = loadNames();
  private mode: ArenaMode = 'hotseat';
  private locked: [ArenaEntry[] | null, ArenaEntry[] | null] = [null, null];
  /** Teams from the previous match (prefill for "New teams"). */
  private previous: [ArenaEntry[], ArenaEntry[]] | null = null;
  private b: Builder | null = null;
  private seed = 0;
  private randomCount = 0;
  private client: ArenaClient | null = null;
  private unsub: (() => void)[] = [];
  private onlineNote: { text: string; kind: 'info' | 'error' } | null = null;
  private connecting = false;
  private curtainUp = false;
  private camT = 0;
  /** The kin available in "My kin": the live adventure, or the saved one if none is loaded. */
  private collection: { party: OwnedCreature[]; box: OwnedCreature[] } = { party: [], box: [] };

  enter(params: Record<string, unknown>) {
    const p = params as ArenaSceneParams;
    const g = this.game;
    this.seed = hashSeed(g.opts.seed, 0xa7e4a);
    this.collection = { party: g.player.party, box: g.player.box };
    void this.loadSavedCollection();
    audio.music('arena');
    this.set = buildArena(this.scene, { nearColor: SEAT_COLORS[0], farColor: SEAT_COLORS[1], nearDark: SEAT_DARK[0], farDark: SEAT_DARK[1], spots: this.spots });
    // Showcase pair on the platforms for the lobby.
    const pair = [RENTALS[(g.opts.seed >>> 0) % RENTALS.length]!, RENTALS[((g.opts.seed >>> 0) + 5) % RENTALS.length]!];
    pair.forEach((r, i) => {
      const v = new CreatureView(species(r.species).look, i);
      v.root.position.copy(this.spots[i]!);
      v.faceTowards(this.spots[1 - i]!);
      this.scene.add(v.root);
      this.showcase.push(v);
    });
    this.pedestal = arenaPlatform('#ffcf3f', '#b88a1f', 1.0);
    this.pedestal.position.set(CENTER.x, 0.02, CENTER.z);
    this.pedestal.visible = false;
    this.scene.add(this.pedestal);

    this.root = h('div', { class: 'arena-ui' });
    this.caption = h('div', { class: 'arena-preview-cap', hidden: true });
    this.ui.append(this.caption, this.root);
    this.ui.addEventListener('keydown', this.onKey);

    if (p.builder) {
      this.mode = p.builder.mode;
      this.names = [...p.builder.names];
      this.previous = p.builder.teams;
      this.startBuilder(0, p.builder.teams[0]);
    } else if (p.online && existingClient()) {
      this.mode = 'online';
      this.attachClient(existingClient()!);
      const room = this.client!.room;
      if (room) this.onRoom(room);
      else this.show('online');
    } else {
      this.show('menu');
    }
  }

  /** Arena straight from the title: borrow the saved adventure's kin (read-only). */
  private async loadSavedCollection() {
    if (this.collection.party.length + this.collection.box.length > 0) return;
    try {
      const saved = await this.game.saves?.read();
      if (!saved || this.view === undefined) return;
      this.collection = { party: saved.player.party ?? [], box: saved.player.box ?? [] };
      if (this.view === 'builder' && !this.curtainUp) this.render();
    } catch { /* no save, or unreadable: rentals only */ }
  }

  override exit() {
    for (const u of this.unsub) u();
    this.unsub = [];
    this.ui.removeEventListener('keydown', this.onKey);
    super.exit();
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !this.curtainUp) {
      const back = this.root.querySelector<HTMLButtonElement>('[data-back]');
      if (back && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); back.click(); }
    }
  };

  // ------------------------------------------------------------------ 3D

  override resize(w: number, hgt: number) {
    this.camera.aspect = w / hgt;
    this.camera.fov = 40;
    this.layoutCamera(w, hgt);
  }

  private layoutCamera(w = this.game.renderer.width, hgt = this.game.renderer.height) {
    const cam = this.camera;
    cam.clearViewOffset();
    if (this.view === 'builder') {
      // Centre the preview kin in the space the panel leaves free.
      const panel = this.root.querySelector<HTMLElement>('.arena-builder');
      const r = panel?.getBoundingClientRect();
      const portrait = w / hgt < 1 || w < 700;
      const fx = 0; const fy = 0; let fw = w; let fh = hgt;
      if (r && r.width > 0) {
        if (portrait) { fh = Math.max(120, r.top); }
        else { fw = Math.max(200, r.left); }
      }
      const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
      const fillV = portrait ? 0.55 : 0.42;
      const dV = (2.0 * hgt) / (fh * fillV) / (2 * tan);
      const dH = (2.6 * w) / (fw * 0.8) / (2 * tan * cam.aspect);
      const d = Math.min(14, Math.max(4.2, dV, dH));
      const target = CENTER.clone().add(new THREE.Vector3(0, 0.75, 0));
      const dir = new THREE.Vector3(0.0, 0.32, 1).normalize();
      cam.position.copy(target).addScaledVector(dir, d);
      cam.lookAt(target);
      const cx = fx + fw / 2;
      const cy = fy + fh / 2 + (portrait ? fh * 0.04 : 0);
      cam.setViewOffset(w, hgt, w / 2 - cx, hgt / 2 - cy, w, hgt);
      cam.updateProjectionMatrix();
      // Caption sits under the kin, inside the free area.
      this.caption.style.left = `${cx}px`;
      this.caption.style.top = `${fy + fh * (portrait ? 0.76 : 0.8)}px`;
      this.caption.style.maxWidth = `${Math.max(160, fw - 24)}px`;
      return;
    }
    cam.updateProjectionMatrix();
    this.orbit(this.camT);
  }

  private orbit(t: number) {
    const cam = this.camera;
    const aspect = cam.aspect;
    const r = aspect < 1 ? 17 : 12.5;
    const a = Math.sin(t * 0.12) * 0.35;
    cam.position.set(Math.sin(a) * r, aspect < 1 ? 6.2 : 4.6, Math.cos(a) * r);
    cam.lookAt(0, aspect < 1 ? 1.9 : 0.9, -0.6);
  }

  override update(_dt: number, t: number) {
    this.camT = t;
    this.set.update(t);
    for (const v of this.showcase) v.update(t);
    if (this.view !== 'builder') this.orbit(t);
    if (this.preview) {
      this.preview.update(t);
      this.preview.root.rotation.y = Math.sin(t * 0.6) * 0.55;
    }
  }

  private setPreview(speciesId: string | null) {
    if (speciesId === this.previewSpecies) return;
    this.previewSpecies = speciesId;
    if (this.preview) {
      this.scene.remove(this.preview.root);
      this.preview.mesh.geometry.dispose();
      this.preview.material.dispose();
      (this.preview.shadow.material as THREE.Material).dispose();
      this.preview.shadow.geometry.dispose();
      this.preview = null;
    }
    if (!speciesId) return;
    const v = new CreatureView(species(speciesId).look, 3);
    v.root.position.copy(CENTER);
    this.scene.add(v.root);
    this.preview = v;
    void v.appear();
    audio.cry(speciesId);
  }

  // ------------------------------------------------------------------ views

  private show(view: View) {
    this.view = view;
    const inBuilder = view === 'builder';
    for (const v of this.showcase) v.root.visible = !inBuilder;
    this.pedestal!.visible = inBuilder;
    if (!inBuilder) this.setPreview(null);
    this.caption.hidden = !inBuilder;
    this.render();
  }

  private render() {
    const keep = (document.activeElement as HTMLElement | null)?.dataset?.testid;
    const scroller = this.root.querySelector<HTMLElement>('.arena-scroll');
    const scroll = scroller?.scrollTop ?? 0;
    let node: HTMLElement;
    switch (this.view) {
      case 'menu': node = this.menuView(); break;
      case 'names': node = this.namesView(); break;
      case 'online': node = this.onlineView(); break;
      case 'builder': node = this.builderView(); break;
    }
    this.root.replaceChildren(node);
    const sc = this.root.querySelector<HTMLElement>('.arena-scroll');
    if (sc) sc.scrollTop = scroll;
    const again = keep ? this.root.querySelector<HTMLElement>(`[data-testid="${keep}"]`) : null;
    if (again && !(again as HTMLButtonElement).disabled) again.focus({ preventScroll: true });
    else if (!this.curtainUp) focusFirst(this.root);
    this.game.idle = !this.connecting;
    requestAnimationFrame(() => this.layoutCamera());
  }

  // ---- menu

  private menuView(): HTMLElement {
    const mode = (id: ArenaMode, title: string, desc: string, icon: string, go: () => void) =>
      abtn([h('span', { class: 'arena-mode-icon', 'aria-hidden': 'true' }, icon), h('span', { class: 'arena-mode-text' }, h('span', { class: 'mname' }, title), h('span', { class: 'mmeta' }, desc))],
        { class: `arena-mode arena-mode-${id}`, 'data-testid': `arena-mode-${id}`, onclick: go });
    const card = h('div', { class: 'arena-card arena-lobby', 'data-testid': 'arena-lobby' },
      h('h1', { class: 'arena-logo' }, 'ARENA'),
      h('p', { class: 'arena-tagline' }, `Lv ${ARENA_LEVEL} · ${ARENA_TEAM_SIZE} vs ${ARENA_TEAM_SIZE} · no items`),
      h('div', { class: 'arena-modes' },
        mode('hotseat', 'Hotseat', '2 players · 1 device', '⇄', () => { this.mode = 'hotseat'; this.show('names'); }),
        mode('cpu', 'vs CPU', 'Face the Arena Ace', '★', () => { this.mode = 'cpu'; this.names = [this.names[0], 'Arena Ace']; this.startBuilder(0); }),
        mode('online', 'Online', 'Battle a friend by room code', '◎', () => { this.mode = 'online'; this.onlineNote = null; this.show('online'); }),
      ),
      abtn('Back to title', { class: 'btn-back arena-wide', 'data-back': true, 'data-testid': 'arena-back', sfx: 'back', onclick: () => void this.game.goto('title') }),
    );
    arrowNav(card);
    return card;
  }

  // ---- hotseat names

  private namesView(): HTMLElement {
    const inputs: [HTMLInputElement, HTMLInputElement] = [0, 1].map((seat) => h('input', {
      class: 'arena-input', type: 'text', maxlength: NAME_MAX, value: this.names[seat as Seat] === 'Arena Ace' ? `Player ${seat + 1}` : this.names[seat as Seat],
      'aria-label': `Player ${seat + 1} name`, 'data-testid': `arena-name-${seat}`, autocomplete: 'off', spellcheck: 'false',
    })) as [HTMLInputElement, HTMLInputElement];
    const go = () => {
      this.names = [cleanName(inputs[0].value, 'Player 1'), cleanName(inputs[1].value, 'Player 2')];
      if (this.names[0] === this.names[1]) this.names[1] = `${this.names[1]} 2`.slice(0, NAME_MAX);
      saveNames(this.names);
      this.startBuilder(0);
    };
    for (const i of inputs) i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    const card = h('div', { class: 'arena-card arena-names' },
      h('h2', {}, 'Hotseat'),
      h('p', { class: 'arena-hint' }, 'Two players share this device. Choices stay secret: hand it over when the curtain says so.'),
      ...([0, 1] as const).map((seat) => h('label', { class: 'arena-field', style: `--seat:${SEAT_COLORS[seat]}` }, h('span', { class: 'arena-field-label' }, `Player ${seat + 1}`), inputs[seat])),
      h('div', { class: 'arena-row' },
        abtn('Back', { class: 'btn-back', 'data-back': true, sfx: 'back', onclick: () => this.show('menu') }),
        abtn('Build teams ▶', { class: 'btn-fight', 'data-testid': 'arena-names-go', onclick: go }),
      ),
    );
    return card;
  }

  // ---- online

  private onlineView(): HTMLElement {
    const nameIn = h('input', { class: 'arena-input', type: 'text', maxlength: NAME_MAX, value: this.names[0], 'aria-label': 'Your name', 'data-testid': 'arena-online-name', autocomplete: 'off', spellcheck: 'false' });
    const codeIn = h('input', {
      class: 'arena-input arena-code-input', type: 'text', maxlength: ROOM_CODE_LENGTH + 2, placeholder: 'CODE', 'aria-label': 'Room code', 'data-testid': 'arena-code-input',
      autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', inputmode: 'text',
    });
    codeIn.addEventListener('input', () => { codeIn.value = normalizeCode(codeIn.value); });
    const myName = () => { const n = cleanName(nameIn.value, 'Player'); this.names = [n, this.names[1]]; saveNames(this.names); return n; };
    const join = () => {
      const code = normalizeCode(codeIn.value);
      if (!isRoomCode(code)) { this.onlineNote = { text: `Room codes are ${ROOM_CODE_LENGTH} letters (no vowels), like BXKT.`, kind: 'error' }; this.render(); return; }
      void this.connectAnd({ t: 'join', v: PROTOCOL_VERSION, code, name: myName() });
    };
    codeIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); join(); } });
    const saved = loadSavedSeat(savedSeatStorage());
    const busy = this.connecting;
    const card = h('div', { class: 'arena-card arena-online', 'data-testid': 'arena-online' },
      h('h2', {}, 'Online battle'),
      h('label', { class: 'arena-field', style: `--seat:${SEAT_COLORS[0]}` }, h('span', { class: 'arena-field-label' }, 'Your name'), nameIn),
      abtn([h('span', { class: 'mname' }, 'Create a room'), h('span', { class: 'mmeta' }, 'Get a code to share with a friend')],
        { class: 'btn-fight arena-wide', 'data-testid': 'arena-create', disabled: busy, onclick: () => void this.connectAnd({ t: 'create', v: PROTOCOL_VERSION, name: myName() }) }),
      h('div', { class: 'arena-or' }, h('span', {}, 'or join one')),
      h('div', { class: 'arena-row' }, codeIn, abtn('Join', { class: 'btn-kin', 'data-testid': 'arena-join', disabled: busy, onclick: join })),
      saved ? abtn(`Rejoin room ${saved.code}`, { class: 'btn-catch arena-wide', 'data-testid': 'arena-rejoin', disabled: busy, onclick: () => void this.connectAnd(null, saved) }) : null,
      this.onlineNote ? h('p', { class: `arena-note ${this.onlineNote.kind}`, role: 'status', 'data-testid': 'arena-online-note' }, this.onlineNote.text) : null,
      busy ? h('p', { class: 'arena-note info' }, h('span', { class: 'arena-spinner' }), 'Connecting…') : null,
      h('p', { class: 'arena-server small' }, `Server: ${serverUrl()}`),
      abtn('Back', { class: 'btn-back arena-wide', 'data-back': true, sfx: 'back', onclick: () => { endOnline(); this.show('menu'); } }),
    );
    return card;
  }

  private async connectAnd(msg: Parameters<ArenaClient['send']>[0] | null, saved?: { code: string; token: string }) {
    if (this.connecting) return;
    this.connecting = true;
    this.onlineNote = null;
    this.render();
    const c = onlineClient();
    this.attachClient(c);
    try {
      if (c.status !== 'open') await c.connect();
      if (saved) c.resume(saved.code, saved.token);
      else if (msg) c.send(msg);
    } catch {
      this.onlineNote = { text: `Can't reach the arena server at ${c.url}. Check your connection, or start one with "npm run server" (see docs/ONLINE.md).`, kind: 'error' };
    }
    this.connecting = false;
    if (this.view === 'online') this.render();
  }

  private attachClient(c: ArenaClient) {
    if (this.client === c) return;
    for (const u of this.unsub) u();
    this.client = c;
    this.unsub = [c.on((m) => this.onMessage(m)), c.onStatus((s) => this.onStatus(s))];
  }

  private onMessage(m: ServerMessage) {
    switch (m.t) {
      case 'start':
        void this.game.goto('arenaBattle', { online: true, events: m.events });
        return;
      case 'room':
        this.onRoom(m.room);
        return;
      case 'error': {
        const text = m.code === 'bad-team' ? `The server refused that team: ${m.message}` : ERROR_TEXT[m.code] ?? m.message;
        audio.sfx('denied');
        if (this.view === 'builder' && this.b) {
          this.b.locked = false;
          this.b.note = { text, kind: 'error' };
        } else {
          this.onlineNote = { text, kind: 'error' };
        }
        this.render();
        return;
      }
      case 'closed':
        return;
      default:
    }
  }

  private onStatus(s: NetStatus) {
    if (s === 'failed' && this.mode === 'online') {
      this.onlineNote = { text: 'Lost the connection to the arena server.', kind: 'error' };
      this.b = null;
      this.show('online');
    } else if (this.view === 'builder') {
      this.render();
    }
  }

  private onRoom(room: RoomView) {
    if (room.phase === 'battle') { void this.game.goto('arenaBattle', { online: true }); return; }
    if (room.phase === 'over') { void this.game.goto('arenaBattle', { online: true }); return; }
    // Lobby: build (or keep building) our team.
    const me = room.players[room.you];
    if (this.view !== 'builder' || !this.b || this.b.mode !== 'online') {
      this.mode = 'online';
      this.names = [me?.name ?? this.names[0], this.names[1]];
      this.startBuilder(room.you, room.yourTeam ?? undefined);
      if (me?.ready && this.b) this.b.locked = true;
      this.render();
      return;
    }
    this.b.locked = !!me?.ready;
    this.render();
  }

  // ---- builder

  private startBuilder(seat: Seat, prefill?: ArenaEntry[]) {
    this.b = { mode: this.mode, seat, team: prefill ? structuredClone(prefill) : [], selected: prefill?.length ? 0 : -1, tab: 'rental', note: null, locked: false };
    this.show('builder');
    this.setPreview(this.b.team[0]?.species ?? null);
  }

  private picks(): Pick[] {
    return this.b!.tab === 'rental' ? rentalPicks() : ownedPicks(this.collection.party, this.collection.box);
  }

  private update_(fn: (b: Builder) => void) {
    fn(this.b!);
    this.render();
  }

  private builderView(): HTMLElement {
    const b = this.b!;
    const online = b.mode === 'online';
    const room = online ? this.client?.room ?? null : null;
    const who = online ? (room?.players[room.you]?.name ?? this.names[0]) : this.names[b.seat];
    const problems = teamProblems(b.team);
    const sel = b.team[b.selected];
    this.setPreview(sel?.species ?? b.team[b.team.length - 1]?.species ?? null);
    this.updateCaption(sel ?? null);

    // Header
    const head = h('div', { class: 'arena-bhead' },
      h('div', { class: 'arena-bhead-main' },
        seatTag(b.seat, who),
        h('h2', {}, b.locked ? 'Team locked in' : 'Build your team'),
      ),
      online && room ? h('div', { class: 'arena-roomcode', 'data-testid': 'arena-room-code', title: 'Share this code' }, h('span', { class: 'small' }, 'ROOM'), room.code) : null,
    );
    const rules = h('div', { class: 'arena-rules' },
      h('span', { class: 'arena-rule arena-rule-lv' }, `Every kin fights at Lv ${ARENA_LEVEL}`),
      h('span', { class: 'arena-rule' }, `${ARENA_TEAM_SIZE} kin, all different`),
      h('span', { class: 'arena-rule' }, '1–4 moves each'),
      h('span', { class: 'arena-rule' }, 'No items'),
    );

    // Opponent status (online)
    let opp: HTMLElement | null = null;
    if (online && room) {
      const o = room.players[room.you === 0 ? 1 : 0];
      const status = this.client?.status;
      const text = status === 'reconnecting' ? 'Reconnecting to the server…'
        : !o ? `Waiting for a friend to join with code ${room.code}…`
          : !o.connected ? `${o.name} is reconnecting…`
            : o.ready ? `${o.name} is ready!` : `${o.name} joined — building a team…`;
      opp = h('p', { class: `arena-note ${o?.ready ? 'good' : 'info'}`, 'data-testid': 'arena-opp-status' }, !o || !o.ready ? h('span', { class: 'arena-spinner' }) : null, text);
    }

    // Slots
    const slots = h('div', { class: 'arena-slots', role: 'list' },
      ...Array.from({ length: ARENA_TEAM_SIZE }, (_, i) => {
        const e = b.team[i];
        if (!e) return h('div', { class: 'arena-slot empty', role: 'listitem', 'data-testid': `slot-${i}` }, h('span', { class: 'arena-slot-plus' }, '+'), h('span', { class: 'small' }, i === 0 ? 'Lead' : `Slot ${i + 1}`));
        const sp = species(e.species);
        return abtn([
          i === 0 ? h('span', { class: 'arena-lead' }, 'LEAD') : null,
          h('span', { class: 'mname' }, displayName(e)),
          h('span', { class: 'chips' }, ...sp.types.map(typeChip)),
          h('span', { class: 'mmeta' }, `${e.moves.length} move${e.moves.length === 1 ? '' : 's'}`),
        ], {
          class: `arena-slot${b.selected === i ? ' selected' : ''}`, role: 'listitem', 'data-testid': `slot-${i}`, disabled: b.locked,
          style: `--c:${TYPE_COLORS[sp.types[0]!]}`, 'aria-pressed': b.selected === i ? 'true' : 'false',
          onclick: () => this.update_((x) => { x.selected = i; x.note = null; }),
        });
      }));
    const slotActions = sel && !b.locked ? h('div', { class: 'arena-slot-actions' },
      abtn('◀ Earlier', { class: 'btn-back', 'data-testid': 'slot-left', disabled: b.selected === 0, onclick: () => this.update_((x) => { x.team = moveSlot(x.team, x.selected, x.selected - 1); x.selected--; }) }),
      abtn('Later ▶', { class: 'btn-back', 'data-testid': 'slot-right', disabled: b.selected >= b.team.length - 1, onclick: () => this.update_((x) => { x.team = moveSlot(x.team, x.selected, x.selected + 1); x.selected++; }) }),
      abtn('Make lead', { class: 'btn-catch', 'data-testid': 'slot-lead', disabled: b.selected === 0, onclick: () => this.update_((x) => { x.team = moveSlot(x.team, x.selected, 0); x.selected = 0; }) }),
      abtn('Remove', { class: 'btn-fight', 'data-testid': 'slot-remove', sfx: 'back', onclick: () => this.update_((x) => { x.team = removeFromTeam(x.team, x.selected); x.selected = Math.min(x.selected, x.team.length - 1); }) }),
    ) : null;

    // Selected kin: stats + moves
    let detail: HTMLElement | null = null;
    if (sel) {
      const sp = species(sel.species);
      const st = arenaStats(sel.species);
      const learn = learnableMoves(sel.species, ARENA_LEVEL);
      detail = h('div', { class: 'arena-detail', 'data-testid': 'arena-detail' },
        h('div', { class: 'arena-detail-head' },
          h('span', { class: 'mname' }, displayName(sel)), h('span', { class: 'chips' }, ...sp.types.map(typeChip)), h('span', { class: 'arena-lv' }, `Lv ${ARENA_LEVEL}`)),
        h('div', { class: 'arena-stats' }, ...STAT_LABELS.map(([k, label]) => h('div', { class: 'arena-stat' },
          h('span', { class: 'arena-stat-k' }, label), h('span', { class: 'arena-stat-bar' }, h('span', { style: `width:${Math.min(100, (st[k] / (k === 'hp' ? 130 : 100)) * 100)}%` })), h('span', { class: 'arena-stat-v' }, String(st[k]))))),
        h('div', { class: 'arena-moves-head' }, h('span', {}, `Moves ${sel.moves.length}/4`), h('span', { class: 'small' }, b.locked ? '' : 'Tap to add or drop')),
        h('div', { class: 'arena-moves' }, ...learn.map((id) => {
          const m = getMove(id);
          const on = sel.moves.includes(id);
          return abtn([
            h('span', { class: 'mname' }, `${on ? '✓ ' : ''}${m.name}`),
            h('span', { class: 'mmeta' }, `${m.type} · ${m.category === 'attack' ? `Pow ${m.power}` : 'Status'} · Acc ${m.accuracy}% · PP ${m.pp}`),
          ], {
            class: `arena-moveopt${on ? ' on' : ''}`, style: `--c:${TYPE_COLORS[m.type]}`, title: m.blurb, 'data-testid': `moveopt-${id}`, 'aria-pressed': on ? 'true' : 'false', disabled: b.locked,
            onclick: () => this.update_((x) => {
              const r = toggleMove(x.team[x.selected]!, id);
              x.team = setMoves(x.team, x.selected, r.moves);
              x.note = r.error ? { text: r.error, kind: 'error' } : null;
              if (r.error) audio.sfx('denied');
            }),
          });
        })),
      );
    }

    // Picks
    const owned = ownedPicks(this.collection.party, this.collection.box);
    const tabs = h('div', { class: 'arena-tabs', role: 'tablist' },
      abtn(`Rentals (${RENTALS.length})`, { class: `tab${b.tab === 'rental' ? ' on' : ''}`, role: 'tab', 'aria-selected': b.tab === 'rental' ? 'true' : 'false', 'data-testid': 'tab-rental', onclick: () => this.update_((x) => { x.tab = 'rental'; }) }),
      abtn(`My kin (${owned.length})`, { class: `tab${b.tab === 'owned' ? ' on' : ''}`, role: 'tab', 'aria-selected': b.tab === 'owned' ? 'true' : 'false', 'data-testid': 'tab-owned', onclick: () => this.update_((x) => { x.tab = 'owned'; }) }),
      abtn('🎲 Random', { class: 'tab arena-random', 'data-testid': 'arena-random', disabled: b.locked, title: 'Fill the team with random rentals', onclick: () => this.update_((x) => {
        x.team = randomRentalTeam(hashSeed(this.seed, b.seat, ++this.randomCount));
        x.selected = 0;
        x.note = { text: 'Random rental team ready — tweak it or lock it in!', kind: 'info' };
      }) }),
    );
    const list = this.picks();
    const picks = list.length === 0
      ? h('p', { class: 'arena-empty' }, 'No kin in your collection yet — befriend some on your adventure, or use rentals!')
      : h('div', { class: 'arena-picks' }, ...list.map((pk) => {
        const sp = species(pk.entry.species);
        const inTeam = b.team.findIndex((e) => e.uid === pk.entry.uid);
        return abtn([
          h('span', { class: 'mname' }, `${inTeam >= 0 ? '✓ ' : ''}${displayName(pk.entry)}`),
          h('span', { class: 'chips' }, ...sp.types.map(typeChip)),
          pk.ownedLevel !== undefined ? h('span', { class: 'mmeta' }, pk.ownedLevel === ARENA_LEVEL ? `Lv ${ARENA_LEVEL}` : `Lv ${pk.ownedLevel} → ${ARENA_LEVEL}`) : null,
        ], {
          class: `arena-pick${inTeam >= 0 ? ' in' : ''}`, style: `--c:${TYPE_COLORS[sp.types[0]!]}`, 'data-testid': `pick-${pk.key}`, disabled: b.locked,
          'aria-pressed': inTeam >= 0 ? 'true' : 'false', title: sp.blurb,
          onclick: () => this.update_((x) => {
            const r = addToTeam(x.team, pk);
            if (r.error) {
              x.note = { text: r.error, kind: 'error' };
              audio.sfx('denied');
              this.setPreview(pk.entry.species);
              return;
            }
            x.team = r.team;
            x.selected = r.index;
            x.note = null;
          }),
        });
      }));

    // Footer
    const ready = problems.length === 0;
    const note = b.note ?? (b.locked ? null : ready ? { text: `Ready! ${displayName(b.team[0]!)} leads.`, kind: 'info' as const } : { text: problems[0]!, kind: 'info' as const });
    const lockLabel = b.locked ? 'Locked ✓' : b.mode === 'hotseat' && b.seat === 0 ? 'Lock in ▶' : 'Lock in & battle ▶';
    const foot = h('div', { class: 'arena-bfoot' },
      note ? h('p', { class: `arena-note ${note.kind}`, role: 'status', 'data-testid': 'arena-note' }, note.text) : null,
      opp,
      h('div', { class: 'arena-row' },
        abtn(b.locked ? 'Edit team' : 'Back', {
          class: 'btn-back', 'data-back': true, sfx: 'back', 'data-testid': 'arena-builder-back',
          onclick: () => this.builderBack(),
        }),
        abtn(lockLabel, { class: 'btn-fight arena-lock', 'data-testid': 'arena-lockin', disabled: !ready || b.locked, onclick: () => this.lockIn() }),
      ),
    );

    const panel = h('div', { class: `arena-card arena-builder seat-${b.seat}`, 'data-testid': `arena-builder-${b.seat}`, style: `--seat:${SEAT_COLORS[b.seat]}` },
      h('div', { class: 'arena-scroll' }, head, rules, slots, slotActions, detail, tabs, picks),
      foot,
    );
    arrowNav(panel);
    return panel;
  }

  private updateCaption(e: ArenaEntry | null) {
    if (!e) { this.caption.replaceChildren(h('span', { class: 'arena-cap-hint' }, 'Pick kin from the list')); return; }
    const sp = species(e.species);
    this.caption.replaceChildren(
      h('span', { class: 'arena-cap-name' }, displayName(e)),
      h('span', { class: 'chips' }, ...sp.types.map(typeChip)),
      h('span', { class: 'arena-cap-blurb' }, sp.blurb),
    );
  }

  private builderBack() {
    const b = this.b!;
    if (b.mode === 'online') {
      if (b.locked) {
        // Unlock locally; the server keeps the old team until we lock in again.
        this.update_((x) => { x.locked = false; x.note = { text: 'Editing — lock in again when you are done.', kind: 'info' }; });
        return;
      }
      endOnline();
      this.client = null;
      for (const u of this.unsub) u();
      this.unsub = [];
      this.b = null;
      this.onlineNote = { text: 'You left the room.', kind: 'info' };
      this.show('online');
      return;
    }
    if (b.mode === 'hotseat' && b.seat === 1 && this.locked[0]) {
      const t = this.locked[0];
      this.locked[0] = null;
      this.startBuilder(0, t);
      return;
    }
    this.b = null;
    this.locked = [null, null];
    this.show(this.mode === 'hotseat' ? 'names' : 'menu');
  }

  private async lockIn() {
    const b = this.b!;
    if (teamProblems(b.team).length) return;
    const team = structuredClone(b.team);
    if (b.mode === 'online') {
      if (!this.client?.send({ t: 'team', team })) {
        this.update_((x) => { x.note = { text: 'Not connected — trying to reconnect…', kind: 'error' }; });
        this.client?.retryNow();
        return;
      }
      this.update_((x) => { x.locked = true; x.note = { text: 'Team locked in!', kind: 'info' }; });
      return;
    }
    this.locked[b.seat] = team;
    if (b.mode === 'cpu') {
      const cpuTeam = randomRentalTeam(hashSeed(this.seed, 0xc0, this.randomCount++), team.map((e) => e.species));
      this.startMatch([team, cpuTeam]);
      return;
    }
    if (b.seat === 0) {
      this.curtainUp = true;
      this.root.replaceChildren();
      this.caption.hidden = true;
      this.setPreview(null);
      this.game.idle = true;
      const c = curtain(this.ui, {
        title: `Pass to ${this.names[1]}`, seat: 1,
        subtitle: `${this.names[0]}'s team is locked in. ${this.names[1]}, build your team — ${this.names[0]}, no peeking!`,
        button: `I'm ${this.names[1]} — build my team`,
      });
      await c.done;
      this.curtainUp = false;
      this.startBuilder(1, this.previous?.[1]);
      return;
    }
    this.startMatch([this.locked[0]!, team]);
  }

  private startMatch(teams: [ArenaEntry[], ArenaEntry[]]) {
    const setup: LocalMatchSetup = {
      mode: this.mode as 'hotseat' | 'cpu',
      names: this.mode === 'cpu' ? [this.names[0] === 'Player 1' ? 'You' : this.names[0], 'Arena Ace'] : this.names,
      teams,
      seed: hashSeed(this.seed, 0xba771e, ++matchCounter),
      round: 1,
    };
    void this.game.goto('arenaBattle', { setup });
  }

  /** Test hook. */
  arenaSnapshot() {
    return {
      scene: 'arena', view: this.view, mode: this.mode, curtain: this.curtainUp,
      seat: this.b?.seat ?? null, team: this.b?.team ?? null, locked: this.b?.locked ?? false,
      room: this.client?.room ? { code: this.client.room.code, phase: this.client.room.phase, you: this.client.room.you } : null,
      net: this.client?.status ?? null,
    };
  }
}
