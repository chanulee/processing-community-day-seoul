import { W, H, U, drawInfo, drawGrain } from '../app/lib/poster.js';
import { FONTS, loadFont, textContours, resample } from '../app/lib/outlines.js';

// FABRIK: pull the chain to the target from the tip, then pin it back to the base. Repeat.
function fabrik(joints, lens, target, iters = 12) {
  const base = { ...joints[0] };
  const total = lens.reduce((a, b) => a + b, 0);
  const d = Math.hypot(target.x - base.x, target.y - base.y);
  if (d >= total) {
    // Out of reach: lay the arm straight towards the target.
    for (let i = 1; i < joints.length; i++) {
      const t = lens[i - 1] / Math.hypot(target.x - joints[i - 1].x, target.y - joints[i - 1].y);
      joints[i] = { x: joints[i - 1].x + (target.x - joints[i - 1].x) * t, y: joints[i - 1].y + (target.y - joints[i - 1].y) * t };
    }
    return;
  }
  const n = joints.length;
  for (let k = 0; k < iters; k++) {
    joints[n - 1] = { ...target };
    for (let i = n - 2; i >= 0; i--) {
      const dx = joints[i].x - joints[i + 1].x;
      const dy = joints[i].y - joints[i + 1].y;
      const l = Math.hypot(dx, dy) || 1;
      joints[i] = { x: joints[i + 1].x + (dx / l) * lens[i], y: joints[i + 1].y + (dy / l) * lens[i] };
    }
    joints[0] = { ...base };
    for (let i = 1; i < n; i++) {
      const dx = joints[i].x - joints[i - 1].x;
      const dy = joints[i].y - joints[i - 1].y;
      const l = Math.hypot(dx, dy) || 1;
      joints[i] = { x: joints[i - 1].x + (dx / l) * lens[i - 1], y: joints[i - 1].y + (dy / l) * lens[i - 1] };
    }
    if (Math.hypot(joints[n - 1].x - target.x, joints[n - 1].y - target.y) < 0.2) break;
  }
}

