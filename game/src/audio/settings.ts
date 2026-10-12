// Volume settings with tolerant localStorage persistence. Pure apart from the injected storage.

export interface Volume { master: number; music: number; sfx: number; muted: boolean }

export const DEFAULT_VOLUME: Readonly<Volume> = { master: 0.8, music: 0.55, sfx: 0.8, muted: false };
export const STORAGE_KEY = 'orbkin.audio.v1';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

export function clamp01(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
}

export function mergeVolume(base: Volume, patch: Partial<Volume> | null | undefined): Volume {
  if (!patch || typeof patch !== 'object') return { ...base };
  return {
    master: clamp01(patch.master, base.master),
    music: clamp01(patch.music, base.music),
    sfx: clamp01(patch.sfx, base.sfx),
    muted: typeof patch.muted === 'boolean' ? patch.muted : base.muted,
  };
}

function defaultStore(): Store | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadVolume(store: Store | null = defaultStore()): Volume {
  try {
    const raw = store?.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_VOLUME };
    return mergeVolume(DEFAULT_VOLUME, JSON.parse(raw) as Partial<Volume>);
  } catch {
    return { ...DEFAULT_VOLUME };
  }
}

export function saveVolume(v: Volume, store: Store | null = defaultStore()): void {
  try {
    store?.setItem(STORAGE_KEY, JSON.stringify(v));
  } catch {
    // Storage full / disabled (private mode): settings just won't persist.
  }
}
