import { W, H, U, FONT_CHOICES, hexToRgb, mulberry32, drawInfo, drawGrain } from '../app/lib/poster.js';
import { textMask } from '../app/lib/outlines.js';

// Gray-Scott feed / kill pairs that give recognisable patterns.
const PRESETS = {
  coral: [0.0545, 0.062],
  mitosis: [0.0367, 0.0649],
  worms: [0.078, 0.061],
  spots: [0.035, 0.065],
  maze: [0.029, 0.057],
  waves: [0.014, 0.045],
};

export default {
  id: 'reaction-diffusion',
  title: 'Reaction Diffusion',
  description: 'A Gray-Scott reaction-diffusion field seeded with the poster text. Chemical B starts inside the letters and grows coral, spots or worms; the letters can also be given their own feed rate so the pattern stays in the type. Drag to drop more B.',
  renderer: 'p2d',
  palettes: [
    ['#f4f1ea', '#0b0b12', '#e03a2f'],
    ['#0b0b12', '#c8ff2e', '#5a4dff'],
    ['#1a3cff', '#f4f1ea', '#ff5a1f'],
    ['#e6e1d3', '#0d2bb8', '#e03a2f'],
  ],
  params: [
    { type: 'section', label: 'Seed' },
    { key: 'text', type: 'text', label: 'Text (lines separated with /)', value: 'PCD/SEOUL/2026' },
    { key: 'font', type: 'select', label: 'Font', options: Object.keys(FONT_CHOICES), value: 'Archivo Black' },
    { key: 'res', type: 'range', label: 'Resolution', note: 'Simulation cells across the poster', min: 120, max: 520, step: 10, value: 380, rebuild: true },
    { key: 'speckle', type: 'range', label: 'Random seeds', min: 0, max: 0.02, step: 0.0005, value: 0.001 },

    { type: 'section', label: 'Chemistry' },
    { key: 'preset', type: 'select', label: 'Pattern', options: Object.keys(PRESETS), value: 'coral' },
    { key: 'inside', type: 'select', label: 'Letters', note: 'contain = pattern lives only in the type', options: ['same', 'contain', 'invert'], value: 'contain' },
    { key: 'steps', type: 'range', label: 'Steps / frame', min: 1, max: 40, step: 1, value: 14 },
    { key: 'restart', type: 'range', label: 'Restart after', note: '0 = never', min: 0, max: 120, step: 1, value: 40, unit: 's' },

    { type: 'section', label: 'Look' },
    { key: 'edge', type: 'range', label: 'Edge sharpness', min: 1, max: 30, step: 0.5, value: 10 },
    { key: 'level', type: 'range', label: 'Threshold', min: 0.05, max: 0.5, step: 0.01, value: 0.22 },
    { key: 'tint', type: 'toggle', label: 'Tint letters', note: 'Colour 3 inside the type', value: true },

    { type: 'section', label: 'Colour' },
    { key: 'palette', type: 'palette', label: 'Palette · bg / pattern / letters', value: ['#f4f1ea', '#0b0b12', '#e03a2f'] },
    { key: 'info', type: 'select', label: 'Info block', options: ['none', 'bottom', 'top', 'corners'], value: 'none' },
    { key: 'grain', type: 'range', label: 'Grain', min: 0, max: 0.4, step: 0.01, value: 0 },
  ],

  create(p, P, api) {
    const ctx = p.drawingContext;
    const w = Math.round(P.res);
    const h = Math.round((P.res * H) / W);
    const n = w * h;
    let A = new Float32Array(n);
    let B = new Float32Array(n);
    let A2 = new Float32Array(n);
    let B2 = new Float32Array(n);
    let mask = new Float32Array(n);
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const octx = off.getContext('2d');
    const img = octx.createImageData(w, h);
    let started = 0;

    function seed() {
      mask = textMask(P.text, FONT_CHOICES[P.font], w, h);
      const rnd = mulberry32(7);
      for (let i = 0; i < n; i++) {
        A[i] = 1;
        // Sparse speckle inside the type: solid B would starve A and die out.
        B[i] = mask[i] > 0.5 ? (rnd() < 0.18 ? 1 : 0) : rnd() < P.speckle ? 1 : 0;
      }
      started = api.clock.t;
    }
    seed();

    // One explicit Euler step of Gray-Scott with a 3 × 3 Laplacian, wrapping at the edges.
    function step() {
      const [F0, K0] = PRESETS[P.preset];
      for (let y = 0; y < h; y++) {
        const ym = ((y - 1 + h) % h) * w;
        const y0 = y * w;
        const yp = ((y + 1) % h) * w;
        for (let x = 0; x < w; x++) {
          const xm = (x - 1 + w) % w;
          const xp = (x + 1) % w;
          const i = y0 + x;
          const a = A[i];
          const b = B[i];
          const lapA = 0.2 * (A[ym + x] + A[yp + x] + A[y0 + xm] + A[y0 + xp]) + 0.05 * (A[ym + xm] + A[ym + xp] + A[yp + xm] + A[yp + xp]) - a;
          const lapB = 0.2 * (B[ym + x] + B[yp + x] + B[y0 + xm] + B[y0 + xp]) + 0.05 * (B[ym + xm] + B[ym + xp] + B[yp + xm] + B[yp + xp]) - b;
          // Outside the letters, 'contain' raises kill so B dies; 'invert' does it inside instead.
          const m = mask[i];
          let K = K0;
          if (P.inside === 'contain') K = K0 + (1 - m) * 0.02;
          else if (P.inside === 'invert') K = K0 + m * 0.02;
          const abb = a * b * b;
          A2[i] = Math.min(1, Math.max(0, a + (1.0 * lapA - abb + F0 * (1 - a))));
          B2[i] = Math.min(1, Math.max(0, b + (0.5 * lapB + abb - (K + F0) * b)));
        }
      }
      [A, A2] = [A2, A];
      [B, B2] = [B2, B];
    }

    const paint = () => {
      const cx = Math.floor((p.mouseX / W) * w);
      const cy = Math.floor((p.mouseY / H) * h);
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (x >= 0 && y >= 0 && x < w && y < h && dx * dx + dy * dy <= 9) B[y * w + x] = 1;
        }
      }
    };

    return {
      onParam(key) {
        if (['text', 'font', 'speckle'].includes(key)) seed();
      },
      mousePressed: paint,
      mouseDragged: paint,
      draw() {
        if (P.restart > 0 && api.clock.t - started > P.restart) seed();
        if (api.clock.dt > 0) for (let s = 0; s < P.steps; s++) step();

        const [bg, fg, lt] = P.palette.map(hexToRgb);
        const d = img.data;
        for (let i = 0; i < n; i++) {
          // Smooth threshold on B, so the scaled-up image keeps soft but defined edges.
          const v = 1 / (1 + Math.exp(-P.edge * 10 * (B[i] - P.level)));
          const ink = P.tint && mask[i] > 0.5 ? lt : fg;
          d[i * 4] = bg[0] + (ink[0] - bg[0]) * v;
          d[i * 4 + 1] = bg[1] + (ink[1] - bg[1]) * v;
          d[i * 4 + 2] = bg[2] + (ink[2] - bg[2]) * v;
          d[i * 4 + 3] = 255;
        }
        octx.putImageData(img, 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(off, 0, 0, W, H);

        drawInfo(ctx, { layout: P.info, color: P.palette[1], margin: 44 * U });
        drawGrain(ctx, P.grain);
      },
    };
  },
};
