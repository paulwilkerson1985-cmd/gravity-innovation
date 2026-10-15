// pack.mjs: glTF-Transform 4.5.1 per-slot packing. Never blind `gltf-transform optimize` (its defaults
// flatten, join, palette and SIMPLIFY; measured: destroyed characters, grew PNG files by 12 %).
//
//   node ${CLAUDE_SKILL_DIR}/scripts/pack.mjs in_raw.glb out.glb --preset static-pixel|static-smooth|animated
//        [--validate] [--texture-size 512] [--webp-quality 85] [--no-reorder] [--json report.json]
//
// Presets (verified in references/export-and-pack.md):
//   static-pixel   pixel-art atlases stay PNG (ETC1S turned 6 colours into 142; WebP lossless would
//                  also be fine but PNG is smaller for 7-colour art); dedup, prune, weld, sparse,
//                  reorder, meshopt high. For arena pieces, props, rocks.
//   static-smooth  baked smooth maps -> WebP (8x smaller than PNG), resized to --texture-size; same
//                  geometry chain. Draco is allowed for static props (--draco) but meshopt is the default
//                  because three r180 then needs only the 6.5 KB meshopt decoder.
//   animated       skins, morphs, clips: dedup, prune, resample, weld, sparse, reorder, meshopt high
//                  (Draco cannot compress animation: 165 KB vs 78 KB). `gltfpack -cc` is an alternative
//                  (62 KB, prunes constant tracks) via --gltfpack.
// Always: writes EXT_meshopt_compression (three r180 reads EXT_, not KHR_meshopt_compression which is
// r183+). KTX2 is opt-in and needs owner approval of an encoder (ktx binary or ktx2-encoder npm): not here.
// --validate runs the Khronos validator on the RAW input (it cannot decode meshopt output).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOLS = path.join(HERE, 'node');
const require = createRequire(path.join(TOOLS, 'package.json'));
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { dedup, prune, resample, weld, sparse, reorder, meshopt, draco, textureCompress, quantize } = require('@gltf-transform/functions');
const { MeshoptEncoder } = require('meshoptimizer');

const args = process.argv.slice(2);
const pos = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && ['--preset', '--texture-size', '--webp-quality', '--json'].includes(args[i - 1])));
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const flag = (k) => args.includes(k);
if (pos.length < 2 || flag('--help')) {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
  process.exit(pos.length < 2 ? 64 : 0);
}
const [inp, out] = pos;
const preset = opt('--preset', 'static-pixel');
const texSize = parseInt(opt('--texture-size', '512'), 10);
const report = { input: inp, output: out, preset, inputBytes: fs.statSync(inp).size, steps: [] };

if (flag('--validate')) {
  try {
    const r = execFileSync(path.join(TOOLS, 'node_modules', '.bin', 'gltf-transform'), ['validate', inp, '--format', 'csv'], { encoding: 'utf8' });
    const lines = r.trim().split('\n').slice(1);
    const errors = lines.filter((l) => l.startsWith('ERROR')).length;
    report.validate = { errors, warnings: lines.filter((l) => l.startsWith('WARNING')).length, lines: lines.slice(0, 20) };
    if (errors) { console.error('validator ERRORS on the raw export:\n' + lines.join('\n')); process.exit(1); }
  } catch (e) {
    const outp = (e.stdout || '') + (e.stderr || '');
    report.validate = { errors: -1, note: outp.slice(0, 2000) };
    if (/ERROR/.test(outp)) { console.error(outp); process.exit(1); }
  }
}

if (preset === 'animated' && flag('--gltfpack')) {
  const gp = path.join(TOOLS, 'node_modules', '.bin', 'gltfpack');
  execFileSync(gp, ['-i', inp, '-o', out, '-cc', '-kn', '-km', '-ke'], { stdio: 'inherit' });
  report.steps.push('gltfpack -cc -kn -km -ke');
} else {
  await MeshoptEncoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const doc = await io.read(inp);
  const steps = [dedup(), prune({ keepAttributes: false, keepLeaves: false })];
  report.steps.push('dedup', 'prune');
  if (preset === 'animated') { steps.push(resample()); report.steps.push('resample'); }
  steps.push(weld()); report.steps.push('weld');
  if (preset === 'static-smooth') {
    const sharp = require('sharp');
    steps.push(textureCompress({ encoder: sharp, targetFormat: 'webp', quality: parseInt(opt('--webp-quality', '85'), 10), resize: [texSize, texSize] }));
    report.steps.push(`webp q${opt('--webp-quality', '85')} <= ${texSize}`);
  } else {
    report.steps.push('textures untouched (PNG, pixel art)');
  }
  steps.push(sparse()); report.steps.push('sparse');
  if (!flag('--no-reorder')) { steps.push(reorder({ encoder: MeshoptEncoder, target: 'size' })); report.steps.push('reorder'); }
  if (flag('--draco') && preset !== 'animated') { steps.push(draco({ method: 'edgebreaker' })); report.steps.push('draco'); }
  else { steps.push(meshopt({ encoder: MeshoptEncoder, level: 'high' })); report.steps.push('meshopt high'); }
  await doc.transform(...steps);
  // pixel atlases: nearest filtering is the loader's job (three sets it from the sampler); write NEAREST samplers
  if (preset === 'static-pixel') {
    for (const t of doc.getRoot().listTextures()) { /* sampler filters live on TextureInfo in glTF-Transform */ }
    for (const m of doc.getRoot().listMaterials()) {
      const ti = m.getBaseColorTextureInfo();
      if (ti) { ti.setMagFilter(9728).setMinFilter(9728); } // NEAREST / NEAREST (mips: the game supplies palette mips)
    }
    report.steps.push('samplers NEAREST');
  }
  await io.write(out, doc);
}
report.outputBytes = fs.statSync(out).size;
report.outputKB = Math.round(report.outputBytes / 1024 * 10) / 10;
if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report));
