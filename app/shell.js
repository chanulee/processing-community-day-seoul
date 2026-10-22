import { W, H, U, FORMAT, loadFonts } from './lib/poster.js';
import { Muxer, ArrayBufferTarget } from '../vendor/mp4-muxer.mjs';

// The page's entry module (app/lab.js or main/main.js) sets the list before loading the shell.
const EXPERIMENTS = window.LAB.experiments;

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
  openGroups: new Set(),
};

const sizeLabel = () => FORMAT || 'A2 · 420 × 594 mm';
const storeKey = (exp) => `pcd-lab:${exp.id}`;

function defaults(exp) {
  const P = {};
  for (const d of exp.params) if (d.key) P[d.key] = Array.isArray(d.value) ? [...d.value] : d.value;
  return P;
}

// An experiment with `persist: false` always opens on its built-in defaults; nothing is read from or written to storage.
function loadParams(exp) {
  const P = defaults(exp);
  if (exp.persist === false) return P;
  try {
    const saved = JSON.parse(localStorage.getItem(storeKey(exp)) || '{}');
    // An experiment can bump `schema` when its built-in shapes change: saved per-letter values (keys with '_') are then dropped.
    // `schemaReset` lists other keys (e.g. a default word list) that are dropped the same way.
    const stale = (saved._schema ?? 0) !== (exp.schema ?? 0);
    for (const k of Object.keys(saved)) if (k in P && !(stale && (k.includes('_') || exp.schemaReset?.includes(k)))) P[k] = saved[k];
  } catch { /* corrupted storage falls back to defaults */ }
  return P;
}

// Only edits are stored, so changed defaults reach everyone who never touched that control.
const saveParams = () => {
  if (run.exp.persist === false) return;
  const base = defaults(run.exp);
  const diff = { _schema: run.exp.schema ?? 0 };
  for (const k of Object.keys(run.P)) if (JSON.stringify(run.P[k]) !== JSON.stringify(base[k])) diff[k] = run.P[k];
  localStorage.setItem(storeKey(run.exp), JSON.stringify(diff));
};

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

  run.api = api;
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
  const cs = getComputedStyle(stage);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const s = Math.min((stage.clientWidth - padX) / W, (stage.clientHeight - padY) / H);
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
  nav.hidden = EXPERIMENTS.length < 2;
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
  let into = root; // where controls go: the panel, or the body of a collapsed group
  for (const d of exp.params) {
    if (d.type === 'group') {
      // Everything after a group marker lives in a collapsible block (closed until opened, and stays as left).
      const box = el('details', 'group');
      box.open = run.openGroups.has(d.label);
      box.ontoggle = () => { if (box.open) run.openGroups.add(d.label); else run.openGroups.delete(d.label); };
      box.appendChild(el('summary', '', `<h2>${d.label}</h2>${d.note ? `<p>${d.note}</p>` : ''}`));
      root.appendChild(box);
      into = box;
      continue;
    }
    if (d.type === 'section') {
      const s = el('div', 'section-head', `<h2>${d.label}</h2>${d.note ? `<p>${d.note}</p>` : ''}`);
      into.appendChild(s);
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
    into.appendChild(wrap);
  }
}

function reset() {
  localStorage.removeItem(storeKey(run.exp));
  mount(run.exp);
}

// ---------- transport & export ----------

function setPaused(v) {
  run.paused = v;
  $('btn-play').textContent = v ? 'Play' : 'Pause';
  window.dispatchEvent(new Event('pcd-pause'));
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
  a.style.display = 'none';
  document.body.appendChild(a); // some browsers ignore clicks on detached links
  a.click();
  // Large files (a 120 fps MP4 is tens of MB) are still being read after the click, so keep the URL alive.
  setTimeout(() => { a.remove(); URL.revokeObjectURL(a.href); }, 120000);
}

function savePNG() {
  const c = holder.querySelector('canvas');
  c?.toBlob((b) => download(b, `pcd2026-${run.exp.id}-${stamp()}.png`), 'image/png');
}

