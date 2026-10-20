import { W, H, U, FONT_CHOICES, mulberry32, drawInfo, drawGrain } from '../app/lib/poster.js';
import { textMask } from '../app/lib/outlines.js';

// d3-delaunay is loaded as a classic script in index.html (window.d3).
const MW = 300;
const MH = Math.round((MW * H) / W);

export default {
  id: 'voronoi',
  title: 'Voronoi Type',
  description: 'Points scattered inside and around the letters become Voronoi cells and their dual Delaunay triangles. Lloyd relaxation slowly evens the cells out while points stay on their side of the letter edge, so the type settles into a cell pattern. Click to add a point.',
  renderer: 'p2d',
  palettes: [
    ['#f4f1ea', '#0b0b12', '#e03a2f', '#1a3cff', '#f2c230'],
    ['#0b0b12', '#f4f1ea', '#c8ff2e', '#5a4dff', '#ff5a1f'],
    ['#ffffff', '#000000', '#d40920', '#1356a2', '#f7d842'],
    ['#e6e1d3', '#0d2bb8', '#0d2bb8', '#e03a2f', '#0d2bb8'],
  ],
  params: [
    { type: 'section', label: 'Points' },
    { key: 'text', type: 'text', label: 'Text (lines separated with /)', value: 'PCD/SEOUL/2026' },
    { key: 'font', type: 'select', label: 'Font', options: Object.keys(FONT_CHOICES), value: 'Archivo Black' },
    { key: 'inCount', type: 'range', label: 'Points in letters', min: 50, max: 4000, step: 10, value: 900 },
    { key: 'outCount', type: 'range', label: 'Points outside', min: 0, max: 2000, step: 10, value: 220 },
    { key: 'seed', type: 'range', label: 'Seed', min: 1, max: 999, step: 1, value: 3 },

    { type: 'section', label: 'Motion' },
    { key: 'relax', type: 'range', label: 'Lloyd relaxation', note: 'How fast points move to their cell centroid', min: 0, max: 1, step: 0.01, value: 0.08 },
    { key: 'wander', type: 'range', label: 'Wander', min: 0, max: 4, step: 0.05, value: 0.6, unit: 'px' },
    { key: 'restart', type: 'range', label: 'Restart after', note: '0 = never', min: 0, max: 60, step: 1, value: 0, unit: 's' },

    { type: 'section', label: 'Look' },
    { key: 'show', type: 'select', label: 'Show', options: ['voronoi', 'delaunay', 'both'], value: 'voronoi' },
    { key: 'fillIn', type: 'select', label: 'Letter cells', options: ['mondrian', 'single', 'none'], value: 'mondrian' },
    { key: 'gap', type: 'range', label: 'Cell gap', note: 'Shrinks each cell toward its centre, like stained glass', min: 0, max: 0.6, step: 0.01, value: 0.1 },
    { key: 'weight', type: 'range', label: 'Line weight', min: 0, max: 6, step: 0.1, value: 1.2 },
    { key: 'outLines', type: 'range', label: 'Lines outside letters', min: 0, max: 1, step: 0.01, value: 0.35 },
    { key: 'dots', type: 'range', label: 'Point size', min: 0, max: 8, step: 0.1, value: 0, unit: 'px' },

    { type: 'section', label: 'Colour' },
    { key: 'palette', type: 'palette', label: 'Palette · bg / line / colour 1–3', value: ['#f4f1ea', '#0b0b12', '#e03a2f', '#1a3cff', '#f2c230'] },
    { key: 'info', type: 'select', label: 'Info block', options: ['none', 'bottom', 'top', 'corners'], value: 'none' },
    { key: 'grain', type: 'range', label: 'Grain', min: 0, max: 0.4, step: 0.01, value: 0 },
  ],

  create(p, P, api) {
    const ctx = p.drawingContext;
    let mask;
    let pts = [];
    let started = 0;
    const inside = (x, y) => {
      const mx = Math.min(MW - 1, Math.max(0, Math.floor((x / W) * MW)));
      const my = Math.min(MH - 1, Math.max(0, Math.floor((y / H) * MH)));
      return mask[my * MW + mx] > 0.5;
    };

    function seed() {
      mask = textMask(P.text, FONT_CHOICES[P.font], MW, MH);
      const rnd = mulberry32(P.seed);
      pts = [];
      let guard = 0;
      while (pts.filter((q) => q.in).length < P.inCount && guard++ < P.inCount * 300) {
        const x = rnd() * W;
        const y = rnd() * H;
        if (inside(x, y)) pts.push({ x, y, in: true, c: Math.floor(rnd() * 3), r: rnd() });
      }
      guard = 0;
      while (pts.filter((q) => !q.in).length < P.outCount && guard++ < P.outCount * 50) {
        const x = rnd() * W;
        const y = rnd() * H;
        if (!inside(x, y)) pts.push({ x, y, in: false, c: 0, r: rnd() });
      }
      started = api.clock.t;
    }
    seed();

    return {
      onParam(key) {
        if (['text', 'font', 'inCount', 'outCount', 'seed'].includes(key)) seed();
      },
      mousePressed() {
        pts.push({ x: p.mouseX, y: p.mouseY, in: inside(p.mouseX, p.mouseY), c: Math.floor(Math.random() * 3), r: Math.random() });
      },
      draw() {
        if (P.restart > 0 && api.clock.t - started > P.restart) seed();
        const [bg, lineCol, ...accents] = P.palette;
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);
        if (!window.d3?.Delaunay || pts.length < 3) return;

        const del = window.d3.Delaunay.from(pts, (q) => q.x, (q) => q.y);
        const vor = del.voronoi([0, 0, W, H]);
        const cells = pts.map((_, i) => vor.cellPolygon(i));

        // Lloyd step: move each point toward its cell centroid, but never across the letter edge.
        if (api.clock.dt > 0) {
          const t = api.clock.t;
          cells.forEach((poly, i) => {
            if (!poly) return;
            let a = 0;
            let cx = 0;
            let cy = 0;
            for (let k = 0; k < poly.length - 1; k++) {
              const [x0, y0] = poly[k];
              const [x1, y1] = poly[k + 1];
              const cr = x0 * y1 - x1 * y0;
              a += cr;
              cx += (x0 + x1) * cr;
              cy += (y0 + y1) * cr;
            }
            if (Math.abs(a) < 1e-6) return;
            cx /= 3 * a;
            cy /= 3 * a;
            const q = pts[i];
            const wob = P.wander * U;
            const nx = q.x + (cx - q.x) * P.relax + Math.sin(t * 0.9 + q.r * 40) * wob;
            const ny = q.y + (cy - q.y) * P.relax + Math.cos(t * 0.7 + q.r * 70) * wob;
            if (inside(nx, ny) === q.in) { q.x = Math.min(W, Math.max(0, nx)); q.y = Math.min(H, Math.max(0, ny)); }
          });
        }

        const path = (poly, shrink, cx, cy) => {
          ctx.beginPath();
          poly.forEach(([x, y], k) => {
            const X = cx + (x - cx) * (1 - shrink);
            const Y = cy + (y - cy) * (1 - shrink);
            k ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
          });
          ctx.closePath();
        };

        ctx.lineJoin = 'round';
        if (P.show !== 'delaunay') {
          cells.forEach((poly, i) => {
            if (!poly) return;
            const q = pts[i];
            if (q.in && P.fillIn !== 'none') {
              ctx.fillStyle = P.fillIn === 'single' ? accents[0] : accents[q.c];
              path(poly, P.gap, q.x, q.y);
              ctx.fill();
            }
            if (P.weight > 0) {
              ctx.globalAlpha = q.in ? 1 : P.outLines;
              ctx.strokeStyle = lineCol;
              ctx.lineWidth = P.weight * U;
              path(poly, q.in ? P.gap : 0, q.x, q.y);
              ctx.stroke();
              ctx.globalAlpha = 1;
            }
          });
        }

        if (P.show !== 'voronoi') {
          const { triangles } = del;
          ctx.strokeStyle = lineCol;
          ctx.lineWidth = Math.max(0.5, P.weight * 0.7) * U;
          for (let t = 0; t < triangles.length; t += 3) {
            const a = pts[triangles[t]];
            const b = pts[triangles[t + 1]];
            const c = pts[triangles[t + 2]];
            const allIn = a.in && b.in && c.in;
            if (P.show === 'delaunay' && allIn && P.fillIn !== 'none') {
              ctx.fillStyle = P.fillIn === 'single' ? accents[0] : accents[(triangles[t] + triangles[t + 1]) % 3];
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.lineTo(c.x, c.y);
              ctx.closePath();
              ctx.fill();
            }
            ctx.globalAlpha = allIn ? 1 : P.outLines;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.lineTo(c.x, c.y);
            ctx.closePath();
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }

        if (P.dots > 0) {
          ctx.fillStyle = lineCol;
          pts.forEach((q) => { ctx.beginPath(); ctx.arc(q.x, q.y, P.dots * U, 0, Math.PI * 2); ctx.fill(); });
        }

        drawInfo(ctx, { layout: P.info, color: lineCol, margin: 44 * U });
        drawGrain(ctx, P.grain);
      },
    };
  },
};
