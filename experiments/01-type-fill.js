import { W, H, U, FONT_CHOICES, clamp, lerp, drawInfo, drawGrain, infoHeight } from '../app/lib/poster.js';

const pct = (v) => `${Math.round(v * 100)}%`;

export default {
  id: 'type-fill',
  title: 'Type Fill',
  description: 'Every line is stretched edge to edge. Glyph widths and row heights follow noise, then renormalise so the poster is always completely filled. A GSAP timeline pops letters out of the grid.',
  renderer: 'p2d',
  palettes: [
    ['#1a3cff', '#f4f1ea', '#ff5a1f', '#0b0b12'],
    ['#f4f1ea', '#111111', '#1a3cff', '#ff5a1f'],
    ['#0b0b12', '#e9e6dd', '#c8ff2e', '#5a4dff'],
    ['#ff5a1f', '#111111', '#f4f1ea', '#1a3cff'],
    ['#e6e1d3', '#0d2bb8', '#e03a2f', '#f2b134'],
  ],
  params: [
    { type: 'section', label: 'Text' },
    { key: 'text', type: 'text', label: 'Lines (separate with /)', value: 'PROCESSING / COMMUNITY / DAY / 2026 / SEOUL / 25 YEARS OF / PROCESSING / SOGANG / ART & / TECHNOLOGY' },
    { key: 'font', type: 'select', label: 'Typeface', options: Object.keys(FONT_CHOICES), value: 'Archivo Black' },
    { key: 'margin', type: 'range', label: 'Margin', min: 0, max: 120, step: 1, value: 44, unit: 'px' },
    { key: 'gutter', type: 'range', label: 'Row gap', min: 0, max: 40, step: 1, value: 8, unit: 'px' },
    { key: 'tracking', type: 'range', label: 'Letter gap', min: 0, max: 30, step: 1, value: 6, unit: 'px' },

    { type: 'section', label: 'Glyph X scale', note: 'Each glyph gets a noise-driven X scale. Widths are renormalised per row, so one row can compress while the next stays wide and every row still spans the canvas.' },
    { key: 'minX', type: 'range', label: 'Minimum X scale', min: 0.05, max: 2, step: 0.01, value: 0.3, format: pct },
    { key: 'maxX', type: 'range', label: 'Maximum X scale', min: 0.05, max: 3, step: 0.01, value: 1.9, format: pct },
    { key: 'noiseScale', type: 'range', label: 'Glyph noise scale', min: 0.01, max: 1, step: 0.01, value: 0.3 },
    { key: 'speedX', type: 'range', label: 'X scale speed', min: 0, max: 2, step: 0.01, value: 0.35 },
    { key: 'contrast', type: 'range', label: 'Contrast', min: 0.5, max: 5, step: 0.05, value: 2.4 },
    { key: 'phase', type: 'range', label: 'Row phase offset', min: 0, max: 3, step: 0.01, value: 1.19 },

    { type: 'section', label: 'Row height noise', note: 'Optional Y scaling. Row heights are accumulated, so there are still no gaps.' },
    { key: 'rowAnim', type: 'toggle', label: 'Row height animation', note: 'Noise-driven Y scale per row', value: true },
    { key: 'minY', type: 'range', label: 'Minimum Y scale', min: 0.1, max: 2, step: 0.01, value: 0.48, format: pct },
    { key: 'maxY', type: 'range', label: 'Maximum Y scale', min: 0.1, max: 3, step: 0.01, value: 1.7, format: pct },
    { key: 'speedY', type: 'range', label: 'Row scale speed', min: 0, max: 2, step: 0.01, value: 0.22 },

    { type: 'section', label: 'Pop', note: 'GSAP staggers glyphs in random order with back.out easing.' },
    { key: 'pop', type: 'select', label: 'Mode', options: ['off', 'pop', 'flip', 'wave'], value: 'pop' },
    { key: 'popAmount', type: 'range', label: 'Amount', min: 0, max: 2, step: 0.01, value: 0.6 },
    { key: 'popEvery', type: 'range', label: 'Stagger', min: 0.01, max: 0.4, step: 0.005, value: 0.16, unit: 's' },
    { key: 'popHold', type: 'range', label: 'Hold', min: 0, max: 3, step: 0.05, value: 0.3, unit: 's' },

    { type: 'section', label: 'Colour' },
    { key: 'colorMode', type: 'select', label: 'Colour mode', options: ['mono', 'numerals', 'alternate', 'bands'], value: 'numerals' },
    { key: 'palette', type: 'palette', label: 'Palette · bg / ink / accent / shadow', value: ['#1a3cff', '#f4f1ea', '#ff5a1f', '#0b0b12'] },
    { key: 'info', type: 'select', label: 'Info block', options: ['bottom', 'top', 'corners', 'none'], value: 'bottom' },
    { key: 'grain', type: 'range', label: 'Grain', min: 0, max: 0.4, step: 0.01, value: 0.08 },
    { key: 'seed', type: 'range', label: 'Noise seed', min: 1, max: 999, step: 1, value: 7 },
  ],

  create(p, P, api) {
    const ctx = p.drawingContext;
    const SIZE = 200;
    let rows = [];

    function layout() {
      ctx.font = FONT_CHOICES[P.font](SIZE);
      const lines = P.text.split('/').map((s) => s.trim().toUpperCase()).filter(Boolean);
      rows = lines.map((line) => ({
        highlight: /\d/.test(line) || line.includes('SEOUL'),
        chars: [...line].map((ch) => {
          if (ch === ' ') return { ch, space: true, adv: ctx.measureText(' ').width };
          const m = ctx.measureText(ch);
          return {
            ch,
            abL: m.actualBoundingBoxLeft,
            inkW: Math.max(1, m.actualBoundingBoxLeft + m.actualBoundingBoxRight),
            asc: m.actualBoundingBoxAscent,
            desc: m.actualBoundingBoxDescent,
            pop: { v: 0 },
            spin: Math.random() < 0.5 ? -1 : 1,
          };
        }),
      }));
      buildTimeline();
    }

    function buildTimeline() {
      api.killTweens();
      const targets = rows.flatMap((r) => r.chars.filter((c) => !c.space).map((c) => c.pop));
      targets.forEach((t) => { t.v = 0; });
      if (P.pop !== 'pop' && P.pop !== 'flip') return;
      const tl = api.timeline({ repeat: -1, repeatDelay: 0.4 });
      tl.to(targets, {
        v: 1,
        duration: P.pop === 'flip' ? 0.6 : 0.42,
        ease: P.pop === 'flip' ? 'power3.inOut' : 'back.out(2.6)',
        stagger: { each: P.popEvery, from: 'random', repeat: 1, yoyo: true, repeatDelay: P.popHold },
      });
    }

    p.noiseSeed(P.seed);
    layout();

    function drawGlyph(c, cx, cy, w, h, color, sx2 = 1, rot = 0, scale = 1) {
      const sx = (w / c.inkW) * sx2;
      const sy = h / (c.asc + c.desc);
      ctx.save();
      ctx.translate(cx, cy);
      if (rot) ctx.rotate(rot);
      if (scale !== 1) ctx.scale(scale, scale);
      ctx.scale(sx, sy);
      ctx.fillStyle = color;
      ctx.fillText(c.ch, -c.inkW / 2 + c.abL, (c.asc - c.desc) / 2);
      ctx.restore();
    }

    return {
      onParam(key) {
        if (key === 'text' || key === 'font') layout();
        if (key.startsWith('pop')) buildTimeline();
        if (key === 'seed') p.noiseSeed(P.seed);
      },
      draw() {
        const t = api.clock.t;
        const [bg, ink, accent, shadow] = P.palette;
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);
        ctx.font = FONT_CHOICES[P.font](SIZE);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';

        const m = P.margin * U;
        const infoReserve = infoHeight() + 22 * U;
        const top = m + (P.info === 'top' || P.info === 'corners' ? infoReserve : 0);
        const bottom = H - m - (P.info === 'bottom' || P.info === 'corners' ? infoReserve : 0);
        const x0 = m;
        const rowW = W - m * 2;
        const shape = (v) => clamp(0.5 + (v - 0.5) * P.contrast);

        const n = rows.length;
        const rw = rows.map((_, i) => (P.rowAnim ? lerp(P.minY, P.maxY, shape(p.noise(i * P.phase + 11.3, t * P.speedY))) : 1));
        const rSum = rw.reduce((a, b) => a + b, 0);
        const availH = bottom - top - P.gutter * U * (n - 1);

        const popped = [];
        let y = top;
        rows.forEach((row, i) => {
          const rh = (rw[i] / rSum) * availH;
          const cw = row.chars.map((c, j) => {
            const s = lerp(P.minX, P.maxX, shape(p.noise(j * P.noiseScale + i * P.phase, t * P.speedX + i * 0.37)));
            return (c.space ? c.adv * 0.6 : c.inkW) * Math.max(0.02, s);
          });
          const cSum = cw.reduce((a, b) => a + b, 0);
          const availW = rowW - P.tracking * U * (row.chars.length - 1);

          let rowInk = ink;
          if (P.colorMode === 'numerals' && row.highlight) rowInk = accent;
          if (P.colorMode === 'alternate' && i % 2) rowInk = shadow;
          if (P.colorMode === 'bands' && i % 2 === 0) {
            ctx.fillStyle = ink;
            ctx.fillRect(0, y - P.gutter * U * 0.5, W, rh + P.gutter * U);
            rowInk = bg;
          }

          let x = x0;
          row.chars.forEach((c, j) => {
            const w = (cw[j] / cSum) * availW;
            if (!c.space) {
              const cx = x + w / 2;
              const v = c.pop.v;
              let h = rh;
              let cy = y + rh / 2;
              if (P.pop === 'wave') {
                const k = 1 - P.popAmount * 0.45 * (0.5 + 0.5 * Math.sin(t * 2.6 - j * 0.55 - i * 0.9));
                h = rh * clamp(k, 0.05, 1);
                cy = y + rh - h / 2;
              }
              if (P.pop === 'flip' && v > 0.001) {
                const flip = Math.cos(v * Math.PI);
                popped.push(() => drawGlyph(c, cx, cy, w, h, flip < 0 ? accent : rowInk, flip));
              } else if (P.pop === 'pop' && v > 0.001) {
                const s = 1 + v * P.popAmount * clamp((240 * U) / Math.max(w, h), 0.12, 1);
                const rot = v * c.spin * 0.12 * P.popAmount;
                popped.push(() => {
                  drawGlyph(c, cx + 7 * U * v, cy + 7 * U * v, w, h, shadow, 1, rot, s);
                  drawGlyph(c, cx, cy, w, h, accent === rowInk ? ink : accent, 1, rot, s);
                });
              } else {
                drawGlyph(c, cx, cy, w, h, rowInk);
              }
            }
            x += w + P.tracking * U;
          });
          y += rh + P.gutter * U;
        });
        popped.forEach((f) => f());

        drawInfo(ctx, { layout: P.info, color: P.colorMode === 'bands' ? ink : ink, margin: m || 24 * U });
        drawGrain(ctx, P.grain);
      },
    };
  },
};
