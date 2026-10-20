import { W, H, U, drawInfo, drawGrain } from '../app/lib/poster.js';
import { FONTS, loadFont, textContours, resample } from '../app/lib/outlines.js';

// Roll a wheel of radius r along the path; a pen at distance d from its hub traces the roulette.
// d = r is a true cycloid, d < r curtate (loops flatten), d > r prolate (loops).
// hub = 'cursor' puts the wheel centre on the mouse path itself; 'edge' rolls the rim along it.
function roulette(path, r, d, side, phase, hub = 'edge') {
  const off = hub === 'cursor' ? 0 : r;
  const out = [];
  for (let i = 0; i < path.length; i++) {
    const a = path[Math.max(0, i - 1)];
    const b = path[Math.min(path.length - 1, i + 1)];
    const h = Math.atan2(b.y - a.y, b.x - a.x);
    const nx = -Math.sin(h) * side;
    const ny = Math.cos(h) * side;
    const cx = path[i].x + nx * off;
    const cy = path[i].y + ny * off;
    // Contact point starts under the hub; rolling without slipping turns the wheel by s / r.
    const th = h + (Math.PI / 2) * side + Math.PI - (path[i].s / r) * side + phase;
    out.push({ cx, cy, x: cx + Math.cos(th) * d, y: cy + Math.sin(th) * d, h });
  }
  return out;
}

// Other pens that ride the same path. Each returns points with the hub (cx, cy) and pen (x, y).
const MODES = ['cycloid', 'spirograph', 'sine', 'contour', 'hatch', 'fourier'];

// Discrete Fourier transform of a closed contour, sampled at M even arc-length steps.
// Returns the 2K + 1 lowest frequencies, biggest circles first, as { k, re, im, amp }.
function fourier(raw, K, M = 256) {
  const path = resample(raw, 1, 0);
  if (path.length < 4) return [];
  const pts = Array.from({ length: M }, (_, n) => path[Math.floor((n / M) * path.length)]);
  const out = [];
  for (let k = -K; k <= K; k++) {
    let re = 0;
    let im = 0;
    pts.forEach((q, n) => {
      const a = (-2 * Math.PI * k * n) / M;
      re += q.x * Math.cos(a) - q.y * Math.sin(a);
      im += q.x * Math.sin(a) + q.y * Math.cos(a);
    });
    out.push({ k, re: re / M, im: im / M, amp: Math.hypot(re, im) / M });
  }
  return out.sort((a, b) => b.amp - a.amp);
}


function penPath(mode, path, r, d, side, phase, hub, ratio, k) {
  if (mode === 'cycloid') return roulette(path, r, d, side, phase, hub);
  if (mode === 'spirograph') {
    // A second arm spins on the rim of the first, `ratio` times as fast and the other way.
    return roulette(path, r, r, side, phase, hub).map((q) => {
      const th = Math.atan2(q.y - q.cy, q.x - q.cx);
      return { ...q, x: q.x + Math.cos(-th * ratio) * d, y: q.y + Math.sin(-th * ratio) * d };
    });
  }
  return path.map((q, i) => {
    const a = path[Math.max(0, i - 1)];
    const b = path[Math.min(path.length - 1, i + 1)];
    const h = Math.atan2(b.y - a.y, b.x - a.x);
    const off = mode === 'sine' ? d * Math.sin(q.s / r + phase) : d * (k + 1) * side;
    return { cx: q.x, cy: q.y, h, x: q.x - Math.sin(h) * off, y: q.y + Math.cos(h) * off };
  });
}

