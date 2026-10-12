// Settings dialog: text speed (adventure + device), audio volumes & mute, reduced motion.
import { audio } from '../audio/audio';
import { TEXT_SPEEDS, setTextSpeed, type PlayerSettings } from '../game/state';
import type { Game } from '../game/game';
import { h, openModal, type ModalHandle } from './dom';
import { loadPrefs, reduceMotion, savePrefs } from './prefs';

const SPEED_LABEL: Record<PlayerSettings['textSpeed'], string> = { slow: 'Slow', normal: 'Normal', fast: 'Fast' };

function slider(label: string, testid: string, value: number, onInput: (v: number) => void, onCommit?: () => void): HTMLElement {
  const out = h('output', { class: 'set-val' }, `${Math.round(value * 100)}`);
  const input = h('input', {
    type: 'range', min: 0, max: 100, step: 5, value: Math.round(value * 100), 'data-testid': testid, 'aria-label': label,
  });
  const paint = () => { input.style.setProperty('--k', `${input.value}%`); out.textContent = input.value; };
  paint();
  input.addEventListener('input', () => { paint(); onInput(Number(input.value) / 100); });
  input.addEventListener('change', () => onCommit?.());
  return h('label', { class: 'set-row' }, h('span', { class: 'set-label' }, label), input, out);
}

function toggle(label: string, testid: string, on: boolean, onChange: (on: boolean) => void): HTMLElement {
  const btn = h('button', { class: 'switch', role: 'switch', 'aria-checked': String(on), 'data-testid': testid, 'aria-label': label });
  btn.addEventListener('click', () => {
    const next = btn.getAttribute('aria-checked') !== 'true';
    btn.setAttribute('aria-checked', String(next));
    onChange(next);
  });
  return h('div', { class: 'set-row' }, h('span', { class: 'set-label' }, label), btn);
}

export function openSettings(game: Game): ModalHandle {
  const m = openModal({ title: 'Settings', className: 'modal-settings', testid: 'settings' });
  const vol = audio.getVolume();

  const current = () => game.player.settings?.textSpeed ?? loadPrefs().textSpeed ?? 'normal';
  const seg = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Text speed' });
  const paintSeg = () => seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === current())));
  for (const s of TEXT_SPEEDS) {
    seg.append(h('button', {
      class: 'seg', role: 'radio', 'data-v': s, 'data-testid': `speed-${s}`,
      onclick: () => {
        game.player = setTextSpeed(game.player, s);
        savePrefs({ textSpeed: s });
        void game.save();
        audio.sfx('cursor');
        paintSeg();
      },
    }, SPEED_LABEL[s]));
  }
  paintSeg();

  m.body.append(
    h('section', { class: 'set-group' },
      h('h3', {}, 'Text'),
      h('div', { class: 'set-row' }, h('span', { class: 'set-label' }, 'Text speed'), seg)),
    h('section', { class: 'set-group' },
      h('h3', {}, 'Sound'),
      slider('Master', 'vol-master', vol.master, (v) => audio.setVolume({ master: v })),
      slider('Music', 'vol-music', vol.music, (v) => audio.setVolume({ music: v })),
      slider('Effects', 'vol-sfx', vol.sfx, (v) => audio.setVolume({ sfx: v }), () => audio.sfx('select')),
      toggle('Mute all', 'toggle-mute', vol.muted, (on) => { audio.mute(on); if (!on) audio.sfx('select'); })),
    h('section', { class: 'set-group' },
      h('h3', {}, 'Comfort'),
      toggle('Reduce motion', 'toggle-motion', reduceMotion(), (on) => { savePrefs({ reduceMotion: on }); audio.sfx('cursor'); })),
    h('p', { class: 'set-note' }, 'Sound and motion settings are kept on this device. Text speed is also stored in your save.'),
  );
  (seg.querySelector('[aria-checked="true"]') as HTMLElement | null)?.focus({ preventScroll: true });
  return m;
}
