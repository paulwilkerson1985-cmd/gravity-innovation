import * as THREE from 'three';
import { BaseScene } from './base';
import { CreatureView } from '../render/creature';
import { addLights, backdrop, makeSky, platform } from '../render/diorama';
import { h, focusFirst, confirmDialog, toast, TYPE_COLORS } from '../ui/dom';
import { boxPoints, fitPoints, freeArea, layoutMode } from './framing';
import { icon } from '../ui/icons';
import { openSettings } from '../ui/settings';
import { audio } from '../audio/audio';
import { species } from '../engine';
import { formatPlayTime } from '../game/state';
import { loadSavedSeat } from '../net/client';
import { savedSeatStorage } from '../net/session';
import { SaveError, parseSave, pickSaveFile, summarize, type SaveSummary } from '../game/save';
import type { SavePeek } from '../game/game';
import { hd2dRequested } from '../render/hd2d/pipeline';
import { buildTitleSet } from '../render/hd2d/screens/meadowScreens';
import { Hd2dScreenStage } from './hd2dScreen';

export class TitleScene extends BaseScene {
  readonly name = 'title' as const;
  private views: CreatureView[] = [];
  private stands: THREE.Object3D[] = [];
  private slot!: HTMLElement;
  private peek: SavePeek | undefined;
  private peeking: Promise<SavePeek> | null = null;
  private busy = false;
  /** HD-2D staging (`?gfx=hd2d`): the golden-hour flower field, else null. */
  private hd2d: Hd2dScreenStage | null = null;
  private keyHandler = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.repeat && document.activeElement === document.body && !document.querySelector('.modal-root')) {
      if (this.peek && 'summary' in this.peek) void this.continue(); else void this.start();
    }
  };

  enter() {
    audio.music('title');
    if (hd2dRequested()) this.hd2d = new Hd2dScreenStage(this.game, this.scene, this.camera, (q) => buildTitleSet(q));
    else {
      this.scene.add(makeSky('title'));
      addLights(this.scene, 'title');
      this.scene.fog = new THREE.Fog('#ffc8e4', 16, 40);
      this.scene.add(backdrop('meadow', 3));
    }
    const ids = ['pyrelord', 'maelstrode', 'verdantusk'];
    ids.forEach((id, i) => {
      const v = new CreatureView(species(id).look, i);
      v.root.position.set((i - 1) * 2.4, 0, i === 1 ? -0.6 : 0);
      v.root.rotation.y = (1 - i) * 0.45;
      // HD-2D: the kin stand in the flower field's clearing as pixel sprites (no platform).
      const p = this.hd2d ? new THREE.Object3D() : platform('#8fdc6a', 1.1 * species(id).look.scale);
      p.position.copy(v.root.position);
      if (this.hd2d) this.scene.add(v.root); else this.scene.add(p, v.root);
      this.hd2d?.addKin(v);
      this.views.push(v);
      this.stands.push(p);
    });
    this.camera.position.set(0, 2.2, 8.5);
    this.camera.lookAt(0, 1.1, 0);

    this.slot = h('div', { class: 'title-slot', 'data-testid': 'title-slot' });
    const arenaReady = this.game.hasScene('arena');
    // Reloaded mid online match: offer the way straight back to the seat.
    const seat = arenaReady ? loadSavedSeat(savedSeatStorage()) : null;
    const buttons = h('div', { class: 'title-buttons' },
      seat ? h('button', {
        class: 'btn btn-big btn-rejoin', 'data-testid': 'btn-rejoin',
        onclick: () => { audio.sfx('select'); void this.game.goto('arena', { rejoin: true }); },
      }, icon('arena'), `Rejoin your match (${seat.code})`) : null,
      this.slot,
      h('button', { class: 'btn btn-big btn-new', 'data-testid': 'btn-start', onclick: () => void this.start() }, 'New adventure'),
      h('div', { class: 'title-row' },
        h('button', {
          class: 'btn btn-title btn-arena', 'data-testid': 'btn-arena', disabled: !arenaReady, title: arenaReady ? 'Battle a friend online' : 'The Arena opens soon',
          onclick: () => { audio.sfx('select'); void this.game.goto('arena'); },
        }, icon('arena'), 'Arena (PvP)'),
        h('button', { class: 'btn btn-title', 'data-testid': 'btn-settings', onclick: () => { audio.sfx('select'); openSettings(this.game); } }, icon('settings'), 'Settings'),
        h('button', { class: 'btn btn-title', 'data-testid': 'btn-import', onclick: () => void this.importSave() }, icon('import'), 'Import save')),
    );
    this.ui.append(h('div', { class: 'title-ui' },
      h('h1', { class: 'logo' }, h('span', {}, 'ORB'), h('span', {}, 'KIN')),
      h('p', { class: 'tagline' }, h('span', {}, 'Befriend wild kin.'), ' ', h('span', {}, 'Battle with heart.')),
      buttons,
      h('p', { class: 'footnote' }, `${this.game.dex().species.size} kin to discover · prototype build`),
    ));
    focusFirst(buttons);
    window.addEventListener('keydown', this.keyHandler);
    if (this.hd2d) this.resize(this.game.renderer.width, this.game.renderer.height);
    void this.refreshSlot();
  }

  private loadPeek(): Promise<SavePeek> {
    this.peeking ??= this.game.peekSave().then((p) => { this.peek = p; return p; });
    return this.peeking;
  }

  private async refreshSlot() {
    await this.fillSlot();
    if (this.ui.isConnected) this.resize(this.game.renderer.width, this.game.renderer.height);
  }

  private async fillSlot() {
    this.peeking = null;
    const peek = await this.loadPeek();
    if (!this.ui.isConnected) return;
    if (!peek) { this.slot.replaceChildren(); this.slot.classList.remove('has-save'); return; }
    this.slot.classList.add('has-save');
    if ('error' in peek) {
      this.slot.replaceChildren(h('div', { class: 'save-card broken', 'data-testid': 'save-broken', role: 'status' },
        h('strong', {}, 'Saved adventure can\'t be loaded'), h('span', { class: 'small' }, peek.error)));
      return;
    }
    const s = peek.summary;
    const lead = species(s.leadSpecies);
    const btn = h('button', {
      class: 'btn btn-big save-card', 'data-testid': 'btn-continue-save', style: `--tc:${TYPE_COLORS[lead.types[0]!]}`,
      onclick: () => void this.continue(),
    },
    h('span', { class: 'sc-top' }, icon('play'), 'Continue'),
    h('span', { class: 'sc-info' },
      h('span', { class: 'sc-lead' }, h('span', { class: 'kc-dot', 'aria-hidden': 'true' }), `${s.leadName} Lv${s.leadLevel}`),
      h('span', { 'data-testid': 'save-playtime' }, formatPlayTime(s.playTime)),
      h('span', {}, `${s.caught} caught`),
      s.champion ? h('span', { class: 'sc-champ' }, icon('crown'), 'Champion') : ''));
    this.slot.replaceChildren(btn);
    btn.focus({ preventScroll: true });
  }

  private describe(s: SaveSummary): string {
    return `${s.leadName} Lv${s.leadLevel} · ${formatPlayTime(s.playTime)} · ${s.caught} caught`;
  }

  private async start() {
    if (this.busy) return;
    this.busy = true;
    try {
      const peek = await this.loadPeek();
      if (peek) {
        audio.sfx('select');
        const ok = await confirmDialog({
          title: 'Start a new adventure?',
          message: 'summary' in peek
            ? `Your saved adventure (${this.describe(peek.summary)}) will be overwritten as soon as the new one is saved.`
            : 'Your damaged save will be replaced as soon as the new adventure is saved.',
          confirmLabel: 'Start over', cancelLabel: 'Keep my save', danger: true,
        });
        if (!ok) { audio.sfx('back'); return; }
      }
      audio.sfx('select');
      this.game.newGame();
      await this.game.goto('starter');
    } finally {
      this.busy = false;
    }
  }

  private async continue() {
    if (this.busy) return;
    this.busy = true;
    try {
      if (!(await this.game.load())) {
        audio.sfx('denied');
        toast('Your save could not be loaded.', 'bad');
        void this.refreshSlot();
        return;
      }
      audio.sfx('select');
      await this.game.goto('route', { route: this.game.player.lastRoute });
    } finally {
      this.busy = false;
    }
  }

  private async importSave() {
    if (this.busy) return;
    audio.sfx('select');
    let text: string | null;
    try { text = await pickSaveFile(); } catch (e) { audio.sfx('denied'); toast(e instanceof SaveError ? e.message : 'That file could not be read.', 'bad'); return; }
    if (text === null) return;
    let parsed;
    try { parsed = parseSave(text); } catch (e) {
      audio.sfx('denied');
      toast(e instanceof SaveError ? e.message : 'That file isn\'t a valid save.', 'bad', 4000);
      return;
    }
    const incoming = summarize(parsed.player, parsed.savedAt);
    const peek = await this.loadPeek();
    if (peek) {
      const ok = await confirmDialog({
        title: 'Replace your save?',
        message: `Import ${this.describe(incoming)}? ${'summary' in peek ? `Your current save (${this.describe(peek.summary)}) will be replaced.` : 'Your damaged save will be replaced.'}`,
        confirmLabel: 'Import', cancelLabel: 'Cancel', danger: true,
      });
      if (!ok) return;
    }
    try {
      await this.game.storeImported(parsed.player);
    } catch {
      audio.sfx('denied');
      toast('Couldn\'t store the imported save on this device.', 'bad', 4000);
      return;
    }
    audio.sfx('item');
    toast(parsed.migratedFrom ? `Save imported and upgraded from v${parsed.migratedFrom}!` : 'Save imported!', 'good');
    await this.refreshSlot();
  }

  override resize(w: number, hgt: number) {
    super.resize(w, hgt);
    if (this.hd2d) { this.frameHd2d(w, hgt); return; }
    // Tall screens: a tighter group pose (the middle kin a step behind) so the trio reads big.
    const narrow = w / hgt < 0.8;
    this.views.forEach((v, i) => {
      const x = (i - 1) * (narrow ? 1.35 : 2.4);
      const z = i === 1 ? (narrow ? -1.5 : -0.6) : (narrow ? 0.3 : 0);
      v.root.position.set(x, 0.1, z);
      v.root.rotation.y = (1 - i) * (narrow ? 0.3 : 0.45);
      this.stands[i]!.position.set(x, 0, z);
    });
    // The trio stands in the space between the logo and the buttons (beside the buttons on a
    // landscape phone, where they form a right-hand column).
    const q = (sel: string) => this.ui.querySelector(sel);
    const land = layoutMode(w, hgt) === 'land';
    const area = freeArea(w, hgt, land ? { top: [q('.tagline')], right: [q('.title-buttons')], bottom: [q('.footnote')] } : { top: [q('.tagline')], bottom: [q('.title-buttons')] }, 6);
    // Tall screens frame the kin themselves (their stands may run off the sides).
    const pts = boxPoints(narrow ? this.views.map((v) => v.inner) : [...this.views.map((v) => v.inner), ...this.stands]);
    fitPoints(this.camera, w, hgt, pts, area, { dir: new THREE.Vector3(0, 0.2, 1), target: new THREE.Vector3(0, 1.1, -0.2), fill: 0.98, alignY: 'bottom' });
  }

  /**
   * HD-2D framing: the trio stands in the lit clearing of the flower field; the camera looks
   * down at it from the front (≈ 24°), the trio fills the space between the logo and the
   * buttons with a margin, so the diorama (beds, gazebo, shafts) frames them.
   */
  private frameHd2d(w: number, hgt: number) {
    const narrow = w / hgt < 0.8;
    this.views.forEach((v, i) => {
      const x = (i - 1) * (narrow ? 1.25 : 2.2);
      const z = i === 1 ? (narrow ? -1.0 : -0.7) : (narrow ? 0.45 : 0.15);
      v.root.position.set(x + 0.2, 0, z);
      v.root.rotation.y = (1 - i) * (narrow ? 0.35 : 0.5);
    });
    const q = (sel: string) => this.ui.querySelector(sel);
    const land = layoutMode(w, hgt) === 'land';
    const area = freeArea(w, hgt, land ? { top: [q('.tagline')], right: [q('.title-buttons')], bottom: [q('.footnote')] } : { top: [q('.tagline')], bottom: [q('.title-buttons')] }, 6);
    const pts = boxPoints(this.views.map((v) => v.inner), 0.15);
    const target = new THREE.Vector3(0.2, 0.7, -0.2);
    // A little from the left: the trio turns a 3/4 face to us and the gazebo clears the logo.
    fitPoints(this.camera, w, hgt, pts, area, { dir: new THREE.Vector3(narrow ? -0.12 : -0.28, narrow ? 0.62 : 0.46, 1), target, fill: narrow ? 0.86 : 0.74, alignY: 'bottom' });
    this.hd2d!.framed(target);
  }

  /** HD-2D render stats (debug hook), null on the default renderer. */
  perf() { return this.hd2d?.perf() ?? null; }

  /** Layout checks (debug hook). */
  subjects() {
    return this.views.map((v, i) => ({ name: `kin${i}`, obj: v.inner }));
  }

  override update(_dt: number, t: number) {
    this.views.forEach((v) => v.update(t));
    if (this.hd2d) {
      this.hd2d.update(t);
      // A slow drift across the field (whole texels at the trio's depth), ±0.55 units.
      this.hd2d.drift(new THREE.Vector3(Math.sin(t * 0.11) * 0.55, Math.sin(t * 0.07) * 0.08, 0));
    }
  }

  override exit() {
    window.removeEventListener('keydown', this.keyHandler);
    this.hd2d?.dispose();
    this.hd2d = null;
    super.exit();
  }
}
