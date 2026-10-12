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

// ---------------------------------------------------------------- orb icons
// Orbs are lantern-buds (see render/fx.ts): a pointed faceted pod in leafy sepals with a
// glowing tip. Tiers: Orb (coral, green sepals), Bright Orb (sky blue + gold halo ring),
// Star Orb (gold pod in a white 4-point star collar). Drawn as inline SVG so they stay crisp.

export type OrbIconTier = 'orb' | 'bright' | 'star';

const ORB_ICON: Record<OrbIconTier, { body: string; shade: string; light: string; tip: string; collar: string; collarDark: string }> = {
  orb: { body: '#ff4d6d', shade: '#d62c55', light: '#ff9aab', tip: '#fff1a8', collar: '#4cc35a', collarDark: '#2f8f44' },
  bright: { body: '#3d9bff', shade: '#2266d8', light: '#9ad6ff', tip: '#ffd23f', collar: '#4cc35a', collarDark: '#2f8f44' },
  star: { body: '#ffc93d', shade: '#e8901e', light: '#fff0a0', tip: '#ff7ad0', collar: '#ffffff', collarDark: '#d8def5' },
};

/** SVG markup (24×24 viewBox) for an orb tier. Pure string — safe to call outside the DOM. */
export function orbIconSvg(tier: OrbIconTier): string {
  const c = ORB_ICON[tier];
  const ink = '#1d1838';
  const collar = tier === 'star'
    ? `<path d="M12 12.5 3 9.6 8.4 15.6 5.6 21.2 12 18.4 18.4 21.2 15.6 15.6 21 9.6Z" fill="${c.collar}" stroke="${ink}" stroke-width="1.4" stroke-linejoin="round"/>`
    : `<path d="M12 15.5 4.2 11.4 6.6 18.6Z" fill="${c.collar}" stroke="${ink}" stroke-width="1.3" stroke-linejoin="round"/>`
      + `<path d="M12 15.5 19.8 11.4 17.4 18.6Z" fill="${c.collarDark}" stroke="${ink}" stroke-width="1.3" stroke-linejoin="round"/>`;
  const front = tier === 'star' ? '' : `<path d="M12 22 8.2 15.4 12 13.6 15.8 15.4Z" fill="${c.collar}" stroke="${ink}" stroke-width="1.3" stroke-linejoin="round"/>`;
  const ring = tier === 'bright'
    ? { back: `<path d="M3.6 12.4C4.6 9.6 19.6 7.6 20.4 9.6" fill="none" stroke="#b57b12" stroke-width="2" stroke-linecap="round"/>`,
      front: `<path d="M20.4 9.6C21.2 11.8 4.6 15.4 3.6 12.4" fill="none" stroke="${ink}" stroke-width="3.4" stroke-linecap="round"/><path d="M20.4 9.6C21.2 11.8 4.6 15.4 3.6 12.4" fill="none" stroke="#ffc93d" stroke-width="1.8" stroke-linecap="round"/>` }
    : { back: '', front: '' };
  return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">`
    + ring.back + collar
    + `<path d="M12 1.8 17.4 9.4Q18.6 15.6 12 18.6 5.4 15.6 6.6 9.4Z" fill="${c.body}" stroke="${ink}" stroke-width="1.5" stroke-linejoin="round"/>`
    + `<path d="M12 2.6 12 18 15.8 16.2Q17.8 13.6 16.8 9.6Z" fill="${c.shade}"/>`
    + `<path d="M12 3.4 8.4 9.6 9.6 13.8 12 9.8Z" fill="${c.light}"/>`
    + ring.front + front
    + `<path d="M12 .6 13.6 3.2 12 5.6 10.4 3.2Z" fill="${c.tip}" stroke="${ink}" stroke-width="1" stroke-linejoin="round"/>`
    + `</svg>`;
}

/** An inline orb icon element. */
export function orbIcon(tier: OrbIconTier, cls = 'orb-svg'): HTMLElement {
  const el = document.createElement('span');
  el.className = cls;
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = orbIconSvg(tier);
  return el;
}

const ORB_TIER_COLOR: Record<OrbIconTier, string> = { orb: '#ff4d6d', bright: '#3d9bff', star: '#ffc93d' };

/**
 * CSS that re-skins the existing orb icon hooks (`.item-ico.ico-<tier>` in the bag/shop and
 * `i.orb-ico` in the battle Catch menu, keyed by its inline --c colour) with the bud SVGs.
 */
export function orbIconCss(): string {
  const url = (t: OrbIconTier) => `url("data:image/svg+xml,${encodeURIComponent(orbIconSvg(t))}")`;
  const reset = 'border:0;border-radius:0;box-shadow:none;background-color:transparent;background-repeat:no-repeat;background-position:center;background-size:contain;';
  let css = '';
  for (const t of Object.keys(ORB_ICON) as OrbIconTier[]) {
    const id = t === 'orb' ? 'orb' : t;
    css += `.item-ico.ico-${id}{${reset}background-image:${url(t)};}`;
    css += `.item-ico.ico-${id}::after{content:none;display:none;}`;
    css += `i.orb-ico[style*="${ORB_TIER_COLOR[t]}"]{${reset}background-image:${url(t)};width:18px;height:18px;vertical-align:-3px;}`;
  }
  return css;
}

/** Install the orb icon skin once (called on import in the browser). */
export function installOrbIcons() {
  if (typeof document === 'undefined' || document.getElementById('orb-icon-skin')) return;
  const style = document.createElement('style');
  style.id = 'orb-icon-skin';
  style.textContent = orbIconCss();
  document.head.appendChild(style);
}

installOrbIcons();
