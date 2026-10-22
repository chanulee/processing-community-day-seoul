import { W, H, FORMAT, clamp } from '../app/lib/poster.js';
import { loadFont } from '../app/lib/outlines.js';

// Every shape is a band of constant thickness along a circular arc:
// { x, y } start, h start heading (deg, y down), L length, s sweep (deg turned over L), w thickness.
// s = 0 is a straight rectangle, so tweening s bends the rectangle into an arc and back.
const band = (x, y, h, L, s, w) => ({ x, y, h, L, s, w });

// Glyphs on a 1074 × 1510 sketch, scaled to the poster. These are the tuned values exported from the lab.
// a = the grey rectangle, b / c = the black strokes (a stroke of length 0 is switched off).
const GLYPHS = {
  0: { a: band(410, 1058, -60, 700, 0, 168), b: band(585, 435, 0, 2010.6, 360, 30) },
  2: { a: band(514, 718, 90, 500, 0, 168), b: band(525.3, 367, -10, 795, 200, 30), c: band(470, 1140, 0, 400, 0, 30) },
  6: { a: band(659, 281, 120, 600, 0, 168), b: band(638, 615, 0, 2010.6, 360, 30) },
  P: { a: band(459, 485, 90, 862, 0, 168), b: band(459, 260, 0, 1165, 180, 30) },
  C: { a: band(425, 1032.1, 210, 670.2, 120, 168), b: band(811.3, 528.7, -135, 1508, -270, 30) },
  D: { a: band(420, 255, 90, 1000, 0, 168), b: band(420, 255, 0, 1570.8, 180, 30) },
  S: { a: band(585, 755, 0, 837.8, 240, 120), b: band(772.9, 486.6, -110, 872.7, -250, 30) },
  E: { a: band(211, 755, 0, 521, 0, 120), b: band(768.5, 492.9, -145, 1396.3, -250, 30) },
  O: { a: band(529.4, 1070.1, 190, 893.6, 160, 168), b: band(585, 435, 0, 2010.6, 360, 30) },
  U: { a: band(265, 300, 90, 400, 0, 168), b: band(905, 700, 90, 1005.3, 180, 30) },
  L: { a: band(420, 255, 90, 1000, 0, 168), b: band(420, 1240, 0, 400, 0, 30) },
  R: { a: band(456, 585, 90, 600, 0, 168), b: band(449, 380, 0, 717, 180, 30), c: band(458, 815, 60, 604, 0, 30) },
  I: { a: band(585, 700, 90, 400, 0, 168), b: band(585, 400, 90, 400, 0, 30) },
  N: { a: band(555, 509, 75, 500, 0, 120), b: band(800, 1142, -90, 978, 0, 30) },
  G: { a: band(463, 1075, 210, 722, 120, 168), b: band(938, 514, -135, 1788, -270, 30), c: band(620, 793, 0, 347, 0, 30) },
  A: { a: band(330, 1255, -75, 1000, 0, 168), b: band(589, 289, 75, 1000, 0, 30), c: band(440, 900, 0, 300, 0, 30) },
  a: { a: band(774, 677, 90, 547, 0, 168), b: band(520, 698, 0, 1563, 360, 30) },
  y: { a: band(824, 699, 120, 810, 0, 168), b: band(299, 675, 60, 500, 0, 30), c: band(840, 675, 120, 0, 0, 30) },
  Y: { a: band(585, 755, 90, 500, 0, 168), b: band(585, 755, -120, 600, 0, 30), c: band(585, 755, -60, 600, 0, 30) },
};
// Words mode: glyph centre in the sketch, and the advance between letters.
const GX = 585;
const GY = 755;
const ADV = 550; // widest centre-to-centre distance between two letters
const PAIR_GAP = -40; // between the ink of two neighbours; narrow letters (I, S, E ...) sit closer than ADV
const LINE = 1250; // line height in sketch units for multi-line scenes
const REF_W = 1074;

function bandPolygon(b, n = 72) {
  const th = (b.h * Math.PI) / 180;
  const phi = (b.s * Math.PI) / 180;
  const left = [];
  const right = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * b.L;
    const h = th + (phi * t) / Math.max(1e-6, b.L);
    let x;
    let y;
    if (Math.abs(phi) < 1e-4) {
      x = b.x + Math.cos(th) * t;
      y = b.y + Math.sin(th) * t;
    } else {
      const R = b.L / phi;
      x = b.x + R * (Math.sin(h) - Math.sin(th));
      y = b.y - R * (Math.cos(h) - Math.cos(th));
    }
    const nx = -Math.sin(h) * (b.w / 2);
    const ny = Math.cos(h) * (b.w / 2);
    left.push([x + nx, y + ny]);
    right.push([x - nx, y - ny]);
  }
  return left.concat(right.reverse());
}

// Horizontal ink of each glyph, so spacing follows the letterforms instead of a fixed grid.
const INK = Object.fromEntries(Object.entries(GLYPHS).map(([ch, g]) => {
  const xs = Object.values(g).filter((b) => b.L > 0.5).flatMap((b) => bandPolygon(b).map(([x]) => x));
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  return [ch, { c: (lo + hi) / 2, w: hi - lo }];
}));
const advance = (a, b) => Math.min(ADV, (INK[a].w + INK[b].w) / 2 + PAIR_GAP);

