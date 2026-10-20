import { W, H, U, FONT_CHOICES, hexToRgb, mulberry32, drawInfo, drawGrain } from '../app/lib/poster.js';
import { textMask } from '../app/lib/outlines.js';

// Box blur in place, `r` cells wide, rows then columns.
function blur(src, w, h, r) {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const k = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let d = -r; d <= r; d++) s += src[y * w + Math.min(w - 1, Math.max(0, x + d))];
      tmp[y * w + x] = s / k;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let d = -r; d <= r; d++) s += tmp[Math.min(h - 1, Math.max(0, y + d)) * w + x];
      out[y * w + x] = s / k;
    }
  }
  return out;
}

// Marching squares: line segments where the field crosses `iso`, with linear interpolation on each edge.
function contour(f, w, h, iso, cell, out) {
  const lerp = (a, b) => (iso - a) / (b - a || 1e-9);
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const a = f[y * w + x];
      const b = f[y * w + x + 1];
      const c = f[(y + 1) * w + x + 1];
      const d = f[(y + 1) * w + x];
      const idx = (a > iso ? 8 : 0) | (b > iso ? 4 : 0) | (c > iso ? 2 : 0) | (d > iso ? 1 : 0);
      if (idx === 0 || idx === 15) continue;
      const X = x * cell;
      const Y = y * cell;
      const T = [X + lerp(a, b) * cell, Y];
      const R = [X + cell, Y + lerp(b, c) * cell];
      const B = [X + lerp(d, c) * cell, Y + cell];
      const L = [X, Y + lerp(a, d) * cell];
      const seg = (p, q) => out.push(p[0], p[1], q[0], q[1]);
      switch (idx) {
        case 1: case 14: seg(L, B); break;
        case 2: case 13: seg(B, R); break;
        case 3: case 12: seg(L, R); break;
        case 4: case 11: seg(T, R); break;
        case 6: case 9: seg(T, B); break;
        case 7: case 8: seg(L, T); break;
        case 5: case 10: {
          // Saddle: the centre value decides which corners connect.
          const mid = (a + b + c + d) / 4 > iso;
          if ((idx === 5) === mid) { seg(L, T); seg(B, R); } else { seg(T, R); seg(L, B); }
          break;
        }
        default:
      }
    }
  }
}

