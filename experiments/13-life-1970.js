import { W, H, U, FONT, mulberry32, drawInfo, drawGrain } from '../app/lib/poster.js';

// Conway's Game of Life (B3/S23), first published in Martin Gardner's Scientific American column, October 1970.
// Three period looks: the magazine page, a phosphor terminal, and the Go board Conway first played it on.
const STYLES = {
  gardner: { bg: '#efe8d6', ink: '#16130f', grid: 'rgba(22,19,15,0.18)', label: '#16130f' },
  phosphor: { bg: '#050a05', ink: '#5cff7a', grid: 'rgba(92,255,122,0.07)', label: '#5cff7a' },
  amber: { bg: '#0c0703', ink: '#ffb640', grid: 'rgba(255,182,64,0.07)', label: '#ffb640' },
  go: { bg: '#d9a95b', ink: '#111111', grid: 'rgba(40,24,8,0.7)', label: '#2a1806' },
};

export default {
  id: 'life-1970',
  title: 'Life 1970',
  description: 'Conway\'s Game of Life, seeded with the poster text and run in 1970 dress: the Scientific American page, a green or amber phosphor terminal with afterglow, or the Go board it was first played on. It runs forward from the text and then replays its history backwards until the letters come back. Drag to draw live cells.',
  renderer: 'p2d',
  params: [
    { type: 'section', label: 'Seed' },
    { key: 'text', type: 'text', label: 'Seed text (lines separated with /)', value: 'PCD/SEOUL/2026' },
    { key: 'noise', type: 'range', label: 'Random cells', min: 0, max: 0.5, step: 0.01, value: 0.04 },
    { key: 'seed', type: 'range', label: 'Seed', min: 1, max: 999, step: 1, value: 1970 % 999 },
    { key: 'restart', type: 'range', label: 'Run length', note: 'Generations before it rewinds (or restarts). 0 = run forever', min: 0, max: 2000, step: 10, value: 160, unit: 'gen' },
    { key: 'reverse', type: 'toggle', label: 'Rewind to the text', note: 'Life cannot run backwards, so it replays its recorded history in reverse', value: true },
    { key: 'rewindRate', type: 'range', label: 'Rewind speed', min: 0.5, max: 4, step: 0.1, value: 1.5, unit: '×' },

    { type: 'section', label: 'Rules' },
    { key: 'cols', type: 'range', label: 'Columns', min: 20, max: 240, step: 1, value: 80 },
    { key: 'rate', type: 'range', label: 'Generations / s', min: 0.5, max: 60, step: 0.5, value: 8 },
    { key: 'hold', type: 'range', label: 'Hold the seed', min: 0, max: 5, step: 0.1, value: 1.5, unit: 's' },
    { key: 'wrap', type: 'toggle', label: 'Wrap edges (torus)', value: true },

    { type: 'section', label: 'Look' },
    { key: 'style', type: 'select', label: 'Style', options: Object.keys(STYLES), value: 'gardner' },
    { key: 'shape', type: 'select', label: 'Cell', options: ['dot', 'square', 'stone'], value: 'dot' },
    { key: 'fill', type: 'range', label: 'Cell size', min: 0.2, max: 1, step: 0.01, value: 0.78 },
    { key: 'grid', type: 'toggle', label: 'Grid lines', value: true },
    { key: 'glow', type: 'range', label: 'Afterglow', note: 'Phosphor persistence of dead cells', min: 0, max: 0.98, step: 0.01, value: 0.8 },
    { key: 'scan', type: 'range', label: 'Scanlines', min: 0, max: 0.6, step: 0.01, value: 0.25 },
    { key: 'counter', type: 'toggle', label: 'Generation counter', value: true },
    { key: 'info', type: 'select', label: 'Info block', options: ['none', 'bottom', 'top', 'corners'], value: 'bottom' },
    { key: 'grain', type: 'range', label: 'Grain', min: 0, max: 0.4, step: 0.01, value: 0.08 },
  ],

  create(p, P, api) {
    const ctx = p.drawingContext;
    let cols;
    let rows;
    let cell;
    let cur;
    let nxt;
    let glow;
    let gen = 0;
    let acc = 0;
    let holdLeft = 0;
    let history = [];
    let rewinding = false;

    function seedGrid() {
      cols = Math.round(P.cols);
      cell = W / cols;
      rows = Math.floor(H / cell);
      cur = new Uint8Array(cols * rows);
      nxt = new Uint8Array(cols * rows);
      glow = new Float32Array(cols * rows);
      gen = 0;
      acc = 0;
      holdLeft = P.hold;
      history = [];
      rewinding = false;

      // Rasterise the seed text at grid resolution and threshold it into live cells.
      const lines = P.text.split('/').map((l) => l.trim()).filter(Boolean);
      const off = document.createElement('canvas');
      off.width = cols;
      off.height = rows;
      const o = off.getContext('2d');
      if (lines.length) {
        let size = rows / (lines.length * 1.05);
        o.font = `${size}px ${FONT.display}`;
        const widest = Math.max(...lines.map((l) => o.measureText(l).width));
        size *= Math.min(1, (cols * 0.86) / widest);
        o.font = `${size}px ${FONT.display}`;
        o.textAlign = 'center';
        o.textBaseline = 'middle';
        o.fillStyle = '#000';
        lines.forEach((l, i) => o.fillText(l, cols / 2, rows / 2 + (i - (lines.length - 1) / 2) * size * 1.02));
      }
      const px = o.getImageData(0, 0, cols, rows).data;
      const rnd = mulberry32(P.seed);
      for (let i = 0; i < cols * rows; i++) cur[i] = px[i * 4 + 3] > 110 || rnd() < P.noise ? 1 : 0;
    }

    function step() {
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          let n = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (!dx && !dy) continue;
              let xx = x + dx;
              let yy = y + dy;
              if (P.wrap) { xx = (xx + cols) % cols; yy = (yy + rows) % rows; } else if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
              n += cur[yy * cols + xx];
            }
          }
          const i = y * cols + x;
          nxt[i] = n === 3 || (n === 2 && cur[i]) ? 1 : 0;
        }
      }
      // Keep the generation we are leaving so the run can be replayed backwards.
      if (P.reverse) history.push(cur.slice());
      [cur, nxt] = [nxt, cur];
      gen++;
      if (P.restart > 0 && gen >= P.restart) {
        if (P.reverse) rewinding = true;
        else seedGrid();
      }
    }

    function unstep() {
      const prev = history.pop();
      if (prev) { cur.set(prev); gen--; }
      if (!history.length) {
        // Back at the text: hold it, then run forward again.
        rewinding = false;
        holdLeft = P.hold;
      }
    }

    seedGrid();

    const paint = () => {
      const x = Math.floor(p.mouseX / cell);
      const y = Math.floor(p.mouseY / cell);
      if (x >= 0 && y >= 0 && x < cols && y < rows) cur[y * cols + x] = 1;
    };

    return {
      onParam(key) {
        if (['text', 'noise', 'seed', 'cols', 'hold', 'reverse'].includes(key)) seedGrid();
      },
      mousePressed: paint,
      mouseDragged: paint,
      draw() {
        const S = STYLES[P.style];
        const dt = api.clock.dt;
        if (holdLeft > 0) holdLeft -= dt;
        else {
          acc += dt * P.rate * (rewinding ? P.rewindRate : 1);
          let guard = 0;
          while (acc >= 1 && guard++ < 16) { (rewinding ? unstep : step)(); acc -= 1; }
        }

        ctx.fillStyle = S.bg;
        ctx.fillRect(0, 0, W, H);
        const top = (H - rows * cell) / 2;
        const crt = P.style === 'phosphor' || P.style === 'amber';

        if (P.grid) {
          ctx.strokeStyle = S.grid;
          ctx.lineWidth = (P.style === 'go' ? 1.4 : 1) * U;
          ctx.beginPath();
          // The Go board puts stones on intersections, the others in squares.
          const o = P.style === 'go' ? cell / 2 : 0;
          for (let x = 0; x <= cols - (o ? 1 : 0); x++) { ctx.moveTo(x * cell + o, top + o); ctx.lineTo(x * cell + o, top + rows * cell - o); }
          for (let y = 0; y <= rows - (o ? 1 : 0); y++) { ctx.moveTo(o, top + y * cell + o); ctx.lineTo(cols * cell - o, top + y * cell + o); }
          ctx.stroke();
        }

        const r = (cell / 2) * P.fill;
        const shape = P.style === 'go' ? 'stone' : P.shape;
        if (crt) { ctx.shadowColor = S.ink; ctx.shadowBlur = 10 * U; }
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            const i = y * cols + x;
            // Afterglow: a live cell sets glow to 1, a dead one decays it.
            glow[i] = cur[i] ? 1 : glow[i] * (crt ? P.glow : 0);
            const a = glow[i];
            if (a < 0.03) continue;
            const cx = x * cell + cell / 2;
            const cy = top + y * cell + cell / 2;
            ctx.globalAlpha = cur[i] ? 1 : a * 0.45;
            if (shape === 'stone') {
              const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
              g.addColorStop(0, '#5a5a5a');
              g.addColorStop(1, '#050505');
              ctx.fillStyle = g;
              ctx.beginPath();
              ctx.arc(cx, cy, r, 0, Math.PI * 2);
              ctx.fill();
            } else {
              ctx.fillStyle = S.ink;
              if (shape === 'square') ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
              else { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); }
            }
          }
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;

        if (crt && P.scan > 0) {
          ctx.fillStyle = `rgba(0,0,0,${P.scan})`;
          for (let y = 0; y < H; y += 4 * U) ctx.fillRect(0, y, W, 2 * U);
          // Vignette like a curved tube.
          const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
          v.addColorStop(0, 'rgba(0,0,0,0)');
          v.addColorStop(1, 'rgba(0,0,0,0.6)');
          ctx.fillStyle = v;
          ctx.fillRect(0, 0, W, H);
        }

        if (P.counter) {
          ctx.fillStyle = S.label;
          ctx.font = `700 ${22 * U}px ${FONT.mono}`;
          ctx.textBaseline = 'top';
          ctx.textAlign = 'left';
          const live = cur.reduce((a, b) => a + b, 0);
          ctx.fillText(`${rewinding ? '<< REWIND' : '>> PLAY  '}   GENERATION ${String(gen).padStart(4, '0')}   POPULATION ${String(live).padStart(5, '0')}   B3/S23`, 44 * U, 40 * U);
        }

        drawInfo(ctx, { layout: P.info, color: S.label, margin: 44 * U });
        drawGrain(ctx, P.grain);
      },
    };
  },
};