// ---- Title and footer ----------------------------------------------------------------------
// ABC Areal Regular, -3% tracking, black on white label strips, laid out on a 514 × 917 (9:16) layout
// and scaled to the canvas. Footer positions count up from the bottom edge, so 3:4 and A2 reuse them;
// landscape (4:3) scales by its height and pushes the right-hand boxes out to the right edge.
const LANDSCAPE = W > H;
const S = Math.min(W, H) / 514;
// Landscape is wider than the 514-unit layout: boxes on the right half move out by the extra width.
const DX = W / S - 514;
const AREAL = 'Areal, Inter, sans-serif';
const TITLE = ['Processing Community Day Seoul:', 'Creative Coding', 'in the Age of Vibe Coding'];
const fy = (y917) => H - (917 - y917) * S; // footer y, measured on the 9:16 layout
const TITLE_LH = 1.047; // line heights as a multiple of the font size
const FOOT_LH = 1.18;
const FOOT_LEFT = ['12:30–17:30', '10.31.2026 (Sat)'];
const VENUE = ['Xavier Hall, Dept. of Art & Technology', 'Sogang University'];
const HOST = ['Hosted by', 'Creative Computing Group'];
const LOGO_RATIO = 357 / 2000;

// Box positions (top-left, on the 514 × 917 layout) and the two font sizes are sliders.
const BOXES = {
  title: ['Title', 17, 16],
  time: ['Time', 17, 822],
  venue: ['Venue', 17, 867],
  host: ['Host', 273, 822],
  logos: ['Sponsor logos', 273, 867],
  qr: ['QR code', 446, 802],
};
const boxParams = () => [
  { type: 'section', label: 'Title + footer boxes' },
  { key: 'titleSize', type: 'range', label: 'Title font size', min: 10, max: 60, step: 0.5, value: 32 },
  { key: 'textSize', type: 'range', label: 'Text font size (footer)', min: 6, max: 40, step: 0.5, value: 14 },
  { key: 'qrSize', type: 'range', label: 'QR code size', min: 10, max: 200, step: 1, value: 53 },
  { key: 'logosW', type: 'range', label: 'Sponsor logos · width', note: 'Grows from the top-left corner', min: 40, max: 514, step: 1, value: 225 },
  { key: 'footerX', type: 'range', label: 'Footer group · x offset', note: 'Moves every bottom box together', min: -200, max: 200, step: 1, value: 0 },
  { key: 'footerY', type: 'range', label: 'Footer group · y offset', min: -400, max: 200, step: 1, value: -15 },
  ...Object.entries(BOXES).flatMap(([id, [name, x, y]]) => [
    { key: `${id}X`, type: 'range', label: `${name} · x`, min: 0, max: 514, step: 1, value: x },
    { key: `${id}Y`, type: 'range', label: `${name} · y`, min: 0, max: 917, step: 1, value: y },
  ]),
];

// The central graphic is fitted to a fixed band between the title and the footer, so moving a box never moves it.
const TITLE_BOTTOM = 130.5 * S;
const FOOT_TOP = fy(808);

// Text is drawn from the font's outlines (opentype.js) rather than with canvas fillText: the browser's text
// renderer smooths and embolden glyphs, which made ABC Areal Regular look heavier than it does in Figma.
let arealFont = null;
loadFont('Areal Regular').then((f) => { arealFont = f; });
const TRACKING = -0.03; // em
const pathCache = new Map();
function textPath(text, size) {
  const key = `${text}|${size}`;
  if (!pathCache.has(key)) {
    if (pathCache.size > 300) pathCache.clear();
    pathCache.set(key, arealFont.getPath(text, 0, 0, size, { kerning: true, letterSpacing: TRACKING }));
  }
  return pathCache.get(key);
}

// One line of text on a white strip that hugs it.
function label(c, text, x, baseline, size, lh) {
  let w;
  if (arealFont) w = arealFont.getAdvanceWidth(text, size, { kerning: true, letterSpacing: TRACKING });
  else {
    c.font = `400 ${size}px ${AREAL}`;
    c.letterSpacing = `${TRACKING * size}px`;
    w = c.measureText(text).width;
  }
  c.fillStyle = '#fff';
  c.fillRect(x, baseline - lh * 0.8, w + 1, lh);
  c.fillStyle = '#000';
  if (arealFont) {
    c.save();
    c.translate(x, baseline);
    textPath(text, size).draw(c);
    c.restore();
  } else {
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    c.fillText(text, x, baseline);
  }
}

// Lines stacked from a box's top-left corner. fromBottom boxes count y from the bottom edge.
function textBox(c, lines, x, y, size, lh, fromBottom) {
  lines.forEach((t, i) => label(c, t, x * S, (fromBottom ? fy(y) : y * S) + lh * S * (0.8 + i), size * S, lh * S));
}

function drawTitle(c, P) {
  c.save();
  textBox(c, TITLE, P.titleX, P.titleY, P.titleSize, P.titleSize * TITLE_LH, false);
  c.restore();
}

