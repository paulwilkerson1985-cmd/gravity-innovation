import type { SpeciesData } from '../engine/types';

type L = [number, string][];
const FLAME_LINE: L = [[1, 'bump'], [1, 'cinder-spit'], [7, 'battle-cry'], [11, 'searing-fang'], [16, 'smolder-cloud'], [21, 'quick-jab'], [26, 'pyre-crash']];
const TIDE_LINE: L = [[1, 'bump'], [1, 'droplet-shot'], [7, 'brine-mist'], [11, 'riptide-slam'], [16, 'second-wind'], [21, 'stare-down'], [26, 'breaker-crush']];
const FLORA_LINE: L = [[1, 'bump'], [1, 'seed-sling'], [7, 'stare-down'], [10, 'spore-puff'], [12, 'thorn-lash'], [20, 'second-wind'], [26, 'grove-hammer']];
const SPARK_LINE: L = [[1, 'quick-jab'], [1, 'static-nip'], [8, 'jolt-wave'], [12, 'volt-lunge'], [17, 'battle-cry'], [20, 'breeze-cut'], [24, 'storm-lance']];
const TERRA_LINE: L = [[1, 'bump'], [1, 'pebble-toss'], [7, 'bedrock-brace'], [12, 'quake-stomp'], [17, 'ram-charge'], [24, 'landslide']];
const GALE_LINE: L = [[1, 'quick-jab'], [1, 'breeze-cut'], [7, 'stare-down'], [12, 'talon-dive'], [17, 'updraft'], [24, 'cyclone-slam']];

