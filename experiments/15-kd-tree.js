import { W, H, U, FONT_CHOICES, mulberry32, drawInfo, drawGrain } from '../app/lib/poster.js';

// Points scattered inside the letters (plus some background) are split by a k-d tree:
// each node cuts its box at the median along x or y, alternating, until a leaf holds few points.
function build(pts, box, depth, leaf, maxDepth) {
  if (pts.length <= leaf || depth >= maxDepth) return { box, depth, pts };
  const axis = depth % 2 ? 'y' : 'x';
  const sorted = pts.slice().sort((a, b) => a[axis] - b[axis]);
  const m = sorted.length >> 1;
  const v = sorted[m][axis];
  const [lo, hi] = axis === 'x'
    ? [{ ...box, x1: v }, { ...box, x0: v }]
    : [{ ...box, y1: v }, { ...box, y0: v }];
  return {
    box, depth, axis, v, pt: sorted[m],
    a: build(sorted.slice(0, m), lo, depth + 1, leaf, maxDepth),
    b: build(sorted.slice(m + 1), hi, depth + 1, leaf, maxDepth),
  };
}

// Nearest-neighbour search, recording every node it had to open.
function nearest(node, q, best, visited) {
  if (!node) return best;
  visited.push(node);
  const consider = (pt) => {
    const d = Math.hypot(pt.x - q.x, pt.y - q.y);
    if (d < best.d) { best.d = d; best.pt = pt; }
  };
  if (!node.axis) { node.pts.forEach(consider); return best; }
  consider(node.pt);
  const diff = q[node.axis] - node.v;
  const [near, far] = diff < 0 ? [node.a, node.b] : [node.b, node.a];
  nearest(near, q, best, visited);
  if (Math.abs(diff) < best.d) nearest(far, q, best, visited);
  return best;
}

