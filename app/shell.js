import { W, H, U, loadFonts } from './lib/poster.js';
import typeFill from '../experiments/01-type-fill.js';
import splatField from '../experiments/05-splat-field.js';
import gravityLetters from '../experiments/07-gravity-letters.js';
import waveType from '../experiments/08-wave-type.js';

const EXPERIMENTS = [typeFill, splatField, gravityLetters, waveType];

const $ = (id) => document.getElementById(id);
const holder = $('canvas-holder');
const gsap = window.gsap;

const run = {
  exp: null,
  P: null,
  p5: null,
  inst: null,
  tweens: [],
  paused: false,
  speed: 1,
  density: 1,
  recorder: null,
};

const storeKey = (exp) => `pcd-lab:${exp.id}`;

function defaults(exp) {
  const P = {};
  for (const d of exp.params) if (d.key) P[d.key] = Array.isArray(d.value) ? [...d.value] : d.value;
  return P;
}

function loadParams(exp) {
  const P = defaults(exp);
  try {
    const saved = JSON.parse(localStorage.getItem(storeKey(exp)) || '{}');
    for (const k of Object.keys(saved)) if (k in P) P[k] = saved[k];
  } catch { /* corrupted storage falls back to defaults */ }
  return P;
}

const saveParams = () => localStorage.setItem(storeKey(run.exp), JSON.stringify(run.P));

function unmount() {
  run.tweens.forEach((t) => t.kill());
  run.tweens = [];
  run.inst?.dispose?.();
  run.p5?.remove();
  run.p5 = null;
  run.inst = null;
  holder.innerHTML = '';
}

function mount(exp, keepParams = false) {
  stopRecording();
  unmount();
  run.exp = exp;
  if (!keepParams) run.P = loadParams(exp);
  const P = run.P;
  const api = {
    W, H, U,
    gsap,
    clock: { t: 0, dt: 0, frame: 0 },
    track(t) { run.tweens.push(t); return t; },
    timeline(vars) { return api.track(gsap.timeline(vars)); },
    to(target, vars) { return api.track(gsap.to(target, vars)); },
    killTweens() { run.tweens.forEach((t) => t.kill()); run.tweens = []; },
    get paused() { return run.paused; },
  };

  run.p5 = new p5((p) => {
    p.setup = () => {
      p.pixelDensity(run.density);
      p.createCanvas(W, H, exp.renderer === 'webgl' ? p.WEBGL : p.P2D);
      fitCanvas();
      run.inst = exp.create(p, P, api) || {};
      if (run.paused) p.noLoop();
    };
    p.draw = () => {
      const dt = run.paused ? 0 : Math.min(p.deltaTime / 1000, 1 / 20) * run.speed;
      api.clock.dt = dt;
      api.clock.t += dt;
      api.clock.frame++;
      run.inst?.draw?.();
    };
    const inside = () => p.mouseX >= 0 && p.mouseY >= 0 && p.mouseX <= W && p.mouseY <= H;
    p.mousePressed = () => { if (inside()) run.inst?.mousePressed?.(); };
    p.mouseDragged = () => { if (inside()) run.inst?.mouseDragged?.(); };
    p.mouseReleased = () => run.inst?.mouseReleased?.();
  }, holder);

  location.hash = exp.id;
  renderNav();
  $('exp-title').textContent = exp.title;
  $('exp-desc').textContent = exp.description;
  buildParams(exp);
}

function fitCanvas() {
  const c = holder.querySelector('canvas');
  if (!c) return;
  const stage = $('stage');
  const s = Math.min((stage.clientWidth - 64) / W, (stage.clientHeight - 64) / H);
  c.style.width = `${Math.floor(W * s)}px`;
  c.style.height = `${Math.floor(H * s)}px`;
}
window.addEventListener('resize', fitCanvas);

function notify(key) {
  saveParams();
  const def = run.exp.params.find((d) => d.key === key);
  if (def?.rebuild) {
    mount(run.exp, true);
    return;
  }
  run.inst?.onParam?.(key);
  if (run.paused) run.p5?.redraw();
}

// ---------- panel ----------

function renderNav() {
  const nav = $('exp-list');
  nav.innerHTML = '';
  EXPERIMENTS.forEach((exp, i) => {
    const b = document.createElement('button');
    b.innerHTML = `<b>${String(i + 1).padStart(2, '0')}</b>${exp.title}`;
    b.className = exp === run.exp ? 'active' : '';
    b.onclick = () => mount(exp);
    nav.appendChild(b);
  });
}

