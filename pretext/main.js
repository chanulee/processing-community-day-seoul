import { prepareWithSegments, layoutWithLines, layoutNextLine } from '../vendor/pretext/layout.js';
import { growthLayer, peopleLayer, freeInterval } from './data-layer.js';

// A2 is 420 × 594 mm; 1191 × 1684 px at 72 dpi.
const W = 1191;
const H = 1684;
const STORE = 'pcd-pretext:layout';
const HANDLE = 14;

const DEFAULT = {
  bg: '#f4f1ea',
  guides: true,
  data: { layer: 'growth', cumulative: true, height: 0.55, scale: 1.1, pad: 10, labels: true, ink: '#111111', accent: '#1a3cff', seed: 25 },
  boxes: [
    { text: 'Processing Community Day @ Seoul 2026', x: 44, y: 44, w: 1100, size: 168, weight: 700, leading: 0.9, tracking: -0.02, align: 'left', color: '#111111', flow: true },
    { text: 'Creative Coding in the Age of Vibe Coding', x: 44, y: 860, w: 620, size: 64, weight: 500, leading: 1.0, tracking: -0.01, align: 'left', color: '#1a3cff', flow: true },
    { text: '2026.10.31 Sat\n12:30–17:30', x: 700, y: 860, w: 447, size: 40, weight: 400, leading: 1.1, tracking: 0, align: 'right', color: '#111111', flow: true },
    { text: '25 years of Processing, counted in people: 11,452 forum members wrote 156,168 posts; 519 people committed code to Processing and p5.js; GitHub holds over 100,000 Processing sketches and over 85,000 p5.js projects — and 2026 alone brought 23,244 new p5.js repositories, the year of vibe coding.', x: 44, y: 1010, w: 1103, size: 34, weight: 500, leading: 1.15, tracking: -0.01, align: 'left', color: '#111111', flow: true },
    { text: 'Sogang University\nArt & Technology\npcd2026.creative-computing.org', x: 44, y: 1520, w: 700, size: 26, weight: 400, leading: 1.2, tracking: 0, align: 'left', color: '#111111' },
  ],
};

const $ = (id) => document.getElementById(id);
const canvas = $('poster');
const ctx = canvas.getContext('2d');
const dpr = Math.min(2, window.devicePixelRatio || 1);
canvas.width = W * dpr;
canvas.height = H * dpr;

let state = load();
let sel = 0;
let drag = null;

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE));
    if (s && Array.isArray(s.boxes)) return { ...s, data: { ...DEFAULT.data, ...s.data } };
  } catch { /* fall back to defaults */ }
  return structuredClone(DEFAULT);
}
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { /* storage unavailable */ } };

const fontOf = (b) => `${b.weight} ${b.size}px Areal`;

// prepare() is the expensive pass; cache it per text/font/tracking so dragging only re-runs layout.
const prepCache = new WeakMap();
function prepared(b) {
  const key = `${b.text}|${fontOf(b)}|${b.tracking}`;
  const hit = prepCache.get(b);
  if (hit && hit.key === key) return hit.p;
  const p = prepareWithSegments(b.text, fontOf(b), { whiteSpace: 'pre-wrap', letterSpacing: b.tracking * b.size });
  prepCache.set(b, { key, p });
  return p;
}

let data = null;
let layer = null;

function buildLayer() {
  const d = state.data;
  const opts = { W, H, margin: 44, pad: d.pad, seed: d.seed };
  if (!data || d.layer === 'off') layer = null;
  else if (d.layer === 'growth') layer = growthLayer(data, { ...opts, height: H * d.height, cumulative: d.cumulative, gap: 6 });
  else layer = peopleLayer(data, { ...opts, scale: d.scale });
  redraw();
}

// Lines carry their own x / width. A flowing box asks, per line band, which x-intervals are taken
// (by data that text yields to, and by the inked lines of boxes laid out before it), takes the widest
// gap, and Pretext's layoutNextLine() continues from the previous line's cursor.
function layoutBox(b, taken) {
  const lh = b.size * b.leading;
  const p = prepared(b);
  if (!b.flow) {
    const res = layoutWithLines(p, b.w, lh);
    const lines = res.lines.map((ln, j) => ({ ...ln, x: b.x, y: b.y + j * lh, w: b.w }));
    return { lines, lh, h: Math.max(lh, res.height) };
  }
  const lines = [];
  let cursor;
  let y = b.y;
  const minW = Math.min(b.w, b.size * 3);
  while (y < H + lh) {
    const iv = freeInterval(b.x, b.x + b.w, taken(y, y + lh), minW);
    if (iv) {
      const ln = layoutNextLine(p, iv[1] - iv[0], cursor);
      if (!ln) break;
      lines.push({ ...ln, x: iv[0], y, w: iv[1] - iv[0] });
      cursor = ln.end;
    }
    y += lh;
  }
  return { lines, lh, h: Math.max(lh, y - b.y) };
}

// Inked rectangle of a laid-out line, after alignment.
function inkRect(b, ln, lh) {
  let x = ln.x;
  if (b.align === 'center') x += (ln.w - ln.width) / 2;
  else if (b.align === 'right') x += ln.w - ln.width;
  return { x, y: ln.y, w: ln.width, h: lh };
}

