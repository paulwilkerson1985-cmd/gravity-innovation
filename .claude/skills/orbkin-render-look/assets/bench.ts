// On-device render bench (`?bench=1`): copy to game/src/debug/bench.ts and add ONE line to main.ts
// after installHooks(game):
//   if (params.get('bench')) void import('./debug/bench').then((m) => m.runBench(game));
// Lazy chunk (≈ 5 KB gz), never loaded without the flag. One URL, one START tap, one COPY tap,
// ≈ 1–2.5 min, one `ORBKIN_BENCH {json}` line to paste into the chat (references/bench.md).
//
//   ?bench=1          warm-up + every case + probes      ?bench=quick   6 cases
//   &bcases=a,b,c     pick cases by id                   &bnoprobe=1    skip the fullscreen-pass probes
//   &bvar=flag        ALSO run every picked case with `post=flag` added (id `<case>+flag`): the ablation
//                     of your same-build switch, e.g. bvar=oldscreens → cost = title-low − title-low+oldscreens
//
// Per case: enterMs (scene build, instant mode), links/linkMs (programs linked while entering),
// syncMs p50/p90 (render + 1-px readPixels: CPU submit + GPU, no vsync), gpuMs p50/p90 (whole-frame
// TIME_ELAPSED when EXT_disjoint_timer_query_webgl2 is exposed: Chrome Android needs
// chrome://flags/#enable-webgl-developer-extensions, Safari the "WebGL Timer Queries" feature flag),
// cpuMs p50/p90 (inside renderer.render in the live loop), raf p50/p95/over20/over34 (real presentation
// cadence over 2 s), calls, tris, internal, programs, tex, geo, heapMB. Global: device, thermalDriftPct
// (cave-low-again vs cave-low), probe (one 9-tap fullscreen pass at ¼ / ½ / native in RGBA8 / RGBA16F
// and RGBA16F + MSAA4 with three's blit resolve; 400 tiny draws).
import * as THREE from 'three';
import type { Game } from '../game/game';
import { animClock, pendingTweens } from '../render/anim';

interface Case { id: string; scene: 'battle' | 'route' | 'title' | 'starter'; args?: Record<string, unknown>; q: 'low' | 'high'; post?: string }

const CASES: Case[] = [
  { id: 'cave-low', scene: 'battle', args: { route: 'ridge', hotspot: 'hiker-brann' }, q: 'low' },
  { id: 'cave-low-nobloom', scene: 'battle', args: { route: 'ridge', hotspot: 'hiker-brann' }, q: 'low', post: 'nobloom' },
  { id: 'cave-low-nopost', scene: 'battle', args: { route: 'ridge', hotspot: 'hiker-brann' }, q: 'low', post: 'nobloom,nograde,notilt' },
  { id: 'cave-high', scene: 'battle', args: { route: 'ridge', hotspot: 'hiker-brann' }, q: 'high' },
  { id: 'meadow-low', scene: 'battle', args: { route: 'meadow', hotspot: 'tall-grass' }, q: 'low' },
  { id: 'coast-low', scene: 'battle', args: { route: 'coast', hotspot: 'angler-merrow' }, q: 'low' },
  { id: 'route-low', scene: 'route', args: { route: 'meadow' }, q: 'low' },
  { id: 'title-low', scene: 'title', q: 'low' },
  { id: 'starter-low', scene: 'starter', q: 'low' },
  { id: 'cave-low-again', scene: 'battle', args: { route: 'ridge', hotspot: 'hiker-brann' }, q: 'low' },
];
const QUICK = ['cave-low', 'cave-low-nobloom', 'cave-high', 'meadow-low', 'title-low', 'cave-low-again'];

const pct = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))]! : 0; };
const r1 = (v: number) => Math.round(v * 10) / 10;
const nextFrame = () => new Promise<number>((r) => requestAnimationFrame(r));

/** Rewrite the query string so pipeline switches (`q`, `post`, `gfx`) are read by the next scene. */
function setQuery(c: Case) {
  const p = new URLSearchParams(location.search);
  p.set('gfx', 'hd2d'); p.set('q', c.q);
  if (c.post) p.set('post', c.post); else p.delete('post');
  history.replaceState(null, '', `?${p.toString()}`);
}

