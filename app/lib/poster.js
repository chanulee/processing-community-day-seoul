// A2 is 420 × 594 mm. At 72 dpi that is 1191 × 1684 px; export density multiplies it.
export const W = 1191;
export const H = 1684;
export const U = W / 1000;

export const EVENT = {
  name: 'Processing Community Day',
  short: 'PCD @ Seoul 2026',
  anniversary: '25 Years of Processing',
  date: '2026.10.31 Sat',
  time: '12:30–17:30',
  venue: 'Sogang University',
  dept: 'Art & Technology',
  theme: 'Creative Coding in the Age of Vibe Coding',
  url: 'pcd2026.creative-computing.org',
};

export const FONT = {
  display: '"Archivo Black"',
  mono: '"Space Mono"',
  sans: 'Inter',
  areal: 'Areal, Inter',
};

export const FONT_CHOICES = {
  'Archivo Black': (size) => `${size}px "Archivo Black"`,
  'Inter Black': (size) => `900 ${size}px Inter`,
  'Inter Thin': (size) => `200 ${size}px Inter`,
  'Space Mono': (size) => `700 ${size}px "Space Mono"`,
  'Areal Bold': (size) => `700 ${size}px Areal, Inter`,
  'Areal Medium': (size) => `500 ${size}px Areal, Inter`,
};

export async function loadFonts() {
  await Promise.all([
    '100px "Archivo Black"',
    '400 100px "Space Mono"',
    '700 100px "Space Mono"',
    '200 100px Inter',
    '400 100px Inter',
    '900 100px Inter',
    '400 100px Areal',
    '500 100px Areal',
    '700 100px Areal',
  ].map((f) => document.fonts.load(f)));
}

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const hexToVec = (hex) => hexToRgb(hex).map((c) => c / 255);

export function shuffle(arr, rnd = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Font size at which `text` spans exactly `width` of ink.
export function fitFontSize(ctx, text, fontFn, width) {
  ctx.font = fontFn(100);
  const m = ctx.measureText(text);
  const ink = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
  return (100 * width) / Math.max(1, ink);
}

// Rasterises text items and returns sample points on a grid inside the ink.
// items: [{ text, font, x, y, align, baseline }]. Coordinates are poster px.
export function sampleText(items, { step = 6, outline = false, scale = 0.5 } = {}) {
  const cw = Math.ceil(W * scale);
  const ch = Math.ceil(H * scale);
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.scale(scale, scale);
  ctx.fillStyle = '#000';
  for (const it of items) {
    ctx.font = it.font;
    ctx.textAlign = it.align || 'left';
    ctx.textBaseline = it.baseline || 'alphabetic';
    ctx.fillText(it.text, it.x, it.y);
  }
  const data = ctx.getImageData(0, 0, cw, ch).data;
  const on = (x, y) => x >= 0 && y >= 0 && x < cw && y < ch && data[(y * cw + x) * 4 + 3] > 127;
  const pts = [];
  const s = Math.max(1, Math.round(step * scale));
  for (let y = 0; y < ch; y += s) {
    for (let x = 0; x < cw; x += s) {
      if (!on(x, y)) continue;
      if (outline && on(x - s, y) && on(x + s, y) && on(x, y - s) && on(x, y + s)) continue;
      pts.push([x / scale, y / scale]);
    }
  }
  return pts;
}

const INFO_COLS = [
  [EVENT.short, EVENT.name, EVENT.anniversary],
  [EVENT.date, EVENT.time],
  [EVENT.venue, EVENT.dept, 'Seoul'],
  ['Creative Coding in the', 'Age of Vibe Coding', EVENT.url],
];
const INFO_X = [0, 0.27, 0.47];

export const infoHeight = (size = 15 * U) => size * 1.35 * 3;

// Information block shared by all posters so typography stays consistent.
export function drawInfo(ctx, { layout = 'bottom', color = '#fff', margin = 48 * U, size = 15 * U, font = FONT.mono } = {}) {
  if (layout === 'none') return 0;
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `400 ${size}px ${font}`;
  ctx.textBaseline = 'alphabetic';
  const lh = size * 1.35;
  const blockH = infoHeight(size);
  if (layout === 'bottom' || layout === 'top') {
    const y0 = layout === 'bottom' ? H - margin - blockH + size : margin + size;
    const span = W - margin * 2;
    INFO_COLS.forEach((lines, i) => {
      ctx.textAlign = i === 3 ? 'right' : 'left';
      const x = i === 3 ? W - margin : margin + span * INFO_X[i];
      lines.forEach((t, j) => ctx.fillText(t, x, y0 + j * lh));
    });
  } else if (layout === 'corners') {
    const spots = [
      [margin, margin + size, 'left', 0, 1],
      [W - margin, margin + size, 'right', 1, 1],
      [margin, H - margin, 'left', 2, -1],
      [W - margin, H - margin, 'right', 3, -1],
    ];
    for (const [x, y, align, i, dir] of spots) {
      ctx.textAlign = align;
      const lines = INFO_COLS[i];
      lines.forEach((t, j) => ctx.fillText(t, x, dir > 0 ? y + j * lh : y - (lines.length - 1 - j) * lh));
    }
  }
  ctx.restore();
  return blockH + margin;
}

let grainCanvas = null;
function grainTile() {
  if (grainCanvas) return grainCanvas;
  grainCanvas = document.createElement('canvas');
  grainCanvas.width = grainCanvas.height = 256;
  const g = grainCanvas.getContext('2d');
  const img = g.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return grainCanvas;
}

export function drawGrain(ctx, amount) {
  if (amount <= 0) return;
  ctx.save();
  ctx.globalAlpha = amount;
  ctx.globalCompositeOperation = 'overlay';
  const pat = ctx.createPattern(grainTile(), 'repeat');
  ctx.translate(Math.random() * 256, Math.random() * 256);
  ctx.fillStyle = pat;
  ctx.fillRect(-256, -256, W + 512, H + 512);
  ctx.restore();
}

// Draws into a plain 2D canvas and returns a static p5.Image (uploaded to GL once).
export function canvasImage(p, w, h, draw, density = 1) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * density);
  c.height = Math.ceil(h * density);
  const ctx = c.getContext('2d');
  ctx.scale(density, density);
  draw(ctx);
  const img = p.createImage(c.width, c.height);
  img.drawingContext.drawImage(c, 0, 0);
  img.modified = true;
  img.setModified?.(true);
  return img;
}

