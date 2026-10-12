// Bag (out of battle): browse orbs and items; use healing items on party members.
import { MetaScene, itemModel } from './meta';
import { audio } from '../audio/audio';
import { ORBS, calcStats, getItem, itemHasEffect, type ItemId } from '../engine';
import { allBagIds, bagCount, bagName, isOrb, useBagItem, type BagId } from '../game/state';
import { arrowNav, focusFirst, h, hpBar, openModal, toast } from '../ui/dom';
import { coin } from '../ui/icons';
import { kinName, statusBadge } from '../ui/kin';

export function bagBlurb(id: BagId): string {
  if (!isOrb(id)) return getItem(id).blurb;
  const k = ORBS[id].bonus;
  return k === 1 ? 'A trusty capture orb. Throw it at a weakened wild kin to befriend it.'
    : `A finely tuned orb with ${k}× the catch power of a plain Orb.`;
}

export function itemIcon(id: BagId): HTMLElement {
  return h('span', { class: `item-ico ico-${id}`, 'aria-hidden': 'true' });
}

export class BagScene extends MetaScene {
  readonly name = 'bag' as const;
  private list!: HTMLElement;
  private detail!: HTMLElement;
  private sel: BagId | null = null;

  enter(params: Record<string, unknown>) {
    this.setupStage(params);
    this.motion = 'spin';
    this.list = h('div', { class: 'bag-list', 'data-testid': 'bag-list' });
    arrowNav(this.list);
    this.detail = h('div', { class: 'bag-detail', 'data-testid': 'bag-detail' });
    this.layout(
      h('section', { class: 'meta-panel bag-panel' },
        h('div', { class: 'meta-head' }, h('h2', {}, 'Bag'), h('span', { class: 'pill' }, coin(), String(this.game.player.money)), this.backButton('btn-bag-back')),
        this.list),
      h('section', { class: 'meta-panel detail-panel' }, this.detail),
      'meta-bag');
    this.render();
    const first = this.owned()[0] ?? null;
    this.select(first, false);
    focusFirst(this.list);
  }

  private owned(): BagId[] {
    return allBagIds().filter((id) => bagCount(this.game.player, id) > 0);
  }

  private render() {
    const ids = this.owned();
    const sections: HTMLElement[] = [];
    const orbs = ids.filter(isOrb);
    const items = ids.filter((id) => !isOrb(id));
    const row = (id: BagId) => h('button', {
      class: `btn item-row ${this.sel === id ? 'selected' : ''}`, 'data-testid': `bag-${id}`,
      onclick: () => { audio.sfx('cursor'); this.select(id); },
    }, itemIcon(id), h('span', { class: 'ir-main' }, h('span', { class: 'mname' }, bagName(id))), h('span', { class: 'ir-count' }, `×${bagCount(this.game.player, id)}`));
    if (orbs.length) sections.push(h('h4', { class: 'meta-sub' }, 'Orbs'), ...orbs.map(row));
    if (items.length) sections.push(h('h4', { class: 'meta-sub' }, 'Items'), ...items.map(row));
    if (!ids.length) sections.push(h('p', { class: 'empty-note', 'data-testid': 'bag-empty' }, 'Your bag is empty. Visit the Shop to stock up on orbs and tonics.'));
    this.list.replaceChildren(...sections);
  }

  private select(id: BagId | null, animate = true) {
    this.sel = id;
    this.list.querySelectorAll('.item-row').forEach((el) => el.classList.toggle('selected', (el as HTMLElement).dataset.testid === `bag-${id}`));
    if (!id) {
      this.clearModel();
      this.setCaption('');
      this.detail.replaceChildren(h('p', { class: 'empty-note' }, 'Nothing to show.'));
      return;
    }
    if (animate || !this.prop) this.showProp(itemModel(id));
    this.setCaption(bagName(id), `×${bagCount(this.game.player, id)}`);
    const orb = isOrb(id);
    this.detail.replaceChildren(
      h('div', { class: 'ks-title' }, itemIcon(id), h('h3', {}, bagName(id)), h('span', { class: 'plevel' }, `×${bagCount(this.game.player, id)}`)),
      h('p', { class: 'blurb' }, bagBlurb(id)),
      orb
        ? h('p', { class: 'meta-hint' }, 'Orbs are thrown during wild battles — choose Catch.')
        : h('button', { class: 'btn btn-go btn-wide', 'data-testid': 'btn-use-item', onclick: () => this.pickTarget(id) }, 'Use on a kin…'),
    );
  }

  private pickTarget(id: ItemId) {
    audio.sfx('select');
    const p = this.game.player;
    const m = openModal({ title: `Use ${getItem(id).name} on…`, className: 'modal-items', testid: 'target-picker' });
    const list = h('div', { class: 'item-pick' }, ...p.party.map((c, i) => {
      const works = itemHasEffect(c, id);
      const max = calcStats(c.species, c.level).hp;
      return h('button', {
        class: 'btn item-row target-row', 'data-testid': `use-target-${i}`, disabled: !works,
        onclick: () => { m.close(); this.use(id, i); },
      },
      h('span', { class: 'ir-main' },
        h('span', { class: 'prow' }, h('span', { class: 'mname' }, kinName(c)), statusBadge(c), h('span', { class: 'plevel' }, `Lv${c.level}`)),
        h('span', { class: 'prow' }, hpBar(c.hp, max), h('span', { class: 'hpnums small' }, `${c.hp}/${max}`)),
        works ? null : h('span', { class: 'small' }, 'No effect')));
    }));
    arrowNav(list);
    m.body.append(list);
    focusFirst(list);
  }

  private use(id: ItemId, i: number) {
    const before = this.game.player.party[i]!;
    try { this.game.player = useBagItem(this.game.player, id, i); } catch (e) { audio.sfx('denied'); toast((e as Error).message, 'bad'); return; }
    const after = this.game.player.party[i]!;
    audio.sfx('heal');
    toast(before.hp <= 0 ? `${kinName(after)} was revived!` : before.status && !after.status ? `${kinName(after)} feels better!` : `${kinName(after)} recovered ${after.hp - before.hp} HP.`, 'good');
    this.render();
    this.select(bagCount(this.game.player, id) > 0 ? id : this.owned()[0] ?? null, bagCount(this.game.player, id) === 0);
    void this.game.save();
  }
}
