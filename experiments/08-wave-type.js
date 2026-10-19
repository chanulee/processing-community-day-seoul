import { W, H, U, FONT, drawInfo, drawGrain } from '../app/lib/poster.js';

const TEXTS = {
  date: ['Saturday 31 October 2026'],
  title: ['Processing Community Day Seoul'],
  theme: ['Creative Coding in the Age of Vibe Coding'],
  venue: ['Sogang University Art & Technology'],
  mix: ['Processing Community Day', 'Saturday 31 October 2026', 'Sogang Art & Technology', '25 Years of Processing'],
};

export default {
  id: 'wave-type',
  title: 'Wave Type',
  description: 'Lines of text ride travelling sine curves laid out by arc length, after the wave-date reference. Inter’s variable weight ripples along each line, and the middle lines slide off the left edge.',
  renderer: 'p2d',
  palettes: [
    ['#ffffff', '#111111', '#2f6bff'],
    ['#111111', '#f2efe6', '#ff5a1f'],
    ['#0a22b0', '#ffffff', '#ffd23f'],
    ['#e4dccb', '#1d1a5c', '#e8442e'],
    ['#d8ff3a', '#111111', '#111111'],
  ],
  params: [
    { type: 'section', label: 'Text' },
    { key: 'text', type: 'select', label: 'Content', options: Object.keys(TEXTS), value: 'date' },
    { key: 'lines', type: 'range', label: 'Lines', min: 3, max: 40, step: 1, value: 17 },
    { key: 'size', type: 'range', label: 'Font size', min: 14, max: 120, step: 1, value: 46, unit: 'px' },
    { key: 'wMin', type: 'range', label: 'Weight min', min: 100, max: 900, step: 10, value: 300 },
    { key: 'wMax', type: 'range', label: 'Weight max', min: 100, max: 900, step: 10, value: 600 },
    { key: 'wSpeed', type: 'range', label: 'Weight wave speed', min: 0, max: 6, step: 0.05, value: 1.6 },
    { key: 'repeat', type: 'range', label: 'Repeats per line', min: 1, max: 4, step: 1, value: 1 },
    { type: 'section', label: 'Curve' },
    { key: 'layout', type: 'select', label: 'Layout', options: ['bracket', 'fill'], value: 'bracket' },
    { key: 'spread', type: 'range', label: 'Line spread', min: 100, max: 1600, step: 5, value: 760 },
    { key: 'fan', type: 'range', label: 'Fan', min: -1.5, max: 1.5, step: 0.01, value: 0.68 },
    { key: 'amp', type: 'range', label: 'Wave amplitude', min: 0, max: 300, step: 1, value: 96 },
    { key: 'freq', type: 'range', label: 'Wave frequency', min: 0.2, max: 6, step: 0.05, value: 0.85 },
    { key: 'speed', type: 'range', label: 'Wave speed', min: -4, max: 4, step: 0.05, value: 1 },
    { key: 'phaseStep', type: 'range', label: 'Phase per line', min: 0, max: 1.5, step: 0.01, value: 0.28 },
    { key: 'shift', type: 'range', label: 'Middle shift', min: 0, max: 900, step: 5, value: 500 },
    { key: 'start', type: 'range', label: 'Start x', min: 0, max: 900, step: 5, value: 400 },
    { type: 'section', label: 'Colour' },
    { key: 'palette', type: 'palette', label: 'Palette · bg / ink / accent', value: ['#ffffff', '#111111', '#2f6bff'] },
    { key: 'accentLine', type: 'toggle', label: 'Accent centre line', value: false },
    { key: 'info', type: 'select', label: 'Info block', options: ['bottom', 'top', 'corners', 'none'], value: 'corners' },
    { key: 'grain', type: 'range', label: 'Grain', min: 0, max: 0.4, step: 0.01, value: 0 },
  ],

  create(p, P, api) {
    const ctx = p.drawingContext;
    const xs = new Float32Array(2048);
    const ys = new Float32Array(2048);
    const ls = new Float32Array(2048);

    return {
      draw() {
        const t = api.clock.t;
        const [bg, ink, accent] = P.palette;
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
        const n = P.lines;
        const texts = TEXTS[P.text];
        const size = P.size * U;
        const yc = H * 0.5;

        for (let i = 0; i < n; i++) {
          const s = n === 1 ? 0 : i / (n - 1) - 0.5;
          const str = Array(P.repeat).fill(texts[i % texts.length]).join('   ');
          const bracket = P.layout === 'bracket';
          const x0 = bracket
            ? P.start * U - P.shift * U * Math.cos(s * Math.PI) * (0.8 + 0.2 * Math.sin(t * 0.4))
            : -100 * U + Math.sin(t * 0.3 + i * 0.5) * 60 * U;
          const yBase = yc + s * P.spread * U;
          const fan = bracket ? -P.fan * s * 2 : 0;
          const bulge = bracket ? 0.35 + Math.abs(s) * 1.3 : 1;
          const k = (P.freq * Math.PI * 2) / W;
          const ph = -t * P.speed + i * P.phaseStep;

          const step = 4;
          let len = 0;
          let count = 0;
          for (let j = 0; j < xs.length; j++) {
            const x = x0 + j * step;
            const dx = x - x0;
            const y = yBase - fan * dx * 0.5 + Math.sin(dx * k + ph) * P.amp * U * bulge;
            if (j) len += Math.hypot(x - xs[j - 1], y - ys[j - 1]);
            xs[j] = x;
            ys[j] = y;
            ls[j] = len;
            count = j + 1;
            if (x > W + size * 2) break;
          }

          ctx.fillStyle = P.accentLine && i === Math.floor(n / 2) ? accent : ink;
          let dist = 0;
          let seg = 0;
          for (let c = 0; c < str.length; c++) {
            const ch = str[c];
            const wv = 0.5 + 0.5 * Math.sin(c * 0.35 - t * P.wSpeed + i * 0.45);
            const wght = Math.round(P.wMin + (P.wMax - P.wMin) * wv);
            ctx.font = `${wght} ${size}px ${FONT.sans}`;
            const adv = ctx.measureText(ch).width;
            const mid = dist + adv / 2;
            while (seg < count - 2 && ls[seg + 1] < mid) seg++;
            if (seg >= count - 2) break;
            const f = (mid - ls[seg]) / Math.max(1e-6, ls[seg + 1] - ls[seg]);
            const x = xs[seg] + (xs[seg + 1] - xs[seg]) * f;
            const y = ys[seg] + (ys[seg + 1] - ys[seg]) * f;
            const ang = Math.atan2(ys[seg + 1] - ys[seg], xs[seg + 1] - xs[seg]);
            dist += adv;
            if (x < -size || ch === ' ') continue;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(ang);
            ctx.fillText(ch, -adv / 2, 0);
            ctx.restore();
          }
        }
        drawInfo(ctx, { layout: P.info, color: ink, font: FONT.sans });
        drawGrain(ctx, P.grain);
      },
    };
  },
};