const decimals = (step) => (step >= 1 ? 0 : Math.min(3, String(step).split('.')[1]?.length || 2));
const fmt = (d, v) => (d.format ? d.format(v) : `${Number(v).toFixed(decimals(d.step ?? 0.01))}${d.unit || ''}`);

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function buildParams(exp) {
  const root = $('params');
  root.innerHTML = '';
  const P = run.P;
  for (const d of exp.params) {
    if (d.type === 'section') {
      const s = el('div', 'section-head', `<h2>${d.label}</h2>${d.note ? `<p>${d.note}</p>` : ''}`);
      root.appendChild(s);
      continue;
    }
    const wrap = el('div', 'control');
    wrap.dataset.key = d.key;
    if (d.type === 'range') {
      const lab = el('div', 'label', `<span>${d.label}</span><span class="value">${fmt(d, P[d.key])}</span>`);
      const input = el('input');
      Object.assign(input, { type: 'range', min: d.min, max: d.max, step: d.step ?? 0.01, value: P[d.key] });
      const out = lab.querySelector('.value');
      input.oninput = () => {
        P[d.key] = Number(input.value);
        out.textContent = fmt(d, P[d.key]);
        if (!d.rebuild) notify(d.key);
      };
      if (d.rebuild) input.onchange = () => notify(d.key);
      wrap.append(lab, input);
    } else if (d.type === 'toggle') {
      const lab = el('label', 'toggle', `<span>${d.label}${d.note ? `<small>${d.note}</small>` : ''}</span>`);
      const input = el('input');
      input.type = 'checkbox';
      input.checked = !!P[d.key];
      input.onchange = () => { P[d.key] = input.checked; notify(d.key); };
      lab.append(input, el('span', 'switch'));
      wrap.append(lab);
    } else if (d.type === 'select') {
      wrap.append(el('div', 'label', `<span>${d.label}</span>`));
      if (d.options.length <= 6) {
        const seg = el('div', 'segmented');
        d.options.forEach((o) => {
          const b = el('button', o === P[d.key] ? 'on' : '', o);
          b.onclick = () => {
            P[d.key] = o;
            seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
            notify(d.key);
          };
          seg.appendChild(b);
        });
        wrap.append(seg);
      } else {
        const sel = el('select');
        d.options.forEach((o) => sel.appendChild(new Option(o, o, false, o === P[d.key])));
        sel.onchange = () => { P[d.key] = sel.value; notify(d.key); };
        wrap.append(sel);
      }
    } else if (d.type === 'text') {
      wrap.append(el('div', 'label', `<span>${d.label}</span>`));
      const input = el('input');
      input.type = 'text';
      input.value = P[d.key];
      input.onchange = () => { P[d.key] = input.value; notify(d.key); };
      wrap.append(input);
    } else if (d.type === 'palette') {
      wrap.append(el('div', 'label', `<span>${d.label || 'Palette'}</span>`));
      const row = el('div', 'palette');
      P[d.key].forEach((c, i) => {
        const sw = el('label');
        sw.style.background = c;
        const input = el('input');
        input.type = 'color';
        input.value = c;
        input.oninput = () => {
          P[d.key][i] = input.value;
          sw.style.background = input.value;
          notify(d.key);
        };
        sw.appendChild(input);
        row.appendChild(sw);
      });
      wrap.append(row);
      if (exp.palettes?.length) {
        const presets = el('div', 'palette-presets');
        exp.palettes.forEach((pal) => {
          const b = el('button');
          b.title = pal.join(' ');
          pal.forEach((c) => { const s = el('span'); s.style.background = c; b.appendChild(s); });
          b.onclick = () => { P[d.key] = [...pal]; buildParams(exp); notify(d.key); };
          presets.appendChild(b);
        });
        wrap.append(presets);
      }
    }
    root.appendChild(wrap);
  }
}

function randomize() {
  const exp = run.exp;
  const P = run.P;
  let rebuild = false;
  const changed = [];
  for (const d of exp.params) {
    if (!d.key || d.random === false) continue;
    const before = JSON.stringify(P[d.key]);
    if (d.type === 'range') {
      const step = d.step ?? 0.01;
      const v = d.min + Math.random() * (d.max - d.min);
      P[d.key] = Number((Math.round(v / step) * step).toFixed(decimals(step)));
    } else if (d.type === 'toggle') {
      P[d.key] = Math.random() < 0.5;
    } else if (d.type === 'select') {
      P[d.key] = d.options[Math.floor(Math.random() * d.options.length)];
    } else if (d.type === 'palette' && exp.palettes?.length) {
      P[d.key] = [...exp.palettes[Math.floor(Math.random() * exp.palettes.length)]];
    } else continue;
    if (JSON.stringify(P[d.key]) !== before) {
      changed.push(d.key);
      if (d.rebuild) rebuild = true;
    }
  }
  saveParams();
  buildParams(exp);
  if (rebuild) mount(exp, true);
  else changed.forEach((k) => run.inst?.onParam?.(k));
}