async function enter(game: Game, c: Case, links: { n: number; ms: number }) {
  setQuery(c);
  links.n = 0; links.ms = 0;
  animClock.instant = true;
  const t0 = performance.now();
  game.debugParty();
  await game.goto(c.scene, c.args ?? {});
  // Battles: wait for the command menu (idle); screens: wait for the entry tweens only.
  const ready = () => (c.scene === 'battle' ? game.idle && pendingTweens() === 0 : pendingTweens() === 0);
  for (let i = 0; i < 600 && !ready(); i++) await nextFrame();
  const enterMs = performance.now() - t0;
  animClock.instant = false;
  for (let i = 0; i < 40; i++) await nextFrame();
  return { enterMs: r1(enterMs), readyMs: r1(performance.now() - t0) };
}

function wrapLink(gl: WebGL2RenderingContext, links: { n: number; ms: number }) {
  const orig = gl.linkProgram.bind(gl);
  gl.linkProgram = (p: WebGLProgram) => { const t = performance.now(); orig(p); gl.getProgramParameter(p, gl.LINK_STATUS); links.n++; links.ms += performance.now() - t; };
}

async function measure(game: Game, ext: { beginQuery?: () => WebGLQuery | null; readQuery?: (q: WebGLQuery) => number | null } | null) {
  const r = game.renderer;
  const s = game.current!;
  const gl = r.gl.getContext() as WebGL2RenderingContext;
  const px = new Uint8Array(4);
  // sync frames: render + readPixels forces completion.
  const sync: number[] = [];
  for (let i = 0; i < 12; i++) {
    const t0 = performance.now();
    r.render(s.scene, s.camera);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    sync.push(performance.now() - t0);
    await nextFrame();
  }
  // live loop for 2 s: cpu time inside render, GPU timer queries, rAF cadence.
  const cpu: number[] = [], gpu: number[] = [], raf: number[] = [];
  const orig = r.render.bind(r);
  const pending: WebGLQuery[] = [];
  (r as { render: typeof r.render }).render = (scene, camera) => {
    const q = ext?.beginQuery?.() ?? null;
    const t0 = performance.now();
    orig(scene, camera);
    cpu.push(performance.now() - t0);
    if (q) { gl.endQuery((gl as unknown as { TIME_ELAPSED_EXT: number }).TIME_ELAPSED_EXT ?? 0x88BF); pending.push(q); }
  };
  let last = await nextFrame();
  const tEnd = last + 2000;
  while (last < tEnd) {
    const t = await nextFrame();
    raf.push(t - last); last = t;
    for (let i = 0; i < pending.length; i++) { const v = ext?.readQuery?.(pending[i]!); if (v !== null && v !== undefined) { gpu.push(v); pending.splice(i, 1); i--; } }
  }
  (r as { render: typeof r.render }).render = orig;
  const info = r.gl.info;
  const size = r.gl.getDrawingBufferSize(new THREE.Vector2());
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return {
    syncMs: { p50: r1(pct(sync, 0.5)), p90: r1(pct(sync, 0.9)) },
    gpuMs: gpu.length ? { p50: r1(pct(gpu, 0.5)), p90: r1(pct(gpu, 0.9)), n: gpu.length } : null,
    cpuMs: { p50: r1(pct(cpu, 0.5)), p90: r1(pct(cpu, 0.9)) },
    raf: { p50: r1(pct(raf, 0.5)), p95: r1(pct(raf, 0.95)), over20: r1((100 * raf.filter((x) => x > 20).length) / Math.max(1, raf.length)), over34: r1((100 * raf.filter((x) => x > 34).length) / Math.max(1, raf.length)), frames: raf.length },
    calls: info.render.calls, tris: info.render.triangles, internal: [size.x, size.y], programs: info.programs?.length ?? 0, tex: info.memory.textures, geo: info.memory.geometries,
    heapMB: mem ? r1(mem.usedJSHeapSize / 1e6) : null,
  };
}