// Video export. Rec starts recording from the current frame and Rec again stops and saves.
// An experiment that renders deterministically (fixedStep: Two Shapes) is stepped at exactly the chosen fps and
// encoded to H.264 MP4 with WebCodecs, so the frame rate does not depend on the screen. Anything else is
// recorded live from the canvas (MP4 where the browser can, else WebM).
let recFps = 120; // 30 / 60 / 120, from the Video fps buttons when the page has them
const REC_TYPES = ['video/mp4;codecs=avc1.64002A', 'video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const yieldNow = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });

// Both the developer button and the client one show the recording state; label is null when idle.
function recUI(label) {
  const dev = $('btn-rec');
  dev.classList.toggle('rec', label !== null);
  dev.textContent = label === null ? '● Rec' : `■ ${label}`;
  const client = $('c-rec');
  if (!client) return;
  client.classList.toggle('rec', label !== null);
  client.textContent = label === null ? '● 녹화 시작' : `■ 녹화 중 ${label} · 눌러서 저장`;
}

function startRecording() {
  if (run.inst?.fixedStep && window.VideoEncoder && window.VideoFrame) recordStepped();
  else recordLive();
}

function recordLive() {
  const c = holder.querySelector('canvas');
  if (!c || !window.MediaRecorder) return;
  const type = REC_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
  const ext = type.startsWith('video/mp4') ? 'mp4' : 'webm';
  const rec = new MediaRecorder(c.captureStream(60), { mimeType: type, videoBitsPerSecond: 16e6 });
  const chunks = [];
  const started = performance.now();
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.onstop = () => download(new Blob(chunks, { type: `video/${ext}` }), `pcd2026-${run.exp.id}-${stamp()}.${ext}`);
  rec.start(250);
  recUI('0s');
  run.recorder = {
    rec,
    timer: setInterval(() => recUI(`${((performance.now() - started) / 1000).toFixed(0)}s`), 250),
  };
}

// First H.264 level / acceleration combination this browser can encode at the canvas size and the chosen fps.
async function encoderConfig(w, h) {
  // About 0.15 bit per pixel: thin lines and trails need far more than the usual 0.05 to stay clean.
  const bitrate = Math.round(Math.min(120e6, Math.max(8e6, w * h * recFps * 0.15)));
  for (const hardwareAcceleration of ['no-preference', 'prefer-software']) {
    for (const codec of ['avc1.640034', 'avc1.640033', 'avc1.640032', 'avc1.64002A']) {
      const cfg = { codec, width: w, height: h, bitrate, framerate: recFps, latencyMode: 'quality', hardwareAcceleration };
      try { if ((await VideoEncoder.isConfigSupported(cfg)).supported) return cfg; } catch { /* try the next one */ }
    }
  }
  return null;
}

async function recordStepped() {
  const c = holder.querySelector('canvas');
  const { inst, p5: p, api } = run;
  const state = { stop: false };
  run.recorder = state;
  recUI('…');
  const cfg = await encoderConfig(c.width, c.height);
  if (!cfg) {
    console.warn('No H.264 encoder for', c.width, 'x', c.height, '@', recFps, '- recording live instead.');
    run.recorder = null;
    recUI(null);
    recordLive();
    return;
  }
  const wasPaused = run.paused;
  p.noLoop(); // frames are drawn by this loop from here on, starting at the current moment
  const fps = recFps;
  const dt = run.speed / fps;
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: c.width, height: c.height }, fastStart: 'in-memory' });
  let failed = null;
  const encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { failed = e; } });
  encoder.configure(cfg);
  const t0 = performance.now();
  let i = 0;
  try {
    while (!state.stop && !failed) {
      api.clock.dt = dt;
      api.clock.t += dt;
      api.clock.frame++;
      inst.draw();
      const frame = new VideoFrame(c, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) });
      encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 }); // a keyframe every 2 s keeps quality from pulsing
      frame.close();
      i++;
      if (i % 12 === 0) recUI(`${(i / fps).toFixed(0)}s`);
      // Keep the encoder from running far ahead; give up if it stops draining.
      for (let g = 0; encoder.encodeQueueSize > 8 && !state.stop && !failed; g++) {
        if (g > 2500) failed = new Error('The video encoder stopped responding');
        else await sleep(4);
      }
      // Pace to real time when rendering is fast enough, and always let the page handle clicks.
      const ahead = t0 + (i * 1000) / fps - performance.now();
      if (ahead > 2) await sleep(ahead);
      else await yieldNow();
    }
    if (!failed && i > 0) {
      await encoder.flush();
      muxer.finalize();
      download(new Blob([muxer.target.buffer], { type: 'video/mp4' }), `pcd2026-${run.exp.id}-${stamp()}.mp4`);
    }
  } catch (e) {
    failed = e;
  } finally {
    if (encoder.state !== 'closed') { try { encoder.close(); } catch { /* already closed */ } }
    if (failed) { console.error('Video export failed:', failed); $('btn-rec').textContent = 'Rec failed'; if ($('c-rec')) $('c-rec').textContent = '녹화 실패 · 다시 시도해 주세요'; await sleep(2500); }
    run.recorder = null;
    recUI(null);
    if (!wasPaused && run.p5 === p) p.loop();
  }
}

