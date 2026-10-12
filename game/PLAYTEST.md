# Orbkin — playtest guide

## Start it

```bash
git checkout claude/new-session-0opnq8
cd game
npm install
npm run dev              # http://localhost:5173
```

On a phone on the same Wi-Fi: `npm run dev -- --host`, then open the printed `http://<your-ip>:5173`.

For online PvP also run `npm run server` (port 8787). Or do it all from one process:
`npm run build && npm run server` and open `http://localhost:8787`.

## What to try

1. **Adventure.** Title → *New adventure* → pick a starter → Mossy Meadow.
   - Tap grass, flowers or the cave to find wild kin.
   - **Fight / Bag / Kin / Run** in battle. Bag → Orbs shows the live catch %.
   - Beat Scout Pim to unlock Ember Ridge. Then Brann + Sola unlock Squall Coast, and Merrow + Tavi unlock Crown Plateau and Champion Vale.
   - Kin evolve at Lv 14 and 26 (three-stage lines) or Lv 18 (two-stage lines). Press *Skip* to finish the scene instantly; *Stop* asks again later. You can also evolve from the Party screen.
2. **Menu** (button on the route, or `Esc` / `M`): Party, Bestiary, Bag, Box, Shop, Save, Settings, Export.
   - The game autosaves; *Continue* appears on the title.
   - Export/Import save files from the menu and the title.
3. **Arena (PvP)** from the title:
   - **Hotseat:** pass the device. A curtain hides each player's choice.
   - **vs CPU:** fight the Ace AI.
   - **Online:** create a room and share the 4-letter code.

## Controls

- **Mouse / touch:** everything is a button (all at least 44 px).
- **Keyboard:**
  - Arrows to move.
  - Enter / Space / Z to confirm or advance text.
  - Esc / X to go back.
  - 1–4 to pick a move.

## Handy URL flags

- `?debug=1` shows FPS and draw calls.
- `?scene=model` opens the creature gallery. Add `&lineup=all` for evolution lines, or `&species=pyrelord&view=q3` for one creature.
- `?seed=123` gives a deterministic run. It's for tests, so it never auto-loads your save.
- `/audio-test.html` (dev server only) lets you audition every sound and music track.

## Good to know

- **Audio:** sound starts after your first tap or keypress (browser rule). Volumes are in Settings.
- **Saves:** closing the tab mid-battle resumes from just before that battle; autosave is paused during battles on purpose.
- **XP:**
  - Catching gives no XP.
  - Benched kin get half XP, so the whole team grows.
- **Difficulty:** Champion Vale is meant to be the hardest fight.
  - Use type matchups (the move buttons show *Super* / *Weak*) and switch out of bad matchups.
  - In simulation a casual player wins the first try about 45% of the time.

More detail: `docs/PROGRESS.md`, `docs/DECISIONS.md`, `docs/BALANCE.md`, `docs/CREATURES.md`, `docs/ONLINE.md`.
