// Dev-only audition page (served at /audio-test.html by `npm run dev`; not part of the build).
import { audio, type MusicTrack } from './audio';
import { SFX_NAMES, MOVE_TYPES } from './sfxdefs';
import { TRACK_NAMES } from './music/tracks';
import { SPECIES } from '../data/species';

const app = document.getElementById('app')!;
audio.installUnlock();

function section(title: string): HTMLElement {
  const h = document.createElement('h2');
  h.textContent = title;
  const div = document.createElement('div');
  app.append(h, div);
  return div;
}

function button(parent: HTMLElement, label: string, fn: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', () => { audio.unlock(); fn(); });
  parent.append(b);
  return b;
}

// Volume controls
const vol = section('Volume');
for (const key of ['master', 'music', 'sfx'] as const) {
  const label = document.createElement('label');
  const input = document.createElement('input');
  input.type = 'range'; input.min = '0'; input.max = '1'; input.step = '0.05';
  input.value = String(audio.getVolume()[key]);
  input.addEventListener('input', () => audio.setVolume({ [key]: Number(input.value) }));
  label.append(key, input);
  vol.append(label);
}
const muteBtn = button(vol, audio.getVolume().muted ? 'Unmute' : 'Mute', () => {
  audio.mute(!audio.getVolume().muted);
  muteBtn.textContent = audio.getVolume().muted ? 'Unmute' : 'Mute';
});

const music = section('Music');
const trackButtons: HTMLButtonElement[] = [];
for (const t of [...TRACK_NAMES, 'none'] as MusicTrack[]) {
  const b = button(music, t, () => {
    audio.music(t);
    for (const other of trackButtons) other.classList.toggle('on', other === b && t !== 'none');
  });
  trackButtons.push(b);
}

const sfx = section('SFX');
for (const name of SFX_NAMES) button(sfx, name, () => audio.sfx(name));

const moves = section('Move cues');
for (const type of MOVE_TYPES) button(moves, type, () => audio.move(type));

const cries = section('Cries (click = normal, shift-click = low pitch / faint)');
for (const s of SPECIES) {
  const b = button(cries, s.name, () => undefined);
  b.addEventListener('click', (e) => audio.cry(s.id, e.shiftKey ? 0.8 : 1));
}
