import type { MoveData } from '../engine/types';

const atk = (
  id: string, name: string, type: MoveData['type'], power: number, accuracy: number, pp: number,
  blurb: string, extra: Partial<MoveData> = {},
): MoveData => ({ id, name, type, category: 'attack', power, accuracy, pp, priority: 0, blurb, ...extra });

const status = (
  id: string, name: string, type: MoveData['type'], accuracy: number, pp: number,
  effect: NonNullable<MoveData['effect']>, blurb: string,
): MoveData => ({ id, name, type, category: 'status', power: 0, accuracy, pp, priority: 0, effect, blurb });

export const MOVES: MoveData[] = [
  // Flame
  atk('cinder-spit', 'Cinder Spit', 'Flame', 40, 100, 25, 'Spits a glowing cinder.'),
  atk('searing-fang', 'Searing Fang', 'Flame', 65, 95, 15, 'A red-hot bite. May burn.', { effect: { kind: 'status', status: 'burn', chance: 0.15 } }),
  status('smolder-cloud', 'Smolder Cloud', 'Flame', 85, 15, { kind: 'status', status: 'burn', chance: 1 }, 'Wraps the foe in hot smoke to burn it.'),
  atk('pyre-crash', 'Pyre Crash', 'Flame', 95, 85, 5, 'Slams down wreathed in flame.'),
  // Tide
  atk('droplet-shot', 'Droplet Shot', 'Tide', 40, 100, 25, 'Fires a fast bead of water.'),
  atk('riptide-slam', 'Riptide Slam', 'Tide', 65, 95, 15, 'Crashes in with a pulling current.'),
  status('brine-mist', 'Brine Mist', 'Tide', 100, 15, { kind: 'stage', who: 'foe', stat: 'atk', delta: -1, chance: 1 }, 'Salty spray that lowers the foe\'s Attack.'),
  atk('breaker-crush', 'Breaker Crush', 'Tide', 95, 85, 5, 'Hammers the foe with a towering wave.'),
  // Flora
  atk('seed-sling', 'Seed Sling', 'Flora', 40, 100, 25, 'Flings hard seeds.'),
  atk('thorn-lash', 'Thorn Lash', 'Flora', 65, 95, 15, 'Whips with a thorny vine.'),
  status('spore-puff', 'Spore Puff', 'Flora', 75, 10, { kind: 'status', status: 'drowsy', chance: 1 }, 'A puff of sleepy spores makes the foe Drowsy.'),
  atk('grove-hammer', 'Grove Hammer', 'Flora', 95, 85, 5, 'Swings a mass of knotted roots.'),
  // Spark
  atk('static-nip', 'Static Nip', 'Spark', 40, 100, 25, 'A crackling nip. May shock.', { effect: { kind: 'status', status: 'shock', chance: 0.1 } }),
  atk('volt-lunge', 'Volt Lunge', 'Spark', 65, 95, 15, 'A charged headlong lunge.'),
  status('jolt-wave', 'Jolt Wave', 'Spark', 90, 15, { kind: 'status', status: 'shock', chance: 1 }, 'A ripple of current that Shocks the foe.'),
  atk('storm-lance', 'Storm Lance', 'Spark', 95, 85, 5, 'Hurls a spear of lightning.'),
  // Terra
  atk('pebble-toss', 'Pebble Toss', 'Terra', 40, 100, 25, 'Kicks up a spray of pebbles.'),
  atk('quake-stomp', 'Quake Stomp', 'Terra', 65, 95, 15, 'Stomps hard enough to crack stone.'),
  status('bedrock-brace', 'Bedrock Brace', 'Terra', 100, 15, { kind: 'stage', who: 'self', stat: 'def', delta: 2, chance: 1 }, 'Roots into the ground, sharply raising Defense.'),
  atk('landslide', 'Landslide', 'Terra', 95, 85, 5, 'Buries the foe under tumbling rock.'),
  // Gale
  atk('breeze-cut', 'Breeze Cut', 'Gale', 40, 100, 25, 'A thin blade of wind.'),
  atk('talon-dive', 'Talon Dive', 'Gale', 65, 95, 15, 'Dives from above, talons first.'),
  status('updraft', 'Updraft', 'Gale', 100, 15, { kind: 'stage', who: 'self', stat: 'spe', delta: 2, chance: 1 }, 'Rides a rising wind, sharply raising Speed.'),
  atk('cyclone-slam', 'Cyclone Slam', 'Gale', 95, 85, 5, 'Spins into a crushing whirlwind.'),
  // Neutral
  atk('bump', 'Bump', 'Neutral', 40, 100, 35, 'A plain, honest bump.'),
  atk('quick-jab', 'Quick Jab', 'Neutral', 40, 100, 30, 'Always strikes first.', { priority: 1 }),
  atk('ram-charge', 'Ram Charge', 'Neutral', 80, 90, 10, 'A reckless charge that also hurts the user.', { effect: { kind: 'recoil', fraction: 0.25 } }),
  status('battle-cry', 'Battle Cry', 'Neutral', 100, 20, { kind: 'stage', who: 'self', stat: 'atk', delta: 1, chance: 1 }, 'A rousing cry that raises Attack.'),
  status('stare-down', 'Stare Down', 'Neutral', 100, 25, { kind: 'stage', who: 'foe', stat: 'def', delta: -1, chance: 1 }, 'An unblinking stare that lowers the foe\'s Defense.'),
  status('second-wind', 'Second Wind', 'Neutral', 100, 10, { kind: 'heal', fraction: 0.5 }, 'Catches its breath and restores half its HP.'),
];

/** Used automatically when every move is out of PP. Not learnable. */
export const DESPERATION: MoveData = atk('desperation', 'Desperation', 'Neutral', 35, 100, 1, 'A last-ditch flail that also hurts the user.', { effect: { kind: 'recoil', fraction: 0.25 } });
