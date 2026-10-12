// Low-poly people: the player and each trainer, built from primitives and merged into one
// mesh (one draw call). Every trainer gets a distinct palette, hat and prop so they read at a
// glance on the route map and in battle. Built facing +Z, feet on y = 0, ~1.05 units tall.
import * as THREE from 'three';
import { GEO, MeshBuilder } from './builder';

type Hat = 'cap' | 'ranger' | 'beanie' | 'band' | 'souwester' | 'goggles' | 'crown';
type Prop = 'none' | 'pack' | 'rod' | 'staff' | 'scarf' | 'cape';

export interface PersonLook {
  skin: string;
  hair: string;
  top: string;
  bottom: string;
  shoes: string;
  hat: Hat;
  hatColor: string;
  accent: string;
  prop: Prop;
  /** Long coat / robe instead of trousers. */
  robe?: boolean;
}

export const PLAYER_LOOK: PersonLook = {
  skin: '#ffd9b3', hair: '#5a3a2a', top: '#ff4d6d', bottom: '#2b3a67', shoes: '#1d1838', hat: 'cap', hatColor: '#ffffff', accent: '#ff4d6d', prop: 'pack',
};

const LOOKS: Record<string, PersonLook> = {
  'scout-pim': { skin: '#ffe0bd', hair: '#c9772f', top: '#4caf50', bottom: '#c9a46a', shoes: '#6b4a2a', hat: 'ranger', hatColor: '#8a9a3a', accent: '#ffd23f', prop: 'scarf' },
  'hiker-brann': { skin: '#e9b48a', hair: '#4a3020', top: '#a0522d', bottom: '#4a5a3a', shoes: '#3a2a1a', hat: 'beanie', hatColor: '#d8452f', accent: '#f2c230', prop: 'pack' },
  'adept-sola': { skin: '#f0c49a', hair: '#1d1838', top: '#ff7a1e', bottom: '#b8321e', shoes: '#3a1a1a', hat: 'band', hatColor: '#ffd23f', accent: '#ffd23f', prop: 'staff', robe: true },
  'angler-merrow': { skin: '#d9a07a', hair: '#7a7a8a', top: '#ffd23f', bottom: '#2f5f8f', shoes: '#1d2a3a', hat: 'souwester', hatColor: '#ffd23f', accent: '#3d9bff', prop: 'rod' },
  'rider-tavi': { skin: '#ffd9b3', hair: '#e8e8f8', top: '#2fb5a8', bottom: '#1d3a5a', shoes: '#f6f6f6', hat: 'goggles', hatColor: '#6fcde3', accent: '#ff9ad0', prop: 'scarf' },
  'champion-vale': { skin: '#f3c8a0', hair: '#2a1d48', top: '#5b3fbf', bottom: '#2a1d48', shoes: '#1d1838', hat: 'crown', hatColor: '#ffd23f', accent: '#ffffff', prop: 'cape', robe: true },
};

