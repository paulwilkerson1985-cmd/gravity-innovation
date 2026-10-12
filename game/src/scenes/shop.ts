// Shop: buy orbs and items with a quantity picker. Prices come from data/items.ts and engine ORBS.
import { MetaScene, itemModel } from './meta';
import { bagBlurb, itemIcon } from './bag';
import { audio } from '../audio/audio';
import { allBagIds, bagCount, bagName, buyItem, maxAffordable, priceOf, type BagId } from '../game/state';
import { arrowNav, focusFirst, h, toast } from '../ui/dom';
import { coin, icon } from '../ui/icons';

export class ShopScene extends MetaScene {
  readonly name = 'shop' as const;
  private list!: HTMLElement;
  private detail!: HTMLElement;
  private money!: HTMLElement;
  private sel: BagId = 'orb';
  private qty = 1;

  enter(params: Record<string, unknown>) {
    this.setupStage(params);
    this.motion = 'spin';
    this.money = h('span', { class: 'pill pill-money', 'data-testid': 'shop-money' });
    this.list = h('div', { class: 'shop-list', 'data-testid': 'shop-list' });
    arrowNav(this.list);
    this.detail = h('div', { class: 'shop-detail', 'data-testid': 'shop-detail' });
    this.layout(
      h('section', { class: 'meta-panel shop-panel' },
        h('div', { class: 'meta-head' }, h('h2', {}, 'Wayside Shop'), this.money, this.backButton('btn-shop-back')),
        h('p', { class: 'meta-hint small' }, 'Fresh orbs and tonics for travelling tamers.'),
        this.list),
      h('section', { class: 'meta-panel detail-panel' }, this.detail),
      'meta-shop');
    this.render();
    this.select('orb', false);
    focusFirst(this.list);
  }

  private render() {
    const p = this.game.player;
    this.money.replaceChildren(coin(), String(p.money));
    this.list.replaceChildren(...allBagIds().map((id) => h('button', {
      class: `btn item-row ${this.sel === id ? 'selected' : ''} ${priceOf(id) > p.money ? 'pricey' : ''}`, 'data-testid': `shop-${id}`,
      onclick: () => { audio.sfx('cursor'); this.select(id); },
    },
    itemIcon(id),
    h('span', { class: 'ir-main' }, h('span', { class: 'mname' }, bagName(id)), h('span', { class: 'small' }, `In bag: ${bagCount(p, id)}`)),
    h('span', { class: 'ir-price' }, coin(), String(priceOf(id))))));
  }

  private select(id: BagId, animate = true) {
    const changed = id !== this.sel || !this.prop;
    this.sel = id;
    this.qty = Math.max(1, Math.min(this.qty, maxAffordable(this.game.player, id)));
    if (changed) this.qty = 1;
    this.list.querySelectorAll('.item-row').forEach((el) => el.classList.toggle('selected', (el as HTMLElement).dataset.testid === `shop-${id}`));
    if (changed || animate) this.showProp(itemModel(id));
    this.setCaption(bagName(id), `${priceOf(id)} each`);
    this.renderDetail();
  }

  private renderDetail() {
    const p = this.game.player;
    const id = this.sel;
    const max = maxAffordable(p, id);
    const price = priceOf(id);
    const total = price * this.qty;
    const can = max >= 1 && this.qty <= max;
    const step = (d: number) => {
      const next = Math.max(1, Math.min(Math.max(1, max), this.qty + d));
      if (next === this.qty) { audio.sfx('denied'); return; }
      this.qty = next;
      audio.sfx('cursor');
      this.renderDetail();
    };
    const qtyBtns = h('div', { class: 'qty' },
      h('button', { class: 'btn btn-icon', 'data-testid': 'qty-minus', 'aria-label': 'One fewer', disabled: this.qty <= 1, onclick: () => step(-1) }, icon('minus')),
      h('output', { class: 'qty-v', 'data-testid': 'qty-value', 'aria-live': 'polite' }, String(this.qty)),
      h('button', { class: 'btn btn-icon', 'data-testid': 'qty-plus', 'aria-label': 'One more', disabled: this.qty >= max, onclick: () => step(1) }, icon('plus')),
      h('button', { class: 'btn btn-small btn-back', 'data-testid': 'qty-max', disabled: max <= 1 || this.qty === max, onclick: () => step(max - this.qty) }, 'Max'));
    this.detail.replaceChildren(
      h('div', { class: 'ks-title' }, itemIcon(id), h('h3', {}, bagName(id)), h('span', { class: 'ir-price' }, coin(), String(price))),
      h('p', { class: 'blurb' }, bagBlurb(id)),
      h('p', { class: 'small owned' }, `In bag: ${bagCount(p, id)}`),
      h('div', { class: 'buy-box' },
        qtyBtns,
        h('div', { class: 'buy-sum' },
          h('span', {}, 'Total ', h('strong', { 'data-testid': 'shop-total' }, coin(), String(total))),
          h('span', { class: `small ${can ? '' : 'warn'}` }, can ? `Left after: ${p.money - total}` : max === 0 && bagCount(p, id) >= 99 ? 'Your bag can\'t hold more.' : 'Not enough money.')),
        h('button', { class: 'btn btn-big btn-wide btn-buy', 'data-testid': 'btn-buy', 'aria-disabled': String(!can), onclick: () => this.buy() }, `Buy ${this.qty}`)),
    );
  }

  private buy() {
    try {
      this.game.player = buyItem(this.game.player, this.sel, this.qty);
    } catch (e) {
      audio.sfx('denied');
      toast((e as Error).message, 'bad');
      this.money.classList.remove('shake');
      void this.money.offsetWidth;
      this.money.classList.add('shake');
      return;
    }
    audio.sfx('item');
    toast(`Bought ${this.qty} × ${bagName(this.sel)}!`, 'good');
    this.qty = 1;
    this.render();
    this.renderDetail();
    void this.game.save();
  }
}