function timerExt(gl: WebGL2RenderingContext) {
  const e = gl.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  if (!e) return null;
  return {
    beginQuery: () => { const q = gl.createQuery(); if (!q) return null; gl.beginQuery(e.TIME_ELAPSED_EXT, q); return q; },
    readQuery: (q: WebGLQuery) => {
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) return null;
      const disjoint = gl.getParameter(e.GPU_DISJOINT_EXT) as boolean;
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT) as number;
      gl.deleteQuery(q);
      return disjoint ? null : ns / 1e6;
    },
  };
}

function device(gl: WebGL2RenderingContext) {
  const dbg = gl.getExtension('WEBGL_debug_renderer_info') as { UNMASKED_RENDERER_WEBGL: number } | null;
  const exts = gl.getSupportedExtensions() ?? [];
  return {
    ua: navigator.userAgent, gpu: dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'masked', dpr: devicePixelRatio,
    css: [innerWidth, innerHeight], screen: [screen.width, screen.height], cores: navigator.hardwareConcurrency, deviceMemory: (navigator as { deviceMemory?: number }).deviceMemory ?? null,
    maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number, maxSamples: gl.getParameter(gl.MAX_SAMPLES) as number,
    ext: { timer: exts.includes('EXT_disjoint_timer_query_webgl2'), astc: exts.includes('WEBGL_compressed_texture_astc'), etc: exts.includes('WEBGL_compressed_texture_etc'), bptc: exts.includes('EXT_texture_compression_bptc'), colorBufferFloat: exts.includes('EXT_color_buffer_float'), colorBufferHalf: exts.includes('EXT_color_buffer_half_float'), floatLinear: exts.includes('OES_texture_float_linear'), parallelCompile: exts.includes('KHR_parallel_shader_compile'), msRtt: exts.includes('WEBGL_multisampled_render_to_texture') },
  };
}

/** Fullscreen-pass probe on a second context: one 9-tap pass at ¼ / ½ / native, RGBA8 / RGBA16F, + MSAA4. */
function probe(): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  const canvas = document.createElement('canvas');
  const W = Math.round(innerWidth * devicePixelRatio), H = Math.round(innerHeight * devicePixelRatio);
  canvas.width = W; canvas.height = H;
  const r = new THREE.WebGLRenderer({ canvas, antialias: false });
  r.setPixelRatio(1); r.setSize(W, H, false);
  const src = new THREE.WebGLRenderTarget(W, H, { depthBuffer: false });
  const mat = new THREE.ShaderMaterial({
    uniforms: { t: { value: src.texture }, px: { value: new THREE.Vector2(1 / W, 1 / H) } },
    vertexShader: 'varying vec2 v; void main(){ v = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform sampler2D t; uniform vec2 px; varying vec2 v; void main(){ vec4 c = vec4(0.0); for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) c += texture2D(t, v + vec2(float(i), float(j)) * px); gl_FragColor = c / 9.0; }',
  });
  const scene = new THREE.Scene(); scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const gl = r.getContext();
  const sink = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
  const px = new Uint8Array(4);
  const time = (rt: THREE.WebGLRenderTarget) => {
    const ms: number[] = [];
    for (let i = 0; i < 6; i++) {
      const t0 = performance.now();
      r.setRenderTarget(rt); r.render(scene, cam);
      r.setRenderTarget(sink); r.render(scene, cam); // forces the previous target to complete
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      ms.push(performance.now() - t0);
    }
    return r1(pct(ms, 0.5));
  };
  for (const [name, k] of [['q', 0.25], ['h', 0.5], ['n', 1]] as const) {
    for (const [fmt, type] of [['8', THREE.UnsignedByteType], ['16f', THREE.HalfFloatType]] as const) {
      const rt = new THREE.WebGLRenderTarget(Math.round(W * k), Math.round(H * k), { type, depthBuffer: false });
      try { out[`pass_${name}_${fmt}`] = time(rt); } catch { out[`pass_${name}_${fmt}`] = null; }
      rt.dispose();
    }
  }
  try { const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4, depthBuffer: false }); out.pass_n_16f_msaa4 = time(rt); rt.dispose(); } catch { out.pass_n_16f_msaa4 = null; }
  // 400 tiny separate draws (CPU submit cost).
  const many = new THREE.Scene(); const g = new THREE.BoxGeometry(0.01, 0.01, 0.01); const m = new THREE.MeshBasicMaterial();
  for (let i = 0; i < 400; i++) { const o = new THREE.Mesh(g, m); o.position.set((i % 20) / 10 - 1, Math.floor(i / 20) / 10 - 1, 0); many.add(o); }
  const ms: number[] = [];
  for (let i = 0; i < 5; i++) { const t0 = performance.now(); r.setRenderTarget(sink); r.render(many, cam); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ms.push(performance.now() - t0); }
  out.draw400Ms = r1(pct(ms, 0.5)); out.per100DrawsMs = r1(pct(ms, 0.5) / 4);
  src.dispose(); sink.dispose(); mat.dispose(); g.dispose(); m.dispose();
  r.forceContextLoss(); r.dispose();
  return out;
}