function drawFooter(c, logos, qr, P) {
  c.save();
  const lh = P.textSize * FOOT_LH;
  const ox = P.footerX;
  const oy = P.footerY;
  textBox(c, FOOT_LEFT, P.timeX + ox, P.timeY + oy, P.textSize, lh, true);
  textBox(c, VENUE, P.venueX + ox, P.venueY + oy, P.textSize, lh, true);
  textBox(c, HOST, P.hostX + ox + DX, P.hostY + oy, P.textSize, lh, true);
  const pad = 3;
  const imgW = (P.logosW - pad * 2) * S;
  const imgH = imgW * LOGO_RATIO;
  c.fillStyle = '#fff';
  c.fillRect((P.logosX + ox + DX) * S, fy(P.logosY + oy), P.logosW * S, imgH + pad * 2 * S);
  if (logos.complete && logos.naturalWidth) c.drawImage(logos, (P.logosX + ox + DX + pad) * S, fy(P.logosY + oy) + pad * S, imgW, imgH);
  if (qr.complete && qr.naturalWidth) c.drawImage(qr, (P.qrX + ox + DX) * S, fy(P.qrY + oy), P.qrSize * S, P.qrSize * S);
  c.restore();
}

const KEYS = ['x', 'y', 'h', 'L', 's', 'w'];

// The piece of band b between fractions f0 and f1 of its length, as a band of its own.
// Two pieces (0–½ and ½–1) lie end to end and make up the whole shape.
function subBand(b, f0, f1) {
  const th = (b.h * Math.PI) / 180;
  const phi = (b.s * Math.PI) / 180;
  const t = f0 * b.L;
  let x;
  let y;
  if (Math.abs(phi) < 1e-4) {
    x = b.x + Math.cos(th) * t;
    y = b.y + Math.sin(th) * t;
  } else {
    const R = b.L / phi;
    const hh = th + phi * f0;
    x = b.x + R * (Math.sin(hh) - Math.sin(th));
    y = b.y - R * (Math.cos(hh) - Math.cos(th));
  }
  return { x, y, h: b.h + b.s * f0, L: b.L * (f1 - f0), s: b.s * (f1 - f0), w: b.w };
}

// Every letter's two shapes are editable sliders: key `${letter}_${a|b}${field}`, e.g. P_ax.
const FIELDS = {
  x: ['Start x', -400, 1500, 1],
  y: ['Start y', -400, 1900, 1],
  h: ['Heading', -360, 360, 0.5, '°'],
  L: ['Length', 0, 2000, 1],
  s: ['Bend (sweep)', -400, 400, 0.5, '°'],
  w: ['Thickness', 0, 500, 1],
};
const round = (v) => Math.round(v * 10) / 10;
// Optional third shape c: a second stroke. Letters without one keep it at zero length on top of b,
// so it splits out of b when the next letter needs it.
const SHAPES = ['a', 'b', 'c', 'd'];
const letterParams = () => Object.keys(GLYPHS).flatMap((ch) => SHAPES.filter((sh) => GLYPHS[ch][sh]).flatMap((sh) => [
  { type: 'section', label: `${ch} · ${{ a: 'rectangle', b: 'stroke', c: 'second stroke', d: 'third stroke' }[sh]}` },
  ...KEYS.map((k) => {
    const [label, min, max, step, unit] = FIELDS[k];
    return { key: `${ch}_${sh}${k}`, type: 'range', label, min, max, step, unit, value: round(GLYPHS[ch][sh][k]) };
  }),
]));

// Default Zoom and Zoom centre x for each canvas format.
const ZOOM = { '9:16': [1.15, -0.11], '3:4': [1.35, -0.03], '4:3': [1, -0.03], A2: [1.4, -0.03] }[FORMAT] || [1.15, -0.11];

// A2 only: some scenes sit at a different Zoom. These are the Zoom each should have when the Zoom slider is at
// its A2 default; the slider scales all of them together, and the zoom eases between scenes while they morph.
const SCENE_ZOOM = FORMAT === 'A2' ? { 'PROCESSING/DAY/2026/SEOUL': 1.23 } : {};
const SCENE_ZOOM_BASE = 1.4;

