// Per-device preferences (not part of the adventure save): last chosen text speed and reduced
// motion. Tolerant of missing/blocked storage.
import type { PlayerSettings } from '../game/state';

export interface DevicePrefs { textSpeed?: PlayerSettings['textSpeed']; reduceMotion?: boolean }

const KEY = 'orbkin.prefs.v1';

export function loadPrefs(): DevicePrefs {
  try {
    const raw = localStorage.getItem(KEY);
    const p = raw ? (JSON.parse(raw) as DevicePrefs) : {};
    const out: DevicePrefs = {};
    if (p.textSpeed === 'slow' || p.textSpeed === 'normal' || p.textSpeed === 'fast') out.textSpeed = p.textSpeed;
    if (typeof p.reduceMotion === 'boolean') out.reduceMotion = p.reduceMotion;
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

export function applyPrefs(p: DevicePrefs = loadPrefs()) {
  const sys = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.toggle('reduce-motion', p.reduceMotion ?? sys);
}