function reset() {
  localStorage.removeItem(storeKey(run.exp));
  mount(run.exp);
}

// ---------- transport & export ----------

function setPaused(v) {
  run.paused = v;
  $('btn-play').textContent = v ? 'Play' : 'Pause';
  if (v) { run.p5?.noLoop(); gsap.globalTimeline.pause(); } else { run.p5?.loop(); gsap.globalTimeline.resume(); }
}

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function savePNG() {
  const c = holder.querySelector('canvas');
  c?.toBlob((b) => download(b, `pcd2026-${run.exp.id}-${stamp()}.png`), 'image/png');
}

function startRecording() {
  const c = holder.querySelector('canvas');
  if (!c || !window.MediaRecorder) return;
  const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t));
  const rec = new MediaRecorder(c.captureStream(60), { mimeType: type, videoBitsPerSecond: 16e6 });
  const chunks = [];
  const started = performance.now();
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.onstop = () => download(new Blob(chunks, { type: 'video/webm' }), `pcd2026-${run.exp.id}-${stamp()}.webm`);
  rec.start(250);
  const btn = $('btn-rec');
  btn.classList.add('rec');
  run.recorder = {
    rec,
    timer: setInterval(() => { btn.textContent = `■ ${((performance.now() - started) / 1000).toFixed(0)}s`; }, 250),
  };
}

function stopRecording() {
  if (!run.recorder) return;
  clearInterval(run.recorder.timer);
  run.recorder.rec.stop();
  run.recorder = null;
  const btn = $('btn-rec');
  btn.classList.remove('rec');
  btn.textContent = '● Rec';
}

$('btn-play').onclick = () => setPaused(!run.paused);
$('btn-png').onclick = savePNG;
$('btn-rec').onclick = () => (run.recorder ? stopRecording() : startRecording());
$('btn-random').onclick = randomize;
$('btn-reset').onclick = reset;
$('btn-copy').onclick = () => navigator.clipboard?.writeText(JSON.stringify({ experiment: run.exp.id, params: run.P }, null, 2));
$('speed').oninput = (e) => {
  run.speed = Number(e.target.value);
  $('speed-val').textContent = `${run.speed.toFixed(2)}×`;
  gsap.globalTimeline.timeScale(Math.max(0.0001, run.speed));
};
$('density').onchange = (e) => {
  run.density = Number(e.target.value);
  $('density-val').textContent = `${run.density}×`;
  $('meta-size').textContent = `A2 · 420 × 594 mm · ${W * run.density} × ${H * run.density}px`;
  mount(run.exp, true);
};

window.addEventListener('keydown', (e) => {
  if (e.target.matches('input[type=text], select')) return;
  const i = EXPERIMENTS.indexOf(run.exp);
  if (e.code === 'Space') { e.preventDefault(); setPaused(!run.paused); }
  else if (e.key === 's' || e.key === 'S') savePNG();
  else if (e.key === 'r' || e.key === 'R') randomize();
  else if (e.key === 'ArrowRight') mount(EXPERIMENTS[(i + 1) % EXPERIMENTS.length]);
  else if (e.key === 'ArrowLeft') mount(EXPERIMENTS[(i - 1 + EXPERIMENTS.length) % EXPERIMENTS.length]);
});

setInterval(() => {
  if (run.p5) $('meta-fps').textContent = run.paused ? 'paused' : `${run.p5.frameRate().toFixed(0)} fps`;
}, 500);

window.lab = {
  mount: (id) => mount(EXPERIMENTS.find((e) => e.id === id)),
  set(key, value) { run.P[key] = value; buildParams(run.exp); notify(key); },
  snapshot(width = 560) {
    const c = holder.querySelector('canvas');
    const o = document.createElement('canvas');
    o.width = width;
    o.height = Math.round((width * H) / W);
    o.getContext('2d').drawImage(c, 0, 0, o.width, o.height);
    return o.toDataURL('image/jpeg', 0.8);
  },
};

$('meta-size').textContent = `A2 · 420 × 594 mm · ${W}×${H}px`;
await loadFonts();
const initial = EXPERIMENTS.find((e) => e.id === location.hash.slice(1)) || EXPERIMENTS[0];
mount(initial);
