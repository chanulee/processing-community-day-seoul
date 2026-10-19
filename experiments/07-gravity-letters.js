import { W, H, U, FONT, drawInfo, makeOverlay, blitOverlay, canvasImage, texturedQuad, hexToVec, mulberry32 } from '../app/lib/poster.js';
import { GW, GH, glyphCells, cellPolygon } from '../app/lib/glyphs.js';

const WORDS = ['PCD', '2026', 'SEOUL'];
const SHADERS = ['chrome', 'clay', 'holo', 'toon', 'normal'];
const DZ = 320;

const VERT = `
precision highp float;
attribute vec3 aPosition;
attribute vec3 aNormal;
uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;
uniform mat3 uNormalMatrix;
varying vec3 vN;
varying vec3 vV;
varying vec3 vObj;
void main() {
  vec4 mv = uModelViewMatrix * vec4(aPosition, 1.0);
  vV = mv.xyz;
  vN = normalize(uNormalMatrix * aNormal);
  vObj = aPosition;
  gl_Position = uProjectionMatrix * mv;
}`;

const FRAG = `
precision highp float;
uniform float uMode, uTime, uFogNear, uFogFar, uFog;
uniform vec3 uColor, uInk, uBg;
varying vec3 vN;
varying vec3 vV;
varying vec3 vObj;

vec3 rainbow(float t) { return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67))); }

void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(-vV);
  vec3 L1 = normalize(vec3(-0.5, -0.8, 0.6));
  vec3 L2 = normalize(vec3(0.7, 0.3, 0.5));
  float d1 = max(dot(N, L1), 0.0);
  float d2 = max(dot(N, L2), 0.0);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 2.5);
  vec3 H1 = normalize(L1 + V);
  float spec = pow(max(dot(N, H1), 0.0), 60.0);
  vec3 col;
  if (uMode < 0.5) {
    vec3 R = reflect(-V, N);
    float y = -R.y;
    vec3 sky = mix(uInk, vec3(1.0), smoothstep(0.0, 0.9, y));
    vec3 ground = mix(uColor * 0.25, uColor, smoothstep(-1.0, -0.05, y));
    col = mix(ground, sky, smoothstep(-0.03, 0.03, y));
    col += smoothstep(0.985, 1.0, 1.0 - abs(y - 0.02)) * 0.6;
    col += spec * 0.8;
  } else if (uMode < 1.5) {
    col = uColor * (0.35 + 0.7 * d1 + 0.25 * d2) + fres * 0.15 + spec * 0.12;
  } else if (uMode < 2.5) {
    float stripe = smoothstep(0.4, 0.6, fract(vObj.y * 1.2 - uTime * 0.8));
    vec3 hue = rainbow(fres * 1.2 + vObj.x * 0.05 + uTime * 0.15);
    col = mix(uColor * 0.25, hue, 0.35 + 0.65 * fres) + stripe * 0.08 + spec;
  } else if (uMode < 3.5) {
    float b = d1 > 0.6 ? 1.0 : d1 > 0.25 ? 0.72 : 0.45;
    col = uColor * b;
    col = mix(col, uInk, step(0.62, fres));
    col += step(0.94, spec) * 0.9;
  } else {
    col = mix(N * 0.5 + 0.5, uColor, 0.35) * (0.7 + 0.3 * d1);
  }
  float depth = clamp((-vV.z - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  col = mix(col, uBg, depth * uFog);
  gl_FragColor = vec4(col, 1.0);
}`;

