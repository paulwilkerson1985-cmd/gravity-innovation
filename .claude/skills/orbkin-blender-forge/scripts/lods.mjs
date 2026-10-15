// lods.mjs: meshoptimizer simplify LODs from a packed or raw GLB (keeps skins, morphs, clips).
//   node ${CLAUDE_SKILL_DIR}/scripts/lods.mjs in.glb out_prefix --ratios 0.5,0.25 [--error 0.01] [--json rep.json]
// Writes out_prefix_lod1.glb, out_prefix_lod2.glb (meshopt high) and prints the tri counts.
// Measured: 2,690 -> 1,344 tris (ratio 0.5, error 0.01) looked identical at game size; ratio 0.2 with
// error 0.05 showed dark specks where simplified triangles sampled the UV gutter. Keep ratio >= 0.4 on
// textured pieces or fill gutters (compose.py dilates 4 texels). Ship LODs as separate files or named
// nodes: glTF has no ratified LOD extension and three r180 has no MSFT_lod loader.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(HERE, 'node', 'package.json'));
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { weld, simplify, meshopt } = require('@gltf-transform/functions');
const { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } = require('meshoptimizer');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const [inp, prefix] = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!inp || !prefix) { console.error('usage: lods.mjs in.glb out_prefix --ratios 0.5,0.25'); process.exit(64); }
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const ratios = opt('--ratios', '0.5,0.25').split(',').map(Number);
const error = parseFloat(opt('--error', '0.01'));
const rep = { input: inp, lods: [] };
const count = (doc) => doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).reduce((n, p) => n + (p.getIndices() ? p.getIndices().getCount() / 3 : p.getAttribute('POSITION').getCount() / 3), 0);
for (let i = 0; i < ratios.length; i++) {
  const doc = await io.read(inp);
  const before = count(doc);
  await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: ratios[i], error }), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  const out = `${prefix}_lod${i + 1}.glb`;
  await io.write(out, doc);
  const after = count(doc);
  const verts = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).reduce((n, p) => n + p.getAttribute('POSITION').getCount(), 0);
  const row = { file: out, ratio: ratios[i], trisBefore: before, trisAfter: after, kb: Math.round(fs.statSync(out).size / 1024 * 10) / 10 };
  if (after >= before * 0.95 && verts >= after * 2.5) row.warning = 'no reduction: vertices are unwelded (flat shading or per-CORNER colour attributes split every corner; weld() in glTF-Transform 4 has no tolerance). Decimate in Blender instead, or export POINT-domain colour attributes.';
  rep.lods.push(row);
}
if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify(rep, null, 1));
console.log(JSON.stringify(rep));
