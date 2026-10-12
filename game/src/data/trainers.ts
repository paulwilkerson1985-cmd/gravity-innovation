import type { TrainerData } from '../engine/types';

export const TRAINERS: TrainerData[] = [
  // ---- Mossy Meadow
  {
    id: 'scout-pim', name: 'Pim', title: 'Sprout Scout', routeId: 'meadow', ai: 'rookie',
    party: [
      { species: 'flickwing', level: 5 },
      { species: 'breezel', level: 7 },
    ],
    reward: 250,
    intro: 'I\'ve been training all morning! Let\'s see if your kin can keep up!',
    defeat: 'Aw, mud on my badge... Go on, the trail up the ridge is open to you now.',
  },
  // ---- Ember Ridge
  {
    id: 'hiker-brann', name: 'Brann', title: 'Ridge Hiker', routeId: 'ridge', ai: 'skilled',
    party: [
      { species: 'pebblet', level: 11 },
      { species: 'pebblet', level: 12 },
      { species: 'cragmaul', level: 14, moves: ['quake-stomp', 'bedrock-brace', 'pebble-toss', 'bump'] },
    ],
    reward: 650,
    intro: 'These rocks have stood a thousand years. My team is just as stubborn!',
    defeat: 'Ha! You cracked us like flint. Good legs on you, traveller.',
  },
  {
    id: 'adept-sola', name: 'Sola', title: 'Cinder Adept', routeId: 'ridge', ai: 'skilled',
    party: [
      { species: 'flickwing', level: 11 },
      { species: 'breezel', level: 12 },
      { species: 'cindertail', level: 14, moves: ['searing-fang', 'battle-cry', 'cinder-spit', 'bump'] },
    ],
    reward: 700,
    intro: 'The vents up here burn hot. Can your spirit burn hotter?',
    defeat: 'Smothered... I will meditate on this by the steam vents.',
  },
  // ---- Squall Coast
  {
    id: 'angler-merrow', name: 'Merrow', title: 'Storm Angler', routeId: 'coast', ai: 'skilled',
    party: [
      { species: 'rillback', level: 22, moves: ['riptide-slam', 'second-wind', 'brine-mist', 'droplet-shot'] },
      { species: 'surgeray', level: 22, moves: ['volt-lunge', 'riptide-slam', 'jolt-wave', 'static-nip'] },
      { species: 'stormoth', level: 23, moves: ['volt-lunge', 'breeze-cut', 'battle-cry', 'jolt-wave'] },
    ],
    reward: 1300,
    intro: 'Nothing bites in a squall like this... except my team!',
    defeat: 'Reeled in and landed. You\'ve got a strong line, I\'ll give you that.',
  },
  {
    id: 'rider-tavi', name: 'Tavi', title: 'Gale Rider', routeId: 'coast', ai: 'ace',
    party: [
      { species: 'cyclonyx', level: 20, moves: ['talon-dive', 'updraft', 'stare-down', 'quick-jab'] },
      { species: 'cragmaul', level: 20, moves: ['quake-stomp', 'ram-charge', 'bedrock-brace', 'pebble-toss'] },
      { species: 'petalwisp', level: 21, moves: ['talon-dive', 'thorn-lash', 'spore-puff', 'breeze-cut'] },
      { species: 'thistlehorn', level: 22, moves: ['thorn-lash', 'spore-puff', 'second-wind', 'stare-down'] },
    ],
    reward: 1500,
    intro: 'Feel that wind off the sea? It only blows for those who can keep their footing.',
    defeat: 'Blown clean off the cliff! The road to Crown Plateau is yours. The Champion waits.',
  },
  // ---- Crown Plateau
  {
    id: 'champion-vale', name: 'Vale', title: 'Champion', routeId: 'plateau', ai: 'ace',
    party: [
      { species: 'cyclonyx', level: 21, moves: ['talon-dive', 'updraft', 'quick-jab', 'stare-down'] },
      { species: 'stormoth', level: 21, moves: ['volt-lunge', 'jolt-wave', 'breeze-cut', 'battle-cry'] },
      { species: 'petalwisp', level: 22, moves: ['talon-dive', 'thorn-lash', 'spore-puff', 'second-wind'] },
      { species: 'cragmaul', level: 22, moves: ['quake-stomp', 'ram-charge', 'bedrock-brace', 'pebble-toss'] },
      { species: 'vulcrag', level: 23, moves: ['pyre-crash', 'quake-stomp', 'searing-fang', 'bedrock-brace'] },
      { species: 'maelstrode', level: 26, moves: ['breaker-crush', 'riptide-slam', 'brine-mist', 'stare-down'] },
    ],
    reward: 5000,
    intro: 'So you climbed all the way up here. Every kin on this plateau answers to the wind and to me. Show me what you\'ve built.',
    defeat: 'The crown wind has changed direction... It blows for you now, Champion.',
  },
];