export function trainerLook(id: string): PersonLook {
  return LOOKS[id] ?? { ...PLAYER_LOOK, top: '#6f5ab8', hat: 'beanie', hatColor: '#3d9bff', prop: 'none' };
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function buildPersonGeometry(l: PersonLook): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const dark = new THREE.Color(l.top).multiplyScalar(0.72);
  // Legs / robe
  if (l.robe) {
    b.add(GEO.cone6, l.bottom, { p: [0, 0.3, 0], s: [0.26, 0.62, 0.22] }, 0.06);
    for (const x of [-0.08, 0.08]) b.add(GEO.box, l.shoes, { p: [x, 0.03, 0.06], s: [0.09, 0.06, 0.15] });
  } else {
    for (const x of [-0.085, 0.085]) {
      b.add(GEO.cyl, l.bottom, { p: [x, 0.2, 0], s: [0.07, 0.36, 0.07] });
      b.add(GEO.box, l.shoes, { p: [x, 0.03, 0.04], s: [0.1, 0.07, 0.16] });
    }
  }
  // Torso + arms
  b.add(GEO.ball, l.top, { p: [0, 0.55, 0], s: [0.21, 0.24, 0.16] }, 0.05);
  b.add(GEO.box, l.accent, { p: [0, 0.4, 0.0], s: [0.36, 0.05, 0.28] }); // belt / sash
  for (const sx of [-1, 1]) {
    b.along(GEO.cyl, dark, V(sx * 0.2, 0.68, 0), V(sx * 0.35, -1, 0.08), 0.32, 0.055);
    b.add(GEO.ball, l.skin, { p: [sx * 0.31, 0.38, 0.03], s: 0.055 });
  }
  // Head
  b.add(GEO.ball, l.skin, { p: [0, 0.88, 0], s: [0.15, 0.155, 0.145] });
  b.add(GEO.ball, l.hair, { p: [0, 0.92, -0.04], s: [0.16, 0.14, 0.14] });
  for (const sx of [-1, 1]) b.add(GEO.box, '#1d1838', { p: [sx * 0.055, 0.89, 0.135], s: [0.025, 0.045, 0.02] });
  // Hat
  switch (l.hat) {
    case 'cap':
      b.add(GEO.ball, l.hatColor, { p: [0, 0.98, 0], s: [0.16, 0.08, 0.16] });
      b.add(GEO.box, l.accent, { p: [0, 0.97, 0.13], s: [0.18, 0.03, 0.14] });
      break;
    case 'ranger':
      b.add(GEO.disc, l.hatColor, { p: [0, 1.0, 0], s: [0.27, 0.025, 0.27] });
      b.add(GEO.cyl, l.hatColor, { p: [0, 1.06, 0], s: [0.13, 0.11, 0.13] });
      b.add(GEO.cyl, l.accent, { p: [0, 1.03, 0], s: [0.135, 0.03, 0.135] });
      break;
    case 'beanie':
      b.add(GEO.ball, l.hatColor, { p: [0, 0.99, -0.01], s: [0.165, 0.11, 0.165] });
      b.add(GEO.ball, l.accent, { p: [0, 1.1, -0.01], s: 0.05 });
      b.add(GEO.cyl, new THREE.Color(l.hatColor).multiplyScalar(0.8), { p: [0, 0.94, -0.01], s: [0.168, 0.04, 0.168] });
      break;
    case 'band':
      b.add(GEO.cyl, l.hatColor, { p: [0, 0.95, 0], s: [0.158, 0.035, 0.158] });
      b.along(GEO.cone4, l.hair, V(0, 0.95, -0.12), V(0, -1, -0.25), 0.42, 0.07); // long ponytail
      break;
    case 'souwester':
      b.add(GEO.ball, l.hatColor, { p: [0, 0.99, 0], s: [0.17, 0.1, 0.17] });
      b.add(GEO.cone6, l.hatColor, { p: [0, 0.95, -0.02], r: [Math.PI, 0, 0], s: [0.28, 0.06, 0.3] });
      break;
    case 'goggles':
      b.add(GEO.cyl, '#1d1838', { p: [0, 0.97, 0], s: [0.16, 0.03, 0.16] });
      for (const sx of [-1, 1]) b.add(GEO.cyl, l.hatColor, { p: [sx * 0.06, 0.99, 0.12], r: [Math.PI / 2, 0, 0], s: [0.05, 0.04, 0.05] });
      b.add(GEO.cone4, l.hair, { p: [0, 1.04, -0.02], r: [0.3, 0, 0], s: [0.16, 0.12, 0.14] });
      break;
    case 'crown':
      b.add(GEO.cyl, l.hatColor, { p: [0, 1.02, 0], s: [0.12, 0.06, 0.12] });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        b.add(GEO.cone4, l.hatColor, { p: [Math.sin(a) * 0.1, 1.09, Math.cos(a) * 0.1], s: [0.035, 0.09, 0.035] });
      }
      b.add(GEO.oct, '#ff4d6d', { p: [0, 1.03, 0.12], s: 0.03 });
      break;
  }
  // Props
  switch (l.prop) {
    case 'pack':
      b.add(GEO.box, l.accent === l.top ? '#ffd23f' : l.accent, { p: [0, 0.58, -0.17], s: [0.24, 0.28, 0.12] }, 0.1);
      b.add(GEO.cyl, '#8a5a3a', { p: [0, 0.74, -0.17], r: [0, 0, Math.PI / 2], s: [0.05, 0.26, 0.05] });
      break;
    case 'rod':
      b.along(GEO.cyl, '#6b4a2a', V(0.31, 0.38, 0.05), V(0.25, 1, 0.35), 0.95, 0.015);
      b.add(GEO.ball, '#ff4d6d', { p: [0.52, 1.0, 0.36], s: 0.03 });
      break;
    case 'staff':
      b.add(GEO.cyl, '#8a5a3a', { p: [-0.32, 0.5, 0.05], s: [0.025, 1.0, 0.025] });
      b.add(GEO.oct, '#ff7a1e', { p: [-0.32, 1.05, 0.05], s: [0.06, 0.09, 0.06] });
      break;
    case 'scarf':
      b.add(GEO.cyl, l.accent, { p: [0, 0.74, 0], s: [0.13, 0.05, 0.13] });
      b.along(GEO.box, l.accent, V(0.06, 0.73, -0.1), V(0.3, -1, -0.5), 0.22, 0.05, 0.4);
      break;
    case 'cape':
      b.add(GEO.cone4, l.accent === '#ffffff' ? '#d9d2ff' : l.accent, { p: [0, 0.42, -0.14], r: [0.12, Math.PI / 4, 0], s: [0.3, 0.72, 0.08] }, 0.05);
      b.add(GEO.cone4, '#b8321e', { p: [0, 0.44, -0.11], r: [0.12, Math.PI / 4, 0], s: [0.26, 0.66, 0.06] });
      b.add(GEO.cyl, l.hatColor, { p: [0, 0.73, 0], s: [0.14, 0.04, 0.14] });
      break;
    case 'none':
      break;
  }
  return b.build();
}

/** A person as a single flat-shaded mesh. */
export function personMesh(look: PersonLook): THREE.Mesh {
  return new THREE.Mesh(buildPersonGeometry(look), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
}
