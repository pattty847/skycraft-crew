// Helpers for painting original 16×16 pixel art into canvases: seeded randomness,
// smooth value noise and a per-tile painter. Used by the atlas, water and crack textures.
export const TILE = 16;

export function makeRng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, y, seed) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Smooth value noise in [0, 1].
export function noise2(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed), c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
// Pick from a palette with a noisy index n in [0, 1].
export const pick = (palette, n) => palette[Math.max(0, Math.min(palette.length - 1, Math.floor(n * palette.length)))];

// Paint tiles laid out in a single row. paint(index, {px, fill, rng}) draws tile `index`.
export function paintRow(canvas, count, tiles) {
  canvas.width = count * TILE; canvas.height = TILE;
  const ctx = canvas.getContext('2d'), img = ctx.createImageData(canvas.width, TILE);
  tiles.forEach((fn, index) => {
    if (!fn) return;
    const rng = makeRng(1000 + index * 7919), ox = index * TILE;
    const px = (x, y, c, a = 255) => {
      if (x < 0 || y < 0 || x >= TILE || y >= TILE) return;
      const k = (y * canvas.width + ox + x) * 4;
      img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = a;
    };
    const fill = f => { for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(x, y, f(x, y)); };
    fn({ px, fill, rng });
  });
  ctx.putImageData(img, 0, 0);
  return canvas;
}
