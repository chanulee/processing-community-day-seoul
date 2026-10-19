import { W, H, U, FONT, drawInfo, makeOverlay, blitOverlay, sampleText, fitFontSize, mulberry32, hexToVec } from '../app/lib/poster.js';

const VERT = `
precision highp float;
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec2 aTexCoord;
attribute vec4 aVertexColor;
uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;
uniform float uTime, uAssemble, uSize, uAniso, uSpread, uTurb, uSmear, uCloudAlpha, uFlow;
varying vec2 vC;
varying vec4 vCol;

float hash(float n) { return fract(sin(n) * 43758.5453123); }
vec3 flow(vec3 p, float t) {
  return vec3(
    sin(p.y * 0.006 + t * 0.7) + sin(p.z * 0.004 - t * 0.4),
    sin(p.z * 0.005 + t * 0.5) + sin(p.x * 0.004 + t * 0.6),
    sin(p.x * 0.006 - t * 0.3) + sin(p.y * 0.005 + t * 0.8));
}

void main() {
  float r1 = hash(dot(aNormal.xy, vec2(12.9898, 78.233)));
  float r2 = hash(r1 * 91.7 + 3.1);
  vec3 dir = normalize(vec3(aNormal.x, aNormal.y, r2 * 2.0 - 1.0) + 1e-4);
  vec3 cloud = dir * uSpread * (0.3 + 0.7 * pow(r1, 0.5));
  cloud.y *= 1.4;
  float delay = r2 * 0.4;
  float a = smoothstep(delay, delay + 0.6, uAssemble);
  vec3 p = mix(cloud, aPosition, a);
  vec3 f = flow(p, uTime);
  p += f * uTurb * mix(70.0, 2.0, a);

  vec4 mv = uModelViewMatrix * vec4(p, 1.0);
  vec2 c = aTexCoord * 2.0 - 1.0;
  float s = uSize * aNormal.z;
  float ang = mix(r1 * 6.2831, atan(f.y, f.x), uFlow);
  vec2 ax = vec2(cos(ang), sin(ang));
  vec2 ay = vec2(-ax.y, ax.x);
  float stretch = 1.0 + uAniso * (0.5 + r2) * mix(1.0, 0.4, a);
  s *= mix(1.25, 0.8, a);
  float band = floor(p.y / 38.0) + floor(uTime * 3.0) * 7.0;
  float smear = step(1.0 - uSmear * 0.35 * mix(1.0, 0.4, a), hash(band * 1.31)) * step(0.5, r1);
  if (smear > 0.5) {
    ax = vec2(1.0, 0.0);
    ay = vec2(0.0, 1.0);
    stretch = 6.0 + 30.0 * hash(band + r2);
  }
  mv.xy += c.x * ax * s * stretch + c.y * ay * s / sqrt(stretch);
  gl_Position = uProjectionMatrix * mv;
  vC = c;
  vCol = aVertexColor;
  vCol.a *= mix(uCloudAlpha, 1.0, a) * (smear > 0.5 ? 0.85 : 1.0);
}`;

const FRAG = `
precision highp float;
uniform float uHard;
varying vec2 vC;
varying vec4 vCol;
void main() {
  float r2 = dot(vC, vC);
  if (r2 > 1.0) discard;
  float g = mix(exp(-r2 * 4.0), 1.0 - smoothstep(0.55, 0.75, r2), uHard);
  float a = g * vCol.a;
  gl_FragColor = vec4(vCol.rgb * a, a);
}`;