function buildGlyph(p, ch, depth) {
  const g = new p5.Geometry();
  const cells = glyphCells(ch);
  const full = new Set(cells.filter((c) => c.code === '#').map((c) => `${c.x},${c.y}`));
  const z0 = -depth / 2;
  const z1 = depth / 2;
  const push = (x, y, z, nx, ny, nz) => {
    g.vertices.push(p.createVector(x, y, z));
    g.vertexNormals.push(p.createVector(nx, ny, nz));
    g.uvs.push((x + GW / 2) / GW, (y + GH / 2) / GH);
    return g.vertices.length - 1;
  };
  for (const c of cells) {
    const poly = cellPolygon(c.code, 10).map(([x, y]) => [c.x + x - GW / 2, c.y + y - GH / 2]);
    const n = poly.length;
    const f = poly.map(([x, y]) => push(x, y, z1, 0, 0, 1));
    const b = poly.map(([x, y]) => push(x, y, z0, 0, 0, -1));
    for (let i = 1; i < n - 1; i++) {
      g.faces.push([f[0], f[i], f[i + 1]], [b[0], b[i + 1], b[i]]);
    }
    const cx = poly.reduce((a, q) => a + q[0], 0) / n;
    const cy = poly.reduce((a, q) => a + q[1], 0) / n;
    const quarter = '1234'.includes(c.code);
    for (let i = 0; i < n; i++) {
      const a = poly[i];
      const bb = poly[(i + 1) % n];
      if (c.code === '#') {
        const nb = [[c.x, c.y - 1], [c.x + 1, c.y], [c.x, c.y + 1], [c.x - 1, c.y]][i];
        if (full.has(`${nb[0]},${nb[1]}`)) continue;
      }
      let na;
      let nbv;
      if (quarter && i >= 1 && i < n - 1) {
        const [ox, oy] = poly[0];
        const la = Math.hypot(a[0] - ox, a[1] - oy) || 1;
        const lb = Math.hypot(bb[0] - ox, bb[1] - oy) || 1;
        na = [(ox - a[0]) / la, (oy - a[1]) / la];
        nbv = [(ox - bb[0]) / lb, (oy - bb[1]) / lb];
        if ((a[0] - ox) * (cx - ox) + (a[1] - oy) * (cy - oy) > 0) {
          na = [-na[0], -na[1]];
          nbv = [-nbv[0], -nbv[1]];
        }
      } else {
        let nx = bb[1] - a[1];
        let ny = -(bb[0] - a[0]);
        const l = Math.hypot(nx, ny) || 1;
        nx /= l; ny /= l;
        if (nx * ((a[0] + bb[0]) / 2 - cx) + ny * ((a[1] + bb[1]) / 2 - cy) < 0) { nx = -nx; ny = -ny; }
        na = nbv = [nx, ny];
      }
      const v0 = push(a[0], a[1], z1, na[0], na[1], 0);
      const v1 = push(bb[0], bb[1], z1, nbv[0], nbv[1], 0);
      const v2 = push(bb[0], bb[1], z0, nbv[0], nbv[1], 0);
      const v3 = push(a[0], a[1], z0, na[0], na[1], 0);
      g.faces.push([v0, v1, v2], [v0, v2, v3]);
    }
  }
  g.gid = `glyph-${ch}-${depth}-${Math.random()}`;
  return g;
}