export default {
  id: 'marching-squares',
  title: 'Marching Squares',
  description: 'The letters are blurred into a smooth scalar field and metaballs drift through it. Marching squares draws the field\'s contour lines like a topographic map, and as the threshold breathes the type melts into the blobs and sets again. The mouse is a metaball too.',
  renderer: 'p2d',
  palettes: [
    ['#f4f1ea', '#0b0b12', '#e03a2f', '#e6e1d3'],
    ['#0b0b12', '#c8ff2e', '#5a4dff', '#16162a'],
    ['#1a3cff', '#f4f1ea', '#ff5a1f', '#1430d0'],
    ['#ffffff', '#000000', '#000000', '#eeeeee'],
  ],
  params: [
    { type: 'section', label: 'Field' },
    { key: 'text', type: 'text', label: 'Text (lines separated with /)', value: 'PCD/SEOUL/2026' },
    { key: 'font', type: 'select', label: 'Font', options: Object.keys(FONT_CHOICES), value: 'Archivo Black' },
    { key: 'cell', type: 'range', label: 'Grid cell', note: 'Smaller is smoother and slower', min: 3, max: 24, step: 1, value: 7, unit: 'px', rebuild: true },
    { key: 'soft', type: 'range', label: 'Letter softness', min: 1, max: 20, step: 1, value: 5, unit: 'cells' },
    { key: 'balls', type: 'range', label: 'Metaballs', min: 0, max: 30, step: 1, value: 9 },
    { key: 'ballSize', type: 'range', label: 'Metaball size', min: 10, max: 300, step: 1, value: 90, unit: 'px' },
    { key: 'ballSpeed', type: 'range', label: 'Metaball speed', min: 0, max: 3, step: 0.01, value: 0.35 },

    { type: 'section', label: 'Contours' },
    { key: 'iso', type: 'range', label: 'Threshold', min: 0.05, max: 0.95, step: 0.01, value: 0.5 },
    { key: 'breathe', type: 'range', label: 'Breathe', note: 'Threshold swing over time', min: 0, max: 0.45, step: 0.01, value: 0.22 },
    { key: 'period', type: 'range', label: 'Breathe period', min: 1, max: 30, step: 0.5, value: 8, unit: 's' },
    { key: 'levels', type: 'range', label: 'Contour lines', min: 1, max: 30, step: 1, value: 10 },
    { key: 'spacing', type: 'range', label: 'Line spacing', min: 0.01, max: 0.2, step: 0.005, value: 0.06 },
    { key: 'weight', type: 'range', label: 'Line weight', min: 0.3, max: 8, step: 0.1, value: 1.6 },
    { key: 'fill', type: 'toggle', label: 'Fill the threshold shape', value: true },
    { key: 'grid', type: 'toggle', label: 'Show grid', value: false },

    { type: 'section', label: 'Colour' },
    { key: 'palette', type: 'palette', label: 'Palette · bg / line / fill / grid', value: ['#f4f1ea', '#0b0b12', '#e03a2f', '#e6e1d3'] },
    { key: 'info', type: 'select', label: 'Info block', options: ['none', 'bottom', 'top', 'corners'], value: 'none' },
    { key: 'grain', type: 'range', label: 'Grain', min: 0, max: 0.4, step: 0.01, value: 0 },
  ],

  create(p, P, api) {
    const ctx = p.drawingContext;
    const cell = P.cell * U;
    const gw = Math.ceil(W / cell) + 1;
    const gh = Math.ceil(H / cell) + 1;
    let letters = new Float32Array(gw * gh);
    const field = new Float32Array(gw * gh);
    const off = document.createElement('canvas');
    off.width = gw;
    off.height = gh;
    const octx = off.getContext('2d');
    const img = octx.createImageData(gw, gh);

    function build() {
      // Normalise so the blurred letter interior reaches about 1.
      letters = blur(textMask(P.text, FONT_CHOICES[P.font], gw, gh), gw, gh, Math.round(P.soft));
      let mx = 0;
      for (let i = 0; i < letters.length; i++) mx = Math.max(mx, letters[i]);
      if (mx > 0) for (let i = 0; i < letters.length; i++) letters[i] /= mx;
    }
    build();

    const rnd = mulberry32(11);
    const balls = Array.from({ length: 30 }, () => ({ x: rnd() * W, y: rnd() * H, a: rnd() * Math.PI * 2, s: 0.5 + rnd(), r: 0.6 + rnd() * 0.8 }));

    return {
      onParam(key) { if (['text', 'font', 'soft'].includes(key)) build(); },
      draw() {
        const t = api.clock.t;
        const [bg, lineCol, fillCol, gridCol] = P.palette;

        // Metaballs wander with a slowly turning heading and bounce off the edges.
        const live = balls.slice(0, P.balls).map((b) => {
          b.a += Math.sin(t * 0.3 + b.s * 10) * 0.02;
          b.x += Math.cos(b.a) * b.s * P.ballSpeed * 120 * api.clock.dt * U;
          b.y += Math.sin(b.a) * b.s * P.ballSpeed * 120 * api.clock.dt * U;
          if (b.x < 0 || b.x > W) { b.a = Math.PI - b.a; b.x = Math.min(W, Math.max(0, b.x)); }
          if (b.y < 0 || b.y > H) { b.a = -b.a; b.y = Math.min(H, Math.max(0, b.y)); }
          return { x: b.x, y: b.y, r: b.r * P.ballSize * U };
        });
        if (p.canvas.matches(':hover')) live.push({ x: p.mouseX, y: p.mouseY, r: P.ballSize * U * 1.2 });

        // Field = soft letters + Σ r² / d² from each ball.
        for (let y = 0; y < gh; y++) {
          for (let x = 0; x < gw; x++) {
            const px = x * cell;
            const py = y * cell;
            let v = letters[y * gw + x];
            for (const b of live) {
              const dx = px - b.x;
              const dy = py - b.y;
              v += (b.r * b.r * 0.5) / (dx * dx + dy * dy + 1);
            }
            field[y * gw + x] = v;
          }
        }

        const iso = P.iso + Math.sin((t / P.period) * Math.PI * 2) * P.breathe;

        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        if (P.fill) {
          // Smooth step at the threshold, scaled up; the contour line covers the soft edge.
          const [br, bgg, bb] = hexToRgb(bg);
          const [fr, fg, fb] = hexToRgb(fillCol);
          const d = img.data;
          for (let i = 0; i < field.length; i++) {
            const v = Math.min(1, Math.max(0, (field[i] - iso) * 40 + 0.5));
            d[i * 4] = br + (fr - br) * v;
            d[i * 4 + 1] = bgg + (fg - bgg) * v;
            d[i * 4 + 2] = bb + (fb - bb) * v;
            d[i * 4 + 3] = 255;
          }
          octx.putImageData(img, 0, 0);
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(off, 0, 0, gw * cell, gh * cell);
        }

        if (P.grid) {
          ctx.strokeStyle = gridCol;
          ctx.lineWidth = 0.6 * U;
          ctx.beginPath();
          for (let x = 0; x < gw; x++) { ctx.moveTo(x * cell, 0); ctx.lineTo(x * cell, H); }
          for (let y = 0; y < gh; y++) { ctx.moveTo(0, y * cell); ctx.lineTo(W, y * cell); }
          ctx.stroke();
        }

        // Contour lines: the threshold itself, then rings outward (lower values) like a map.
        ctx.strokeStyle = lineCol;
        ctx.lineCap = 'round';
        for (let k = 0; k < P.levels; k++) {
          const lv = iso - k * P.spacing;
          if (lv <= 0.005) break;
          const segs = [];
          contour(field, gw, gh, lv, cell, segs);
          ctx.globalAlpha = 1 - (k / P.levels) * 0.75;
          ctx.lineWidth = P.weight * U * (k === 0 ? 1.6 : 1);
          ctx.beginPath();
          for (let i = 0; i < segs.length; i += 4) { ctx.moveTo(segs[i], segs[i + 1]); ctx.lineTo(segs[i + 2], segs[i + 3]); }
          ctx.stroke();
        }
        ctx.globalAlpha = 1;

        drawInfo(ctx, { layout: P.info, color: lineCol, margin: 44 * U });
        drawGrain(ctx, P.grain);
      },
    };
  },
};