export default {
  id: 'two-shapes',
  schema: 4, // bump when GLYPHS or the default scenes change, so saved values don't mask them
  schemaReset: ['words', 'track'],
  persist: false, // always opens on these defaults, however often it is refreshed or reopened
  title: 'Two Shapes',
  description: 'Grey rectangles and black strokes, all one bent-band primitive, spell PCD, 2026, SEOUL and multi-line scenes such as PROCESSING/DAY/2026/SEOUL. A timeline under the poster jumps between scenes ([ and ] step). Between words, rectangles pair with the nearest rectangles and strokes with the nearest strokes; only when a word has more of one kind does a shape split in two, or two pieces join into one. Pick a letter under Edit letters to freeze it and tune its shapes.',
  renderer: 'p2d',
  palettes: [
    ['#f4f4f4', '#d9d9d9', '#000000'],
    ['#1a3cff', '#f4f1ea', '#0b0b12'],
    ['#0b0b12', '#5a4dff', '#c8ff2e'],
    ['#ff5a1f', '#f4f1ea', '#111111'],
    ['#e6e1d3', '#e03a2f', '#0d2bb8'],
  ],
  params: [
    { key: 'hideInfo', type: 'toggle', label: 'Hide text + sponsors', note: 'Title, time, venue, host, sponsor logos and QR · H', value: false },
    { type: 'section', label: 'Sequence' },
    { key: 'unit', type: 'select', label: 'Mode', note: 'letters = one glyph at a time · words = whole words morph into each other', options: ['letters', 'words'], value: 'words' },
    { key: 'seq', type: 'text', label: 'Letters', note: 'Available: P R O C E S I N G D A Y U L 2 0 6, plus lowercase a y', value: 'PCDS' },
    { key: 'words', type: 'text', label: 'Scenes', note: 'Scenes separated with , — lines inside one scene with /', value: 'PCD/2026/SEOUL, PROCESSING/Day/2026/SEOUL, PCD, 2026, SEOUL' },
    { key: 'stagger', type: 'range', label: 'Letter stagger', note: 'Words mode: delay between neighbouring letters', min: 0, max: 0.5, step: 0.01, value: 0.18, unit: 's' },
    { key: 'dur', type: 'range', label: 'Morph', min: 0.2, max: 4, step: 0.05, value: 1.75, unit: 's' },
    { key: 'hold', type: 'range', label: 'Hold', min: 0, max: 4, step: 0.05, value: 1, unit: 's' },
    { key: 'lag', type: 'range', label: 'Stroke lag', note: 'The black stroke starts after the rectangle', min: 0, max: 1, step: 0.01, value: 0.11, unit: 's' },
    { key: 'ease', type: 'select', label: 'Ease', options: ['power3.inOut', 'expo.inOut', 'back.inOut(1.6)', 'elastic.out(1,0.6)', 'none'], value: 'power3.inOut' },

    { type: 'section', label: 'Form' },
    { key: 'scale', type: 'range', label: 'Zoom', min: 0.3, max: 6, step: 0.01, value: ZOOM[0] },
    { key: 'panX', type: 'range', label: 'Zoom centre x', min: -10, max: 1, step: 0.01, value: ZOOM[1] },
    { key: 'panY', type: 'range', label: 'Zoom centre y', min: -10, max: 1, step: 0.01, value: 0.04 },
    { key: 'weightA', type: 'range', label: 'Rectangle weight', min: 0.2, max: 2, step: 0.01, value: 1.08},
    { key: 'weightB', type: 'range', label: 'Stroke weight', min: 0.2, max: 4, step: 0.01, value: 1.48},
    { key: 'trailMode', type: 'select', label: 'Trail', note: 'echo = last N frames · keep = paint stays on the poster (change mode or Clear to wipe)', options: ['off', 'echo', 'keep'], value: 'echo' },
    { key: 'trails', type: 'range', label: 'Echo frames', min: 0, max: 60, step: 1, value: 13 },
    { key: 'keepAlpha', type: 'range', label: 'Trail opacity', note: 'How strong the traces are at most. They never build up past this, however many loops', min: 0, max: 1, step: 0.01, value: 0.7 },
    { key: 'fade', type: 'range', label: 'Keep fade', note: 'How fast traces fade (per 60 fps frame). 0 = never', min: 0, max: 0.2, step: 0.001, value: 0.028 },
    { key: 'clear', type: 'toggle', label: 'Clear trail', note: 'Flip to wipe the kept trail', value: false },
    { key: 'blend', type: 'select', label: 'Overlap', options: ['normal', 'multiply', 'difference'], value: 'difference' },


    { type: 'section', label: 'Zoom out', note: 'Starts zoomed in and eases out to the Zoom above' },
    { key: 'zoomAnim', type: 'select', label: 'Zoom-out animation', note: 'each scene = repeats at the start of every scene · whole loop = once per loop', options: ['off', 'each scene', 'whole loop'], value: 'off' },
    { key: 'zoomFrom', type: 'range', label: 'Start zoom', note: 'Times the Zoom at the start', min: 1, max: 4, step: 0.05, value: 1.6, unit: '×' },
    { key: 'zoomDur', type: 'range', label: 'Zoom-out duration', note: 'Each scene only: seconds from the scene start', min: 0.2, max: 10, step: 0.05, value: 2.5, unit: 's' },
    { key: 'zoomEase', type: 'select', label: 'Zoom-out ease', options: ['power2.out', 'power3.inOut', 'expo.out', 'none'], value: 'power2.out' },

    { type: 'section', label: 'Colour' },
    { key: 'palette', type: 'palette', label: 'Palette · bg / rectangle / stroke', value: ['#e6e1d3', '#e03a2f', '#0d2bb8'] },
    ...boxParams(),

    { type: 'group', label: 'Advanced typo', note: 'The drawn letters: spacing, picking one letter to edit, and every shape of every letter' },
    { key: 'leading', type: 'range', label: 'Line spacing', note: 'Multi-line scenes', min: 0.6, max: 1.6, step: 0.01, value: FORMAT === '4:3' ? 0.83 : 0.93 },
    { key: 'track', type: 'range', label: 'Letter spacing', min: 0.4, max: 1.6, step: 0.01, value: 1 },
    { type: 'section', label: 'Edit letters' },
    { key: 'edit', type: 'select', label: 'Show', note: 'Pick a letter to freeze on it while you tune its sliders below; play runs the sequence and interpolates between your shapes', options: ['play', ...Object.keys(GLYPHS)], value: 'play' },
    ...letterParams(),
  ],

  create(p, P, api) {
    const ctx = p.drawingContext;
    const logos = new Image();
    logos.src = 'assets/sponsors.webp';
    const qr = new Image();
    qr.src = 'assets/qr.png';
    const glyph = (ch) => {
      const g = { a: {}, b: {} };
      ['a', 'b'].forEach((sh) => KEYS.forEach((k) => { g[sh][k] = P[`${ch}_${sh}${k}`] ?? GLYPHS[ch][sh][k]; }));
      ['c', 'd'].forEach((sh) => { if (GLYPHS[ch][sh]) { g[sh] = {}; KEYS.forEach((k) => { g[sh][k] = P[`${ch}_${sh}${k}`] ?? GLYPHS[ch][sh][k]; }); } });
      return g;
    };
    // Kept trail. `layer` is an opaque picture of what has been left behind. Every frame the shapes are
    // rendered exactly as they look (frame) with their coverage (mask), and that picture REPLACES the pixels
    // under the shapes in the layer. So a pixel is never painted over itself: going round the loop again can
    // only refresh a trace, never make it darker. Between frames the layer is veiled back towards the
    // background, which is what makes the traces fade.
    const dpr = p.pixelDensity();
    const mkLayer = () => {
      const cv = document.createElement('canvas');
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      const cx = cv.getContext('2d');
      cx.scale(dpr, dpr);
      return [cv, cx];
    };
    const [layer, lctx] = mkLayer();
    const [frameCv, fctx] = mkLayer();
    const [maskCv, mctx] = mkLayer();
    const history = [];
    let fadeAcc = 0;
    // The veil is applied in steps of at least 8%: a smaller alpha rounds to nothing in 8-bit colour and leaves
    // a permanent faint smudge.
    const VEIL_STEP = 0.08;
    const clearLayer = () => {
      lctx.globalCompositeOperation = 'source-over';
      lctx.globalAlpha = 1;
      lctx.fillStyle = P.palette[0];
      lctx.fillRect(0, 0, W, H);
      fadeAcc = 0;
    };
    clearLayer();

    // ---- Plan -------------------------------------------------------------------------------
    // A scene is a flat list of shapes, { kind: 'rect' | 'stroke', band }, with each letter's
    // offset in the word baked into x. Going from one scene to the next, rectangles only map to
    // rectangles and strokes to strokes. Nearest shapes pair up one to one; only when one scene
    // has more of a kind than the other does a shape split into pieces (or pieces merge into one).

    // lines: array of arrays of glyph keys. Coordinates are centred on the poster and each scene
    // is scaled to fit, so a long multi-line scene is smaller and the morph zooms between them.
    function scene(lines) {
      // Ink-centre position of every letter along its line, and the line's total span.
      const rows = lines.map((chars) => {
        const pos = [];
        chars.forEach((ch, j) => pos.push(j ? pos[j - 1] + advance(chars[j - 1], ch) * P.track : 0));
        const left = pos[0] - INK[chars[0]].w / 2;
        const right = pos[pos.length - 1] + INK[chars[chars.length - 1]].w / 2;
        return { pos, mid: (left + right) / 2, span: right - left };
      });
      const lh = LINE * P.leading;
      // Scenes sit between the title and the footer when those are on.
      const px = REF_W / W; // sketch units per canvas px
      // Only 9:16 grows to the full height when the text is hidden; the other formats keep the graphic where it is,
      // so Zoom and Zoom centre stay as tuned. Landscape always has the whole canvas, the text sits on top of it.
      const fitFull = LANDSCAPE || (P.hideInfo && (FORMAT === '9:16' || !FORMAT));
      const bandTop = fitFull ? 0 : TITLE_BOTTOM;
      const bandBot = fitFull ? H : FOOT_TOP;
      const shiftY = ((bandTop + bandBot) / 2 - H / 2) * px;
      const f = Math.min(1, (REF_W * 0.9) / Math.max(...rows.map((r) => r.span)), ((bandBot - bandTop) * px * 0.9) / (lines.length * lh));
      const out = [];
      lines.forEach((chars, li) => {
        const dy = (li - (lines.length - 1) / 2) * lh + shiftY / f;
        chars.forEach((ch, j) => {
          const g = glyph(ch);
          const dx = rows[li].pos[j] - rows[li].mid - (INK[ch].c - GX);
          const at = (b) => ({ ...b, x: (b.x - GX + dx) * f, y: (b.y - GY + dy) * f, L: b.L * f, w: b.w * f });
          out.push({ kind: 'rect', band: at(g.a) });
          out.push({ kind: 'stroke', band: at(g.b) });
          if (g.c) out.push({ kind: 'stroke', band: at(g.c) });
          if (g.d) out.push({ kind: 'stroke', band: at(g.d) });
        });
      });
      return out;
    }

    const mid = (b) => subBand(b, 0.5, 1);
    const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);

    // Piece r of m along a band's length; inner seams overlap a little so the pieces read as one.
    function piece(b, r, m) {
      if (m === 1) return { ...b };
      const pc = subBand(b, r / m, (r + 1) / m);
      if (r < m - 1 && pc.L > 0) { const e = Math.min(4, pc.L * 0.05); pc.s *= (pc.L + e) / pc.L; pc.L += e; }
      return pc;
    }

    // Order the shapes that share band b along its length, by where their partner sits.
    function along(b, partners) {
      const th = ((b.h + b.s / 2) * Math.PI) / 180;
      const proj = (q) => (q.x - b.x) * Math.cos(th) + (q.y - b.y) * Math.sin(th);
      return partners.map((q, i) => [proj(q), i]).sort((u, v) => u[0] - v[0]).map(([, i]) => i);
    }

    function matchKind(A, B) {
      const n = A.length;
      const m = B.length;
      if (!n || !m) return [];
      const ma = A.map(mid);
      const mb = B.map(mid);
      // 1:1 greedily by distance, closest pairs first.
      const pairs = [];
      A.forEach((_, i) => B.forEach((__, j) => pairs.push([dist(ma[i], mb[j]), i, j])));
      pairs.sort((u, v) => u[0] - v[0]);
      const usedA = new Set();
      const usedB = new Set();
      const links = [];
      for (const [, i, j] of pairs) {
        if (usedA.has(i) || usedB.has(j)) continue;
        usedA.add(i);
        usedB.add(j);
        links.push([i, j]);
        if (links.length === Math.min(n, m)) break;
      }
      // Leftovers attach to their nearest shape on the other side: that one splits or merges.
      B.forEach((_, j) => { if (!usedB.has(j)) links.push([ma.reduce((bi, q, i) => (dist(q, mb[j]) < dist(ma[bi], mb[j]) ? i : bi), 0), j]); });
      A.forEach((_, i) => { if (!usedA.has(i)) links.push([i, mb.reduce((bj, q, j) => (dist(ma[i], q) < dist(ma[i], mb[bj]) ? j : bj), 0)]); });

      // Cut each shared shape into as many pieces as it has links, in order along its length.
      const fromPiece = new Map();
      const toPiece = new Map();
      A.forEach((a, i) => {
        const ls = links.filter((l) => l[0] === i);
        along(a, ls.map((l) => mb[l[1]])).forEach((li, r) => fromPiece.set(ls[li], piece(a, r, ls.length)));
      });
      B.forEach((b, j) => {
        const ls = links.filter((l) => l[1] === j);
        along(b, ls.map((l) => ma[l[0]])).forEach((li, r) => toPiece.set(ls[li], piece(b, r, ls.length)));
      });
      return links.map((l) => {
        const from = fromPiece.get(l);
        const to = { ...toPiece.get(l) };
        // Turn the short way round.
        to.h = from.h + ((((to.h - from.h) % 360) + 540) % 360) - 180;
        return { from, to, x: (mid(from).x + mid(to).x) / 2 };
      });
    }

    function plan(SA, SB) {
      const kinds = ['rect', 'stroke'];
      const out = [];
      kinds.forEach((kind) => {
        const A = SA.filter((q) => q.kind === kind).map((q) => q.band);
        const B = SB.filter((q) => q.kind === kind).map((q) => q.band);
        matchKind(A, B).forEach((pt) => out.push({ kind, ...pt }));
      });
      // Stagger left to right.
      const xs = out.map((q) => q.x);
      const lo = Math.min(...xs);
      const hi = Math.max(...xs);
      out.forEach((q) => { q.order = hi > lo ? (q.x - lo) / (hi - lo) : 0; });
      return out;
    }

    let scenes = [];
    let plans = [];
    let wordsMode = false;
    let labels = [];
    // Own playhead, so the timeline can seek. It advances with the lab clock (pause / speed).
    let time = 0;
    // Lowercase a and y have their own glyphs; every other letter is case-insensitive.
    const key = (c) => (GLYPHS[c] ? c : c.toUpperCase());
    function buildTimeline() {
      api.killTweens();
      wordsMode = P.unit === 'words' && P.edit === 'play';
      // list: scenes → lines → glyph keys.
      let list;
      if (P.edit !== 'play') list = [[[P.edit]]];
      else if (wordsMode) {
        list = P.words.split(',')
          .map((sc) => sc.split('/').map((l) => [...l].map(key).filter((c) => GLYPHS[c])).filter((l) => l.length))
          .filter((sc) => sc.length);
      } else list = [...P.seq].map(key).filter((c) => GLYPHS[c]).map((c) => [[c]]);
      labels = list.map((sc) => sc.map((l) => l.join('')).join('/'));
      scenes = list.map(scene);
      plans = scenes.map((sc, i) => plan(sc, scenes[(i + 1) % scenes.length]));
    }
    buildTimeline();

    const lerp = (a, b, t) => a + (b - a) * t;
    // Multiplier on Zoom for the scene on screen (1 where a scene has no override). Labels keep the lowercase a / y glyphs, so match upper-cased.
    const sceneMul = (i) => (SCENE_ZOOM[labels[i].toUpperCase()] ?? SCENE_ZOOM_BASE) / SCENE_ZOOM_BASE;
    // Zoom-out animation: a multiplier that starts at zoomFrom and eases down to 1.
    function animMul() {
      if (P.zoomAnim === 'off' || !scenes.length) return 1;
      const step = stepLen();
      const span = P.zoomAnim === 'whole loop' ? total() : Math.max(0.001, P.zoomDur);
      const t = P.zoomAnim === 'whole loop' ? time : time - Math.floor(time / step) * step;
      return lerp(P.zoomFrom, 1, api.gsap.parseEase(P.zoomEase)(clamp(t / span)));
    }
    function zoomMul() {
      if (!scenes.length || !Object.keys(SCENE_ZOOM).length) return 1;
      const step = stepLen();
      const n = Math.floor(time / step);
      const idx = n % scenes.length;
      const spread = P.stagger * 4;
      const e = clamp((time - n * step - P.hold) / Math.max(0.001, P.dur + P.lag + spread));
      return lerp(sceneMul(idx), sceneMul((idx + 1) % scenes.length), e);
    }
    // Current frame: a whole scene while holding, the planned pieces while morphing.
    function frameShapes() {
      if (!scenes.length) return [];
      const spread = P.stagger * 4;
      const step = P.hold + P.dur + P.lag + spread;
      const t = time;
      const n = Math.floor(t / step);
      const idx = n % scenes.length;
      const local = t - n * step;
      if (scenes.length < 2 || local < P.hold) return scenes[idx];
      const ease = api.gsap.parseEase(P.ease);
      return plans[idx].map((q) => {
        const delay = (q.kind === 'stroke' ? P.lag : 0) + q.order * spread;
        const e = ease(clamp((local - P.hold - delay) / P.dur));
        const band = {};
        KEYS.forEach((k) => { band[k] = lerp(q.from[k], q.to[k], e); });
        return { kind: q.kind, band };
      });
    }

    // ---- Timeline -------------------------------------------------------------------------------
    // A bar under the poster: one segment per scene, click to jump, drag to scrub, ◀ ▶ to step.
    const stepLen = () => P.hold + P.dur + P.lag + P.stagger * 4;
    const total = () => stepLen() * Math.max(1, scenes.length);
    const ui = document.createElement('div');
    ui.className = 'timeline';
    ui.innerHTML = '<button class="tl-play" title="Play / pause (Space)"></button><button data-go="-1" title="Previous scene ( [ )">◀</button><div class="tl-track"><div class="tl-segs"></div><div class="tl-head"></div></div><button data-go="1" title="Next scene ( ] )">▶</button><span class="tl-time"></span>';
    const stage = document.getElementById('stage');
    stage.appendChild(ui);
    const playBtn = ui.querySelector('.tl-play');
    const syncPlay = () => { playBtn.textContent = api.paused ? '▶' : '❚❚'; };
    playBtn.onclick = () => window.lab.togglePause();
    window.addEventListener('pcd-pause', syncPlay);
    syncPlay();
    // When paused nothing is drawn, so every seek has to ask for one frame itself.
    const refresh = () => { if (api.paused) p.redraw(); };
    const fmtTime = (t) => { const s = Math.floor(t); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
    const track = ui.querySelector('.tl-track');
    const segs = ui.querySelector('.tl-segs');
    const head = ui.querySelector('.tl-head');
    const timeEl = ui.querySelector('.tl-time');
    const current = () => Math.floor(time / stepLen()) % Math.max(1, scenes.length);
    const jump = (i) => { const n = scenes.length; time = (((i % n) + n) % n) * stepLen(); history.length = 0; refresh(); };
    function renderSegs() {
      segs.innerHTML = '';
      labels.forEach((l, i) => {
        const b = document.createElement('button');
        b.textContent = l;
        b.title = l;
        b.dataset.i = i;
        segs.appendChild(b);
      });
      ui.hidden = scenes.length < 2;
      stage.classList.toggle('has-timeline', !ui.hidden);
      window.dispatchEvent(new Event('resize'));
    }
    ui.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => jump(current() + Number(b.dataset.go)); });
    let scrubbing = false;
    const scrub = (e) => {
      const r = track.getBoundingClientRect();
      time = clamp((e.clientX - r.left) / r.width) * total() * 0.9999;
      refresh();
    };
    // Press anywhere on the track to scrub, scene buttons included. A press that barely moves on a scene
    // button jumps to the start of that scene instead.
    let downX = 0;
    let downScene = null;
    track.addEventListener('pointerdown', (e) => {
      downX = e.clientX;
      downScene = e.target.closest('button')?.dataset.i ?? null;
      scrubbing = true;
      track.setPointerCapture(e.pointerId);
      scrub(e);
    });
    track.addEventListener('pointermove', (e) => { if (scrubbing) scrub(e); });
    track.addEventListener('pointerup', (e) => {
      scrubbing = false;
      if (downScene !== null && Math.abs(e.clientX - downX) < 4) jump(Number(downScene));
    });
    const keys = (e) => {
      if (e.target.matches('input, select, textarea')) return;
      if (e.key === '[') jump(current() - 1);
      else if (e.key === ']') jump(current() + 1);
    };
    window.addEventListener('keydown', keys);
    renderSegs();

    function fillBand(b, color, k, wMul, c = ctx) {
      const poly = bandPolygon({ ...b, w: b.w * wMul });
      c.beginPath();
      poly.forEach(([x, y], i) => (i ? c.lineTo(x * k, y * k) : c.moveTo(x * k, y * k)));
      c.closePath();
      c.fillStyle = color;
      c.fill();
    }

    return {
      keyPressed(e) {
        if (e.key === 'h' || e.key === 'H') window.lab.set('hideInfo', !P.hideInfo);
      },
      onParam(key) {
        if (['seq', 'dur', 'hold', 'lag', 'ease', 'edit', 'unit', 'words', 'stagger', 'track', 'leading', 'hideInfo'].includes(key) || /^[A-Za-z0-9]_[abcd]/.test(key)) { buildTimeline(); renderSegs(); }
        if (['trails', 'trailMode', 'clear', 'palette', 'scale', 'panX', 'panY'].includes(key)) {
          history.length = 0;
          clearLayer();
        }
      },
      fixedStep: true, // renders the same at any frame step, so the exporter can step it at 120 fps
      dispose() {
        ui.remove();
        stage.classList.remove('has-timeline');
        window.removeEventListener('keydown', keys);
        window.removeEventListener('pcd-pause', syncPlay);
      },
      draw() {
        const [bg, colA, colB] = P.palette;
        // Trail settings are per 60 fps frame; scale them so 120 fps looks the same, just smoother.
        const k60 = api.clock.dt > 0 ? api.clock.dt * 60 : 1;
        if (!scrubbing) time = (time + api.clock.dt) % total();
        head.style.left = `${(time / total()) * 100}%`;
        const ci = current();
        segs.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i === ci));
        timeEl.textContent = `${fmtTime(time)} / ${fmtTime(total())}`;
        const snapshot = () => frameShapes().map((q) => ({ kind: q.kind, band: { ...q.band } }));
        // Rectangles first, then strokes on top with the overlap blend.
        // mask = true paints the plain coverage of the shapes (no colour, no blend).
        function paint(c, snap, mask = false) {
          c.save();
          c.translate(W / 2, H / 2);
          c.globalCompositeOperation = 'source-over';
          snap.forEach((q) => { if (q.kind === 'rect' && q.band.L > 0.5) fillBand(q.band, mask ? '#000' : colA, k, P.weightA, c); });
          c.globalCompositeOperation = mask || P.blend === 'normal' ? 'source-over' : P.blend;
          snap.forEach((q) => { if (q.kind === 'stroke' && q.band.L > 0.5) fillBand(q.band, mask ? '#000' : colB, k, P.weightB, c); });
          c.restore();
        }
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        const scale = P.scale * zoomMul() * animMul();
        const k = (W / REF_W) * scale;
        // Zoom about the chosen centre, which stays fixed on the poster.
        const zx = W * P.panX;
        const zy = H * P.panY;
        const zoom = (c) => c.translate(zx - zx * scale, zy - zy * scale);

        if (P.trailMode === 'keep') {
          // 1. Veil the layer back towards the background.
          fadeAcc += P.fade * k60;
          if (fadeAcc >= VEIL_STEP) {
            lctx.globalAlpha = Math.min(1, fadeAcc);
            lctx.fillStyle = bg;
            lctx.fillRect(0, 0, W, H);
            lctx.globalAlpha = 1;
            fadeAcc = 0;
          }
          // 2. This frame as it looks, cut out to the area the shapes cover, replaces those pixels.
          const snap = snapshot();
          fctx.save();
          fctx.fillStyle = bg;
          fctx.fillRect(0, 0, W, H);
          zoom(fctx);
          paint(fctx, snap);
          fctx.restore();
          mctx.clearRect(0, 0, W, H);
          mctx.save();
          zoom(mctx);
          paint(mctx, snap, true);
          mctx.restore();
          fctx.globalCompositeOperation = 'destination-in';
          fctx.drawImage(maskCv, 0, 0, W, H);
          fctx.globalCompositeOperation = 'source-over';
          lctx.drawImage(frameCv, 0, 0, W, H);
          // 3. The layer sits under the live shapes at the chosen opacity.
          ctx.globalAlpha = P.keepAlpha;
          ctx.drawImage(layer, 0, 0, W, H);
          ctx.globalAlpha = 1;
        }

        ctx.save();
        zoom(ctx);

        history.push(snapshot());
        while (history.length > (P.trailMode === 'echo' ? Math.round(P.trails / k60) : 0) + 1) history.shift();
        history.forEach((snap, i) => {
          const last = i === history.length - 1;
          ctx.globalAlpha = last ? 1 : clamp(0.08 + (0.35 * i) / history.length);
          paint(ctx, snap);
        });
        ctx.restore();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';

        if (!P.hideInfo) {
          drawTitle(ctx, P);
          drawFooter(ctx, logos, qr, P);
        }
      },
    };
  },
};
