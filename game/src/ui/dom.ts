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

// ---------------------------------------------------------------- modals, confirms, toasts

export interface ModalHandle {
  root: HTMLElement;
  panel: HTMLElement;
  body: HTMLElement;
  close(): void;
  closed: Promise<void>;
  isOpen(): boolean;
}

export interface ModalOptions {
  title: string;
  className?: string;
  testid?: string;
  /** Show a close (×) button and allow Esc / backdrop click to dismiss. Default true. */
  dismissable?: boolean;
  onClose?: () => void;
  /** Extra header content (right side). */
  headerExtra?: Node;
}

const modalStack: ModalHandle[] = [];

function layer(id: string): HTMLElement {
  let el = document.getElementById(id);
  if (!el) {
    el = h('div', { id });
    (document.getElementById('app') ?? document.body).appendChild(el);
  }
  return el;
}

export function anyModalOpen(): boolean {
  return modalStack.length > 0;
}

export function topModal(): ModalHandle | null {
  return modalStack[modalStack.length - 1] ?? null;
}

/** Close every open modal (e.g. before a scene change). */
export function closeAllModals() {
  for (const m of [...modalStack].reverse()) m.close();
}

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter((el) => el.offsetParent !== null || el === document.activeElement);
}

/** A centred, focus-trapped dialog over everything. Esc / × / backdrop close it (when dismissable). */
export function openModal(opts: ModalOptions): ModalHandle {
  const dismissable = opts.dismissable ?? true;
  const prevFocus = document.activeElement as HTMLElement | null;
  const titleId = `modal-title-${modalStack.length}-${Math.floor(performance.now())}`;
  const body = h('div', { class: 'modal-body' });
  let resolveClosed!: () => void;
  const closed = new Promise<void>((r) => { resolveClosed = r; });
  let open = true;
  const close = () => {
    if (!open) return;
    open = false;
    const i = modalStack.indexOf(handle);
    if (i >= 0) modalStack.splice(i, 1);
    // Removed immediately (no exit animation) so stale dialogs never linger under a new one.
    window.removeEventListener('keydown', onKey, true);
    root.remove();
    opts.onClose?.();
    if (prevFocus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
    resolveClosed();
  };
  const panel = h('div', { class: `modal ${opts.className ?? ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, 'data-testid': opts.testid },
    h('div', { class: 'modal-head' },
      h('h2', { id: titleId }, opts.title),
      opts.headerExtra ?? null,
      dismissable ? h('button', { class: 'btn btn-icon modal-x', 'aria-label': 'Close', 'data-testid': 'modal-close', onclick: () => close() }, '×') : null),
    body);
  const root = h('div', { class: 'modal-root' }, h('div', { class: 'modal-backdrop', onclick: () => { if (dismissable) close(); } }), panel);
  const onKey = (e: KeyboardEvent) => {
    if (topModal() !== handle) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (dismissable) close();
    } else if (e.key === 'Tab') {
      const f = focusables(panel);
      if (f.length === 0) return;
      const first = f[0]!;
      const last = f[f.length - 1]!;
      if (e.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { last.focus(); e.preventDefault(); }
      else if (!e.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { first.focus(); e.preventDefault(); }
    }
  };
  window.addEventListener('keydown', onKey, true);
  layer('modals').appendChild(root);
  const handle: ModalHandle = { root, panel, body, close, closed, isOpen: () => open };
  modalStack.push(handle);
  return handle;
}

export interface ConfirmOptions {
  title: string;
  message: string | Node;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

/** Yes/no dialog. Resolves true only when confirmed. */
export function confirmDialog(o: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    let result = false;
    const m = openModal({ title: o.title, className: 'modal-confirm', testid: 'confirm-dialog', onClose: () => resolve(result) });
    const yes = h('button', { class: `btn ${o.danger ? 'btn-danger' : 'btn-go'}`, 'data-testid': 'confirm-yes', onclick: () => { result = true; m.close(); } }, o.confirmLabel ?? 'OK');
    const no = h('button', { class: 'btn btn-back', 'data-testid': 'confirm-no', onclick: () => m.close() }, o.cancelLabel ?? 'Cancel');
    m.body.append(
      typeof o.message === 'string' ? h('p', { class: 'confirm-msg' }, o.message) : o.message,
      h('div', { class: 'confirm-actions' }, no, yes),
    );
    (o.danger ? no : yes).focus({ preventScroll: true });
  });
}

/** A short message that slides in at the top and fades away. */
export function toast(message: string, kind: 'info' | 'good' | 'bad' = 'info', ms = 2400): HTMLElement {
  const host = layer('toasts');
  host.setAttribute('aria-live', 'polite');
  const el = h('div', { class: `toast toast-${kind}`, role: 'status', 'data-testid': 'toast' }, message);
  host.appendChild(el);
  while (host.children.length > 3) host.firstElementChild?.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
  return el;
}

/** A labelled 0..max bar (stats, XP). */
export function meter(value: number, max: number, color: string, cls = 'meter'): HTMLElement {
  const k = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return h('div', { class: cls, style: `--c:${color}` }, h('div', { class: 'meter-fill', style: `width:${(k * 100).toFixed(1)}%` }));
}
