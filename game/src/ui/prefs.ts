// Per-device preferences (not part of the adventure save): last chosen text speed, reduced
// motion and screen shake. Tolerant of missing/blocked storage.
import type { PlayerSettings } from '../game/state';

export interface DevicePrefs { textSpeed?: PlayerSettings['textSpeed']; reduceMotion?: boolean; shake?: boolean }

const KEY = 'orbkin.prefs.v1';

export function loadPrefs(): DevicePrefs {
  try {
    const raw = localStorage.getItem(KEY);
    const p = raw ? (JSON.parse(raw) as DevicePrefs) : {};
    const out: DevicePrefs = {};
    if (p.textSpeed === 'slow' || p.textSpeed === 'normal' || p.textSpeed === 'fast') out.textSpeed = p.textSpeed;
    if (typeof p.reduceMotion === 'boolean') out.reduceMotion = p.reduceMotion;
    if (typeof p.shake === 'boolean') out.shake = p.shake;
    return out;
  } catch {
    return {};
  }
}

export function savePrefs(patch: DevicePrefs): DevicePrefs {
  const next = { ...loadPrefs(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* not persisted */ }
  applyPrefs(next);
  return next;
}

export function reduceMotion(): boolean {
  return document.documentElement.classList.contains('reduce-motion');
}

/**
 * Battle camera kicks and the hit-blink strobe. Off when the player turned it off, and under
 * reduced motion (which follows prefers-reduced-motion).
 */
export function screenShake(): boolean {
  return !reduceMotion() && (loadPrefs().shake ?? true);
}

export function applyPrefs(p: DevicePrefs = loadPrefs()) {
  const sys = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.toggle('reduce-motion', p.reduceMotion ?? sys);
}
