import { prepareRichInline, layoutNextRichInlineLineRange, materializeRichInlineLineRange } from '../vendor/pretext/rich-inline.js';
import { W, H, U, FONT, clamp, drawInfo, drawGrain, infoHeight } from '../app/lib/poster.js';

const pct = (v) => `${Math.round(v * 100)}%`;
const COPY = 'PROCESSING COMMUNITY DAY @ SEOUL 2026 — 25 YEARS OF PROCESSING. CREATIVE CODING IN THE AGE OF VIBE CODING. 2026.10.31 SAT 12:30–17:30 SOGANG UNIVERSITY ART & TECHNOLOGY.';

export default {
  id: 'pretext-flow',
  title: 'Pretext Flow',
  description: 'One paragraph set in ABC Areal. Instead of popping out of the grid, a growing letter stays in the text: every frame Pretext re-breaks the paragraph, so neighbours shift and lines rewrap around it.',
  renderer: 'p2d',
  palettes: [
    ['#f4f1ea', '#111111', '#1a3cff', '#ff5a1f'],
    ['#1a3cff', '#f4f1ea', '#ff5a1f', '#0b0b12'],
    ['#0b0b12', '#e9e6dd', '#c8ff2e', '#5a4dff'],
    ['#ff5a1f', '#111111', '#f4f1ea', '#1a3cff'],
    ['#e6e1d3', '#0d2bb8', '#e03a2f', '#f2b134'],
  ],
  params: [
    { type: 'section', label: 'Text' },
    { key: 'text', type: 'text', label: 'Paragraph', value: COPY },
    { key: 'repeat', type: 'toggle', label: 'Repeat to fill', value: true },
    { key: 'weight', type: 'select', label: 'Weight', options: ['400', '500', '700'], value: '700' },
    { key: 'size', type: 'range', label: 'Base size', min: 20, max: 200, step: 1, value: 74, unit: 'px' },
    { key: 'leading', type: 'range', label: 'Leading', min: 0.7, max: 1.4, step: 0.01, value: 0.92, format: pct },
    { key: 'align', type: 'select', label: 'Align', options: ['justify', 'left', 'center'], value: 'justify' },
    { key: 'margin', type: 'range', label: 'Margin', min: 0, max: 120, step: 1, value: 44, unit: 'px' },

    { type: 'section', label: 'Grow', note: 'The grown size is fed back into Pretext, so the paragraph reflows instead of the glyph overlapping it.' },
    { key: 'mode', type: 'select', label: 'Mode', options: ['stagger', 'wave', 'noise', 'off'], value: 'stagger' },
    { key: 'unit', type: 'select', label: 'Unit', options: ['letter', 'word'], value: 'letter', rebuild: true },
    { key: 'amount', type: 'range', label: 'Grow', min: 0, max: 8, step: 0.05, value: 3.5, format: (v) => `×${(1 + v).toFixed(2)}` },
    { key: 'popEvery', type: 'range', label: 'Stagger', min: 0.02, max: 0.6, step: 0.01, value: 0.22, unit: 's' },
    { key: 'popDur', type: 'range', label: 'Duration', min: 0.1, max: 2, step: 0.05, value: 0.7, unit: 's' },
    { key: 'popHold', type: 'range', label: 'Hold', min: 0, max: 3, step: 0.05, value: 0.4, unit: 's' },
    { key: 'ease', type: 'select', label: 'Ease', options: ['power3.inOut', 'back.out(2)', 'elastic.out(1,0.5)', 'expo.out'], value: 'power3.inOut' },
    { key: 'waveSpeed', type: 'range', label: 'Wave / noise speed', min: 0, max: 3, step: 0.01, value: 0.8 },
    { key: 'waveLen', type: 'range', label: 'Wave length', min: 2, max: 80, step: 1, value: 18 },

    { type: 'section', label: 'Colour' },
    { key: 'palette', type: 'palette', label: 'Palette · bg / ink / accent / accent 2', value: ['#f4f1ea', '#111111', '#1a3cff', '#ff5a1f'] },
    { key: 'tint', type: 'range', label: 'Tint grown above', min: 0, max: 1, step: 0.01, value: 0.25, format: pct },
    { key: 'info', type: 'select', label: 'Info block', options: ['bottom', 'top', 'corners', 'none'], value: 'bottom' },
    { key: 'grain', type: 'range', label: 'Grain', min: 0, max: 0.4, step: 0.01, value: 0.06 },
    { key: 'seed', type: 'range', label: 'Noise seed', min: 1, max: 999, step: 1, value: 7 },
  ],

  create(p, P, api) {
    const ctx = p.drawingContext;
    let chars = [];
    let groups = [];

    function build() {
      const src = P.text.replace(/\s+/g, ' ').trim() || ' ';
      // Enough copies to overflow the poster even at the smallest size; layout stops at the bottom edge.
      const text = P.repeat ? Array(12).fill(src).join(' ') : src;
      chars = [];
      groups = [];
      let word = null;
      for (const ch of text) {
        const c = { ch, k: { v: 0 }, idx: chars.length };
        if (ch === ' ') word = null;
        else {
          if (!word || P.unit === 'letter') groups.push((word = { k: { v: 0 }, n: groups.length }));
          c.g = word;
        }
        chars.push(c);
      }
      buildTimeline();
    }

    function buildTimeline() {
      api.killTweens();
      groups.forEach((g) => { g.k.v = 0; });
      if (P.mode !== 'stagger' || !groups.length) return;
      const tl = api.timeline({ repeat: -1, repeatDelay: 0.4 });
      tl.to(groups.map((g) => g.k), {
        v: 1,
        duration: P.popDur,
        ease: P.ease,
        stagger: { each: P.popEvery, from: 'random', repeat: 1, yoyo: true, repeatDelay: P.popHold },
      });
    }

    function growth(g, t) {
      if (!g) return 0;
      if (P.mode === 'stagger') return g.k.v;
      if (P.mode === 'wave') return Math.max(0, Math.sin(t * P.waveSpeed * 3 - (g.n * Math.PI * 2) / P.waveLen)) ** 6;
      if (P.mode === 'noise') return clamp((p.noise(g.n * 0.35, t * P.waveSpeed) - 0.55) * 4) ** 2;
      return 0;
    }

    p.noiseSeed(P.seed);
    build();

    return {
      onParam(key) {
        if (key === 'text' || key === 'repeat') build();
        if (['mode', 'popEvery', 'popDur', 'popHold', 'ease'].includes(key)) buildTimeline();
        if (key === 'seed') p.noiseSeed(P.seed);
      },
      draw() {
        const t = api.clock.t;
        const [bg, ink, accent, accent2] = P.palette;
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        const m = P.margin * U;
        const infoReserve = infoHeight() + 22 * U;
        const top = m + (P.info === 'top' || P.info === 'corners' ? infoReserve : 0);
        const bottom = H - m - (P.info === 'bottom' || P.info === 'corners' ? infoReserve : 0);
        const rowW = W - m * 2;
        const base = P.size * U;

        // Sizes snap to whole pixels so Pretext's per-font measurement cache stays warm across frames.
        const sizes = chars.map((c) => Math.max(4, Math.round(base * (1 + growth(c.g, t) * P.amount))));
        const items = chars.map((c, i) => ({ text: c.ch, font: `${P.weight} ${sizes[i]}px ${FONT.areal}` }));
        const prepared = prepareRichInline(items);

        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        let cursor;
        let y = top;
        let first = true;
        while (true) {
          const range = layoutNextRichInlineLineRange(prepared, rowW, cursor);
          if (!range) break;
          const line = materializeRichInlineLineRange(prepared, range);
          const frags = line.fragments;
          const lineSize = frags.reduce((a, f) => Math.max(a, sizes[f.itemIndex]), 0);
          // The first line sits on its cap height; later lines advance by leading × the line's largest glyph.
          y += first ? lineSize * 0.72 : lineSize * P.leading;
          first = false;
          if (y > bottom) break;
          cursor = range.end;

          const gaps = frags.filter((f, j) => j > 0 && f.gapBefore > 0).length;
          const isLast = !layoutNextRichInlineLineRange(prepared, rowW, range.end);
          const slack = rowW - line.width;
          let extra = 0;
          let x = m;
          if (P.align === 'justify' && !isLast && gaps) extra = slack / gaps;
          else if (P.align === 'center') x += slack / 2;

          frags.forEach((f, j) => {
            if (j > 0) x += f.gapBefore + (f.gapBefore > 0 ? extra : 0);
            const c = chars[f.itemIndex];
            const g = sizes[f.itemIndex] / base - 1;
            ctx.font = items[f.itemIndex].font;
            ctx.fillStyle = P.amount > 0 && g / P.amount > P.tint ? (c.g && c.g.n % 3 === 0 ? accent2 : accent) : ink;
            ctx.fillText(f.text, x, y);
            x += f.occupiedWidth;
          });
        }

        drawInfo(ctx, { layout: P.info, color: ink, margin: m || 24 * U, font: FONT.areal });
        drawGrain(ctx, P.grain);
      },
    };
  },
};
