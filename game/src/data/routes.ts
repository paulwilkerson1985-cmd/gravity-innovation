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
    ],
  },
  {
    id: 'ridge', name: 'Ember Ridge', levelRange: [8, 14], theme: 'ridge',
    hotspots: [
      { id: 'scrub', kind: 'grass', label: 'Dry scrub', table: [
        { species: 'breezel', weight: 40, min: 8, max: 12 },
        { species: 'pebblet', weight: 40, min: 8, max: 12 },
        { species: 'flickwing', weight: 20, min: 9, max: 12 },
      ] },
      { id: 'vent-cave', kind: 'cave', label: 'Steaming cave', table: [
        { species: 'pebblet', weight: 70, min: 10, max: 13 },
        { species: 'cragmaul', weight: 22, min: 13, max: 14 },
        { species: 'vulcrag', weight: 8, min: 14, max: 15 },
      ] },
    ],
  },
  {
    id: 'coast', name: 'Squall Coast', levelRange: [15, 22], theme: 'coast',
    hotspots: [
      { id: 'dune-grass', kind: 'grass', label: 'Dune grass', table: [
        { species: 'breezel', weight: 45, min: 15, max: 17 },
        { species: 'flickwing', weight: 30, min: 15, max: 17 },
        { species: 'cyclonyx', weight: 20, min: 18, max: 21 },
        { species: 'petalwisp', weight: 5, min: 19, max: 21 },
      ] },
      { id: 'shallows', kind: 'water', label: 'Rough shallows', table: [
        { species: 'surgeray', weight: 25, min: 18, max: 21 },
        { species: 'stormoth', weight: 30, min: 18, max: 21 },
        { species: 'breezel', weight: 45, min: 15, max: 17 },
      ] },
      { id: 'sea-cliff', kind: 'cave', label: 'Sea cliff', table: [
        { species: 'pebblet', weight: 55, min: 15, max: 17 },
        { species: 'cragmaul', weight: 45, min: 18, max: 21 },
      ] },
    ],
  },
];
