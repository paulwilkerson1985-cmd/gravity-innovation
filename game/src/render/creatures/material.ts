// Creature material: flat-shaded Lambert with vertex colours, plus
//  - a vertex-shader "rig" for secondary motion (see kit.ts RIG kinds), and
//  - a small self-lit ambient term so faces turned away from every light never go near-black
//    (keeps colour blocks readable at the pixelated ~420 px internal resolution).
import * as THREE from 'three';

export interface CreatureUniforms {
  uTime: { value: number };
  uBlink: { value: number };
  uAct: { value: number };
  uAmb: { value: number };
}

const VERT_HEAD = /* glsl */ `
attribute vec4 rigA;
attribute vec3 rigB;
uniform float uTime;
uniform float uBlink;
uniform float uAct;
mat3 orbRotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 orbRotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 orbRotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
`;

const VERT_BODY = /* glsl */ `
#include <begin_vertex>
{
  float kind = rigA.w;
  if (kind > 0.5) {
    vec3 pv = rigA.xyz;
    vec3 q = transformed - pv;
    float amp = rigB.x * uAct;
    float wave = sin(uTime * rigB.z + rigB.y);
    float side = pv.x < 0.0 ? -1.0 : 1.0;
    if (kind < 1.5) {               // flap: about the forward axis, mirrored per side
      float w = wave * 0.75 + 0.25 * sin(uTime * rigB.z * 2.0 + rigB.y);
      q = orbRotZ(amp * w * side) * q;
    } else if (kind < 2.5) {        // wag: about the vertical axis
      q = orbRotY(amp * wave) * q;
    } else if (kind < 3.5) {        // nod / sway: about the side axis
      q = orbRotX(amp * wave) * q;
    } else if (kind < 4.5) {        // flicker: stretch up, thin out
      float f = 1.0 + amp * (0.6 * wave + 0.4 * sin(uTime * rigB.z * 1.73 + rigB.y * 2.1));
      q = vec3(q.x / sqrt(f), q.y * f, q.z / sqrt(f));
    } else if (kind < 5.5) {        // blink: squash eyes vertically
      q.y *= 1.0 - uBlink * 0.85;
    } else if (kind < 6.5) {        // twitch: occasional sharp flick (ears)
      float p = pow(max(0.0, wave), 16.0);
      q = orbRotZ(amp * p * side) * q;
    } else {                        // roll: about the forward axis, same direction both sides
      q = orbRotZ(amp * wave) * q;
    }
    transformed = pv + q;
  }
}
`;

const FRAG_AMBIENT = /* glsl */ `
#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * uAmb;
`;

export function creatureMaterial(): { material: THREE.MeshLambertMaterial; uniforms: CreatureUniforms } {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const uniforms: CreatureUniforms = { uTime: { value: 0 }, uBlink: { value: 0 }, uAct: { value: 1 }, uAmb: { value: 0.16 } };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = VERT_HEAD + shader.vertexShader.replace('#include <begin_vertex>', VERT_BODY);
    shader.fragmentShader = 'uniform float uAmb;\n' + shader.fragmentShader.replace('#include <emissivemap_fragment>', FRAG_AMBIENT);
  };
  material.customProgramCacheKey = () => 'orbkin-creature-v1';
  return { material, uniforms };
}
