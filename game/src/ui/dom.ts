type Attrs = Record<string, string | number | boolean | ((e: Event) => void) | undefined>;
type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'style') el.setAttribute('style', String(v));
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

export const TYPE_COLORS: Record<string, string> = {
  Flame: '#ff6a3d', Tide: '#3d9bff', Flora: '#4cc35a', Spark: '#f2c230', Terra: '#b88a52', Gale: '#6fcde3', Neutral: '#a7a7b8',
};

export function typeChip(t: string): HTMLElement {
  return h('span', { class: 'chip', style: `--c:${TYPE_COLORS[t] ?? '#999'}` }, t);
}

export function hpBar(hp: number, max: number): HTMLElement {
  const bar = h('div', { class: 'hpbar' }, h('div', { class: 'hpfill' }));
  setHp(bar, hp, max);
  return bar;
}

export function setHp(bar: HTMLElement, hp: number, max: number) {
  const k = Math.max(0, Math.min(1, hp / max));
  const fill = bar.firstElementChild as HTMLElement;
  fill.style.width = `${k * 100}%`;
  fill.dataset.level = k > 0.5 ? 'high' : k > 0.2 ? 'mid' : 'low';
}

/** Arrow-key navigation within a container of buttons (grid-aware by DOM position). */
export function arrowNav(container: HTMLElement) {
  container.addEventListener('keydown', (e) => {
    const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (!keys.includes(e.key)) return;
    const buttons = [...container.querySelectorAll<HTMLButtonElement>('button:not([disabled])')];
    const cur = document.activeElement as HTMLElement | null;
    if (!cur || !buttons.includes(cur as HTMLButtonElement)) return;
    const r0 = cur.getBoundingClientRect();
    const c0 = { x: r0.left + r0.width / 2, y: r0.top + r0.height / 2 };
    const dir = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key as 'ArrowUp']!;
    let best: HTMLButtonElement | null = null;
    let bestScore = Infinity;
    for (const b of buttons) {
      if (b === cur) continue;
      const r = b.getBoundingClientRect();
      const dx = r.left + r.width / 2 - c0.x;
      const dy = r.top + r.height / 2 - c0.y;
      const along = dx * dir[0]! + dy * dir[1]!;
      if (along <= 4) continue;
      const across = Math.abs(dx * dir[1]! - dy * dir[0]!);
      const score = along + across * 2;
      if (score < bestScore) { bestScore = score; best = b; }
    }
    if (best) { best.focus(); e.preventDefault(); }
  });
}

export function focusFirst(container: HTMLElement) {
  const b = container.querySelector<HTMLButtonElement>('button:not([disabled])');
  b?.focus({ preventScroll: true });
}
