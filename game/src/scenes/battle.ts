// Battle scene: renders the diorama and plays back the engine's event log. It never
// computes outcomes — it only submits actions to resolveTurn and animates the events.
import * as THREE from 'three';
import { BaseScene } from './base';
import { CreatureView } from '../render/creature';
import { addLights, backdrop, makeSky, platform } from '../render/diorama';
import { ORB_COLORS, burst, makeOrb } from '../render/fx';
import { animClock, ease, tween, wait } from '../render/anim';
import { arrowNav, focusFirst, h, hpBar, setHp, typeChip, TYPE_COLORS } from '../ui/dom';
import {
  ORBS, active, catchProbability, chooseAction, legalActions, move as getMove, needsReplacement, resolveTurn, species,
  type Action, type BattleEvent, type BattleState, type OrbId, type StageKey, type StatusId,
} from '../engine';
import { applyBattleResult, healParty, startWildBattle, useOrb } from '../game/state';
import type { Theme } from '../render/diorama';

const STAT_NAMES: Record<StageKey, string> = { atk: 'Attack', def: 'Defense', spe: 'Speed' };
const STATUS_TEXT: Record<StatusId, [string, string, string]> = {
  burn: ['BRN', 'was burned!', '#ff6a3d'],
  shock: ['SHK', 'is shocked! It may be unable to move.', '#f2c230'],
  drowsy: ['DRW', 'became drowsy and fell asleep!', '#b98cff'],
};

interface Panel { root: HTMLElement; name: HTMLElement; level: HTMLElement; bar: HTMLElement; nums?: HTMLElement; badge: HTMLElement; types: HTMLElement }

export class BattleScene extends BaseScene {
  readonly name = 'battle' as const;
  private state!: BattleState;
  private routeId = 'meadow';
  private views: [CreatureView | null, CreatureView | null] = [null, null];
  private spots = [new THREE.Vector3(-1.7, 0, 1.3), new THREE.Vector3(1.75, 0, -1.9)] as const;
  private panels!: [Panel, Panel];
  private text!: HTMLElement;
  private menu!: HTMLElement;
  private advance: (() => void) | null = null;
  private introDone = false;

  enter(params: Record<string, unknown>) {
    this.routeId = String(params.route ?? 'meadow');
    const hotspot = String(params.hotspot ?? 'tall-grass');
    const g = this.game;
    if (g.player.party.length === 0) g.debugParty();
    if (!g.player.party.some((c) => c.hp > 0)) g.player = healParty(g.player);
    const setup = startWildBattle(g.player, this.routeId, hotspot);
    g.player = setup.player;
    this.state = setup.battle;

    const theme = (g.dex().routes.get(this.routeId)?.theme ?? 'meadow') as Theme;
    this.scene.add(makeSky(theme));
    addLights(this.scene, theme);
    this.scene.fog = new THREE.Fog(new THREE.Color(theme === 'ridge' ? '#ffd2a8' : '#d9f2ff'), 18, 45);
    this.scene.add(backdrop(theme, 11));
    const p0 = platform(theme === 'coast' ? '#e9cf86' : theme === 'ridge' ? '#c79560' : '#8fdc6a', 1.25);
    p0.position.copy(this.spots[0]);
    const p1 = platform(theme === 'coast' ? '#e9cf86' : theme === 'ridge' ? '#c79560' : '#8fdc6a', 1.15);
    p1.position.copy(this.spots[1]);
    this.scene.add(p0, p1);

    this.resize(g.renderer.width, g.renderer.height);
    this.buildUi();
    void this.intro(setup.events);
  }

  override resize(w: number, hgt: number) {
    const aspect = w / hgt;
    const cam = this.camera;
    cam.aspect = aspect;
    cam.fov = 38;
    const target = new THREE.Vector3(0.05, 0.55, -0.3);
    const halfWidth = aspect < 1 ? 2.75 : 3.6;
    const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const dist = Math.max(7.2, halfWidth / (tanV * aspect));
    if (this.scene.fog instanceof THREE.Fog) { this.scene.fog.near = dist + 8; this.scene.fog.far = dist + 32; }
    const dir = new THREE.Vector3(-0.28, 0.34, 1).normalize();
    cam.position.copy(target).addScaledVector(dir, dist);
    cam.lookAt(target);
    // Shift the view up so the creatures sit above the bottom UI.
    const shift = aspect < 1 ? 0.14 : 0.1;
    cam.setViewOffset(w, hgt, 0, hgt * shift, w, hgt);
    cam.updateProjectionMatrix();
  }

