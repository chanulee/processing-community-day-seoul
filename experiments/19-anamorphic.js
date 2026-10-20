import { W, H, U, FONT, FONT_CHOICES, mulberry32, smooth, drawInfo, drawGrain } from '../app/lib/poster.js';
import { textMask } from '../app/lib/outlines.js';

const MW = 300;
const MH = Math.round((MW * H) / W);

export default {
  id: 'anamorphic',
  title: 'Anamorphic Points',
  description: 'The type is made of dots scattered through 3D space. Each dot sits somewhere along the sight line from one key viewpoint, so the letters only line up from exactly that angle. The camera wanders and it is just a cloud, then it glides into the key view and PCD 2026 SEOUL snaps together. Drag to look around yourself.',
  renderer: 'p2d',
  palettes: [
    ['#f4f1ea', '#0b0b12', '#e03a2f'],
    ['#0b0b12', '#f4f1ea', '#c8ff2e'],
    ['#1a3cff', '#f4f1ea', '#ff5a1f'],
    ['#ffffff', '#000000', '#1a3cff'],
  ],
  params: [
    { type: 'section', label: 'Type' },
    { key: 'text', type: 'text', label: 'Text (lines separated with /)', value: 'SEOUL' },
    { key: 'rotate', type: 'range', label: 'Text rotation', note: '±90 runs it vertically', min: -180, max: 180, step: 0.5, value: -80, unit: '°' },
    { key: 'zoom', type: 'range', label: 'Text zoom', note: '>1 crops past the poster edge', min: 0.3, max: 3, step: 0.01, value: 1.35 },
    { key: 'font', type: 'select', label: 'Font', options: Object.keys(FONT_CHOICES), value: 'Archivo Black' },
    { key: 'count', type: 'range', label: 'Dots', min: 20, max: 12000, step: 10, value: 420 },
    { key: 'noise', type: 'range', label: 'Stray dots', note: 'Dots that never join a letter', min: 0, max: 3000, step: 5, value: 40 },
    { key: 'seed', type: 'range', label: 'Seed', min: 1, max: 999, step: 1, value: 26 },

    { type: 'section', label: 'Space' },
    { key: 'depth', type: 'range', label: 'Depth spread', note: 'How far dots scatter along their sight lines', min: 0, max: 2, step: 0.01, value: 1.1 },
    { key: 'fov', type: 'range', label: 'Field of view', min: 10, max: 90, step: 1, value: 45, unit: '°' },
    { key: 'dot', type: 'range', label: 'Dot size', min: 0.5, max: 80, step: 0.5, value: 22, unit: 'px' },
    { key: 'sizeByDepth', type: 'toggle', label: 'True size', note: 'Near dots bigger away from the key view; off = all dots the same', value: true },

    { type: 'section', label: 'Camera' },
    { key: 'auto', type: 'toggle', label: 'Auto camera', note: 'Off = use the yaw / pitch sliders below (drag still works)', value: false },
    { key: 'camYaw', type: 'range', label: 'Camera yaw', min: -90, max: 90, step: 0.1, value: 25, unit: '°' },
    { key: 'camPitch', type: 'range', label: 'Camera pitch', min: -80, max: 80, step: 0.1, value: -10, unit: '°' },
    { key: 'cycle', type: 'range', label: 'Cycle', min: 3, max: 30, step: 0.5, value: 10, unit: 's' },
    { key: 'lock', type: 'range', label: 'Readable for', note: 'Share of the cycle near the key view', min: 0.05, max: 0.8, step: 0.01, value: 0.3 },
    { key: 'swing', type: 'range', label: 'Wander', min: 5, max: 120, step: 1, value: 55, unit: '°' },
    { key: 'keyYaw', type: 'range', label: 'Key yaw', min: -60, max: 60, step: 1, value: 0, unit: '°' },
    { key: 'keyPitch', type: 'range', label: 'Key pitch', min: -40, max: 40, step: 1, value: 0, unit: '°' },

    { type: 'section', label: 'Look' },
    { key: 'colour', type: 'select', label: 'Dot colour', options: ['ink', 'depth', 'letters'], value: 'depth' },
    { key: 'hud', type: 'toggle', label: 'Angle readout', value: true },
    { key: 'palette', type: 'palette', label: 'Palette · bg / near / far', value: ['#f4f1ea', '#0b0b12', '#e03a2f'] },
    { key: 'info', type: 'select', label: 'Info block', options: ['none', 'bottom', 'top', 'corners'], value: 'none' },
    { key: 'grain', type: 'range', label: 'Grain', min: 0, max: 0.4, step: 0.01, value: 0 },
  ],

  create(p, P, api) {
    const ctx = p.drawingContext;
    let dots = [];
    let drag = null;
    let user = { yaw: 0, pitch: 0 };

    // Camera sits at (0, 0, D) looking down -z with focal length F (pixels).
    const focal = () => H / 2 / Math.tan((P.fov * Math.PI) / 360);
    const dist = () => focal() * 1.0;

    function build() {
      const mask = textMask(P.text, FONT_CHOICES[P.font], MW, MH, { rotate: P.rotate, zoom: P.zoom });
      const rnd = mulberry32(P.seed);
      const F = focal();
      const D = dist();
      const S = W * 0.5 * P.depth;
      dots = [];
      // Put a dot at screen point (sx, sy) of the key view, at a random depth along that pixel's ray.
      const place = (sx, sy, inLetter) => {
        const zw = (rnd() * 2 - 1) * S;
        const t = (D - zw) / F;
        dots.push({ x: sx * t, y: sy * t, z: D - F * t, t, inLetter, c: rnd() });
      };
      let guard = 0;
      while (dots.length < P.count && guard++ < P.count * 300) {
        const mx = rnd() * MW;
        const my = rnd() * MH;
        if (mask[Math.floor(my) * MW + Math.floor(mx)] > 0.5) place((mx / MW - 0.5) * W, (my / MH - 0.5) * H, true);
      }
      for (let i = 0; i < P.noise; i++) place((rnd() - 0.5) * W * 1.2, (rnd() - 0.5) * H * 1.2, false);
    }
    build();

    return {
      onParam(key) {
        if (['text', 'font', 'count', 'noise', 'seed', 'depth', 'fov', 'rotate', 'zoom'].includes(key)) build();
      },
      mousePressed() { drag = { x: p.mouseX, y: p.mouseY, ...user }; },
      mouseDragged() {
        if (!drag) return;
        user = { yaw: drag.yaw + (p.mouseX - drag.x) * 0.15, pitch: drag.pitch - (p.mouseY - drag.y) * 0.15 };
      },
      mouseReleased() { drag = null; },
      draw() {
        const t = api.clock.t;
        const [bg, near, far] = P.palette;
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        // Auto camera: wander on a Lissajous path, then ease into the key view and hold it.
        const ph = (t % P.cycle) / P.cycle;
        const half = P.lock / 2;
        const dEdge = Math.abs(ph - 0.5) - half; // < 0 while locked
        const away = smooth(Math.min(1, Math.max(0, dEdge / 0.15)));
        let yaw = P.auto ? P.keyYaw + Math.sin(t * 0.61) * P.swing * away : P.camYaw;
        let pitch = P.auto ? P.keyPitch + Math.sin(t * 0.43 + 1) * P.swing * 0.45 * away : P.camPitch;
        // In auto mode a drag springs back; in manual mode it stays where you leave it.
        if (!drag && P.auto) { user.yaw *= 0.96; user.pitch *= 0.96; }
        yaw += user.yaw;
        pitch += user.pitch;

        // Orbit the camera round the origin: rotate the world the other way. The key view is (keyYaw, keyPitch),
        // so the dots were built in that frame and we rotate by the difference.
        const ry = ((yaw - P.keyYaw) * Math.PI) / 180;
        const rx = ((pitch - P.keyPitch) * Math.PI) / 180;
        const cy = Math.cos(ry);
        const sy = Math.sin(ry);
        const cx = Math.cos(rx);
        const sx = Math.sin(rx);
        const F = focal();
        const D = dist();

        const proj = [];
        for (const d of dots) {
          // Rotate about the origin: yaw (Y), then pitch (X).
          const x1 = d.x * cy + d.z * sy;
          const z1 = -d.x * sy + d.z * cy;
          const y2 = d.y * cx - z1 * sx;
          const z2 = d.y * sx + z1 * cx;
          const depth = D - z2;
          if (depth < 1) continue;
          const k = F / depth;
          // Size chosen so every dot is the same size from the key view.
          const r = P.sizeByDepth ? P.dot * U * d.t * k : P.dot * U;
          proj.push({ x: W / 2 + x1 * k, y: H / 2 + y2 * k, r, depth, d });
        }
        proj.sort((a, b) => b.depth - a.depth);

        const lerpHex = (a, b, f) => {
          const pa = parseInt(a.slice(1), 16);
          const pb = parseInt(b.slice(1), 16);
          const ch = (s) => Math.round(((pa >> s) & 255) * (1 - f) + ((pb >> s) & 255) * f);
          return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
        };
        const S = W * 0.5 * Math.max(0.01, P.depth);
        for (const q of proj) {
          if (P.colour === 'ink') ctx.fillStyle = near;
          else if (P.colour === 'letters') ctx.fillStyle = q.d.inLetter ? far : near;
          else ctx.fillStyle = lerpHex(near, far, Math.min(1, Math.max(0, 0.5 - q.d.z / (2 * S))));
          ctx.beginPath();
          ctx.arc(q.x, q.y, Math.max(0.3, q.r), 0, Math.PI * 2);
          ctx.fill();
        }

        if (P.hud) {
          const off = Math.hypot(yaw - P.keyYaw, pitch - P.keyPitch);
          ctx.fillStyle = near;
          ctx.font = `700 ${18 * U}px ${FONT.mono}`;
          ctx.textBaseline = 'top';
          ctx.fillText(`YAW ${yaw.toFixed(1).padStart(6)}°   PITCH ${pitch.toFixed(1).padStart(6)}°   ${off < 0.5 ? '● KEY VIEW' : `○ ${off.toFixed(1)}° OFF`}`, 44 * U, 40 * U);
        }

        drawInfo(ctx, { layout: P.info, color: near, margin: 44 * U });
        drawGrain(ctx, P.grain);
      },
    };
  },
};