export default {
  id: 'splat-field',
  title: 'Splat Field',
  description: 'Gaussian-splat style particles. Each splat is an anisotropic soft quad that drifts in a turbulent cloud, then settles into extruded PCD 2026 SEOUL letterforms. Glitch smear stretches bands of splats horizontally.',
  renderer: 'webgl',
  palettes: [
    ['#e4dccb', '#1d1a5c', '#f1a2b4', '#6aaee0', '#7cc242', '#e8b48a'],
    ['#07080d', '#ff4fa3', '#4fd1ff', '#ffe066', '#9d7bff', '#ffffff'],
    ['#5a9a6a', '#f4b45f', '#e04b3a', '#5a63e8', '#ead9c4', '#f4b45f'],
    ['#f2efe6', '#111111', '#0a22b0', '#ff4b2b', '#111111', '#0a22b0'],
    ['#0a22b0', '#ffffff', '#9fc2ff', '#ffffff', '#ffd23f', '#6aa0ff'],
  ],
  params: [
    { type: 'section', label: 'Splats' },
    { key: 'count', type: 'range', label: 'Splat count', min: 2000, max: 16000, step: 500, value: 12000, rebuild: true },
    { key: 'textShare', type: 'range', label: 'Share in letters', min: 0.3, max: 1, step: 0.01, value: 0.86, rebuild: true },
    { key: 'size', type: 'range', label: 'Splat size', min: 1, max: 30, step: 0.1, value: 7.5 },
    { key: 'aniso', type: 'range', label: 'Anisotropy', min: 0, max: 6, step: 0.05, value: 1.6 },
    { key: 'flowAlign', type: 'range', label: 'Align to flow', min: 0, max: 1, step: 0.01, value: 0.6 },
    { key: 'hard', type: 'range', label: 'Edge hardness', min: 0, max: 1, step: 0.01, value: 0.15 },
    { key: 'depth', type: 'range', label: 'Letter depth', min: 0, max: 600, step: 5, value: 160, rebuild: true },
    { key: 'blend', type: 'select', label: 'Blend', options: ['over', 'additive'], value: 'over' },
    { type: 'section', label: 'Assemble', note: 'GSAP loop: cloud → letters → hold → disperse.' },
    { key: 'auto', type: 'toggle', label: 'Assemble loop', value: true },
    { key: 'assemble', type: 'range', label: 'Assemble (manual)', min: 0, max: 1, step: 0.01, value: 1 },
    { key: 'inTime', type: 'range', label: 'Gather time', min: 0.5, max: 8, step: 0.1, value: 3.6, unit: 's' },
    { key: 'holdTime', type: 'range', label: 'Hold', min: 0, max: 10, step: 0.1, value: 4.5, unit: 's' },
    { key: 'outTime', type: 'range', label: 'Disperse time', min: 0.5, max: 8, step: 0.1, value: 2.6, unit: 's' },
    { key: 'spread', type: 'range', label: 'Cloud radius', min: 200, max: 1600, step: 10, value: 900 },
    { key: 'turb', type: 'range', label: 'Turbulence', min: 0, max: 3, step: 0.01, value: 1 },
    { key: 'cloudAlpha', type: 'range', label: 'Cloud opacity', min: 0, max: 1, step: 0.01, value: 0.45 },
    { key: 'smear', type: 'range', label: 'Glitch smear', min: 0, max: 1, step: 0.01, value: 0.2 },
    { type: 'section', label: 'Camera & colour' },
    { key: 'orbit', type: 'range', label: 'Orbit sway', min: 0, max: 1.2, step: 0.01, value: 0.35 },
    { key: 'colorScale', type: 'range', label: 'Colour field scale', min: 0.2, max: 6, step: 0.05, value: 1.6, rebuild: true },
    { key: 'palette', type: 'palette', label: 'Palette · bg / ink / splats…', value: ['#e4dccb', '#1d1a5c', '#f1a2b4', '#6aaee0', '#7cc242', '#e8b48a'] },
    { key: 'info', type: 'select', label: 'Info block', options: ['bottom', 'top', 'corners', 'none'], value: 'bottom' },
  ],

  create(p, P, api) {
    const sh = p.createShader(VERT, FRAG);
    let geom = null;
    let overlay = null;
    let yaw = 0;
    let drag = null;

    function targets() {
      const m = 70 * U;
      const lines = ['PCD', '2026', 'SEOUL'];
      const c = document.createElement('canvas').getContext('2d');
      const fontFn = (s) => `${s}px ${FONT.display}`;
      const sizes = lines.map((l) => fitFontSize(c, l, fontFn, W - m * 2));
      const caps = sizes.map((s) => { c.font = fontFn(s); return c.measureText('H').actualBoundingBoxAscent; });
      const gap = 48 * U;
      const total = caps.reduce((a, b) => a + b, 0) + gap * 2;
      const scale = Math.min(1, (H - 2 * m - 160 * U) / total);
      let y = (H - 120 * U - total * scale) / 2;
      const items = lines.map((l, i) => {
        y += caps[i] * scale;
        c.font = fontFn(sizes[i] * scale);
        const mt = c.measureText(l);
        const x = (W - (mt.actualBoundingBoxLeft + mt.actualBoundingBoxRight)) / 2 + mt.actualBoundingBoxLeft;
        const it = { text: l, font: fontFn(sizes[i] * scale), x, y };
        y += gap * scale;
        return it;
      });
      let pts = sampleText(items, { step: 6 });
      if (pts.length < P.count) pts = sampleText(items, { step: 4 });
      return pts;
    }

    function build() {
      if (geom && p.freeGeometry) p.freeGeometry(geom);
      const rnd = mulberry32(2026);
      const pts = targets();
      const pal = P.palette.slice(2).map(hexToVec);
      const nText = Math.floor(P.count * P.textShare);
      const splats = [];
      for (let i = 0; i < P.count; i++) {
        let x;
        let y;
        let z;
        const inText = i < nText;
        if (inText) {
          const q = pts[Math.floor(rnd() * pts.length)];
          x = q[0] + (rnd() - 0.5) * 3;
          y = q[1] + (rnd() - 0.5) * 3;
          z = (rnd() - 0.5) * P.depth;
        } else {
          x = rnd() * W;
          y = rnd() * H * 0.9;
          z = (rnd() - 0.5) * 900;
        }
        const n = p.noise(x * 0.0012 * P.colorScale, y * 0.0012 * P.colorScale, 3.7);
        const ci = Math.min(pal.length - 1, Math.floor(Math.max(0, (n - 0.28) / 0.44) * pal.length));
        const big = rnd() < (inText ? 0.025 : 0.06);
        const size = big ? 2 + rnd() * 2.5 : 0.5 + rnd() * rnd() * 1.6;
        const alpha = big ? 0.12 + rnd() * 0.15 : 0.45 + rnd() * 0.5;
        splats.push({ x: x - W / 2, y: y - H / 2, z, sx: rnd() * 2 - 1, sy: rnd() * 2 - 1, size: inText ? size : size * 0.7, col: [...pal[ci], alpha] });
      }
      splats.sort((a, b) => a.z - b.z);
      geom = new p5.Geometry();
      const corners = [[0, 0], [1, 0], [1, 1], [0, 1]];
      splats.forEach((s, i) => {
        for (const [u, v] of corners) {
          geom.vertices.push(p.createVector(s.x, s.y, s.z));
          geom.vertexNormals.push(p.createVector(s.sx, s.sy, s.size));
          geom.uvs.push(u, v);
          geom.vertexColors.push(...s.col);
        }
        const a = i * 4;
        geom.faces.push([a, a + 1, a + 2], [a, a + 2, a + 3]);
      });
      geom.gid = `splats-${Math.random()}`;
    }

    function buildOverlay() {
      overlay = makeOverlay(p, (ctx) => {
        ctx.fillStyle = P.palette[1];
        ctx.font = `400 ${15 * U}px ${FONT.mono}`;
        ctx.fillText('Processing Community Day @ Seoul', 48 * U, 48 * U + 15 * U);
        ctx.textAlign = 'right';
        ctx.fillText('25 Years of Processing', W - 48 * U, 48 * U + 15 * U);
        ctx.textAlign = 'left';
        drawInfo(ctx, { layout: P.info, color: P.palette[1] });
      });
    }

    const st = { a: P.auto ? 0 : P.assemble };
    function schedule() {
      api.killTweens();
      if (!P.auto) { st.a = P.assemble; return; }
      st.a = 0;
      const tl = api.timeline({ repeat: -1 });
      tl.to(st, { a: 1, duration: P.inTime, ease: 'power3.out' })
        .to(st, { a: 1, duration: P.holdTime })
        .to(st, { a: 0, duration: P.outTime, ease: 'power2.in' })
        .to(st, { a: 0, duration: 0.8 });
    }

    build();
    buildOverlay();
    schedule();

    return {
      onParam(key) {
        if (key === 'palette') { build(); buildOverlay(); }
        if (key === 'info') buildOverlay();
        if (['auto', 'assemble', 'inTime', 'holdTime', 'outTime'].includes(key)) schedule();
      },
      mousePressed() { drag = { x: p.mouseX, yaw }; },
      mouseDragged() { if (drag) yaw = drag.yaw + (p.mouseX - drag.x) * 0.004; },
      mouseReleased() { drag = null; },
      dispose() { if (geom && p.freeGeometry) p.freeGeometry(geom); },
      draw() {
        const t = api.clock.t;
        const gl = p.drawingContext;
        p.background(P.palette[0]);
        const fov = Math.PI / 5;
        const z = H / 2 / Math.tan(fov / 2);
        p.perspective(fov, W / H, z / 20, z * 20);
        p.camera(0, 0, z, 0, 0, 0, 0, 1, 0);
        p.push();
        p.rotateY(yaw + Math.sin(t * 0.23) * P.orbit);
        p.rotateX(Math.sin(t * 0.17) * P.orbit * 0.35);
        p.noStroke();
        p.shader(sh);
        sh.setUniform('uTime', t);
        sh.setUniform('uAssemble', st.a);
        sh.setUniform('uSize', P.size * U);
        sh.setUniform('uAniso', P.aniso);
        sh.setUniform('uFlow', P.flowAlign);
        sh.setUniform('uSpread', P.spread * U);
        sh.setUniform('uTurb', P.turb);
        sh.setUniform('uSmear', P.smear);
        sh.setUniform('uCloudAlpha', P.cloudAlpha);
        sh.setUniform('uHard', P.hard);
        p.blendMode(P.blend === 'additive' ? p.ADD : p.BLEND);
        gl.disable(gl.DEPTH_TEST);
        p.model(geom);
        gl.enable(gl.DEPTH_TEST);
        p.blendMode(p.BLEND);
        p.pop();
        blitOverlay(p, overlay);
      },
    };
  },
};
