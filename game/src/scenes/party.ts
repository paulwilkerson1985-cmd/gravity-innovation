// Party screen: reorder, full summary, use bag items, send to the storage box.
import { MetaScene } from './meta';
import { audio } from '../audio/audio';
import { calcStats, canEvolveNow, getItem, itemHasEffect, species, type ItemId } from '../engine';
import { bagCount, depositBlocker, depositToBox, isOrb, moveInParty, setLead, useBagItem, type BagId } from '../game/state';
import { arrowNav, confirmDialog, focusFirst, h, openModal, toast } from '../ui/dom';
import { icon } from '../ui/icons';
import { kinCard, kinName, kinSummary } from '../ui/kin';

export class PartyScene extends MetaScene {
  readonly name = 'party' as const;
  private list!: HTMLElement;
  private detail!: HTMLElement;
  private actions!: HTMLElement;
  private head!: HTMLElement;
  private sel = 0;

  enter(params: Record<string, unknown>) {
    this.setupStage(params);
    this.motion = 'sway';
    this.sel = Math.max(0, Math.min(this.game.player.party.length - 1, Number(params.index ?? 0) || 0));
    this.head = h('h2', {});
    this.list = h('div', { class: 'party-list', 'data-testid': 'party-list' });
    arrowNav(this.list);
    this.detail = h('div', { class: 'party-detail', 'data-testid': 'party-detail' });
    this.actions = h('div', { class: 'kin-actions' });
    this.layout(
      h('section', { class: 'meta-panel party-panel' },
        h('div', { class: 'meta-head' }, this.head, this.backButton('btn-party-back')),
        this.list,
        h('p', { class: 'meta-hint small' }, 'Your lead kin is sent out first in battle.')),
      h('section', { class: 'meta-panel detail-panel' }, this.actions, this.detail),
      'meta-party');
    this.renderList();
    this.show(this.sel, false);
    focusFirst(this.list);
  }

  private renderList() {
    const p = this.game.player;
    this.head.textContent = `Your party (${p.party.length}/6)`;
    this.list.replaceChildren(...p.party.map((c, i) => kinCard(c, {
      'data-testid': `party-${i}`,
      class: `party-card ${i === this.sel ? 'selected' : ''}`,
      onclick: () => { audio.sfx('cursor'); this.show(i); },
    }, i === 0 ? h('span', { class: 'lead-tag' }, 'LEAD') : undefined)));
  }

  private show(i: number, animate = true) {
    const c = this.game.player.party[i];
    if (!c) return;
    const changedKin = this.view === null || this.sel !== i || animate;
    this.sel = i;
    this.list.querySelectorAll('.party-card').forEach((el, j) => el.classList.toggle('selected', i === j));
    if (changedKin) this.showKin(c.species, 'color', animate);
    this.setCaption(kinName(c), `Lv${c.level}`);
    this.detail.replaceChildren(kinSummary(c));
    this.renderActions();
  }

  private renderActions() {
    const p = this.game.player;
    const i = this.sel;
    const n = p.party.length;
    const why = depositBlocker(p, i);
    const usable = (Object.keys(p.bag) as BagId[]).filter((id) => !isOrb(id) && bagCount(p, id) > 0);
    const c = p.party[i];
    this.actions.replaceChildren(
      h('button', { class: 'btn btn-act', 'data-testid': 'btn-set-lead', disabled: i === 0, onclick: () => this.reorder(i, 0, 'is now leading!') }, icon('crown'), 'Lead'),
      h('button', { class: 'btn btn-act', 'data-testid': 'btn-move-up', disabled: i === 0, 'aria-label': 'Move up', onclick: () => this.reorder(i, i - 1) }, icon('up'), 'Up'),
      h('button', { class: 'btn btn-act', 'data-testid': 'btn-move-down', disabled: i >= n - 1, 'aria-label': 'Move down', onclick: () => this.reorder(i, i + 1) }, icon('down'), 'Down'),
      h('button', { class: 'btn btn-act btn-item', 'data-testid': 'btn-use-item', disabled: usable.length === 0, title: usable.length ? 'Use an item' : 'No usable items in your bag', onclick: () => this.pickItem() }, icon('bag'), 'Item'),
      h('button', { class: 'btn btn-act btn-tobox', 'data-testid': 'btn-deposit', disabled: !!why, title: why ?? 'Send to the storage box', onclick: () => void this.deposit() }, icon('box'), 'To box'),
      // An evolution that was stopped can be started again here at any time.
      ...(c && canEvolveNow(c)
        ? [h('button', { class: 'btn btn-act btn-evolve', 'data-testid': 'btn-evolve', title: `Evolve into ${species(species(c.species).evolvesTo!.species).name}`, onclick: () => this.evolve() }, icon('up'), 'Evolve')]
        : []),
    );
  }