export default {
  id: 'gravity-letters',
  title: 'Gravity Letters',
  description: 'P C D 2 0 2 6 S E O U L as extruded 3D letters with rigid-body physics. They hold the layout, drift in zero-g, fall and pile up under gravity, then fly home. Each letter can use a different shader. Click to blast.',
  renderer: 'webgl',
  palettes: [
    ['#e9e6df', '#141414', '#2f6bff', '#ff5a1f', '#f2b51c', '#18a058'],
    ['#0b0b10', '#f2efe6', '#d8ff3a', '#ff4fa3', '#4fd1ff', '#ffffff'],
    ['#0a22b0', '#ffffff', '#ffffff', '#ffd23f', '#ff6a3d', '#9fc2ff'],
    ['#f2efe6', '#111111', '#111111', '#e8442e', '#111111', '#0a22b0'],
    ['#ff5a1f', '#111111', '#fff3e0', '#111111', '#ffd23f', '#1a3cff'],
  ],
  params: [
    { type: 'section', label: 'Physics' },
    { key: 'mode', type: 'select', label: 'Mode', options: ['cycle', 'gravity', 'zero-g', 'home'], value: 'cycle' },
    { key: 'gravity', type: 'range', label: 'Gravity', min: 0, max: 4000, step: 10, value: 2200 },
    { key: 'gravAngle', type: 'range', label: 'Gravity direction', min: -180, max: 180, step: 1, value: 0, unit: '°' },
    { key: 'bounce', type: 'range', label: 'Bounciness', min: 0, max: 0.95, step: 0.01, value: 0.35 },
    { key: 'friction', type: 'range', label: 'Friction', min: 0, max: 1, step: 0.01, value: 0.45 },
    { key: 'kick', type: 'range', label: 'Zero-g kick', min: 0, max: 2, step: 0.01, value: 1 },
    { key: 'spin3d', type: 'range', label: '3D tumble', min: 0, max: 2, step: 0.01, value: 1 },
    { key: 'homeTime', type: 'range', label: 'Hold layout', min: 0.5, max: 8, step: 0.1, value: 2.6, unit: 's' },
    { key: 'floatTime', type: 'range', label: 'Zero-g time', min: 0, max: 10, step: 0.1, value: 4.5, unit: 's' },
    { key: 'fallTime', type: 'range', label: 'Gravity time', min: 0.5, max: 10, step: 0.1, value: 4.5, unit: 's' },
    { type: 'section', label: 'Material' },
    { key: 'shader', type: 'select', label: 'Shader', options: ['mixed', ...SHADERS], value: 'mixed' },
    { key: 'depth', type: 'range', label: 'Extrusion', min: 0.2, max: 4, step: 0.05, value: 1.4, rebuild: true },
    { key: 'fog', type: 'range', label: 'Depth fog', min: 0, max: 1, step: 0.01, value: 0.3 },
    { key: 'shadows', type: 'toggle', label: 'Wall shadows', value: false },
    { key: 'room', type: 'toggle', label: 'Room lines', value: true },
    { key: 'fov', type: 'range', label: 'Field of view', min: 10, max: 80, step: 1, value: 38, unit: '°' },
    { type: 'section', label: 'Colour' },
    { key: 'palette', type: 'palette', label: 'Palette · bg / ink / letters…', value: ['#e9e6df', '#141414', '#2f6bff', '#ff5a1f', '#f2b51c', '#18a058'] },
    { key: 'info', type: 'select', label: 'Info block', options: ['bottom', 'top', 'corners', 'none'], value: 'top' },
  ],

  create(p, P, api) {
    const sh = p.createShader(VERT, FRAG);
    const geoms = {};
    for (const ch of new Set(WORDS.join(''))) geoms[ch] = buildGlyph(p, ch, P.depth);
    const rnd = mulberry32(7);

    const m = 60 * U;
    const floor = H - (P.info === 'bottom' ? 120 * U : 30 * U);
    const ceil = P.info === 'top' ? 120 * U : 30 * U;
    const scales = WORDS.map((w) => (W - m * 2) / (w.length * GW + (w.length - 1) * 1.2));
    const heights = scales.map((s) => s * GH);
    const gapY = 60 * U;
    const total = heights.reduce((a, b) => a + b, 0) + gapY * 2;
    let hy = ceil + (floor - ceil - total) / 2;
    const bodies = [];
    WORDS.forEach((w, wi) => {
      const s = scales[wi];
      [...w].forEach((ch, k) => {
        const hx = m + (k * (GW + 1.2) + GW / 2) * s;
        const hyc = hy + (GH / 2) * s;
        const r = 2.5 * s * 0.98;
        bodies.push({
          ch, i: bodies.length, s, r,
          hx, hy: hyc,
          x: hx, y: hyc, vx: 0, vy: 0, a: 0, w: 0,
          z: 0, vz: 0, rx: 0, ry: 0, wrx: 0, wry: 0,
          m: s * s, I: (s * s * (25 + 49) * s * s) / 12,
          circles: [[0, -s], [0, 0], [0, s]],
          mode: SHADERS[bodies.length % SHADERS.length],
          color: P.palette[2 + (bodies.length % (P.palette.length - 2))],
        });
      });
      hy += heights[wi] + gapY;
    });

    let phase = P.mode === 'cycle' ? 'home' : P.mode;
    let phaseT = 0;
    const order = ['home', 'zero-g', 'gravity'];
    const phaseLen = () => ({ home: P.homeTime, 'zero-g': P.floatTime, gravity: P.fallTime }[phase]);

    function enter(next) {
      phase = next;
      phaseT = 0;
      if (next === 'zero-g') {
        for (const b of bodies) {
          b.vx += (rnd() - 0.5) * 900 * P.kick * U;
          b.vy += (rnd() - 0.5) * 900 * P.kick * U - 200 * P.kick * U;
          b.w += (rnd() - 0.5) * 4 * P.kick;
          b.vz += (rnd() - 0.5) * 500 * P.kick;
          b.wrx += (rnd() - 0.5) * 5 * P.spin3d;
          b.wry += (rnd() - 0.5) * 5 * P.spin3d;
        }
      }
    }

    const worldPt = (b, [lx, ly]) => {
      const c = Math.cos(b.a);
      const s = Math.sin(b.a);
      return [b.x + lx * c - ly * s, b.y + lx * s + ly * c];
    };

    function contact(a, b, px, py, nx, ny, pen) {
      const ima = a ? 1 / a.m : 0;
      const imb = 1 / b.m;
      const iia = a ? 1 / a.I : 0;
      const iib = 1 / b.I;
      const rax = a ? px - a.x : 0;
      const ray = a ? py - a.y : 0;
      const rbx = px - b.x;
      const rby = py - b.y;
      const vax = a ? a.vx - a.w * ray : 0;
      const vay = a ? a.vy + a.w * rax : 0;
      const vbx = b.vx - b.w * rby;
      const vby = b.vy + b.w * rbx;
      const rvx = vbx - vax;
      const rvy = vby - vay;
      const vn = rvx * nx + rvy * ny;
      const corr = Math.max(0, pen - 0.5) * 0.6 / (ima + imb);
      if (a) { a.x -= nx * corr * ima; a.y -= ny * corr * ima; }
      b.x += nx * corr * imb;
      b.y += ny * corr * imb;
      if (vn > 0) return;
      const rna = rax * ny - ray * nx;
      const rnb = rbx * ny - rby * nx;
      const kn = ima + imb + rna * rna * iia + rnb * rnb * iib;
      const e = Math.abs(vn) < 40 ? 0 : P.bounce;
      const j = (-(1 + e) * vn) / kn;
      const tx = -ny;
      const ty = nx;
      const vt = rvx * tx + rvy * ty;
      const rta = rax * ty - ray * tx;
      const rtb = rbx * ty - rby * tx;
      const kt = ima + imb + rta * rta * iia + rtb * rtb * iib;
      let jt = -vt / kt;
      jt = Math.max(-j * P.friction, Math.min(j * P.friction, jt));
      const ix = nx * j + tx * jt;
      const iy = ny * j + ty * jt;
      if (a) {
        a.vx -= ix * ima;
        a.vy -= iy * ima;
        a.w -= (rax * iy - ray * ix) * iia;
      }
      b.vx += ix * imb;
      b.vy += iy * imb;
      b.w += (rbx * iy - rby * ix) * iib;
    }

    function step(dt) {
      const g = P.gravity * U;
      const ga = (P.gravAngle * Math.PI) / 180;
      const gx = Math.sin(-ga) * g;
      const gy = Math.cos(ga) * g;
      const home = phase === 'home';
      for (const b of bodies) {
        if (home) {
          const k = 40;
          const c = 2 * Math.sqrt(k) * 0.9;
          b.vx += ((b.hx - b.x) * k - b.vx * c) * dt;
          b.vy += ((b.hy - b.y) * k - b.vy * c) * dt;
          const da = Math.atan2(Math.sin(-b.a), Math.cos(-b.a));
          b.w += (da * k - b.w * c) * dt;
          b.vz += (-b.z * k - b.vz * c) * dt;
          b.wrx += (Math.atan2(Math.sin(-b.rx), Math.cos(-b.rx)) * k - b.wrx * c) * dt;
          b.wry += (Math.atan2(Math.sin(-b.ry), Math.cos(-b.ry)) * k - b.wry * c) * dt;
        } else if (phase === 'gravity') {
          b.vx += gx * dt;
          b.vy += gy * dt;
          const k = 18;
          const c = 2 * Math.sqrt(k) * 0.5;
          b.wrx += (Math.atan2(Math.sin(-b.rx), Math.cos(-b.rx)) * k - b.wrx * c) * dt;
          b.wry += (Math.atan2(Math.sin(-b.ry), Math.cos(-b.ry)) * k - b.wry * c) * dt;
          b.vz += (-b.z * 6 - b.vz * 3) * dt;
        } else {
          b.vx *= 0.999;
          b.vy *= 0.999;
        }
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.a += b.w * dt;
        b.z += b.vz * dt;
        b.rx += b.wrx * dt;
        b.ry += b.wry * dt;
        if (Math.abs(b.z) > DZ) { b.z = Math.sign(b.z) * DZ; b.vz *= -0.6; }
      }
      if (home) return;
      for (let i = 0; i < bodies.length; i++) {
        const A = bodies[i];
        for (let j = i + 1; j < bodies.length; j++) {
          const B = bodies[j];
          const r = A.r + B.r;
          if ((A.x - B.x) ** 2 + (A.y - B.y) ** 2 > (r + A.s * 2 + B.s * 2) ** 2) continue;
          for (const ca of A.circles) {
            const [ax, ay] = worldPt(A, ca);
            for (const cb of B.circles) {
              const [bx, by] = worldPt(B, cb);
              const dx = bx - ax;
              const dy = by - ay;
              const d = Math.hypot(dx, dy);
              if (d >= r || d < 1e-6) continue;
              const nx = dx / d;
              const ny = dy / d;
              contact(A, B, ax + nx * A.r, ay + ny * A.r, nx, ny, r - d);
            }
          }
        }
      }
      for (const b of bodies) {
        for (const lc of b.circles) {
          const [cx, cy] = worldPt(b, lc);
          if (cx - b.r < 0) contact(null, b, cx - b.r, cy, 1, 0, b.r - cx);
          if (cx + b.r > W) contact(null, b, cx + b.r, cy, -1, 0, cx + b.r - W);
          if (cy - b.r < ceil) contact(null, b, cx, cy - b.r, 0, 1, ceil - (cy - b.r));
          if (cy + b.r > floor) contact(null, b, cx, cy + b.r, 0, -1, cy + b.r - floor);
        }
      }
    }

    function blast(mx, my, power) {
      for (const b of bodies) {
        const dx = b.x - mx;
        const dy = b.y - my;
        const d = Math.hypot(dx, dy) || 1;
        const f = Math.max(0, 1 - d / (700 * U)) * power * U;
        b.vx += (dx / d) * f;
        b.vy += (dy / d) * f - f * 0.3;
        b.w += (rnd() - 0.5) * 6 * (f / (power * U));
        b.wrx += (rnd() - 0.5) * 6 * P.spin3d * (f / (power * U));
        b.wry += (rnd() - 0.5) * 6 * P.spin3d * (f / (power * U));
      }
    }

    const shadowImg = canvasImage(p, 128, 128, (g) => {
      const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grd.addColorStop(0, 'rgba(0,0,0,0.55)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 128);
    });

    let overlay = null;
    const buildOverlay = () => {
      overlay = makeOverlay(p, (ctx) => {
        drawInfo(ctx, { layout: P.info, color: P.palette[1] });
        if (P.info !== 'none') {
          ctx.fillStyle = P.palette[1];
          ctx.font = `400 ${13 * U}px ${FONT.mono}`;
          ctx.globalAlpha = 0.6;
          ctx.textAlign = 'center';
          ctx.fillText('click to blast', W / 2, P.info === 'bottom' ? 36 * U : H - 24 * U);
        }
      });
    };
    buildOverlay();

    const recolor = () => bodies.forEach((b, i) => { b.color = P.palette[2 + (i % (P.palette.length - 2))]; });

    return {
      onParam(key) {
        if (key === 'mode') enter(P.mode === 'cycle' ? 'home' : P.mode);
        if (key === 'palette') { recolor(); buildOverlay(); }
        if (key === 'info') buildOverlay();
      },
      mousePressed() {
        blast(p.mouseX, p.mouseY, 2600);
        if (P.mode === 'cycle' && phase === 'home') enter('gravity');
      },
      dispose() { Object.values(geoms).forEach((g) => p.freeGeometry?.(g)); },
      draw() {
        const dt = api.clock.dt;
        if (P.mode === 'cycle') {
          phaseT += dt;
          if (phaseT > phaseLen()) enter(order[(order.indexOf(phase) + 1) % order.length]);
        } else if (phase !== P.mode) enter(P.mode);
        const sub = 4;
        for (let i = 0; i < sub; i++) step(dt / sub);

        const [bg, ink] = P.palette;
        p.background(bg);
        const fov = (P.fov * Math.PI) / 180;
        const cz = H / 2 / Math.tan(fov / 2);
        p.perspective(fov, W / H, cz / 20, cz * 20);
        p.camera(0, 0, cz, 0, 0, 0, 0, 1, 0);

        if (P.room) {
          p.resetShader();
          p.stroke(ink);
          p.strokeWeight(1);
          p.push();
          const x0 = -W / 2;
          const x1 = W / 2;
          const y0 = ceil - H / 2;
          const y1 = floor - H / 2;
          const zb = -DZ * 1.6;
          p.stroke(p.color(ink).levels.slice(0, 3).concat(40));
          for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) p.line(x, y, zb, x, y, DZ);
          p.line(x0, y0, zb, x1, y0, zb);
          p.line(x1, y0, zb, x1, y1, zb);
          p.line(x1, y1, zb, x0, y1, zb);
          p.line(x0, y1, zb, x0, y0, zb);
          for (let k = 1; k < 8; k++) {
            const x = x0 + ((x1 - x0) * k) / 8;
            p.line(x, y1, zb, x, y1, DZ);
          }
          p.pop();
          p.noStroke();
        }

        if (P.shadows) {
          const gl = p.drawingContext;
          gl.disable(gl.DEPTH_TEST);
          p.resetShader();
          for (const b of bodies) {
            const sz = b.s * 3.2 * (1 + (b.z + DZ) / (2 * DZ) * 0.35);
            const off = 22 * U * (1 + (b.z + DZ) / (2 * DZ));
            p.push();
            p.translate(b.x - W / 2 + off * 0.55, b.y - H / 2 + off, -DZ * 1.6);
            texturedQuad(p, shadowImg, sz, sz * 1.15, [0, 0, 0, 0.12]);
            p.pop();
          }
          gl.enable(gl.DEPTH_TEST);
        }

        p.shader(sh);
        sh.setUniform('uTime', api.clock.t);
        sh.setUniform('uInk', hexToVec(ink));
        sh.setUniform('uBg', hexToVec(bg));
        sh.setUniform('uFog', P.fog);
        sh.setUniform('uFogNear', cz - DZ);
        sh.setUniform('uFogFar', cz + DZ * 2.2);
        for (const b of bodies) {
          const mode = P.shader === 'mixed' ? b.mode : P.shader;
          sh.setUniform('uMode', SHADERS.indexOf(mode));
          sh.setUniform('uColor', hexToVec(b.color));
          p.push();
          p.translate(b.x - W / 2, b.y - H / 2, b.z);
          p.rotateZ(b.a);
          p.rotateX(b.rx);
          p.rotateY(b.ry);
          p.scale(b.s);
          p.model(geoms[b.ch]);
          p.pop();
        }
        blitOverlay(p, overlay);
      },
    };
  },
};
