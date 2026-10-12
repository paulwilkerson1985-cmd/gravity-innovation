import type { RouteData } from '../engine/types';

export const ROUTES: RouteData[] = [
  {
    id: 'meadow', name: 'Mossy Meadow', levelRange: [2, 6], theme: 'meadow',
    hotspots: [
      { id: 'tall-grass', kind: 'grass', label: 'Tall grass', table: [
        { species: 'breezel', weight: 45, min: 2, max: 5 },
        { species: 'flickwing', weight: 40, min: 2, max: 5 },
        { species: 'pebblet', weight: 12, min: 3, max: 5 },
        { species: 'petalwisp', weight: 3, min: 6, max: 7 },
      ] },
      { id: 'flower-patch', kind: 'grass', label: 'Flower patch', table: [
        { species: 'flickwing', weight: 55, min: 3, max: 6 },
        { species: 'breezel', weight: 40, min: 3, max: 6 },
        { species: 'petalwisp', weight: 5, min: 6, max: 7 },
      ] },
      { id: 'hollow', kind: 'cave', label: 'Rocky hollow', table: [
        { species: 'pebblet', weight: 85, min: 3, max: 6 },
        { species: 'flickwing', weight: 15, min: 3, max: 5 },
      ] },
      { id: 'scout-pim', kind: 'trainer', label: 'Sprout Scout Pim', trainer: 'scout-pim', table: [] },
    ],
  },
  {
    id: 'ridge', name: 'Ember Ridge', levelRange: [8, 13], theme: 'ridge', unlockAfter: ['scout-pim'],
    hotspots: [
      { id: 'scrub', kind: 'grass', label: 'Dry scrub', table: [
        { species: 'breezel', weight: 40, min: 8, max: 12 },
        { species: 'pebblet', weight: 35, min: 8, max: 12 },
        { species: 'flickwing', weight: 25, min: 9, max: 13 },
      ] },
      { id: 'vent-cave', kind: 'cave', label: 'Steaming cave', table: [
        { species: 'pebblet', weight: 70, min: 10, max: 13 },
        { species: 'flickwing', weight: 18, min: 10, max: 13 },
        { species: 'vulcrag', weight: 12, min: 13, max: 15 },
      ] },
      { id: 'hiker-brann', kind: 'trainer', label: 'Ridge Hiker Brann', trainer: 'hiker-brann', table: [] },
      { id: 'adept-sola', kind: 'trainer', label: 'Cinder Adept Sola', trainer: 'adept-sola', table: [] },
    ],
  },
  {
    id: 'coast', name: 'Squall Coast', levelRange: [15, 21], theme: 'coast', unlockAfter: ['hiker-brann', 'adept-sola'],
    hotspots: [
      { id: 'dune-grass', kind: 'grass', label: 'Dune grass', table: [
        { species: 'breezel', weight: 40, min: 15, max: 17 },
        { species: 'flickwing', weight: 30, min: 15, max: 17 },
        { species: 'cyclonyx', weight: 24, min: 18, max: 23 },
        { species: 'petalwisp', weight: 6, min: 19, max: 23 },
      ] },
      { id: 'shallows', kind: 'water', label: 'Rough shallows', table: [
        { species: 'stormoth', weight: 35, min: 18, max: 23 },
        { species: 'breezel', weight: 30, min: 15, max: 17 },
        { species: 'flickwing', weight: 20, min: 15, max: 17 },
        { species: 'surgeray', weight: 15, min: 19, max: 23 },
      ] },
      { id: 'sea-cliff', kind: 'cave', label: 'Sea cliff', table: [
        { species: 'pebblet', weight: 45, min: 15, max: 17 },
        { species: 'cragmaul', weight: 45, min: 18, max: 23 },
        { species: 'vulcrag', weight: 10, min: 19, max: 23 },
      ] },
      { id: 'angler-merrow', kind: 'trainer', label: 'Storm Angler Merrow', trainer: 'angler-merrow', table: [] },
      { id: 'rider-tavi', kind: 'trainer', label: 'Gale Rider Tavi', trainer: 'rider-tavi', table: [] },
    ],
  },
  {
    id: 'plateau', name: 'Crown Plateau', levelRange: [21, 26], theme: 'summit', unlockAfter: ['angler-merrow', 'rider-tavi'],
    hotspots: [
      { id: 'champion-vale', kind: 'trainer', label: 'Champion Vale', trainer: 'champion-vale', table: [] },
    ],
  },
];