function layoutAll() {
  const rects = [];
  const pad = state.data.pad;
  const taken = (y0, y1) => {
    const out = layer?.yieldsText ? layer.blocked(y0, y1) : [];
    for (const r of rects) if (r.y < y1 + pad && r.y + r.h > y0 - pad) out.push([r.x - pad, r.x + r.w + pad]);
    return out;
  };
  return state.boxes.map((b) => {
    const L = layoutBox(b, taken);
    b._h = L.h;
    L.rects = L.lines.map((ln) => inkRect(b, ln, L.lh));
    rects.push(...L.rects);
    return L;
  });
}

let dirty = true;
const redraw = () => { dirty = true; };

function render(guides = state.guides) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = state.bg;
  ctx.fillRect(0, 0, W, H);
  const layouts = layoutAll();
  ctx.textBaseline = 'alphabetic';
  layer?.draw(ctx, { ink: state.data.ink, accent: state.data.accent, labels: state.data.labels, text: layouts.flatMap((L) => L.rects) });
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  state.boxes.forEach((b, i) => {
    const { lines, lh, h, rects } = layouts[i];
    ctx.font = fontOf(b);
    ctx.letterSpacing = `${b.tracking * b.size}px`;
    ctx.fillStyle = b.color;
    // Baseline sits so that a leading of 1 fills the line box: ascent ≈ 0.8 of the em.
    const base = (lh - b.size) / 2 + b.size * 0.8;
    lines.forEach((ln, j) => ctx.fillText(ln.text, rects[j].x, ln.y + base));
    ctx.letterSpacing = '0px';
    if (!guides) return;
    const on = i === sel;
    ctx.strokeStyle = on ? '#2f6bff' : 'rgba(47,107,255,0.35)';
    ctx.lineWidth = on ? 2 : 1;
    ctx.setLineDash(on ? [] : [6, 6]);
    ctx.strokeRect(b.x, b.y, b.w, h);
    ctx.setLineDash([]);
    if (on) {
      ctx.fillStyle = '#2f6bff';
      ctx.fillRect(b.x + b.w - HANDLE / 2, b.y + h / 2 - HANDLE, HANDLE, HANDLE * 2);
    }
  });
}

function tick() {
  if (dirty) { dirty = false; render(); }
  requestAnimationFrame(tick);
}

// ---------- pointer ----------
function toPoster(e) {
  const r = canvas.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
}

function hit(x, y) {
  const s = state.boxes[sel];
  if (s && Math.abs(x - (s.x + s.w)) < HANDLE * 1.5 && y > s.y && y < s.y + s._h) return { i: sel, mode: 'resize' };
  for (let i = state.boxes.length - 1; i >= 0; i--) {
    const b = state.boxes[i];
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b._h) return { i, mode: 'move' };
  }
  return null;
}

canvas.addEventListener('pointerdown', (e) => {
  const [x, y] = toPoster(e);
  const h = hit(x, y);
  if (!h) return;
  select(h.i);
  const b = state.boxes[h.i];
  drag = { ...h, dx: x - b.x, dy: y - b.y };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  const [x, y] = toPoster(e);
  if (!drag) {
    const h = hit(x, y);
    canvas.style.cursor = h ? (h.mode === 'resize' ? 'ew-resize' : 'move') : 'default';
    return;
  }
  const b = state.boxes[drag.i];
  if (drag.mode === 'move') {
    b.x = Math.round(x - drag.dx);
    b.y = Math.round(y - drag.dy);
  } else {
    b.w = Math.max(40, Math.round(x - b.x));
    syncFields();
  }
  redraw();
});
const endDrag = () => { if (drag) { drag = null; save(); } };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea')) return;
  const b = state.boxes[sel];
  if (!b) return;
  const step = e.shiftKey ? 10 : 1;
  const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
  if (mv) { b.x += mv[0]; b.y += mv[1]; e.preventDefault(); save(); redraw(); }
  if (e.key === 'Delete' || e.key === 'Backspace') { remove(); e.preventDefault(); }
});

// ---------- panel ----------
const RANGES = { size: (v) => `${v}px`, leading: (v) => `${Math.round(v * 100)}%`, tracking: (v) => `${(v * 1000).toFixed(0)}`, w: (v) => `${v}px` };

for (const key of Object.keys(RANGES)) {
  $(`f-${key}`).addEventListener('input', (e) => {
    const b = state.boxes[sel];
    if (!b) return;
    b[key] = Number(e.target.value);
    $(`v-${key}`).textContent = RANGES[key](b[key]);
    save(); redraw();
  });
}
$('f-text').addEventListener('input', (e) => { const b = state.boxes[sel]; if (b) { b.text = e.target.value; save(); redraw(); listBoxes(); } });
$('f-color').addEventListener('input', (e) => { const b = state.boxes[sel]; if (b) { b.color = e.target.value; save(); redraw(); } });
$('f-bg').addEventListener('input', (e) => { state.bg = e.target.value; save(); redraw(); });
$('f-flow').addEventListener('change', (e) => { const b = state.boxes[sel]; if (b) { b.flow = e.target.checked; save(); redraw(); } });

