// WebGL call recorder, injected as a Playwright init script BEFORE the game loads (audit.mjs).
// Hardware-independent counters of what a frame makes the GPU do: passes (framebuffer targets
// drawn into), draws, full-res passes, render-target bytes written (DRAM proxy), programs linked,
// GPU-resident texture + renderbuffer bytes, 2D canvases, JS heap. Plain script (no modules).
(() => {
  const R = { frames: [], cur: null, linked: 0, created: 0, textures: new Map(), rbs: new Map(), canvases: [], fbo: new Map(), gl: null, inFrame: false };
  globalThis.__orbAudit = R;
  const bytesPerPx = (fmt, type) => {
    // Internal formats/types we see in three r180: RGBA8 (4), RGBA16F (8), RGBA32F (16), depth24/stencil8 (4), depth16 (2), depth32f (4), R8 (1), RGB8 (3).
    const F = {
      0x1908: 4, 0x8058: 4, 0x8C43: 4, // RGBA, RGBA8, SRGB8_ALPHA8
      0x881A: 8, 0x8814: 16, // RGBA16F, RGBA32F
      0x8C3A: 4, // R11F_G11F_B10F
      0x1907: 3, 0x8051: 3, 0x8C41: 3, 0x881B: 6, 0x8815: 12, // RGB, RGB8, SRGB8, RGB16F, RGB32F
      0x1903: 1, 0x8229: 1, 0x822D: 2, 0x822E: 4, // RED, R8, R16F, R32F
      0x1906: 1, 0x1909: 1, 0x190A: 2, // ALPHA, LUMINANCE, LUMINANCE_ALPHA
      0x1902: 4, 0x81A5: 2, 0x81A6: 3, 0x8CAC: 4, 0x88F0: 4, 0x84F9: 4, 0x8CAD: 5, // DEPTH_COMPONENT, DEPTH16, DEPTH24, DEPTH32F, DEPTH24_STENCIL8, DEPTH_STENCIL, DEPTH32F_STENCIL8
      0x1901: 1, 0x8D48: 1, // STENCIL_INDEX8
    };
    if (F[fmt] !== undefined) {
      if (fmt === 0x1908 || fmt === 0x1907 || fmt === 0x1903) { // unsized: the type decides
        const T = { 0x1401: 1, 0x140B: 2, 0x8D61: 2, 0x1406: 4 }; // UNSIGNED_BYTE, HALF_FLOAT, HALF_FLOAT_OES, FLOAT
        return (F[fmt]) * (T[type] ?? 1);
      }
      return F[fmt];
    }
    return 4;
  };
  const newFrame = () => { R.cur = { passes: [], draws: 0, tris: 0 }; };
  newFrame();
  const endFrame = () => {
    if (!R.cur) return;
    R.frames.push(R.cur);
    if (R.frames.length > 240) R.frames.shift();
    newFrame();
  };
  // Frame boundary: the HD-2D frame ends with the grade pass drawing to the canvas (default
  // framebuffer). Everything since the previous canvas draw (sprite bakes, shadow map, scene,
  // bloom chain, grade) is one frame. Robust to Playwright's fake requestAnimationFrame.
  const origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
    const ctx = origGetContext.call(this, kind, ...rest);
    if (!ctx) return ctx;
    if (kind === '2d' || kind === 'bitmaprenderer') { if (!R.canvases.includes(this)) R.canvases.push(this); return ctx; }
    if ((kind === 'webgl2' || kind === 'webgl') && !ctx.__orbWrapped) wrap(ctx);
    return ctx;
  };
  function wrap(gl) {
    gl.__orbWrapped = true;
    if (!R.gl) R.gl = gl;
    const P = Object.getPrototypeOf(gl);
    const state = { fbo: null, boundTex: new Map(), boundRb: null, lastFboKey: '' };
    const hook = (name, fn) => { const o = P[name]; if (!o) return; gl[name] = function (...a) { const r = o.apply(this, a); try { fn(a, r); } catch (e) { /* never break the game */ } return r; }; };
    const texKey = (t) => t;
    hook('createTexture', (_a, r) => { R.textures.set(r, { w: 0, h: 0, bpp: 4, mips: 1, layers: 1 }); });
    hook('deleteTexture', (a) => { R.textures.delete(a[0]); });
    hook('bindTexture', (a) => { state.boundTex.set(a[0], a[1]); });
    const texSize = (target, level, w, h, fmt, type, d = 1) => {
      const t = state.boundTex.get(target === 0x8515 || (target >= 0x8515 && target <= 0x851A) ? 0x8513 : target) ?? state.boundTex.get(target);
      const rec = t && R.textures.get(t);
      if (!rec || level !== 0) return;
      rec.w = w; rec.h = h; rec.bpp = bytesPerPx(fmt, type); rec.layers = (target === 0x8513 ? 6 : d);
    };
    hook('texImage2D', (a) => {
      if (a.length >= 8) texSize(a[0], a[1], a[3], a[4], a[2], a[7]);
      else if (a[5] && (a[5].width || a[5].videoWidth)) texSize(a[0], a[1], a[5].width ?? a[5].videoWidth, a[5].height ?? a[5].videoHeight, a[2], a[4]);
    });
    hook('texStorage2D', (a) => { texSize(a[0], 0, a[3], a[4], a[2], 0); const t = state.boundTex.get(a[0]); const rec = t && R.textures.get(t); if (rec) rec.mips = a[1]; });
    hook('texImage3D', (a) => { if (a.length >= 9) texSize(a[0], a[1], a[3], a[4], a[2], a[8], a[5]); });
    hook('texStorage3D', (a) => { texSize(a[0], 0, a[3], a[4], a[2], 0, a[5]); });
    hook('compressedTexImage2D', (a) => { texSize(a[0], a[1], a[3], a[4], a[2], 0); const t = state.boundTex.get(a[0]); const rec = t && R.textures.get(t); if (rec) rec.bpp = 1; });
    hook('generateMipmap', (a) => { const t = state.boundTex.get(a[0]); const rec = t && R.textures.get(t); if (rec) rec.mips = 'full'; });
    hook('createRenderbuffer', (_a, r) => { R.rbs.set(r, { w: 0, h: 0, bpp: 4, samples: 0 }); });
    hook('deleteRenderbuffer', (a) => { R.rbs.delete(a[0]); });
    hook('bindRenderbuffer', (a) => { state.boundRb = a[1]; });
    hook('renderbufferStorage', (a) => { const r = R.rbs.get(state.boundRb); if (r) { r.w = a[2]; r.h = a[3]; r.bpp = bytesPerPx(a[1], 0); r.samples = 0; } });
    hook('renderbufferStorageMultisample', (a) => { const r = R.rbs.get(state.boundRb); if (r) { r.w = a[3]; r.h = a[4]; r.bpp = bytesPerPx(a[2], 0); r.samples = a[1]; } });
    hook('createFramebuffer', (_a, r) => { R.fbo.set(r, { color: null, depth: null }); });
    hook('deleteFramebuffer', (a) => { R.fbo.delete(a[0]); });
    hook('bindFramebuffer', (a) => { if (a[0] === 0x8D40 || a[0] === 0x8CA9) state.fbo = a[1]; }); // FRAMEBUFFER / DRAW_FRAMEBUFFER
    hook('framebufferTexture2D', (a) => { const f = R.fbo.get(state.fbo); if (!f) return; const att = a[1]; const tex = a[3]; if (att >= 0x8CE0 && att <= 0x8CEF) f.color = { tex }; else f.depth = { tex }; });
    hook('framebufferTextureLayer', (a) => { const f = R.fbo.get(state.fbo); if (!f) return; const att = a[1]; if (att >= 0x8CE0 && att <= 0x8CEF) f.color = { tex: a[2] }; else f.depth = { tex: a[2] }; });
    hook('framebufferRenderbuffer', (a) => { const f = R.fbo.get(state.fbo); if (!f) return; const att = a[1]; if (att >= 0x8CE0 && att <= 0x8CEF) f.color = { rb: a[3] }; else f.depth = { rb: a[3] }; });
    hook('linkProgram', () => { R.linked++; });
    hook('createProgram', () => { R.created++; });
    const target = () => {
      if (!state.fbo) return { key: 'canvas', w: gl.drawingBufferWidth, h: gl.drawingBufferHeight, bpp: 4, depth: 0, samples: 0 };
      const f = R.fbo.get(state.fbo) || {};
      const c = f.color?.tex ? R.textures.get(f.color.tex) : f.color?.rb ? R.rbs.get(f.color.rb) : null;
      const d = f.depth?.tex ? R.textures.get(f.depth.tex) : f.depth?.rb ? R.rbs.get(f.depth.rb) : null;
      const w = c?.w ?? d?.w ?? 0, h = c?.h ?? d?.h ?? 0;
      return { key: `fbo${[...R.fbo.keys()].indexOf(state.fbo)}:${w}x${h}`, w, h, bpp: c?.bpp ?? 0, depth: d?.bpp ?? 0, samples: c?.samples ?? 0 };
    };
    const onDraw = (tris) => {
      const cur = R.cur;
      if (!cur) return;
      const t = target();
      let p = cur.passes[cur.passes.length - 1];
      if (!p || p.key !== t.key) { p = { ...t, draws: 0, tris: 0 }; cur.passes.push(p); }
      p.draws++; p.tris += tris; cur.draws++; cur.tris += tris;
      if (t.key === 'canvas') endFrame();
    };
    const triCount = (mode, count, inst = 1) => (mode === 4 ? count / 3 : mode === 5 || mode === 6 ? Math.max(0, count - 2) : mode === 0 ? count : 0) * inst;
    hook('drawArrays', (a) => onDraw(triCount(a[0], a[2])));
    hook('drawElements', (a) => onDraw(triCount(a[0], a[1])));
    hook('drawArraysInstanced', (a) => onDraw(triCount(a[0], a[2], a[3])));
    hook('drawElementsInstanced', (a) => onDraw(triCount(a[0], a[1], a[4])));
    hook('drawRangeElements', (a) => onDraw(triCount(a[0], a[3])));
    hook('clear', () => { const cur = R.cur; if (!cur) return; const t = target(); const p = cur.passes[cur.passes.length - 1]; if (!p || p.key !== t.key) cur.passes.push({ ...t, draws: 0, tris: 0, cleared: true }); });
  }
  /** Snapshot the counters: averages over the last `n` frames + resident memory. */
  globalThis.__orbAuditSnapshot = (n = 12, internal = [0, 0]) => {
    const frames = R.frames.slice(-n);
    const area = internal[0] * internal[1];
    const avg = (f) => frames.reduce((s, x) => s + f(x), 0) / Math.max(1, frames.length);
    const isFull = (p) => p.w * p.h >= area * 0.98 && p.draws > 0;
    // DRAM proxy (MB/frame): bytes written per pass (colour + depth, × samples for MSAA + a resolve) plus one read of a
    // full-res input for every non-scene pass, plus the compositor reading the canvas (device px × 4).
    const dram = (fr) => {
      let b = 0;
      fr.passes.forEach((p, i) => {
        if (p.draws === 0 && !p.cleared) return;
        const px = p.w * p.h;
        const ms = Math.max(1, p.samples);
        b += px * (p.bpp * ms + p.depth * ms) + (p.samples ? px * p.bpp * 2 : 0);
        if (i > 0) b += px * (p.bpp || 4); // reads its input at its own size (post chain)
      });
      return b;
    };
    const texBytes = [...R.textures.values()].reduce((s, t) => s + t.w * t.h * t.bpp * t.layers * (t.mips === 'full' ? 1.333 : 1), 0);
    const rbBytes = [...R.rbs.values()].reduce((s, r) => s + r.w * r.h * r.bpp * Math.max(1, r.samples), 0);
    const canvasBytes = R.canvases.filter((c) => c.isConnected || true).reduce((s, c) => s + c.width * c.height * 4, 0);
    const dev = R.gl ? R.gl.drawingBufferWidth * R.gl.drawingBufferHeight : 0;
    const maxTex = [...R.textures.values()].reduce((m, t) => Math.max(m, t.w, t.h), 0);
    return {
      frames: frames.length,
      draws: avg((f) => f.draws), tris: avg((f) => f.tris),
      passes: avg((f) => f.passes.filter((p) => p.draws > 0).length),
      fullResPasses: avg((f) => f.passes.filter(isFull).length),
      maxTarget: frames.reduce((m, f) => f.passes.reduce((mm, p) => Math.max(mm, p.w * p.h), m), 0),
      msaaPasses: avg((f) => f.passes.filter((p) => p.samples > 0 && p.draws > 0).length),
      dramMB: avg(dram) / 1e6 + (dev * 4 * 2) / 1e6,
      programsLinked: R.linked,
      gpuResidentMB: (texBytes + rbBytes) / 1e6, textureMB: texBytes / 1e6, renderbufferMB: rbBytes / 1e6,
      maxTextureSize: maxTex,
      float32Targets: [...R.textures.values()].filter((t) => t.bpp === 16).length,
      canvases: R.canvases.length, canvasMB: canvasBytes / 1e6,
      heapMB: (performance.memory?.usedJSHeapSize ?? 0) / 1e6,
      lastFrame: frames.length ? frames[frames.length - 1].passes.map((p) => `${p.w}x${p.h}:${p.draws}d`).join(' ') : '',
    };
  };
})();