export default {
  id: 'ik-plotter',
  title: 'IK Plotter',
  description: 'Robot arms solved with inverse kinematics (FABRIK) share out the glyph outlines and draw them like a pen plotter, lifting the pen between contours. Hold the mouse down and every arm reaches for the cursor.',
  renderer: 'p2d',
  palettes: [
    ['#f4f1ea', '#0b0b12', '#e03a2f', '#0b0b12'],
    ['#0b0b12', '#f4f1ea', '#c8ff2e', '#5a4dff'],
    ['#1a3cff', '#f4f1ea', '#ff5a1f', '#0b0b12'],
    ['#e6e1d3', '#0d2bb8', '#e03a2f', '#0d2bb8'],
  ],
  params: [
    { type: 'section', label: 'Type' },
    { key: 'text', type: 'text', label: 'Text (lines separated with /)', value: 'PCD/SEOUL/2026' },
    { key: 'font', type: 'select', label: 'Font', options: Object.keys(FONTS), value: 'Archivo Black' },
    { key: 'size', type: 'range', label: 'Type size', min: 80, max: 900, step: 1, value: 380, unit: 'px' },

    { type: 'section', label: 'Arms' },
    { key: 'arms', type: 'range', label: 'Arms', min: 1, max: 8, step: 1, value: 4, rebuild: true },
    { key: 'segs', type: 'range', label: 'Segments per arm', min: 2, max: 14, step: 1, value: 4, rebuild: true },
    { key: 'base', type: 'select', label: 'Mounted on', options: ['bottom', 'top', 'sides', 'corners'], value: 'bottom', rebuild: true },
    { key: 'speed', type: 'range', label: 'Pen speed', min: 50, max: 3000, step: 10, value: 520, unit: 'px/s' },
    { key: 'thick', type: 'range', label: 'Arm thickness', min: 2, max: 40, step: 0.5, value: 14, unit: 'px' },
    { key: 'showArms', type: 'toggle', label: 'Show arms', value: true },

    { type: 'section', label: 'Ink' },
    { key: 'weight', type: 'range', label: 'Pen weight', min: 0.5, max: 12, step: 0.1, value: 3 },
    { key: 'travel', type: 'toggle', label: 'Show pen-up travel', value: false },
    { key: 'loop', type: 'range', label: 'Pause before redraw', min: 0, max: 10, step: 0.1, value: 2.5, unit: 's' },

    { type: 'section', label: 'Colour' },
    { key: 'palette', type: 'palette', label: 'Palette · bg / ink / arm / joint', value: ['#f4f1ea', '#0b0b12', '#e03a2f', '#0b0b12'] },
    { key: 'info', type: 'select', label: 'Info block', options: ['none', 'bottom', 'top', 'corners'], value: 'none' },
    { key: 'grain', type: 'range', label: 'Grain', min: 0, max: 0.4, step: 0.01, value: 0 },
  ],

  create(p, P, api) {
    const ctx = p.drawingContext;
    const ink = document.createElement('canvas');
    ink.width = W;
    ink.height = H;
    const ictx = ink.getContext('2d');
    let arms = [];
    let contours = [];
    let doneFor = 0;
    let job = 0;

    function anchors(n) {
      const pts = [];
      for (let i = 0; i < n; i++) {
        const f = (i + 0.5) / n;
        if (P.base === 'bottom') pts.push({ x: W * f, y: H + 10 });
        else if (P.base === 'top') pts.push({ x: W * f, y: -10 });
        else if (P.base === 'sides') pts.push(i % 2 ? { x: W + 10, y: H * (0.2 + 0.6 * f) } : { x: -10, y: H * (0.2 + 0.6 * f) });
        else pts.push([{ x: -10, y: -10 }, { x: W + 10, y: H + 10 }, { x: W + 10, y: -10 }, { x: -10, y: H + 10 }][i % 4]);
      }
      return pts;
    }

    // Give each contour to the nearest arm, then order each arm's contours along x for short travel.
    function assign() {
      ictx.clearRect(0, 0, W, H);
      doneFor = 0;
      const bases = anchors(P.arms);
      const queues = bases.map(() => []);
      contours.forEach((c) => {
        const cx = c.reduce((a, q) => a + q.x, 0) / c.length;
        const cy = c.reduce((a, q) => a + q.y, 0) / c.length;
        let best = 0;
        let bd = Infinity;
        bases.forEach((b, i) => {
          const d = Math.hypot(b.x - cx, b.y - cy) * (1 + queues[i].length * 0.02);
          if (d < bd) { bd = d; best = i; }
        });
        queues[best].push({ c, cx, cy });
      });
      arms = bases.map((b, i) => {
        const q = queues[i].sort((a, b2) => a.cx - b2.cx || a.cy - b2.cy).map((o) => o.c);
        // Long enough to reach its farthest point, split into equal segments.
        const far = Math.max(W * 0.3, ...q.flat().map((pt) => Math.hypot(pt.x - b.x, pt.y - b.y))) * 1.04;
        const lens = Array(P.segs).fill(far / P.segs);
        // Start folded out straight towards the poster centre.
        const dl = Math.hypot(W / 2 - b.x, H / 2 - b.y);
        const joints = Array.from({ length: P.segs + 1 }, (_, j) => {
          const t = Math.min(1, (j * far * 0.5) / P.segs / dl);
          return { x: b.x + (W / 2 - b.x) * t, y: b.y + (H / 2 - b.y) * t };
        });
        return { base: b, lens, joints, queue: q, ci: 0, pi: 0, tip: { ...joints[joints.length - 1] }, up: true };
      });
    }

    async function setText() {
      const id = ++job;
      const lines = P.text.split('/').map((l) => l.trim()).filter(Boolean);
      const font = await loadFont(P.font);
      if (id !== job) return;
      contours = (lines.length ? textContours(font, lines, P.size, 0.95, true) : []).map((c) => resample(c, 2, 0)).filter((c) => c.length > 2);
      assign();
    }
    setText();

    // Move the pen `dist` px: along the current contour if it is down, else straight to the next start.
    function advance(arm, dist) {
      while (dist > 0 && arm.ci < arm.queue.length) {
        const c = arm.queue[arm.ci];
        if (arm.up) {
          const s = c[0];
          const d = Math.hypot(s.x - arm.tip.x, s.y - arm.tip.y);
          const move = Math.min(d, dist * 1.8);
          const from = { ...arm.tip };
          if (d > 0) { arm.tip.x += ((s.x - arm.tip.x) / d) * move; arm.tip.y += ((s.y - arm.tip.y) / d) * move; }
          if (P.travel) line(from, arm.tip, 0.25);
          dist -= move / 1.8;
          if (move >= d) { arm.up = false; arm.pi = 0; }
        } else {
          const nxt = c[arm.pi + 1];
          if (!nxt) { arm.ci++; arm.up = true; continue; }
          const d = Math.hypot(nxt.x - arm.tip.x, nxt.y - arm.tip.y);
          const from = { ...arm.tip };
          if (d <= dist) { arm.tip = { x: nxt.x, y: nxt.y }; arm.pi++; dist -= d; } else {
            arm.tip.x += ((nxt.x - arm.tip.x) / d) * dist;
            arm.tip.y += ((nxt.y - arm.tip.y) / d) * dist;
            dist = 0;
          }
          line(from, arm.tip, 1);
        }
      }
    }

    function line(a, b, alpha) {
      ictx.globalAlpha = alpha;
      ictx.strokeStyle = P.palette[1];
      ictx.lineWidth = P.weight * U;
      ictx.lineCap = 'round';
      ictx.beginPath();
      ictx.moveTo(a.x, a.y);
      ictx.lineTo(b.x, b.y);
      ictx.stroke();
      ictx.globalAlpha = 1;
    }

    return {
      onParam(key) {
        if (['text', 'font', 'size'].includes(key)) setText();
        if (key === 'palette') assign();
      },
      draw() {
        const [bg, , armCol, jointCol] = P.palette;
        const dt = api.clock.dt;
        const reaching = p.mouseIsPressed && p.mouseX >= 0 && p.mouseX <= W && p.mouseY >= 0 && p.mouseY <= H;

        arms.forEach((arm) => {
          if (!reaching) advance(arm, P.speed * dt);
          const target = reaching ? { x: p.mouseX, y: p.mouseY } : arm.tip;
          fabrik(arm.joints, arm.lens, target);
        });
        if (arms.length && arms.every((a) => a.ci >= a.queue.length)) {
          doneFor += dt;
          if (doneFor > P.loop) assign();
        }

        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);
        ctx.drawImage(ink, 0, 0, W, H);

        if (P.showArms) {
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          arms.forEach((arm) => {
            const J = arm.joints;
            // Arm: thick tapered segments, then joints and the pen tip on top.
            for (let i = 0; i < J.length - 1; i++) {
              ctx.strokeStyle = armCol;
              ctx.lineWidth = P.thick * U * (1 - (i / J.length) * 0.55);
              ctx.beginPath();
              ctx.moveTo(J[i].x, J[i].y);
              ctx.lineTo(J[i + 1].x, J[i + 1].y);
              ctx.stroke();
            }
            J.forEach((j, i) => {
              ctx.fillStyle = jointCol;
              ctx.beginPath();
              ctx.arc(j.x, j.y, P.thick * U * (i === J.length - 1 ? 0.3 : 0.38), 0, Math.PI * 2);
              ctx.fill();
            });
            const tip = J[J.length - 1];
            ctx.fillStyle = arm.up ? armCol : P.palette[1];
            ctx.beginPath();
            ctx.arc(tip.x, tip.y, P.thick * U * 0.2, 0, Math.PI * 2);
            ctx.fill();
          });
        }

        drawInfo(ctx, { layout: P.info, color: P.palette[1], margin: 44 * U });
        drawGrain(ctx, P.grain);
      },
    };
  },
};