function stopRecording() {
  if (!run.recorder) return;
  if (run.recorder.rec) {
    clearInterval(run.recorder.timer);
    run.recorder.rec.stop();
    run.recorder = null;
    recUI(null);
  } else run.recorder.stop = true; // the loop above finishes the file and saves it
}

const syncFps = () => document.querySelectorAll('#fps-switch [data-fps]').forEach((o) => o.classList.toggle('primary', Number(o.dataset.fps) === recFps));
document.querySelectorAll('#fps-switch [data-fps]').forEach((b) => {
  b.onclick = () => { if (!run.recorder) { recFps = Number(b.dataset.fps); syncFps(); } };
});
syncFps();

$('btn-play').onclick = () => setPaused(!run.paused);
$('btn-png').onclick = savePNG;
$('btn-rec').onclick = () => (run.recorder ? stopRecording() : startRecording());
$('btn-reset').onclick = reset;
$('btn-copy').onclick = () => navigator.clipboard?.writeText(JSON.stringify({ experiment: run.exp.id, params: run.P }, null, 2));
$('speed').oninput = (e) => {
  run.speed = Number(e.target.value);
  $('speed-val').textContent = `${run.speed.toFixed(2)}×`;
  gsap.globalTimeline.timeScale(Math.max(0.0001, run.speed));
};
// Export size steps: the slider picks an index. 1× is the canvas itself (1080 wide), 4/3 is 2K (1440 wide).
const DENSITIES = [[1, '1×'], [4 / 3, '2K'], [2, '2×'], [3, '3×']];
const densityLabel = (d) => `${DENSITIES.find(([v]) => v === d)?.[1] ?? `${d}×`} · ${Math.round(W * d)}×${Math.round(H * d)}`;
function applyDensity(d, remount = true) {
  run.density = d;
  $('density').value = DENSITIES.findIndex(([v]) => v === d);
  $('density-val').textContent = densityLabel(d);
  $('meta-size').textContent = `${sizeLabel()} · ${Math.round(W * d)} × ${Math.round(H * d)}px`;
  const out = $('c-out');
  if (out) out.textContent = `${Math.round(W * d)} × ${Math.round(H * d)} px · ${recFps} fps · MP4`;
  if (remount && run.exp) mount(run.exp, true);
}
$('density').oninput = (e) => {
  run.density = DENSITIES[Number(e.target.value)][0];
  $('density-val').textContent = densityLabel(run.density);
};
$('density').onchange = () => applyDensity(run.density);

window.addEventListener('keydown', (e) => {
  if (e.target.matches('input[type=text], select')) return;
  const i = EXPERIMENTS.indexOf(run.exp);
  if (e.code === 'Space') { e.preventDefault(); setPaused(!run.paused); }
  else if (e.key === 's' || e.key === 'S') savePNG();
  else if (e.key === 'ArrowRight') mount(EXPERIMENTS[(i + 1) % EXPERIMENTS.length]);
  else if (e.key === 'ArrowLeft') mount(EXPERIMENTS[(i - 1 + EXPERIMENTS.length) % EXPERIMENTS.length]);
  else run.inst?.keyPressed?.(e);
});

setInterval(() => {
  if (run.p5) $('meta-fps').textContent = run.paused ? 'paused' : `${run.p5.frameRate().toFixed(0)} fps`;
}, 500);

window.lab = {
  togglePause: () => setPaused(!run.paused),
  mount: (id) => mount(EXPERIMENTS.find((e) => e.id === id)),
  set(key, value) { run.P[key] = value; buildParams(run.exp); notify(key); window.dispatchEvent(new Event('pcd-mount')); },
  snapshot(width = 560) {
    const c = holder.querySelector('canvas');
    const o = document.createElement('canvas');
    o.width = width;
    o.height = Math.round((width * H) / W);
    o.getContext('2d').drawImage(c, 0, 0, o.width, o.height);
    return o.toDataURL('image/jpeg', 0.8);
  },
};

