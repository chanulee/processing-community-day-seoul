import { W, H } from './poster.js';
import { parse as parseFont } from '../../vendor/opentype.module.js';

export const FONTS = {
  'Areal Bold': 'vendor/fonts/areal/ABCAreal-Bold.ttf',
  'Areal Regular': 'vendor/fonts/areal/ABCAreal-Regular.ttf',
  'Archivo Black': 'vendor/fonts/ArchivoBlack-Regular.ttf',
  'Space Mono': 'vendor/fonts/SpaceMono-Bold.ttf',
};
const fontCache = {};
export const loadFont = (name) => (fontCache[name] ||= fetch(FONTS[name]).then((r) => r.arrayBuffer()).then(parseFont));

// Glyph outlines as polylines: one stroke per contour, curves flattened.
export function textContours(font, lines, size, leading, fit) {
  const out = [];
  if (fit) {
    // Shrink the block until the widest line and the total height sit inside the margins.
    const widest = Math.max(...lines.map((l) => font.getAdvanceWidth(l, size)));
    const tall = size * (leading * (lines.length - 1) + 1);
    size *= Math.min(1, (W * 0.88) / widest, (H * 0.88) / tall);
  }
  const widths = lines.map((l) => font.getAdvanceWidth(l, size));
  const lh = size * leading;
  const top = H / 2 - (lh * (lines.length - 1)) / 2 + size * 0.35;
  lines.forEach((line, li) => {
    const path = font.getPath(line, W / 2 - widths[li] / 2, top + li * lh, size);
    let cur = null;
    let last = [0, 0];
    const curve = (fn, n = 16) => { for (let i = 1; i <= n; i++) cur.push(fn(i / n)); };
    path.commands.forEach((c) => {
      if (c.type === 'M') { cur = [[c.x, c.y]]; out.push(cur); }
      else if (c.type === 'L') cur.push([c.x, c.y]);
      else if (c.type === 'Q') {
        const [x0, y0] = last;
        curve((t) => { const u = 1 - t; return [u * u * x0 + 2 * u * t * c.x1 + t * t * c.x, u * u * y0 + 2 * u * t * c.y1 + t * t * c.y]; });
      } else if (c.type === 'C') {
        const [x0, y0] = last;
        curve((t) => {
          const u = 1 - t;
          return [u * u * u * x0 + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x,
            u * u * u * y0 + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y];
        });
      } else if (c.type === 'Z' && cur) cur.push([...cur[0]]);
      if (c.x !== undefined) last = [c.x, c.y];
    });
  });
  return out.filter((c) => c.length > 1);
}

// Resample a raw mouse path to even arc-length steps, with light smoothing.
export function resample(pts, step, smoothing) {
  if (pts.length < 2) return pts.map(([x, y]) => ({ x, y, s: 0 }));
  let src = pts;
  for (let k = 0; k < smoothing; k++) {
    src = src.map((q, i) => {
      if (i === 0 || i === src.length - 1) return q;
      const a = src[i - 1];
      const b = src[i + 1];
      return [(a[0] + 2 * q[0] + b[0]) / 4, (a[1] + 2 * q[1] + b[1]) / 4];
    });
  }
  const out = [{ x: src[0][0], y: src[0][1], s: 0 }];
  let carry = 0;
  for (let i = 1; i < src.length; i++) {
    const [ax, ay] = src[i - 1];
    const [bx, by] = src[i];
    const len = Math.hypot(bx - ax, by - ay);
    let d = step - carry;
    while (d <= len) {
      const t = d / len;
      out.push({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t, s: out.length * step });
      d += step;
    }
    carry = len - (d - step);
  }
  return out;
}


// Text rasterised to a w × h alpha mask (0–1), centred and fitted to the poster, lines separated by '/'.
// fontFn is one of FONT_CHOICES (size => CSS font string).
// rotate (degrees) turns the block about the centre; zoom > 1 scales it past the fit and crops.
export function textMask(text, fontFn, w, h, { fill = 0.86, leading = 0.98, rotate = 0, zoom = 1 } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const o = c.getContext('2d');
  const lines = text.split('/').map((l) => l.trim()).filter(Boolean);
  if (lines.length) {
    // Fit the rotated block's bounding box inside the canvas.
    const a = (rotate * Math.PI) / 180;
    const cs = Math.abs(Math.cos(a));
    const sn = Math.abs(Math.sin(a));
    let size = 100;
    o.font = fontFn(size);
    const bw = Math.max(...lines.map((l) => o.measureText(l).width));
    const bh = size * leading * lines.length;
    size *= Math.min((w * fill) / (bw * cs + bh * sn), (h * fill) / (bw * sn + bh * cs)) * zoom;
    o.font = fontFn(size);
    o.textAlign = 'center';
    o.textBaseline = 'middle';
    o.translate(w / 2, h / 2);
    o.rotate(a);
    lines.forEach((l, i) => o.fillText(l, 0, (i - (lines.length - 1) / 2) * size * leading));
  }
  const px = o.getImageData(0, 0, w, h).data;
  const m = new Float32Array(w * h);
  for (let i = 0; i < m.length; i++) m[i] = px[i * 4 + 3] / 255;
  return m;
}