export async function runBench(game: Game) {
  const p = new URLSearchParams(location.search);
  const mode = p.get('bench') ?? '1';
  const picked = p.get('bcases')?.split(',').filter(Boolean);
  const base = CASES.filter((c) => (picked ? picked.includes(c.id) : mode === 'quick' ? QUICK.includes(c.id) : true));
  const bvar = p.get('bvar');
  const cases = bvar ? base.flatMap((c) => [c, { ...c, id: `${c.id}+${bvar}`, post: c.post ? `${c.post},${bvar}` : bvar }]) : base;
  const ui = document.createElement('div');
  ui.id = 'bench';
  ui.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;z-index:9999;background:#111d;color:#eee;font:14px monospace;padding:8px;border-radius:6px';
  const status = document.createElement('div'); status.textContent = `bench: ${cases.length} cases. Tap START, do not touch the screen (≈ ${Math.round(cases.length * 12 + 20)} s).`;
  const start = document.createElement('button'); start.textContent = 'START'; start.style.cssText = 'font-size:18px;padding:12px 24px;margin:6px';
  const copy = document.createElement('button'); copy.textContent = 'COPY'; copy.style.cssText = start.style.cssText; copy.disabled = true;
  const box = document.createElement('textarea'); box.style.cssText = 'width:100%;height:60px;font:11px monospace';
  ui.append(status, start, copy, box); document.body.appendChild(ui);
  start.onclick = async () => {
    start.disabled = true;
    const gl = game.renderer.gl.getContext() as WebGL2RenderingContext;
    const links = { n: 0, ms: 0 };
    wrapLink(gl, links);
    const ext = timerExt(gl);
    const result: Record<string, unknown> = { v: 1, at: new Date().toISOString(), mode, device: device(gl), cases: {} as Record<string, unknown> };
    const run = async (c: Case, id: string) => {
      status.textContent = `bench: ${id} …`;
      const e = await enter(game, c, links);
      const m = await measure(game, ext);
      (result.cases as Record<string, unknown>)[id] = { ...e, links: links.n, linkMs: r1(links.ms), ...m };
    };
    try {
      await run(CASES[0]!, 'warmup');
      for (const c of cases) await run(c, c.id);
      const cs = result.cases as Record<string, { syncMs: { p50: number }; gpuMs: { p50: number } | null }>;
      const a = cs['cave-low'], b = cs['cave-low-again'];
      result.thermalDriftPct = a && b ? r1((100 * ((b.gpuMs?.p50 ?? b.syncMs.p50) - (a.gpuMs?.p50 ?? a.syncMs.p50))) / Math.max(0.1, a.gpuMs?.p50 ?? a.syncMs.p50)) : null;
      if (!p.get('bnoprobe')) { status.textContent = 'bench: probes …'; try { result.probe = probe(); } catch (err) { result.probe = { error: String(err) }; } }
    } catch (err) {
      result.error = String(err);
    }
    const line = `ORBKIN_BENCH ${JSON.stringify(result)}`;
    console.log(line);
    box.value = line;
    (window as unknown as { __orbBench: unknown }).__orbBench = result;
    status.textContent = 'bench: done. Tap COPY (or long-press the box → Select All → Copy) and paste the line into the chat.';
    copy.disabled = false;
    copy.onclick = () => { void navigator.clipboard?.writeText(line).then(() => { status.textContent = 'copied'; }, () => { box.select(); status.textContent = 'select the box and copy'; }); };
  };
}