$('meta-size').textContent = `${sizeLabel()} · ${W}×${H}px`;
// Pages that set a canvas format (index.html) get a 9:16 / 3:4 switch; the page reloads at the new size.
document.querySelectorAll('[data-format]').forEach((b) => {
  b.classList.toggle('primary', b.dataset.format === FORMAT);
  b.onclick = () => {
    if (b.dataset.format === FORMAT) return;
    try { sessionStorage.setItem('pcd-format', b.dataset.format); } catch { /* storage blocked */ }
    location.reload();
  };
});

// ---------- client / developer mode ----------
// Client mode (index.html only) is a short guided panel: pick a ratio and colours, then record. It exports at
// 60 fps and 2× size whatever the developer settings are; developer mode keeps every control.
const HAS_CLIENT = !!$('c-rec');
const devExport = { fps: recFps, density: run.density };
let mode = 'dev';
function setMode(next, remount = true) {
  if (!HAS_CLIENT) return;
  if (run.recorder) stopRecording();
  if (next === 'client' && mode === 'dev') { devExport.fps = recFps; devExport.density = run.density; }
  mode = next;
  document.body.dataset.mode = next;
  try { localStorage.setItem('pcd-mode', next); } catch { /* storage blocked */ }
  recFps = next === 'client' ? 60 : devExport.fps;
  syncFps();
  applyDensity(next === 'client' ? 2 : devExport.density, remount);
  if (run.exp) buildParams(run.exp); // the developer panel may be stale after colour edits made in client mode
  window.dispatchEvent(new Event('resize'));
}
if (HAS_CLIENT) {
  document.querySelectorAll('[data-mode-set]').forEach((b) => { b.onclick = () => setMode(b.dataset.modeSet); });
  $('c-rec').onclick = () => (run.recorder ? stopRecording() : startRecording());
  $('c-png').onclick = savePNG;
  // Colours: background stays as designed, rectangle and stroke are editable.
  const colours = [$('c-col-a'), $('c-col-b')];
  colours.forEach((input, i) => {
    input.oninput = () => { run.P.palette[i + 1] = input.value; notify('palette'); };
  });
  const syncColours = () => colours.forEach((input, i) => { input.value = run.P.palette[i + 1]; });
  window.addEventListener('pcd-mount', syncColours);
  const presets = $('c-presets');
  (run.exp?.palettes || window.LAB.experiments[0].palettes || []).forEach((pal) => {
    const b = el('button', '', pal.slice(1).map((c) => `<span style="background:${c}"></span>`).join(''));
    b.title = pal.slice(1).join(' · ');
    b.onclick = () => { run.P.palette[1] = pal[1]; run.P.palette[2] = pal[2]; syncColours(); notify('palette'); };
    presets.appendChild(b);
  });
  const syncBlend = () => document.querySelectorAll('#c-blend [data-blend]').forEach((b) => b.classList.toggle('on', b.dataset.blend === run.P.blend));
  document.querySelectorAll('#c-blend [data-blend]').forEach((b) => {
    b.onclick = () => { run.P.blend = b.dataset.blend; syncBlend(); notify('blend'); };
  });
  window.addEventListener('pcd-mount', syncBlend);
  const syncZoom = () => document.querySelectorAll('#c-zoom [data-zoom]').forEach((b) => b.classList.toggle('on', b.dataset.zoom === run.P.zoomAnim));
  document.querySelectorAll('#c-zoom [data-zoom]').forEach((b) => {
    b.onclick = () => { run.P.zoomAnim = b.dataset.zoom; syncZoom(); notify('zoomAnim'); };
  });
  window.addEventListener('pcd-mount', syncZoom);
  const info = $('c-info');
  info.checked = !run.P?.hideInfo;
  info.onchange = () => window.lab.set('hideInfo', !info.checked);
  window.addEventListener('pcd-mount', () => { info.checked = !run.P.hideInfo; });
  $('c-reset-colours').onclick = () => {
    const base = defaults(run.exp).palette;
    run.P.palette[1] = base[1];
    run.P.palette[2] = base[2];
    syncColours();
    notify('palette');
  };
}

await loadFonts();
const initial = EXPERIMENTS.find((e) => e.id === location.hash.slice(1)) || EXPERIMENTS[0];
let savedMode = 'client';
try { savedMode = localStorage.getItem('pcd-mode') || 'client'; } catch { /* storage blocked */ }
if (HAS_CLIENT && savedMode === 'client') {
  mode = 'client';
  document.body.dataset.mode = 'client';
  recFps = 60;
  syncFps();
  applyDensity(2, false);
} else document.body.dataset.mode = 'dev';
mount(initial);
window.dispatchEvent(new Event('pcd-mount'));
