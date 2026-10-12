// Storage box: grid of stored kin plus the party strip; withdraw / deposit with a turntable model.
import { MetaScene } from './meta';
import { audio } from '../audio/audio';
import { species, type OwnedCreature } from '../engine';
import { PARTY_MAX, depositBlocker, depositToBox, withdrawBlocker, withdrawFromBox } from '../game/state';
import { TYPE_COLORS, arrowNav, h, toast } from '../ui/dom';
import { icon } from '../ui/icons';
import { kinName, kinSummary, statusBadge } from '../ui/kin';

type Sel = { where: 'box' | 'party'; index: number } | null;

export class BoxScene extends MetaScene {
  readonly name = 'box' as const;
  private partyRow!: HTMLElement;
  private grid!: HTMLElement;
  private detail!: HTMLElement;
  private actions!: HTMLElement;
  private counts!: HTMLElement;
  private sel: Sel = null;

  enter(params: Record<string, unknown>) {
    this.setupStage(params);
    this.motion = 'spin';
    this.partyRow = h('div', { class: 'box-party', 'data-testid': 'box-party' });
    this.grid = h('div', { class: 'box-grid', 'data-testid': 'box-grid' });
    arrowNav(this.partyRow);
    arrowNav(this.grid);
    this.counts = h('span', { class: 'pill' });
    this.detail = h('div', { class: 'box-detail', 'data-testid': 'box-detail' });
    this.actions = h('div', { class: 'kin-actions' });
    this.layout(
      h('section', { class: 'meta-panel box-panel' },
        h('div', { class: 'meta-head' }, h('h2', {}, 'Storage box'), this.counts, this.backButton('btn-box-back')),
        h('h4', { class: 'meta-sub' }, `Party`),
        this.partyRow,
        h('h4', { class: 'meta-sub' }, 'Stored kin'),
        this.grid),
      h('section', { class: 'meta-panel detail-panel' }, this.actions, this.detail),
      'meta-box');
    const p = this.game.player;
    this.render();
    this.select(p.box.length ? { where: 'box', index: 0 } : { where: 'party', index: 0 }, false);
    (this.grid.querySelector('button') ?? this.partyRow.querySelector('button'))?.focus({ preventScroll: true });
  }

  private tile(c: OwnedCreature, where: 'box' | 'party', index: number): HTMLButtonElement {
    const s = species(c.species);
    const on = this.sel?.where === where && this.sel.index === index;
    return h('button', {
      class: `kin-tile ${on ? 'selected' : ''} ${c.hp <= 0 ? 'fainted' : ''}`, style: `--tc:${TYPE_COLORS[s.types[0]!]}`,
      'data-testid': `${where === 'box' ? 'box-slot' : 'box-party'}-${index}`, 'aria-label': `${kinName(c)}, level ${c.level}`,
      onclick: () => { audio.sfx('cursor'); this.select({ where, index }); },
    },
    h('span', { class: 'kt-orb', 'aria-hidden': 'true' }),
    h('span', { class: 'kt-name' }, kinName(c)),
    h('span', { class: 'kt-lv' }, `Lv${c.level}`, statusBadge(c))) as HTMLButtonElement;
  }

  private render() {
    const p = this.game.player;
    this.counts.textContent = `${p.box.length} stored`;
    const slots: HTMLElement[] = p.party.map((c, i) => this.tile(c, 'party', i));
    for (let i = p.party.length; i < PARTY_MAX; i++) slots.push(h('div', { class: 'kin-tile empty', 'aria-hidden': 'true' }));
    this.partyRow.replaceChildren(...slots);
    this.grid.replaceChildren(...(p.box.length
      ? p.box.map((c, i) => this.tile(c, 'box', i))
      : [h('p', { class: 'empty-note', 'data-testid': 'box-empty' }, 'Your box is empty. Kin you catch while your party is full are sent here — or deposit one from your party.')]));
  }

  private select(sel: Sel, animate = true) {
    const p = this.game.player;
    const c = sel ? (sel.where === 'box' ? p.box[sel.index] : p.party[sel.index]) : undefined;
    this.sel = c ? sel : null;
    this.ui.querySelectorAll('.kin-tile').forEach((el) => el.classList.remove('selected'));
    if (!c || !sel) {
      this.clearModel();
      this.setCaption('');
      this.detail.replaceChildren(h('p', { class: 'empty-note' }, 'Pick a kin to see its summary.'));
      this.actions.replaceChildren();
      return;
    }
    this.ui.querySelector(`[data-testid="${sel.where === 'box' ? 'box-slot' : 'box-party'}-${sel.index}"]`)?.classList.add('selected');
    this.showKin(c.species, 'color', animate);
    this.setCaption(kinName(c), sel.where === 'box' ? 'In box' : `Party slot ${sel.index + 1}`);
    this.detail.replaceChildren(kinSummary(c));
    if (sel.where === 'box') {
      const why = withdrawBlocker(p, sel.index);
      this.actions.replaceChildren(
        h('button', { class: 'btn btn-act btn-go', 'data-testid': 'btn-withdraw', disabled: !!why, title: why ?? 'Add to your party', onclick: () => this.withdraw() }, icon('up'), 'Withdraw'),
        why ? h('span', { class: 'act-why small' }, why) : '');
    } else {
      const why = depositBlocker(p, sel.index);
      this.actions.replaceChildren(
        h('button', { class: 'btn btn-act btn-tobox', 'data-testid': 'btn-deposit', disabled: !!why, title: why ?? 'Store in the box', onclick: () => this.deposit() }, icon('down'), 'Deposit'),
        why ? h('span', { class: 'act-why small' }, why) : '');
    }
  }

  private withdraw() {
    const sel = this.sel;
    if (sel?.where !== 'box') return;
    const c = this.game.player.box[sel.index]!;
    try { this.game.player = withdrawFromBox(this.game.player, sel.index); } catch (e) { audio.sfx('denied'); toast((e as Error).message, 'bad'); return; }
    audio.sfx('select');
    toast(`${kinName(c)} joined your party!`, 'good');
    this.render();
    this.select({ where: 'party', index: this.game.player.party.length - 1 }, false);
    void this.game.save();
  }

  private deposit() {
    const sel = this.sel;
    if (sel?.where !== 'party') return;
    const c = this.game.player.party[sel.index]!;
    try { this.game.player = depositToBox(this.game.player, sel.index); } catch (e) { audio.sfx('denied'); toast((e as Error).message, 'bad'); return; }
    audio.sfx('select');
    toast(`${kinName(c)} was stored in the box.`, 'good');
    this.render();
    this.select({ where: 'box', index: this.game.player.box.length - 1 }, false);
    void this.game.save();
  }
}