// Data layer controls
const DATA_RANGES = { height: (v) => `${Math.round(v * 100)}%`, scale: (v) => v.toFixed(2), pad: (v) => `${v}px`, seed: (v) => v };
for (const key of Object.keys(DATA_RANGES)) {
  $(`d-${key}`).addEventListener('input', (e) => {
    state.data[key] = Number(e.target.value);
    $(`dv-${key}`).textContent = DATA_RANGES[key](state.data[key]);
    save(); buildLayer();
  });
}
for (const key of ['cumulative', 'labels']) $(`d-${key}`).addEventListener('change', (e) => { state.data[key] = e.target.checked; save(); buildLayer(); });
for (const key of ['ink', 'accent']) $(`d-${key}`).addEventListener('input', (e) => { state.data[key] = e.target.value; save(); redraw(); });
$('d-layer').addEventListener('click', (e) => {
  const v = e.target.dataset?.v;
  if (!v) return;
  state.data.layer = v;
  save(); syncFields(); buildLayer();
});

$('f-guides').addEventListener('change', (e) => { state.guides = e.target.checked; save(); redraw(); });

document.querySelectorAll('#props .seg').forEach((seg) => {
  const key = seg.id.slice(2);
  seg.innerHTML = seg.dataset.opts.split(',').map((o) => `<button type="button" data-v="${o}">${o}</button>`).join('');
  seg.addEventListener('click', (e) => {
    const v = e.target.dataset?.v;
    const b = state.boxes[sel];
    if (!v || !b) return;
    b[key] = key === 'weight' ? Number(v) : v;
    save(); syncFields(); redraw();
  });
});

function syncFields() {
  const b = state.boxes[sel];
  $('props').classList.toggle('empty', !b);
  $('f-bg').value = state.bg;
  $('f-guides').checked = state.guides;
  const d = state.data;
  for (const key of Object.keys(DATA_RANGES)) { $(`d-${key}`).value = d[key]; $(`dv-${key}`).textContent = DATA_RANGES[key](d[key]); }
  $('d-cumulative').checked = d.cumulative;
  $('d-labels').checked = d.labels;
  $('d-ink').value = d.ink;
  $('d-accent').value = d.accent;
  $('d-layer').querySelectorAll('button').forEach((btn) => btn.classList.toggle('on', btn.dataset.v === d.layer));
  if (!b) return;
  $('f-flow').checked = !!b.flow;
  if (document.activeElement !== $('f-text')) $('f-text').value = b.text;
  for (const key of Object.keys(RANGES)) {
    $(`f-${key}`).value = b[key];
    $(`v-${key}`).textContent = RANGES[key](b[key]);
  }
  $('f-color').value = b.color;
  document.querySelectorAll('#props .seg').forEach((seg) => {
    const cur = String(b[seg.id.slice(2)]);
    seg.querySelectorAll('button').forEach((btn) => btn.classList.toggle('on', btn.dataset.v === cur));
  });
}

function listBoxes() {
  $('boxes').innerHTML = '';
  state.boxes.forEach((b, i) => {
    const btn = document.createElement('button');
    btn.textContent = b.text.split('\n')[0] || '(empty)';
    btn.className = i === sel ? 'on' : '';
    btn.onclick = () => select(i);
    $('boxes').append(btn);
  });
}

function select(i) {
  sel = i;
  listBoxes(); syncFields(); redraw();
}

function remove() {
  if (!state.boxes[sel]) return;
  state.boxes.splice(sel, 1);
  select(Math.min(sel, state.boxes.length - 1));
  save();
}

$('add').onclick = () => {
  state.boxes.push({ text: 'New text', x: 120, y: 120, w: 600, size: 80, weight: 700, leading: 1, tracking: 0, align: 'left', color: '#111111' });
  select(state.boxes.length - 1); save();
};
$('dup').onclick = () => {
  const b = state.boxes[sel];
  if (!b) return;
  const { _h, ...copy } = b;
  state.boxes.push({ ...copy, x: b.x + 30, y: b.y + 30 });
  select(state.boxes.length - 1); save();
};
$('del').onclick = remove;
$('reset').onclick = () => { state = structuredClone(DEFAULT); select(0); save(); buildLayer(); };
$('png').onclick = () => {
  render(false);
  canvas.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pcd-pretext-${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  redraw();
};

// Pretext measures with canvas, so the font must be loaded before the first prepare().
await Promise.all([400, 500, 700].map((w) => document.fonts.load(`${w} 100px Areal`)));
$('d-layer').innerHTML = ['growth', 'people', 'off'].map((o) => `<button type="button" data-v="${o}">${o}</button>`).join('');
try {
  data = await (await fetch('data/data.json')).json();
  $('d-source').textContent = `crawled ${data.crawled} · forum ${data.forum.users_count.toLocaleString('en')} users, ${data.forum.posts_count.toLocaleString('en')} posts`;
} catch {
  $('d-source').textContent = 'data/data.json missing: run python3 pretext/data/crawl.py';
}
buildLayer();
select(0);
tick();
