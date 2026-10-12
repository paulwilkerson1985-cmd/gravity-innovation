// Rental kin for the Arena: ready-made L30 movesets so new players can battle at once.
export interface RentalData { id: string; species: string; moves: string[] }

export const RENTALS: RentalData[] = [
  { id: 'r-pyrelord', species: 'pyrelord', moves: ['pyre-crash', 'searing-fang', 'smolder-cloud', 'quick-jab'] },
  { id: 'r-maelstrode', species: 'maelstrode', moves: ['breaker-crush', 'riptide-slam', 'brine-mist', 'second-wind'] },
  { id: 'r-verdantusk', species: 'verdantusk', moves: ['grove-hammer', 'thorn-lash', 'spore-puff', 'second-wind'] },
  { id: 'r-stormoth', species: 'stormoth', moves: ['storm-lance', 'volt-lunge', 'jolt-wave', 'breeze-cut'] },
  { id: 'r-cragmaul', species: 'cragmaul', moves: ['landslide', 'quake-stomp', 'bedrock-brace', 'ram-charge'] },
  { id: 'r-cyclonyx', species: 'cyclonyx', moves: ['cyclone-slam', 'talon-dive', 'updraft', 'quick-jab'] },
  { id: 'r-vulcrag', species: 'vulcrag', moves: ['pyre-crash', 'landslide', 'searing-fang', 'bedrock-brace'] },
  { id: 'r-surgeray', species: 'surgeray', moves: ['storm-lance', 'breaker-crush', 'jolt-wave', 'riptide-slam'] },
  { id: 'r-petalwisp', species: 'petalwisp', moves: ['grove-hammer', 'talon-dive', 'spore-puff', 'second-wind'] },
  { id: 'r-cindertail', species: 'cindertail', moves: ['searing-fang', 'battle-cry', 'quick-jab', 'smolder-cloud'] },
  { id: 'r-rillback', species: 'rillback', moves: ['riptide-slam', 'stare-down', 'second-wind', 'brine-mist'] },
  { id: 'r-thistlehorn', species: 'thistlehorn', moves: ['thorn-lash', 'spore-puff', 'stare-down', 'bump'] },
];