  private evolve() {
    const c = this.game.player.party[this.sel];
    if (!c || !canEvolveNow(c)) return;
    audio.sfx('select');
    void this.game.goto('evolution', {
      queue: c.uid, next: 'party', index: this.sel,
      route: typeof this.params.route === 'string' ? this.params.route : this.game.player.lastRoute,
      ...(typeof this.params.from === 'string' ? { from: this.params.from } : {}),
    });
  }

  private reorder(from: number, to: number, msg?: string) {
    const p = this.game.player;
    this.game.player = to === 0 && msg ? setLead(p, from) : moveInParty(p, from, to);
    audio.sfx('switch');
    this.sel = to;
    this.renderList();
    this.show(to, false);
    if (msg) toast(`${kinName(this.game.player.party[0]!)} ${msg}`, 'good');
    this.list.querySelector<HTMLButtonElement>(`[data-testid="party-${to}"]`)?.focus({ preventScroll: true });
    void this.game.save();
  }

  private async deposit() {
    const p = this.game.player;
    const c = p.party[this.sel]!;
    const ok = await confirmDialog({ title: 'Send to box?', message: `${kinName(c)} will wait in your storage box. You can withdraw it any time from the Box.`, confirmLabel: 'Send', cancelLabel: 'Keep' });
    if (!ok) return;
    try {
      this.game.player = depositToBox(this.game.player, this.sel);
    } catch (e) {
      audio.sfx('denied');
      toast((e as Error).message, 'bad');
      return;
    }
    audio.sfx('select');
    toast(`${kinName(c)} was sent to the box.`, 'good');
    this.sel = Math.min(this.sel, this.game.player.party.length - 1);
    this.renderList();
    this.show(this.sel);
    void this.game.save();
  }

  private pickItem() {
    const p = this.game.player;
    const c = p.party[this.sel]!;
    audio.sfx('select');
    const ids = (Object.keys(p.bag) as BagId[]).filter((id): id is ItemId => !isOrb(id) && bagCount(p, id) > 0);
    const m = openModal({ title: `Use an item on ${kinName(c)}`, className: 'modal-items', testid: 'item-picker' });
    const list = h('div', { class: 'item-pick' }, ...ids.map((id) => {
      const it = getItem(id);
      const works = itemHasEffect(c, id);
      return h('button', {
        class: 'btn item-row', 'data-testid': `use-${id}`, disabled: !works,
        onclick: () => { m.close(); this.useItem(id); },
      },
      h('span', { class: `item-ico ico-${id}`, 'aria-hidden': 'true' }),
      h('span', { class: 'ir-main' }, h('span', { class: 'mname' }, it.name), h('span', { class: 'small' }, works ? it.blurb : 'It won\'t have any effect.')),
      h('span', { class: 'ir-count' }, `×${bagCount(p, id)}`));
    }));
    arrowNav(list);
    m.body.append(list);
    focusFirst(list);
  }

  private useItem(id: ItemId) {
    const before = this.game.player.party[this.sel]!;
    try {
      this.game.player = useBagItem(this.game.player, id, this.sel);
    } catch (e) {
      audio.sfx('denied');
      toast((e as Error).message, 'bad');
      return;
    }
    const after = this.game.player.party[this.sel]!;
    const max = calcStats(after.species, after.level).hp;
    const name = kinName(after);
    const msg = before.hp <= 0 ? `${name} was revived!` : before.status && !after.status ? `${name} feels better!` : `${name} recovered ${after.hp - before.hp} HP (${after.hp}/${max}).`;
    audio.sfx('heal');
    toast(msg, 'good');
    this.renderList();
    this.show(this.sel, false);
    void this.view?.pulse('#7dffb0');
    void this.game.save();
  }
}
