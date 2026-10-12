// Chunky stroke icons (24×24, currentColor) for menus. Inline SVG so they never depend on
// emoji fonts and stay crisp at any size.
const PATHS = {
  party: '<circle cx="8.5" cy="9" r="3.5"/><circle cx="16" cy="8" r="2.8"/><path d="M2.5 20c0-3.6 2.7-6 6-6s6 2.4 6 6"/><path d="M14.5 13.6c.5-.2 1-.3 1.5-.3 3 0 5.5 2.1 5.5 5.7"/>',
  bestiary: '<path d="M4 4.5h6.5a2 2 0 0 1 2 2V20a1.6 1.6 0 0 0-1.6-1.6H4z"/><path d="M20 4.5h-6.5a2 2 0 0 0-1 .3"/><path d="M12.5 20a1.6 1.6 0 0 1 1.6-1.6H20V4.5"/><circle cx="7.5" cy="10" r="1.4"/>',
  bag: '<path d="M5 9h14l-1.2 11H6.2z"/><path d="M9 9V7a3 3 0 0 1 6 0v2"/><path d="M9.5 14h5"/>',
  box: '<rect x="3.5" y="4" width="17" height="16" rx="2.5"/><path d="M3.5 10h17M10 4v6M14 4v6"/><path d="M9.5 15h5"/>',
  shop: '<path d="M4 10v10h16V10"/><path d="M3 10l2-6h14l2 6c0 1.4-1.1 2.3-2.4 2.3S16.3 11.4 16.3 10c0 1.4-1.1 2.3-2.4 2.3S11.6 11.4 11.6 10c0 1.4-1 2.3-2.3 2.3S7 11.4 7 10c0 1.4-1.1 2.3-2.3 2.3S3 11.4 3 10z"/><path d="M10 20v-4.5h4V20"/>',
  save: '<path d="M5 4h11l3.5 3.5V20H5z"/><path d="M8 4v5h7V4"/><rect x="8" y="13" width="8" height="5" rx="1"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3 5.5 5.5"/><circle cx="12" cy="12" r="6.6"/>',
  export: '<path d="M12 3.5v11"/><path d="M7.5 10.5 12 15l4.5-4.5"/><path d="M4 15.5V20h16v-4.5"/>',
  import: '<path d="M12 15V4"/><path d="M7.5 8 12 3.5 16.5 8"/><path d="M4 15.5V20h16v-4.5"/>',
  quit: '<path d="M10 4H5v16h5"/><path d="M14 8l4 4-4 4"/><path d="M18 12H9"/>',
  arena: '<path d="M5 19 15 9"/><path d="M15 9l2-5 3 3-5 2"/><path d="M19 19 9 9"/><path d="M9 9 7 4 4 7l5 2"/><path d="M4 17l3 3M20 17l-3 3"/>',
  play: '<path d="M8 5v14l11-7z"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z"/>',
  up: '<path d="M6 14l6-6 6 6"/>',
  down: '<path d="M6 10l6 6 6-6"/>',
  crown: '<path d="M4 18h16M5 15 3.5 7l5 4L12 5l3.5 6 5-4L19 15z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  heart: '<path d="M12 20s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10z"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
} as const;

export type IconName = keyof typeof PATHS;

export function icon(name: IconName, cls = 'ico'): SVGSVGElement {
  const wrap = document.createElement('span');
  wrap.innerHTML = `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${PATHS[name]}</svg>`;
  return wrap.firstElementChild as SVGSVGElement;
}

/** The gold coin glyph used next to money amounts. */
export function coin(): HTMLElement {
  const el = document.createElement('span');
  el.className = 'coin';
  el.setAttribute('aria-hidden', 'true');
  return el;
}