export default {
  id: 'cycloid-pen',
  title: 'Cycloid Pen',
  description: 'Draw with the mouse. A wheel rolls along your path without slipping and a pen fixed to it traces the roulette: a cycloid on a straight line, epicycloid loops on curves. Type text and the same pen traces every glyph outline. Fourier mode redraws each contour with spinning epicycles and leaves a trail whose hue drifts over time. Z undoes a stroke, C clears your strokes.',
  renderer: 'p2d',
  palettes: [
    ['#f4f1ea', '#0b0b12', '#e03a2f', '#ffffff', '#e03a2f'],
    ['#0b0b12', '#c8ff2e', '#5a4dff', '#0b0b12', '#5a4dff'],
    ['#1a3cff', '#f4f1ea', '#ff5a1f', '#1a3cff', '#ff5a1f'],
    ['#ffffff', '#000000', '#bdbdbd', '#ffffff', '#000000'],
  ],
  params: [
    { type: 'section', label: 'Type' },
    { key: 'text', type: 'text', label: 'Text (lines separated with /)', value: 'PCD/SEOUL' },
    { key: 'font', type: 'select', label: 'Font', options: Object.keys(FONTS), value: 'Areal Bold' },
    { key: 'size', type: 'range', label: 'Type size', min: 80, max: 900, step: 1, value: 300, unit: 'px' },
    { key: 'leading', type: 'range', label: 'Leading', min: 0.6, max: 1.6, step: 0.01, value: 0.95 },
    { key: 'fit', type: 'toggle', label: 'Fit to poster', note: 'Shrink the type when a line is wider than the poster', value: true },
    { key: 'glyphFill', type: 'range', label: 'Glyph fill', note: 'Opacity of the solid letterform (palette 5)', min: 0, max: 1, step: 0.01, value: 0 },
    { key: 'glyphStroke', type: 'range', label: 'Glyph stroke', note: '0 hides the outline (palette 3)', min: 0, max: 12, step: 0.1, value: 1.5, unit: 'px' },
    { key: 'glyphLayer', type: 'select', label: 'Glyph layer', options: ['top', 'bottom'], value: 'top' },
    { key: 'penFill', type: 'range', label: 'Pen fill', note: 'Opacity of the fill inside each pen loop (palette 4)', min: 0, max: 1, step: 0.01, value: 1 },

    { type: 'section', label: 'Pen' },
    { key: 'mode', type: 'select', label: 'Mode', note: 'cycloid · spirograph = wheel on a wheel · sine · contour = parallel offsets · hatch = cross strokes', options: MODES, value: 'cycloid' },
    { key: 'ratio', type: 'range', label: 'Spirograph ratio', note: 'Spin of the second arm', min: 1, max: 12, step: 0.1, value: 4 },
    { key: 'tilt', type: 'range', label: 'Hatch angle', min: 0, max: 180, step: 1, value: 45, unit: '°' },

    { type: 'section', label: 'Fourier' },
    { key: 'terms', type: 'range', label: 'Circles per contour', note: 'More circles, closer to the glyph', min: 1, max: 80, step: 1, value: 12 },
    { key: 'fSpeed', type: 'range', label: 'Draw speed', min: 0.01, max: 1, step: 0.01, value: 0.12, unit: 'laps/s' },
    { key: 'trailSec', type: 'range', label: 'Trail length', min: 0.5, max: 60, step: 0.5, value: 16, unit: 's' },
    { key: 'hue0', type: 'range', label: 'Start hue', min: 0, max: 360, step: 1, value: 350, unit: '°' },
    { key: 'hueSpeed', type: 'range', label: 'Hue drift', note: 'Colour change over time, which makes the trail a gradient', min: 0, max: 120, step: 1, value: 18, unit: '°/s' },
    { key: 'hueSpread', type: 'range', label: 'Hue per contour', min: 0, max: 60, step: 1, value: 6, unit: '°' },
    { key: 'sat', type: 'range', label: 'Saturation', min: 0, max: 100, step: 1, value: 85, unit: '%' },
    { key: 'light', type: 'range', label: 'Lightness', min: 10, max: 90, step: 1, value: 52, unit: '%' },
    { key: 'circles', type: 'toggle', label: 'Show circles', value: true },

    { key: 'radius', type: 'range', label: 'Wheel radius', min: 2, max: 200, step: 1, value: 14, unit: 'px' },
    { key: 'pen', type: 'range', label: 'Pen / radius', note: '1 = cycloid · <1 curtate · >1 prolate loops', min: 0, max: 3, step: 0.01, value: 1 },
    { key: 'hub', type: 'select', label: 'Wheel centre', note: 'cursor = hub follows the mouse · edge = rim rolls on the path', options: ['cursor', 'edge'], value: 'cursor' },
    { key: 'side', type: 'select', label: 'Side', options: ['left', 'right', 'both'], value: 'left' },
    { key: 'pens', type: 'range', label: 'Pens per wheel', note: 'Contour: number of offsets', min: 1, max: 8, step: 1, value: 1 },

    { type: 'section', label: 'Path' },
    { key: 'smooth', type: 'range', label: 'Smoothing', min: 0, max: 12, step: 1, value: 4 },
    { key: 'weight', type: 'range', label: 'Line weight', min: 0.5, max: 12, step: 0.1, value: 2 },
    { key: 'guide', type: 'toggle', label: 'Show mouse path', value: true },
    { key: 'wheel', type: 'toggle', label: 'Show wheel', value: true },
    { key: 'animate', type: 'toggle', label: 'Replay', note: 'Wheel re-rolls every stroke in a loop', value: false },
    { key: 'speed', type: 'range', label: 'Replay speed', min: 50, max: 3000, step: 10, value: 600, unit: 'px/s' },

    { type: 'section', label: 'Colour' },
    { key: 'palette', type: 'palette', label: 'Palette · bg / pen / guide + glyph stroke / pen fill / glyph fill', value: ['#f4f1ea', '#0b0b12', '#e03a2f', '#ffffff', '#e03a2f'] },
    { key: 'info', type: 'select', label: 'Info block', options: ['none', 'bottom', 'top', 'corners'], value: 'none' },
    { key: 'grain', type: 'range', label: 'Grain', min: 0, max: 0.4, step: 0.01, value: 0 },
  ],

  create(p, P, api) {
    const ctx = p.drawingContext;
    const strokes = [];
    let typed = [];
    // Fourier mode: coefficients per contour (cached per circle count) and coloured trails.
    const spectra = new WeakMap();
    const trails = new Map();
    let phase = 0;
    const spectrum = (raw) => {
      let c = spectra.get(raw);
      if (!c || c.terms !== P.terms) spectra.set(raw, (c = { terms: P.terms, coefs: fourier(raw, P.terms) }));
      return c.coefs;
    };

    function drawFourier() {
      const t = api.clock.t;
      phase += api.clock.dt * P.fSpeed * Math.PI * 2;
      const contours = [...typed, ...strokes.filter((s) => s !== live)];
      ctx.lineCap = 'round';
      contours.forEach((raw, ci) => {
        const coefs = spectrum(raw);
        if (!coefs.length) return;
        // Walk the epicycle chain: each circle spins at its own frequency on the rim of the last.
        let x = 0;
        let y = 0;
        const chain = [];
        coefs.forEach((c) => {
          const a = c.k * phase;
          chain.push([x, y, c.amp]);
          x += c.re * Math.cos(a) - c.im * Math.sin(a);
          y += c.re * Math.sin(a) + c.im * Math.cos(a);
        });
        let tr = trails.get(raw);
        if (!tr) trails.set(raw, (tr = []));
        if (api.clock.dt > 0) tr.push({ x, y, t, h: (P.hue0 + t * P.hueSpeed + ci * P.hueSpread) % 360 });
        while (tr.length && t - tr[0].t > P.trailSec) tr.shift();

        // Trail: short batches, each in the hue it was drawn with, so colour drifts along the line.
        ctx.lineWidth = P.weight * U;
        for (let i = 1; i < tr.length; i += 6) {
          ctx.strokeStyle = `hsl(${tr[i].h} ${P.sat}% ${P.light}%)`;
          ctx.beginPath();
          ctx.moveTo(tr[i - 1].x, tr[i - 1].y);
          for (let j = i; j < Math.min(tr.length, i + 6); j++) ctx.lineTo(tr[j].x, tr[j].y);
          ctx.stroke();
        }

        if (P.circles) {
          ctx.strokeStyle = P.palette[2];
          ctx.globalAlpha = 0.35;
          ctx.lineWidth = 0.8 * U;
          chain.forEach(([cx, cy, r], i) => {
            if (i === 0 || r < 0.5) return; // the k = 0 term is just the contour's centre
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.stroke();
          });
          ctx.globalAlpha = 0.8;
          ctx.beginPath();
          // Start at the first circle's centre; the chain before it is just the offset from the origin.
          chain.slice(1).forEach(([cx, cy], i) => (i ? ctx.lineTo(cx, cy) : ctx.moveTo(cx, cy)));
          ctx.lineTo(x, y);
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.fillStyle = P.palette[2];
          ctx.beginPath();
          ctx.arc(x, y, 3 * U, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }
    // Older saved palettes only had three colours.
    const PAD = ['#f4f1ea', '#0b0b12', '#e03a2f', '#ffffff', '#e03a2f'];
    for (let i = P.palette.length; i < PAD.length; i++) P.palette.push(PAD[i]);
    let live = null;
    let job = 0;

    async function setText() {
      const id = ++job;
      const lines = P.text.split('/').map((l) => l.trim()).filter(Boolean);
      const font = await loadFont(P.font);
      if (id === job) {
        typed = lines.length ? textContours(font, lines, P.size, P.leading, P.fit) : [];
        trails.clear();
      }
    }
    setText();

    // Resampling is the slow part; cache it per stroke until smoothing changes.
    const cache = new WeakMap();
    const pathOf = (raw) => {
      if (raw === live) return resample(raw, 1.5, P.smooth);
      // Glyph outlines are already clean; smoothing them only rounds off the corners.
      const sm = typed.includes(raw) ? 0 : P.smooth;
      let c = cache.get(raw);
      if (!c || c.smooth !== sm) cache.set(raw, (c = { smooth: sm, path: resample(raw, 1.5, sm) }));
      return c.path;
    };

    const add = () => {
      const last = live[live.length - 1];
      if (!last || Math.hypot(p.mouseX - last[0], p.mouseY - last[1]) > 1) live.push([p.mouseX, p.mouseY]);
    };

    function polyline(pts, key) {
      ctx.beginPath();
      pts.forEach((q, i) => (i ? ctx.lineTo(q[key[0]], q[key[1]]) : ctx.moveTo(q[key[0]], q[key[1]])));
      ctx.stroke();
    }

    function drawStroke(raw, limit, showWheel) {
      const path = pathOf(raw);
      if (path.length < 2) return;
      const n = Math.min(path.length, limit);
      const shown = path.slice(0, n);
      const [, ink, guide] = P.palette;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const glyph = typed.includes(raw);
      // Glyph outlines are drawn solid on top of everything afterwards, see drawGlyphs.
      if (P.guide && !glyph) {
        ctx.strokeStyle = guide;
        ctx.lineWidth = 1.2 * U;
        ctx.setLineDash([6 * U, 6 * U]);
        polyline(shown, 'xy');
        ctx.setLineDash([]);
      }

      const sides = P.side === 'both' ? [1, -1] : [P.side === 'left' ? -1 : 1];
      sides.forEach((side) => {
        if (P.mode === 'hatch') {
          // Cross strokes every wheel radius, Pen / radius sets their half length.
          const len = P.radius * P.pen * (sides.length > 1 ? 1 : 2);
          const step = Math.max(1, Math.round(P.radius / (1.5 * P.pens)));
          const tilt = (P.tilt * Math.PI) / 180;
          ctx.strokeStyle = ink;
          ctx.lineWidth = P.weight * U;
          ctx.beginPath();
          for (let i = 0; i < shown.length; i += step) {
            const a = shown[Math.max(0, i - 1)];
            const b = shown[Math.min(shown.length - 1, i + 1)];
            const ang = Math.atan2(b.y - a.y, b.x - a.x) + tilt * side;
            const q = shown[i];
            const o = sides.length > 1 ? 0.5 : 0;
            ctx.moveTo(q.x - Math.cos(ang) * len * o, q.y - Math.sin(ang) * len * o);
            ctx.lineTo(q.x + Math.cos(ang) * len * (1 - o), q.y + Math.sin(ang) * len * (1 - o));
          }
          ctx.stroke();
          return;
        }
        for (let k = 0; k < P.pens; k++) {
          const ro = penPath(P.mode, shown, P.radius, P.radius * P.pen, side, (k / P.pens) * Math.PI * 2, P.hub, P.ratio, k);
          if (glyph && P.mode !== 'contour' && P.penFill > 0) {
            ctx.globalAlpha = P.penFill;
            ctx.fillStyle = P.palette[3];
            ctx.beginPath();
            ro.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
            ctx.fill();
            ctx.globalAlpha = 1;
          }
          ctx.strokeStyle = ink;
          ctx.lineWidth = P.weight * U;
          polyline(ro, 'xy');
          if (showWheel && k === 0 && (P.mode === 'cycloid' || P.mode === 'spirograph')) {
            const tip = ro[ro.length - 1];
            ctx.strokeStyle = guide;
            ctx.lineWidth = 1.5 * U;
            ctx.beginPath();
            ctx.arc(tip.cx, tip.cy, P.radius, 0, Math.PI * 2);
            ctx.stroke();
            for (let j = 0; j < P.pens; j++) {
              const pj = j ? penPath(P.mode, shown.slice(-2), P.radius, P.radius * P.pen, side, (j / P.pens) * Math.PI * 2, P.hub, P.ratio, j)[1] : tip;
              ctx.beginPath();
              ctx.moveTo(tip.cx, tip.cy);
              ctx.lineTo(pj.x, pj.y);
              ctx.stroke();
              ctx.fillStyle = guide;
              ctx.beginPath();
              ctx.arc(pj.x, pj.y, 4 * U, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      });
      return path.length;
    }

    // All contours in one path so counters (the hole in O, A, …) stay open under nonzero fill.
    function drawGlyphs() {
      if (!typed.length) return;
      ctx.beginPath();
      typed.forEach((c) => c.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))));
      if (P.glyphFill > 0) {
        ctx.globalAlpha = P.glyphFill;
        ctx.fillStyle = P.palette[4];
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (P.glyphStroke > 0) {
        ctx.strokeStyle = P.palette[2];
        ctx.lineWidth = P.glyphStroke * U;
        ctx.stroke();
      }
    }

    return {
      mousePressed() { live = [[p.mouseX, p.mouseY]]; strokes.push(live); },
      mouseDragged() { if (live) add(); },
      mouseReleased() {
        if (live && live.length < 2) strokes.pop();
        live = null;
      },
      keyPressed(e) {
        if (e.key === 'z' || e.key === 'Z') strokes.pop();
        else if (e.key === 'c' || e.key === 'C') { strokes.length = 0; trails.clear(); }
      },
      onParam(key) {
        if (['text', 'font', 'size', 'leading', 'fit'].includes(key)) setText();
      },
      draw() {
        ctx.fillStyle = P.palette[0];
        ctx.fillRect(0, 0, W, H);
        if (P.glyphLayer === 'bottom') drawGlyphs();

        if (P.mode === 'fourier') {
          drawFourier();
          if (live) drawStroke(live, Infinity, false);
        } else if (P.animate && !live) {
          // Replay: reveal all strokes in order at a constant rolling speed.
          const all = [...typed, ...strokes];
          const lens = all.map((s) => pathOf(s).length);
          const total = lens.reduce((a, b) => a + b, 0);
          let budget = total ? ((api.clock.t * P.speed) / 1.5) % (total + 60) : 0;
          all.forEach((s, i) => {
            if (budget <= 0) return;
            const n = Math.min(lens[i], Math.floor(budget));
            drawStroke(s, n, P.wheel && n < lens[i]);
            budget -= lens[i];
          });
        } else {
          [...typed, ...strokes].forEach((s) => drawStroke(s, Infinity, P.wheel && s === live));
        }

        if (P.glyphLayer === 'top') drawGlyphs();
        drawInfo(ctx, { layout: P.info, color: P.palette[1], margin: 44 * U });
        drawGrain(ctx, P.grain);
      },
    };
  },
};