export default {
  id: 'kd-tree',
  title: 'K-d Tree',
  description: 'Points scattered inside the letters are split by a k-d tree and only the leaves that sit inside the type are coloured, so the letters are built out of boxes; each cut at the median and alternating between vertical and horizontal, so the cuts crowd where the type is. The tree grows level by level, and moving the mouse runs a nearest-neighbour search that lights up every box it opens.',
  renderer: 'p2d',
  palettes: [
    ['#f4f1ea', '#0b0b12', '#e03a2f', '#1a3cff', '#f2c230'],
    ['#ffffff', '#000000', '#d40920', '#1356a2', '#f7d842'],
    ['#0b0b12', '#f4f1ea', '#c8ff2e', '#5a4dff', '#ff5a1f'],
    ['#e6e1d3', '#0d2bb8', '#e03a2f', '#0d2bb8', '#e6e1d3'],
  ],
  params: [
    { type: 'section', label: 'Points' },
    { key: 'text', type: 'text', label: 'Text (lines separated with /)', value: 'PCD/SEOUL/2026' },
    { key: 'font', type: 'select', label: 'Font', options: Object.keys(FONT_CHOICES), value: 'Archivo Black' },
    { key: 'count', type: 'range', label: 'Points in letters', min: 50, max: 12000, step: 10, value: 5000 },
    { key: 'bgCount', type: 'range', label: 'Points outside', min: 0, max: 3000, step: 10, value: 60 },
    { key: 'seed', type: 'range', label: 'Seed', min: 1, max: 999, step: 1, value: 7 },

    { type: 'section', label: 'Tree' },
    { key: 'leaf', type: 'range', label: 'Points per leaf', min: 1, max: 64, step: 1, value: 2 },
    { key: 'maxDepth', type: 'range', label: 'Max depth', min: 1, max: 22, step: 1, value: 16 },
    { key: 'grow', type: 'range', label: 'Grow speed', note: '0 shows the whole tree', min: 0, max: 12, step: 0.1, value: 2.5, unit: 'levels/s' },
    { key: 'hold', type: 'range', label: 'Hold full tree', min: 0, max: 10, step: 0.1, value: 3, unit: 's' },

    { type: 'section', label: 'Look' },
    { key: 'style', type: 'select', label: 'Style', options: ['letters', 'lines', 'mondrian', 'density'], value: 'letters' },
    { key: 'cover', type: 'range', label: 'Letter threshold', note: 'Share of a box that must be inside the type to be coloured', min: 0.05, max: 0.95, step: 0.01, value: 0.5 },
    { key: 'colours', type: 'select', label: 'Letter colours', options: ['single', 'mondrian'], value: 'mondrian' },
    { key: 'ghost', type: 'range', label: 'Cut lines', note: 'Opacity of the tree cuts in letters style', min: 0, max: 1, step: 0.01, value: 0.25 },
    { key: 'weight', type: 'range', label: 'Root line weight', min: 0.5, max: 24, step: 0.1, value: 10 },
    { key: 'taper', type: 'range', label: 'Weight taper', note: 'How fast cuts thin with depth', min: 0.5, max: 1, step: 0.01, value: 0.8 },
    { key: 'fillAmt', type: 'range', label: 'Colour fill', min: 0, max: 1, step: 0.01, value: 0.22 },
    { key: 'dots', type: 'range', label: 'Point size', min: 0, max: 6, step: 0.1, value: 1.2, unit: 'px' },
    { key: 'query', type: 'toggle', label: 'Mouse nearest-neighbour', value: true },

    { type: 'section', label: 'Colour' },
    { key: 'palette', type: 'palette', label: 'Palette · bg / line / colour 1–3', value: ['#f4f1ea', '#0b0b12', '#e03a2f', '#1a3cff', '#f2c230'] },
    { key: 'info', type: 'select', label: 'Info block', options: ['none', 'bottom', 'top', 'corners'], value: 'none' },
    { key: 'grain', type: 'range', label: 'Grain', min: 0, max: 0.4, step: 0.01, value: 0 },
  ],

  create(p, P, api) {
    const ctx = p.drawingContext;
    let root = null;
    let nodes = [];
    let pts = [];
    let mask = null;
    let deepest = 0;
    let t0 = 0;

    function sample() {
      // Rasterise the text at quarter resolution, then rejection-sample points inside the ink.
      const k = 4;
      const w = Math.ceil(W / k);
      const h = Math.ceil(H / k);
      const off = document.createElement('canvas');
      off.width = w;
      off.height = h;
      const o = off.getContext('2d');
      const lines = P.text.split('/').map((l) => l.trim()).filter(Boolean);
      if (lines.length) {
        const fontFn = FONT_CHOICES[P.font];
        let size = (h * 0.8) / lines.length;
        o.font = fontFn(size);
        const widest = Math.max(...lines.map((l) => o.measureText(l).width));
        size *= Math.min(1, (w * 0.86) / widest);
        o.font = fontFn(size);
        o.textAlign = 'center';
        o.textBaseline = 'middle';
        lines.forEach((l, i) => o.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * size * 0.98));
      }
      const px = o.getImageData(0, 0, w, h).data;
      mask = { px, w, h, k };
      const rnd = mulberry32(P.seed);
      pts = [];
      let tries = 0;
      while (pts.length < P.count && tries++ < P.count * 400 && lines.length) {
        const x = rnd() * W;
        const y = rnd() * H;
        if (px[(Math.floor(y / k) * w + Math.floor(x / k)) * 4 + 3] > 128) pts.push({ x, y });
      }
      for (let i = 0; i < P.bgCount; i++) pts.push({ x: rnd() * W, y: rnd() * H });
    }

    // Share of a box inside the type, from an 8 × 8 sample of the text mask.
    function coverage(b) {
      if (!mask) return 0;
      let hit = 0;
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
          const x = Math.min(mask.w - 1, Math.floor((b.x0 + ((i + 0.5) / 8) * (b.x1 - b.x0)) / mask.k));
          const y = Math.min(mask.h - 1, Math.floor((b.y0 + ((j + 0.5) / 8) * (b.y1 - b.y0)) / mask.k));
          if (mask.px[(y * mask.w + x) * 4 + 3] > 128) hit++;
        }
      }
      return hit / 64;
    }

    function rebuild() {
      root = build(pts, { x0: 0, y0: 0, x1: W, y1: H }, 0, P.leaf, P.maxDepth);
      nodes = [];
      deepest = 0;
      const walk = (n) => {
        nodes.push(n);
        deepest = Math.max(deepest, n.depth);
        if (n.axis) { walk(n.a); walk(n.b); }
      };
      walk(root);
      // A stable colour pick per leaf for the Mondrian fill.
      const rnd = mulberry32(P.seed * 31 + 5);
      nodes.forEach((n) => { n.r = rnd(); n.c = Math.floor(rnd() * 3); n.cov = coverage(n.box); });
      t0 = api.clock.t;
    }

    sample();
    rebuild();

    return {
      onParam(key) {
        if (['text', 'font', 'count', 'bgCount', 'seed'].includes(key)) { sample(); rebuild(); }
        if (['leaf', 'maxDepth'].includes(key)) rebuild();
      },
      draw() {
        const [bg, lineCol, ...accents] = P.palette;
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        // How many levels are showing: grows, holds, restarts.
        let level = deepest + 1;
        if (P.grow > 0) {
          const growT = (deepest + 1) / P.grow;
          const e = (api.clock.t - t0) % (growT + P.hold);
          level = Math.min(deepest + 1, e * P.grow);
        }
        const shown = nodes.filter((n) => n.depth < level);
        // A node is a visible leaf if it is a leaf, or its children are not grown yet.
        const leaves = shown.filter((n) => !n.axis || n.depth + 1 >= level);

        if (P.style === 'letters') {
          // Only boxes that sit inside the type get colour, so the letters are built from leaves.
          leaves.forEach((n) => {
            if (n.cov < P.cover) return;
            ctx.fillStyle = P.colours === 'single' ? accents[0] : accents[n.c];
            ctx.fillRect(n.box.x0, n.box.y0, n.box.x1 - n.box.x0, n.box.y1 - n.box.y0);
          });
          // Thin outline on the coloured boxes keeps the tree structure readable inside the letters.
          ctx.strokeStyle = lineCol;
          ctx.lineWidth = 1 * U;
          leaves.forEach((n) => {
            if (n.cov >= P.cover) ctx.strokeRect(n.box.x0, n.box.y0, n.box.x1 - n.box.x0, n.box.y1 - n.box.y0);
          });
        } else if (P.style === 'mondrian') {
          leaves.forEach((n) => {
            // Leave the big early boxes empty, or the first levels flood the poster with colour.
            if (n.r > P.fillAmt || (n.box.x1 - n.box.x0) * (n.box.y1 - n.box.y0) > W * H * 0.06) return;
            ctx.fillStyle = accents[n.c];
            ctx.fillRect(n.box.x0, n.box.y0, n.box.x1 - n.box.x0, n.box.y1 - n.box.y0);
          });
        } else if (P.style === 'density') {
          // Small boxes are dense: shade by area so the letters appear as dark mass.
          leaves.forEach((n) => {
            const area = (n.box.x1 - n.box.x0) * (n.box.y1 - n.box.y0);
            const a = Math.min(1, (3000 * U * U) / Math.max(1, area)) * P.fillAmt * 4;
            ctx.globalAlpha = Math.min(1, a);
            ctx.fillStyle = accents[0];
            ctx.fillRect(n.box.x0, n.box.y0, n.box.x1 - n.box.x0, n.box.y1 - n.box.y0);
          });
          ctx.globalAlpha = 1;
        }

        // Cuts: thick at the root, thinner with each level; the newest level fades in.
        ctx.strokeStyle = lineCol;
        ctx.lineCap = 'square';
        shown.forEach((n) => {
          if (!n.axis || n.depth + 1 > level) return;
          ctx.globalAlpha = Math.min(1, level - n.depth) * (P.style === 'letters' ? P.ghost : 1);
          ctx.lineWidth = Math.max(0.4, P.weight * Math.pow(P.taper, n.depth)) * U;
          ctx.beginPath();
          if (n.axis === 'x') { ctx.moveTo(n.v, n.box.y0); ctx.lineTo(n.v, n.box.y1); } else { ctx.moveTo(n.box.x0, n.v); ctx.lineTo(n.box.x1, n.v); }
          ctx.stroke();
        });
        ctx.globalAlpha = 1;
        ctx.strokeRect(0, 0, W, H);

        if (P.dots > 0) {
          ctx.fillStyle = lineCol;
          pts.forEach((q) => ctx.fillRect(q.x - (P.dots * U) / 2, q.y - (P.dots * U) / 2, P.dots * U, P.dots * U));
        }

        if (P.query && root && p.canvas.matches(':hover')) {
          const q = { x: p.mouseX, y: p.mouseY };
          const visited = [];
          const best = nearest(root, q, { d: Infinity, pt: null }, visited);
          ctx.strokeStyle = accents[0];
          ctx.lineWidth = 2 * U;
          visited.forEach((n) => ctx.strokeRect(n.box.x0, n.box.y0, n.box.x1 - n.box.x0, n.box.y1 - n.box.y0));
          if (best.pt) {
            ctx.beginPath();
            ctx.arc(q.x, q.y, best.d, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(q.x, q.y);
            ctx.lineTo(best.pt.x, best.pt.y);
            ctx.stroke();
            ctx.fillStyle = accents[0];
            ctx.beginPath();
            ctx.arc(best.pt.x, best.pt.y, 6 * U, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = lineCol;
          ctx.font = `700 ${16 * U}px "Space Mono"`;
          ctx.fillText(`${visited.length} nodes visited / ${nodes.length}`, q.x + 14 * U, q.y - 14 * U);
        }

        drawInfo(ctx, { layout: P.info, color: lineCol, margin: 44 * U });
        drawGrain(ctx, P.grain);
      },
    };
  },
};