  override update(_dt: number, t: number) {
    this.views.forEach((v) => v?.update(t));
  }

  // ------------------------------------------------------------------ UI

  private buildUi() {
    const panel = (mine: boolean): Panel => {
      const name = h('span', { class: 'pname' });
      const level = h('span', { class: 'plevel' });
      const badge = h('span', { class: 'badge', hidden: true });
      const types = h('span', { class: 'ptypes' });
      const bar = hpBar(1, 1);
      const nums = mine ? h('div', { class: 'hpnums' }) : undefined;
      const root = h('div', { class: `panel ${mine ? 'panel-mine' : 'panel-foe'}`, 'data-testid': mine ? 'panel-mine' : 'panel-foe' },
        h('div', { class: 'prow' }, name, badge, level), h('div', { class: 'prow' }, types, h('span', { class: 'hplabel' }, 'HP'), bar), nums);
      root.style.visibility = 'hidden';
      return { root, name, level, bar, badge, types, ...(nums ? { nums } : {}) };
    };
    this.panels = [panel(true), panel(false)];
    this.text = h('div', { class: 'text', 'data-testid': 'battle-text', 'aria-live': 'polite' });
    this.menu = h('div', { class: 'menu' });
    arrowNav(this.menu);
    const box = h('div', { class: 'battle-bottom' }, this.panels[0].root, h('div', { class: 'textbox', onclick: () => this.advance?.() }, this.text), this.menu);
    this.ui.append(h('div', { class: 'battle-ui' }, this.panels[1].root, box));
    this.ui.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ' || e.key === 'z') && this.advance) { e.preventDefault(); this.advance(); }
    });
    window.addEventListener('keydown', this.globalKeys);
  }

  private globalKeys = (e: KeyboardEvent) => {
    if (this.advance && (e.key === 'Enter' || e.key === ' ' || e.key === 'z')) { e.preventDefault(); this.advance(); }
    if (e.key === 'Escape' || e.key === 'x') this.menu.querySelector<HTMLButtonElement>('[data-back]')?.click();
  };

  override exit() {
    window.removeEventListener('keydown', this.globalKeys);
    super.exit();
  }

  private setPanel(side: 0 | 1, ev: Extract<BattleEvent, { t: 'send' }>) {
    const p = this.panels[side];
    p.root.style.visibility = 'visible';
    p.name.textContent = ev.name;
    p.level.textContent = `Lv${ev.level}`;
    p.types.replaceChildren(...species(ev.species).types.map(typeChip));
    this.setStatus(side, ev.status);
    this.setHpUi(side, ev.hp, ev.maxHp);
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
    }
  }

  private async tweenHp(side: 0 | 1, from: number, to: number, max: number) {
    await tween(Math.min(700, 120 + Math.abs(from - to) * 25), (k) => this.setHpUi(side, from + (to - from) * ease.outCubic(k), max));
  }

  /** Show a line of text; resolves after a short hold or when the player taps / presses a key. */
  private say(msg: string, hold = 700): Promise<void> {
    this.text.textContent = msg;
    this.menu.replaceChildren();
    if (animClock.instant) return Promise.resolve();
    return new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; this.advance = null; resolve(); } };
      this.advance = finish;
      void wait(hold + msg.length * 18).then(finish);
    });
  }

  private label(side: 0 | 1, name: string) {
    if (side === 0) return name;
    return this.state.sides[1].isWild ? `Wild ${name}` : `Foe ${name}`;
  }

  // ------------------------------------------------------------------ flow

  private async intro(events: BattleEvent[]) {
    await this.play(events);
    this.introDone = true;
    this.prompt();
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
    const legal = legalActions(this.state, 0);
    const canCatch = legal.some((a) => a.type === 'catch');
    const canRun = legal.some((a) => a.type === 'run');
    this.setMenu('main', [
      h('button', { class: 'btn btn-fight', 'data-testid': 'btn-fight', onclick: () => this.showMoves() }, 'Fight'),
      h('button', { class: 'btn btn-catch', 'data-testid': 'btn-catch', disabled: !canCatch, onclick: () => this.showOrbs() }, 'Catch'),
      h('button', { class: 'btn btn-kin', 'data-testid': 'btn-kin', onclick: () => this.showParty(false) }, 'Kin'),
      h('button', { class: 'btn btn-run', 'data-testid': 'btn-run', disabled: !canRun, onclick: () => this.submit({ type: 'run' }) }, 'Run'),
    ]);
  }

  private setMenu(kind: string, buttons: HTMLElement[], back = false) {
    this.menu.className = `menu menu-${kind}`;
    this.menu.replaceChildren(...buttons);
    if (back) this.menu.append(h('button', { class: 'btn btn-back', 'data-back': true, 'data-testid': 'btn-back', onclick: () => this.showMain() }, 'Back'));
    this.game.idle = true;
    focusFirst(this.menu);
  }

  private showMoves() {
    const me = active(this.state, 0);
    const legal = legalActions(this.state, 0);
    if (legal.some((a) => a.type === 'move' && a.index === -1)) {
      void this.submit({ type: 'move', index: -1 });
      return;
    }
    this.setMenu('moves', me.moves.map((m, i) => {
      const data = getMove(m.id);
      return h('button', {
        class: 'btn btn-move', style: `--c:${TYPE_COLORS[data.type]}`, 'data-testid': `move-${i}`, disabled: m.pp <= 0,
        title: data.blurb, onclick: () => this.submit({ type: 'move', index: i }),
      }, h('span', { class: 'mname' }, data.name), h('span', { class: 'mmeta' }, `${data.type} · ${data.category === 'attack' ? `Pow ${data.power}` : 'Status'} · PP ${m.pp}/${m.maxPp}`));
    }), true);
    this.text.textContent = 'Choose a move.';
  }

  private showOrbs() {
    const foe = active(this.state, 1);
    const sp = species(foe.species);
    this.text.textContent = `Throw an orb at the ${this.label(1, foe.name)}?`;
    this.setMenu('orbs', (Object.keys(ORBS) as OrbId[]).map((id) => {
      const p = catchProbability(foe.stats.hp, foe.hp, sp.catchRate, ORBS[id].bonus, foe.status);
      const have = this.game.player.bag[id] ?? 0;
      return h('button', {
        class: 'btn btn-orb', style: `--c:${ORB_COLORS[id]}`, 'data-testid': `orb-${id}`, disabled: have <= 0,
        onclick: () => this.submit({ type: 'catch', orb: id }),
      }, h('span', { class: 'mname' }, `${ORBS[id].name} ×${have}`), h('span', { class: 'mmeta' }, `≈ ${Math.round(p * 100)}% catch`));
    }), true);
  }

  private showParty(forced: boolean) {
    const s = this.state;
    const side = s.sides[0];
    this.text.textContent = forced ? 'Choose your next kin.' : 'Switch to which kin?';
    const legal = legalActions(s, 0);
    this.setMenu('party', side.party.map((c, i) => {
      const ok = legal.some((a) => a.type === 'switch' && a.to === i);
      return h('button', { class: 'btn btn-kinpick', 'data-testid': `kin-${i}`, disabled: !ok, onclick: () => this.submit({ type: 'switch', to: i }) },
        h('span', { class: 'mname' }, `${c.name} Lv${c.level}`), h('span', { class: 'mmeta' }, i === side.active && c.hp > 0 ? 'In battle' : `HP ${c.hp}/${c.stats.hp}`));
    }), !forced);
  }

  private busyGuard = false;

  async submit(action: Action) {
    if (this.busyGuard || !this.introDone) return;
    this.busyGuard = true;
    this.game.idle = false;
    this.menu.replaceChildren();
    if (action.type === 'catch') this.game.player = useOrb(this.game.player, action.orb);
    const foe = chooseAction(this.state, 1, this.state.sides[1].ai ?? 'rookie');
    const r = resolveTurn(this.state, [action, foe]);
    this.state = r.state;
    await this.play(r.events);
    this.busyGuard = false;
    this.prompt();
  }

  private async play(events: BattleEvent[]) {
    for (const e of events) await this.playOne(e);
  }

  private async playOne(e: BattleEvent) {
    const v = (side: 0 | 1) => this.views[side];
    switch (e.t) {
      case 'turn': return;
      case 'send': {
        const old = this.views[e.side];
        if (old) { this.scene.remove(old.root); old.mesh.geometry.dispose(); old.material.dispose(); }
        const view = new CreatureView(species(e.species).look, e.side);
        view.root.position.copy(this.spots[e.side]);
        view.faceTowards(e.side === 0 ? this.spots[1] : this.spots[0].clone().add(new THREE.Vector3(2, 0, 3)));
        this.scene.add(view.root);
        this.views[e.side] = view;
        this.setPanel(e.side, e);
        const appear = view.appear();
        if (e.side === 1 && this.state.sides[1].isWild && !this.introDone) await this.say(`A wild ${e.name} appeared!`);
        else if (e.side === 1) await this.say(`Foe sent out ${e.name}!`);
        else await this.say(`Go, ${e.name}!`, 400);
        await appear;
        return;
      }
      case 'move': {
        await this.say(`${this.label(e.side, e.name)} used ${e.moveName}!`, 250);
        const data = getMove(e.move);
        const me = v(e.side);
        if (data.category === 'attack') await me?.lunge(this.spots[e.side === 0 ? 1 : 0]);
        else await me?.pulse(TYPE_COLORS[data.type]!);
        return;
      }
      case 'miss': return this.say(`But ${this.label(e.side, e.name)}'s attack missed!`);
      case 'damage': {
        const target = v(e.side);
        const from = e.hp + e.amount;
        if (e.source === 'move') {
          void burst(this.scene, this.spots[e.side].clone().add(new THREE.Vector3(0, 0.6, 0)), e.mult > 1 ? '#fff27a' : '#ffffff', e.mult > 1 ? 1.4 : 1);
          await Promise.all([target?.hit(e.mult > 1 || e.crit), this.tweenHp(e.side, from, e.hp, e.maxHp)]);
          if (e.crit) await this.say('A critical hit!', 400);
          if (e.mult > 1) await this.say("It's super effective!", 450);
          else if (e.mult < 1) await this.say("It's not very effective…", 450);
        } else {
          await Promise.all([target?.pulse(e.source === 'burn' ? '#ff6a3d' : '#ffffff'), this.tweenHp(e.side, from, e.hp, e.maxHp)]);
          await this.say(e.source === 'burn' ? `${this.label(e.side, e.name)} is hurt by its burn!` : `${this.label(e.side, e.name)} is hit with recoil!`, 350);
        }
        return;
      }
      case 'heal': {
        await Promise.all([v(e.side)?.pulse('#7dff8a'), this.tweenHp(e.side, e.hp - e.amount, e.hp, e.maxHp)]);
        return this.say(`${this.label(e.side, e.name)} recovered some HP!`, 400);
      }
      case 'status': {
        this.setStatus(e.side, e.status);
        await v(e.side)?.pulse(STATUS_TEXT[e.status][2]);
        return this.say(`${this.label(e.side, e.name)} ${STATUS_TEXT[e.status][1]}`);
      }
      case 'statusFail': return this.say('But it failed!', 400);
      case 'stage': {
        const n = STAT_NAMES[e.stat];
        if (e.capped) return this.say(`${this.label(e.side, e.name)}'s ${n} won't go any ${e.value > 0 ? 'higher' : 'lower'}!`);
        await v(e.side)?.pulse(e.delta > 0 ? '#7ad0ff' : '#ff7a9a');
        const amt = Math.abs(e.delta) >= 2 ? (e.delta > 0 ? 'sharply rose' : 'harshly fell') : e.delta > 0 ? 'rose' : 'fell';
        return this.say(`${this.label(e.side, e.name)}'s ${n} ${amt}!`, 450);
      }
      case 'cantMove': return this.say(e.reason === 'asleep' ? `${this.label(e.side, e.name)} is fast asleep.` : `${this.label(e.side, e.name)} is shocked and can't move!`);
      case 'wake': this.setStatus(e.side, null); return this.say(`${this.label(e.side, e.name)} woke up!`, 400);
      case 'faint': {
        await v(e.side)?.faint();
        this.panels[e.side].root.style.visibility = e.side === 1 ? 'hidden' : 'visible';
        return this.say(`${this.label(e.side, e.name)} fainted!`);
      }
      case 'catch': return this.playCatch(e);
      case 'run': return this.say(e.success ? 'Got away safely!' : "Couldn't get away!");
      case 'forfeit': return this.say('The battle was forfeited.');
      case 'needReplace': return;
      case 'end': {
        if (e.reason === 'ko' && e.winner === 0) return this.say(`You defeated the ${this.label(1, active(this.state, 1).name)}!`);
        if (e.reason === 'ko' && e.winner !== 0) return this.say('You have no kin left that can fight…');
        return;
      }
    }
  }

  private async playCatch(e: Extract<BattleEvent, { t: 'catch' }>) {
    await this.say(`You threw a ${ORBS[e.orb].name}!`, 200);
    const orb = makeOrb(ORB_COLORS[e.orb]);
    const from = this.spots[0].clone().add(new THREE.Vector3(0.3, 1.0, 0.2));
    const target = this.spots[1].clone().add(new THREE.Vector3(0, 0.75, 0.35));
    const ground = this.spots[1].clone().add(new THREE.Vector3(0, 0.22, 0.35));
    orb.position.copy(from);
    this.scene.add(orb);
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
    await tween(260, (k) => {
      orb.position.lerpVectors(target, ground, ease.inCubic(k));
      orb.rotation.x = 0;
    });
    await tween(140, (k) => { orb.position.y = ground.y + Math.sin(k * Math.PI) * 0.18; });
    // Shakes.
    for (let i = 0; i < e.shakes; i++) {
      await wait(260);
      await tween(380, (k) => { orb.rotation.z = Math.sin(k * Math.PI * 2) * 0.45; });
      this.text.textContent = `${'• '.repeat(i + 1).trim()}`;
    }
    await wait(300);
    if (e.caught) {
      await tween(200, (k) => (orb.material as THREE.MeshLambertMaterial).emissive.setScalar(0.6 * (1 - k)));
      void burst(this.scene, ground.clone().add(new THREE.Vector3(0, 0.2, 0)), '#ffe14d', 1.2, 10);
      this.panels[1].root.style.visibility = 'hidden';
      await this.say(`Gotcha! ${e.name} was caught!`, 900);
    } else {
      void burst(this.scene, ground, '#ffffff', 1);
      this.scene.remove(orb);
      if (foe) {
        foe.reset();
        await foe.appear();
      }
      const lines = ['Oh no! It broke free!', 'Argh! Almost had it!', 'Gah! So close!'];
      await this.say(lines[Math.min(2, e.shakes)]!);
    }
    if (!e.caught) { orb.geometry.dispose(); (orb.material as THREE.Material).dispose(); }
  }

  private async finish() {
    const g = this.game;
    const before = g.player;
    const res = applyBattleResult(before, this.state);
    g.player = res.player;
    const o = this.state.outcome!;
    if (o.reason === 'caught') {
      const c = active(this.state, 1);
      await this.say(res.caughtInto === 'box' ? `${c.name} was sent to your storage box.` : `${c.name} joined your party!`, 700);
    }
    if (o.reason === 'ko' && o.winner !== 0) {
      g.player = healParty(g.player);
      await this.say('You hurried back to the spring to rest. Your kin are healed.', 900);
    }
    this.text.textContent = o.reason === 'caught' ? 'Nice catch!' : 'The meadow grows quiet.';
    this.setMenu('end', [
      h('button', { class: 'btn btn-fight', 'data-testid': 'btn-continue', onclick: () => void g.goto('route', { route: this.routeId }) }, 'Continue'),
      h('button', { class: 'btn btn-kin', 'data-testid': 'btn-view-party', onclick: () => void g.goto('party', { from: 'route', route: this.routeId }) }, 'View party'),
    ]);
  }

  /** Test hook: the visible battle state. */
  snapshot() {
    return this.state;
  }
}
