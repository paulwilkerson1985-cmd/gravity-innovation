// inspect_assert.mjs: NodeIO budget assertions on a (packed) GLB, decoding meshopt so counts are real.
//   node ${CLAUDE_SKILL_DIR}/scripts/inspect_assert.mjs file.glb [--max-tris 5000] [--max-kb 150] [--one-mesh]
//        [--one-material] [--require-attrs POSITION,NORMAL,TEXCOORD_0] [--no-double-sided]
//        [--require-ext EXT_meshopt_compression] [--forbid-ext KHR_draco_mesh_compression,KHR_texture_basisu]
//        [--max-image-px 512] [--max-joints 20] [--require-clips Idle] [--json out.json]
// Exit 0 pass, 1 fail (JSON lists failures), 2 unreadable. glbinfo.py does the same without node;
// this one also reports texture sizes decoded by glTF-Transform and the real vertex count after weld.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(HERE, 'node', 'package.json'));
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { MeshoptDecoder } = require('meshoptimizer');

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--'));
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const flag = (k) => args.includes(k);
if (!file) { console.error('usage: inspect_assert.mjs file.glb [assertions]'); process.exit(64); }
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
let doc;
try { doc = await io.read(file); } catch (e) { console.log(JSON.stringify({ error: String(e) })); process.exit(2); }
const root = doc.getRoot();
const json = JSON.parse(fs.readFileSync(file).subarray(20, 20 + fs.readFileSync(file).readUInt32LE(12)).toString());
const prims = [];
let tris = 0, verts = 0;
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) {
  const idx = p.getIndices(); const pos = p.getAttribute('POSITION');
  const t = idx ? idx.getCount() / 3 : pos.getCount() / 3;
  tris += t; verts += pos.getCount();
  prims.push({ mesh: mesh.getName(), attrs: p.listSemantics().sort(), tris: t, targets: p.listTargets().length, material: p.getMaterial()?.getName() });
}
const materials = root.listMaterials().map((m) => ({ name: m.getName(), doubleSided: m.getDoubleSided(), alphaMode: m.getAlphaMode(),
  textures: ['baseColor', 'normal', 'occlusion', 'emissive', 'metallicRoughness'].filter((k) => m[`get${k[0].toUpperCase()}${k.slice(1)}Texture`]()) }));
const images = root.listTextures().map((t) => ({ name: t.getName(), mime: t.getMimeType(), size: t.getSize(), bytes: t.getImage()?.byteLength }));
const skins = root.listSkins().map((s) => s.listJoints().length);
const anims = root.listAnimations().map((a) => ({ name: a.getName(), channels: a.listChannels().length }));
const rep = { file, kb: Math.round(fs.statSync(file).size / 1024 * 10) / 10, extensionsUsed: json.extensionsUsed || [], meshes: root.listMeshes().length,
  primitives: prims, tris, verts, materials, images, skins, animations: anims, failures: [] };
const f = rep.failures;
if (opt('--max-tris') && tris > +opt('--max-tris')) f.push(`tris ${tris} > ${opt('--max-tris')}`);
if (opt('--max-kb') && rep.kb > +opt('--max-kb')) f.push(`size ${rep.kb} KB > ${opt('--max-kb')}`);
if (flag('--one-mesh') && (rep.meshes !== 1 || prims.length !== 1)) f.push(`meshes ${rep.meshes}/primitives ${prims.length} != 1`);
if (flag('--one-material') && materials.length !== 1) f.push(`materials ${materials.length} != 1`);
if (opt('--require-attrs')) for (const p of prims) { const miss = opt('--require-attrs').split(',').filter((x) => !p.attrs.includes(x)); if (miss.length) f.push(`mesh ${p.mesh} lacks ${miss}`); }
if (flag('--no-double-sided') && materials.some((m) => m.doubleSided)) f.push('doubleSided material');
if (opt('--require-ext')) for (const e of opt('--require-ext').split(',')) if (!rep.extensionsUsed.includes(e)) f.push(`missing extension ${e}`);
if (opt('--forbid-ext')) for (const e of opt('--forbid-ext').split(',')) if (rep.extensionsUsed.includes(e)) f.push(`forbidden extension ${e}`);
if (opt('--max-image-px')) for (const im of images) if (im.size && Math.max(...im.size) > +opt('--max-image-px')) f.push(`image ${im.size} > ${opt('--max-image-px')}`);
if (opt('--max-joints') && skins.some((j) => j > +opt('--max-joints'))) f.push(`joints ${skins} > ${opt('--max-joints')}`);
if (opt('--require-clips')) for (const c of opt('--require-clips').split(',')) if (!anims.some((a) => a.name === c)) f.push(`missing clip ${c}`);
rep.pass = f.length === 0;
if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify(rep, null, 1));
console.log(JSON.stringify(rep, null, 1));
process.exit(rep.pass ? 0 : 1);
