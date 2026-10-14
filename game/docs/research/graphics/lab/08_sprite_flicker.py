"""Lab 08d - temporal stability: % of sprite pixels that change between consecutive Idle frames.
native (rendered at 48 px) vs ss4 (192 px, dominant-colour downsample) vs ss4+hysteresis
(keep last frame's colour if it still holds >= 25 % of the block: pseudo-pixel's 'keep' rule)."""
import os, numpy as np, importlib.util
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); D = os.path.join(HERE, 'out', '08', 'flicker')
spec = importlib.util.spec_from_file_location('post', os.path.join(HERE, '08_sprite_post.py'))
# reuse helpers without running the sheet code: exec only the function defs
src = open(os.path.join(HERE, '08_sprite_post.py')).read().split('results = {}')[0]
ns = {'__file__': os.path.join(HERE, '08_sprite_post.py')}; exec(src, ns)
blocks, mode_down = ns['blocks'], ns['mode_down']
def mode_down_keep(img, s, prev, keep=0.25):
    out = mode_down(img, s)
    if prev is None: return out
    b = blocks(img, s); n = s * s
    pk = (prev[..., 0].astype(np.int64) << 16) | (prev[..., 1].astype(np.int64) << 8) | prev[..., 2]
    key = (b[..., 0].astype(np.int64) << 16) | (b[..., 1].astype(np.int64) << 8) | b[..., 2]
    share = ((key == pk[..., None]) & (b[..., 3] >= 128)).sum(-1) / n
    hold = (prev[..., 3] > 0) & (out[..., 3] > 0) & (share >= keep)
    out[hold] = prev[hold]
    return out
def load(p): return np.asarray(Image.open(p).convert('RGBA')).copy()
seqs = {'native': [], 'ss4_mode': [], 'ss4_mode_keep': []}
prev = None
for f in range(1, 13):
    seqs['native'].append(load(os.path.join(D, f'native_{f:02d}.png')))
    ss = load(os.path.join(D, f'ss4_{f:02d}.png'))
    seqs['ss4_mode'].append(mode_down(ss, 4))
    prev = mode_down_keep(ss, 4, prev); seqs['ss4_mode_keep'].append(prev)
for k, fr in seqs.items():
    ch = []
    for a, b in zip(fr, fr[1:]):
        m = (a[..., 3] > 0) | (b[..., 3] > 0)
        diff = (np.abs(a.astype(int) - b.astype(int)).sum(-1) > 0) & m
        ch.append(diff.sum() / m.sum())
    cols = np.mean([len(np.unique(x[x[..., 3] > 0][:, :3], axis=0)) for x in fr])
    print(f'{k:14s} changed px/frame: mean {np.mean(ch)*100:5.1f}%  max {np.max(ch)*100:5.1f}%   colours/frame {cols:.0f}')
# palette-locked: one 16-colour OKLab palette from frame 1, applied to every frame (what a real sheet does)
pal = ns['kmeans_palette'](seqs['ss4_mode_keep'][0], k=16)
for base in ('native', 'ss4_mode_keep'):
    fr = [ns['quantize_oklab'](x, pal) for x in seqs[base]]
    ch = []
    for a, b in zip(fr, fr[1:]):
        m = (a[..., 3] > 0) | (b[..., 3] > 0)
        ch.append(((np.abs(a.astype(int) - b.astype(int)).sum(-1) > 0) & m).sum() / m.sum())
    print(f'{base+"+pal16":14s} changed px/frame: mean {np.mean(ch)*100:5.1f}%  max {np.max(ch)*100:5.1f}%')
    Image.fromarray(np.concatenate(fr[:6], 1)).resize((48 * 6 * 4, 48 * 4), Image.NEAREST).save(os.path.join(HERE, 'out', f'08_strip_{base}_pal16.png'))