export const SPECIES: SpeciesData[] = [
  // ---- Flame starter line
  {
    id: 'ashkit', name: 'Ashkit', types: ['Flame'], base: { hp: 44, atk: 54, def: 40, spe: 58 },
    catchRate: 45, xpYield: 62, evolvesTo: { species: 'cindertail', level: 14 }, learnset: FLAME_LINE,
    look: { body: 'quad', scale: 0.8, colors: { main: '#ff7a2e', belly: '#ffe0b0', accent: '#ffd23f' }, parts: ['pointyEars', 'flameTail'] },
    blurb: 'A fox kit whose tail tip smoulders like a coal. It naps in warm ash.',
  },
  {
    id: 'cindertail', name: 'Cindertail', types: ['Flame'], base: { hp: 60, atk: 72, def: 55, spe: 75 },
    catchRate: 45, xpYield: 142, evolvesTo: { species: 'pyrelord', level: 26 }, learnset: FLAME_LINE,
    look: { body: 'quad', scale: 1.05, colors: { main: '#f0502a', belly: '#ffd9a0', accent: '#ffcc00' }, parts: ['pointyEars', 'flameTail', 'mane'] },
    blurb: 'Its tail flame burns hotter when it is proud of something.',
  },
  {
    id: 'pyrelord', name: 'Pyrelord', types: ['Flame'], base: { hp: 78, atk: 96, def: 70, spe: 92 },
    catchRate: 45, xpYield: 225, learnset: FLAME_LINE,
    look: { body: 'quad', scale: 1.35, colors: { main: '#d8321e', belly: '#ffcf7a', accent: '#ffe14d' }, parts: ['pointyEars', 'flameTail', 'mane', 'horns', 'flame'] },
    blurb: 'A crowned beast of living flame. Snow will not settle within a stone\'s throw of it.',
  },
  // ---- Tide starter line
  {
    id: 'dropple', name: 'Dropple', types: ['Tide'], base: { hp: 52, atk: 46, def: 52, spe: 46 },
    catchRate: 45, xpYield: 62, evolvesTo: { species: 'rillback', level: 14 }, learnset: TIDE_LINE,
    look: { body: 'blob', scale: 0.8, colors: { main: '#3fa9f5', belly: '#c8ecff', accent: '#1f5fd1' }, parts: ['crest', 'fins'] },
    blurb: 'A wobbly droplet that hops from puddle to puddle after rain.',
  },
  {
    id: 'rillback', name: 'Rillback', types: ['Tide'], base: { hp: 70, atk: 64, def: 70, spe: 60 },
    catchRate: 45, xpYield: 142, evolvesTo: { species: 'maelstrode', level: 26 }, learnset: TIDE_LINE,
    look: { body: 'quad', scale: 1.05, colors: { main: '#2d8fe0', belly: '#bfe6ff', accent: '#e8f8ff' }, parts: ['ears', 'finTail', 'dorsal'] },
    blurb: 'It surfs river rapids on its broad, flat back.',
  },
  {
    id: 'maelstrode', name: 'Maelstrode', types: ['Tide'], base: { hp: 92, atk: 86, def: 90, spe: 72 },
    catchRate: 45, xpYield: 225, learnset: TIDE_LINE,
    look: { body: 'serpent', scale: 1.35, colors: { main: '#1e64c8', belly: '#9ee0ff', accent: '#f4f4ff' }, parts: ['crest', 'finTail', 'dorsal', 'whiskers'] },
    blurb: 'Coils of sea-blue armour. Whirlpools form wherever it dives.',
  },
  // ---- Flora starter line
  {
    id: 'mossling', name: 'Mossling', types: ['Flora'], base: { hp: 48, atk: 50, def: 54, spe: 44 },
    catchRate: 45, xpYield: 62, evolvesTo: { species: 'thistlehorn', level: 14 }, learnset: FLORA_LINE,
    look: { body: 'blob', scale: 0.8, colors: { main: '#5cc94a', belly: '#e6ffb8', accent: '#ff8fb0' }, parts: ['leaf'] },
    blurb: 'A mossy puffball. The sprout on its head turns to follow the sun.',
  },
  {
    id: 'thistlehorn', name: 'Thistlehorn', types: ['Flora'], base: { hp: 66, atk: 68, def: 72, spe: 56 },
    catchRate: 45, xpYield: 142, evolvesTo: { species: 'verdantusk', level: 26 }, learnset: FLORA_LINE,
    look: { body: 'quad', scale: 1.05, colors: { main: '#3ead48', belly: '#d9f7a6', accent: '#b04ad8' }, parts: ['horn', 'leaf', 'leafTail'] },
    blurb: 'Its horn blooms with a purple thistle each spring.',
  },
  {
    id: 'verdantusk', name: 'Verdantusk', types: ['Flora'], base: { hp: 90, atk: 90, def: 94, spe: 64 },
    catchRate: 45, xpYield: 225, learnset: FLORA_LINE,
    look: { body: 'quad', scale: 1.4, colors: { main: '#2c8c3a', belly: '#c9ef8a', accent: '#e05ab8' }, parts: ['horns', 'tusks', 'leaf', 'spikes', 'leafTail'] },
    blurb: 'A walking thicket. Small kin nest in the groves on its back.',
  },
  // ---- Spark line
  {
    id: 'flickwing', name: 'Flickwing', types: ['Spark'], base: { hp: 40, atk: 48, def: 38, spe: 66 },
    catchRate: 190, xpYield: 54, evolvesTo: { species: 'stormoth', level: 18 }, learnset: SPARK_LINE,
    look: { body: 'bug', scale: 0.75, colors: { main: '#ffd83a', belly: '#fff4b0', accent: '#2b2b3a' }, parts: ['antennae', 'wings'] },
    blurb: 'Its wings crackle with static. Swarms light up summer meadows.',
  },
  {
    id: 'stormoth', name: 'Stormoth', types: ['Spark'], base: { hp: 62, atk: 82, def: 56, spe: 96 },
    catchRate: 75, xpYield: 160, learnset: SPARK_LINE,
    look: { body: 'bug', scale: 1.15, colors: { main: '#f5c400', belly: '#fff1a0', accent: '#5a3cff' }, parts: ['antennae', 'wings', 'crest'] },
    blurb: 'It flies straight into thunderheads to recharge.',
  },
  // ---- Terra line
  {
    id: 'pebblet', name: 'Pebblet', types: ['Terra'], base: { hp: 50, atk: 56, def: 66, spe: 28 },
    catchRate: 190, xpYield: 56, evolvesTo: { species: 'cragmaul', level: 18 }, learnset: TERRA_LINE,
    look: { body: 'blob', scale: 0.75, colors: { main: '#a3825c', belly: '#d9c3a0', accent: '#6fd0e0' }, parts: ['crystals'] },
    blurb: 'Often mistaken for a rock until it sneezes.',
  },
  {
    id: 'cragmaul', name: 'Cragmaul', types: ['Terra'], base: { hp: 80, atk: 94, def: 100, spe: 44 },
    catchRate: 75, xpYield: 162, learnset: TERRA_LINE,
    look: { body: 'biped', scale: 1.3, colors: { main: '#8a6a48', belly: '#cdb592', accent: '#6fd0e0' }, parts: ['horns', 'arms', 'crystals', 'spikes'] },
    blurb: 'A boulder with fists. It polishes its crystals on cliff faces.',
  },
  // ---- Gale line
  {
    id: 'breezel', name: 'Breezel', types: ['Gale'], base: { hp: 42, atk: 50, def: 38, spe: 62 },
    catchRate: 200, xpYield: 54, evolvesTo: { species: 'cyclonyx', level: 18 }, learnset: GALE_LINE,
    look: { body: 'bird', scale: 0.75, colors: { main: '#8fd7f0', belly: '#ffffff', accent: '#ffb347' }, parts: ['wings', 'crest'] },
    blurb: 'A puffy chick that rides breezes instead of flapping.',
  },
  {
    id: 'cyclonyx', name: 'Cyclonyx', types: ['Gale'], base: { hp: 68, atk: 88, def: 60, spe: 98 },
    catchRate: 75, xpYield: 160, learnset: GALE_LINE,
    look: { body: 'bird', scale: 1.2, colors: { main: '#4fb8e8', belly: '#f0fbff', accent: '#ff8a3d' }, parts: ['wings', 'crest', 'tail'] },
    blurb: 'Its dive whips up a spinning gust that can uproot saplings.',
  },
  // ---- Rare dual-type singles
  {
    id: 'vulcrag', name: 'Vulcrag', types: ['Flame', 'Terra'], base: { hp: 75, atk: 92, def: 85, spe: 58 },
    catchRate: 45, xpYield: 185, learnset: [[1, 'cinder-spit'], [1, 'pebble-toss'], [10, 'searing-fang'], [14, 'quake-stomp'], [20, 'bedrock-brace'], [23, 'pyre-crash'], [28, 'landslide']],
    look: { body: 'biped', scale: 1.2, colors: { main: '#4a3a3a', belly: '#ff7a30', accent: '#ffb020' }, parts: ['crystals', 'flame', 'arms', 'horns'] },
    blurb: 'Magma glows through the cracks in its stony hide.',
  },
  {
    id: 'surgeray', name: 'Surgeray', types: ['Tide', 'Spark'], base: { hp: 70, atk: 82, def: 64, spe: 90 },
    catchRate: 45, xpYield: 185, learnset: [[1, 'droplet-shot'], [1, 'static-nip'], [10, 'jolt-wave'], [14, 'riptide-slam'], [18, 'volt-lunge'], [24, 'storm-lance'], [28, 'breaker-crush']],
    look: { body: 'fish', scale: 1.15, colors: { main: '#2b6cd8', belly: '#e0f5ff', accent: '#ffe23a' }, parts: ['fins', 'finTail', 'antennae'] },
    blurb: 'Glides just under the waves. Fishing boats go dark when it passes.',
  },
  {
    id: 'petalwisp', name: 'Petalwisp', types: ['Flora', 'Gale'], base: { hp: 66, atk: 70, def: 68, spe: 88 },
    catchRate: 45, xpYield: 185, learnset: [[1, 'seed-sling'], [1, 'breeze-cut'], [10, 'spore-puff'], [14, 'thorn-lash'], [18, 'talon-dive'], [22, 'second-wind'], [25, 'grove-hammer']],
    look: { body: 'bird', scale: 1.0, colors: { main: '#ff9ad0', belly: '#fff0f8', accent: '#6ed46a' }, parts: ['wings', 'leaf', 'leafTail'] },
    blurb: 'Drifts on warm air scattering petals. Seen only on bright spring days.',
  },
];

export const STARTERS = ['ashkit', 'dropple', 'mossling'] as const;
