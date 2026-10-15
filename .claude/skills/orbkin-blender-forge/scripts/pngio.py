"""pngio: dependency-free 8-bit PNG read/write (numpy + zlib) so the pixel tools run inside the Blender
python (no Pillow in desktop Blender or in the hash-locked bpy venv) as well as under plain python3.

    from pngio import read_rgba, write_rgba
    a = read_rgba('x.png')        # uint8 (H, W, 4); greyscale/RGB/palette-free 8-bit sources are widened
    write_rgba('y.png', a)        # RGBA uint8, deflate level 9, byte-stable
Supports colour types 0 (grey), 2 (RGB), 4 (grey+alpha), 6 (RGBA) at bit depth 8, non-interlaced,
and 16-bit grey/RGB (reduced to 8 bit with full range). Not JPEG: JPEG sources need Pillow.
"""
import zlib, struct
import numpy as np


def _unfilter(raw, h, stride, bpp):
    out = np.zeros((h, stride), np.uint8)
    pos = 0
    prev = np.zeros(stride, np.int32)
    for y in range(h):
        f = raw[pos]; pos += 1
        line = np.frombuffer(raw, np.uint8, stride, pos).astype(np.int32); pos += stride
        if f == 0:
            cur = line
        elif f == 1:
            cur = line.copy()
            for i in range(bpp, stride):
                cur[i] = (cur[i] + cur[i - bpp]) & 255
        elif f == 2:
            cur = (line + prev) & 255
        elif f == 3:
            cur = line.copy()
            for i in range(stride):
                left = cur[i - bpp] if i >= bpp else 0
                cur[i] = (cur[i] + ((left + prev[i]) >> 1)) & 255
        elif f == 4:
            cur = line.copy()
            for i in range(stride):
                a = cur[i - bpp] if i >= bpp else 0; b = prev[i]; c = prev[i - bpp] if i >= bpp else 0
                p = a + b - c; pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pred = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                cur[i] = (cur[i] + pred) & 255
        else:
            raise ValueError(f'bad PNG filter {f}')
        out[y] = cur; prev = cur
    return out


def read_rgba(path):
    data = open(path, 'rb').read()
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError('not a PNG')
    pos = 8; idat = []; w = h = depth = ctype = None; interlace = 0
    while pos < len(data):
        ln, typ = struct.unpack('>I4s', data[pos:pos + 8]); chunk = data[pos + 8:pos + 8 + ln]; pos += 12 + ln
        if typ == b'IHDR':
            w, h, depth, ctype, _, _, interlace = struct.unpack('>IIBBBBB', chunk)
        elif typ == b'IDAT':
            idat.append(chunk)
        elif typ == b'IEND':
            break
    if interlace:
        raise ValueError('interlaced PNG not supported (re-save it)')
    channels = {0: 1, 2: 3, 4: 2, 6: 4}[ctype]
    bps = depth // 8; bpp = channels * bps; stride = w * bpp
    raw = zlib.decompress(b''.join(idat))
    rows = _unfilter(raw, h, stride, bpp)
    if depth == 16:
        px = rows.reshape(h, w, channels, 2); px = (px[..., 0].astype(np.uint16) << 8 | px[..., 1]) >> 8; px = px.astype(np.uint8)
    else:
        px = rows.reshape(h, w, channels)
    out = np.zeros((h, w, 4), np.uint8); out[..., 3] = 255
    if channels == 1:
        out[..., :3] = px[..., :1]
    elif channels == 2:
        out[..., :3] = px[..., :1]; out[..., 3] = px[..., 1]
    elif channels == 3:
        out[..., :3] = px
    else:
        out[:] = px
    return out


def write_rgba(path, a):
    a = np.ascontiguousarray(a, np.uint8)
    if a.ndim == 2:
        a = np.stack([a, a, a, np.full_like(a, 255)], -1)
    if a.shape[2] == 3:
        a = np.concatenate([a, np.full(a.shape[:2] + (1,), 255, np.uint8)], -1)
    h, w = a.shape[:2]
    raw = b''.join(b'\x00' + a[y].tobytes() for y in range(h))
    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xFFFFFFFF)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    open(path, 'wb').write(png)
    return path


class Image:
    """Minimal stand-in for the PIL.Image calls the forge scripts use: Image.open(p).convert('RGBA'),
    Image.fromarray(a).save(p), .resize((w, h), NEAREST), np.asarray(img)."""
    NEAREST = 0; BILINEAR = 1

    def __init__(self, arr):
        self.arr = arr

    @classmethod
    def open(cls, path):
        if not str(path).lower().endswith('.png'):
            raise ImportError(f'{path}: only PNG without Pillow (pip-free fallback); install Pillow for JPEG')
        return cls(read_rgba(path))

    @classmethod
    def fromarray(cls, a):
        return cls(np.asarray(a))

    def convert(self, mode):
        if mode == 'RGBA':
            return self
        if mode == 'L':
            a = self.arr.astype(np.float32); return Image((0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]).astype(np.uint8))
        if mode == 'RGB':
            return Image(self.arr[..., :3])
        raise ValueError(mode)

    def resize(self, size, method=0):
        w, h = size; H, W = self.arr.shape[:2]
        ys = (np.arange(h) * H / h).astype(int); xs = (np.arange(w) * W / w).astype(int)
        return Image(self.arr[ys][:, xs])

    def save(self, path):
        write_rgba(path, self.arr)

    def __array__(self, dtype=None, copy=None):
        return self.arr if dtype is None else self.arr.astype(dtype)

    @property
    def mode(self):
        return 'RGBA' if self.arr.ndim == 3 and self.arr.shape[2] == 4 else ('RGB' if self.arr.ndim == 3 else 'L')

    @property
    def size(self):
        return (self.arr.shape[1], self.arr.shape[0])