// WEBGL sketches draw 2D typography into a static image and blit it last.
export const makeOverlay = (p, draw) => canvasImage(p, W, H, draw, p.pixelDensity());

const TEX_VERT = `
precision highp float;
attribute vec3 aPosition;
attribute vec2 aTexCoord;
uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;
varying vec2 vUv;
void main() {
  vUv = aTexCoord;
  gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
}`;

const TEX_FRAG = `
precision highp float;
uniform sampler2D uTex;
uniform vec4 uTint;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(uTex, vec2(vUv.x, 1.0 - vUv.y));
  c *= uTint;
  if (c.a < 0.004) discard;
  gl_FragColor = vec4(c.rgb * c.a, c.a);
}`;

function texShader(p) {
  if (!p._pcdTexSh) p._pcdTexSh = p.createShader(TEX_VERT, TEX_FRAG);
  return p._pcdTexSh;
}

// p.image() in WEBGL dies after a custom shader (immediate-mode UV buffer is null).
export function texturedQuad(p, img, w, h, tint = [1, 1, 1, 1]) {
  const sh = texShader(p);
  p.shader(sh);
  sh.setUniform('uTex', img);
  sh.setUniform('uTint', tint);
  p.noStroke();
  p.plane(w, h);
}

export function blitOverlay(p, img) {
  if (!img) return;
  const gl = p.drawingContext;
  const z = H / 2 / Math.tan(Math.PI / 6);
  p.push();
  p.camera(0, 0, z, 0, 0, 0, 0, 1, 0);
  p.perspective(Math.PI / 3, W / H, z / 10, z * 10);
  gl.disable(gl.DEPTH_TEST);
  p.blendMode(p.BLEND);
  texturedQuad(p, img, W, H);
  gl.enable(gl.DEPTH_TEST);
  p.resetShader();
  p.pop();
}
