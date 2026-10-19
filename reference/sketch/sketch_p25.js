// const CANVAS_W = 1280;
// const CANVAS_H = 720;
const CANVAS_W = 1280;
const CANVAS_H = 720;

let theFont;
let theFontBold;
let theFontThin;
let capImages = [];
let stripImages = [];
let stripPool = [];   // band strips (PNGs + procedural) for the onion inner wall and nest layers

// Previous palette (kept for reference)
// let colorSet = ['#570088', '#4b34ff', '#93d120', '#c8d3f1', '#ffb095', '#ff38f0', '#000000', '#ffffff'];

// Palette from the design-system color chart (a couple of purples, plus pink/blue/green/orange); B&W last
let colorSet = ['#7a00de', '#9c4bff', '#fc86ff', '#4b34ff', '#acdf4e', '#fc862a', '#000000', '#ffffff'];
let hoop;

const MAX_DUP = 10;
let rings = [];

const SEAM_FACE = Math.PI / 2;
const CRAWL_SPEED = 0.003;
let springScroll = 0;

const CRAWL_OFFSET = 1 / (2 * MAX_DUP + 1);
let crawl = 0;

const STACK_FRAMES = 75;
const MAX_STAGGER = 0.18;
let openRaw = 0;

const SPIRAL_FRAMES = 75;
const PULL_APART = 1.9;
let spiralRaw = 0;

let vaseRaw = 0;
let engagedRaw = 0;
const VASE_MIN_R = 60;
const VASE_MAX_R = 440;
const VASE_NOISE_STEP = 0.2;
const NUDGE_WINDOW = 180;
const NUDGE_STEP = 2;
const NUDGE_LAYER = 2;
const VASE_PUSH = 300;
const VASE_BAND_SCALE = 0.65;

let coinRaw = 0;
let fallTime = 0;
const COIN_RADIUS = 200;
const COIN_THICK = 16;
const COIN_TOP = 380;
const COIN_BOT = -1500;
const FALL_RATE = 0.0013;
const COIN_STAGGER = 1 / (2 * MAX_DUP + 1);
const COIN_DEVIATE = 0.35;
const COIN_SLOPE = COIN_THICK / (COIN_STAGGER * (COIN_TOP - COIN_BOT));
const COIN_FALL_POW = 3;
const COIN_ACCEL = (1 - COIN_SLOPE) / ((1 - COIN_DEVIATE) ** COIN_FALL_POW);
const MAX_TUMBLE = Math.PI / 5;
const MAX_SPIN = Math.PI * 1.25;
const COIN_TILT = Math.PI / 6;
const COIN_SETTLE = 0.7;

let onionRaw = 0;
const ONION_THICK = 64;
const ONION_RADIUS = 500;
const ORTHO_ZOOM = 80;

let burstRaw = 0;
let burstEngaged = false;
const BURST_A = 60;
const BURST_B = 170;
const BURST_C = 280;
const BURST_D = 340;
const BURST_SWAP = (BURST_B + BURST_C) / 2;
const BURST_STAGGER = 60;

let nestGrow = 0;
let nestRaw = 0;
const NEST_FRAMES = 120;
const NEST_COUNT = 2 * MAX_DUP + 1;
const NEST_GROW = 0.01;
const NEST_BIRTH_SIZE = 25;
const NEST_RAD_MAX = 1700;
const NEST_STRIPH_MAX = 500;
const NEST_XBUMP_MAX = NEST_COUNT * 30;
const NEST_YBUMP_MAX = NEST_COUNT * 10;
const NEST_ROTX_MAX = Math.PI / 2;
const NEST_ROTZ_MAX = NEST_COUNT * 0.145;
const NEST_XANIM_ORG = 50;
const NEST_POP = 220;
const NEST_CASCADE = 0.45;
const NEST_SPREAD_MIN_DUR = 0.1;
const NEST_SEAM = Math.PI * 10 / 8;
const NEST_SEAM_TURN = Math.PI / 2;   // extra 90° spin of each settled nest ring, to push its seam off the viewer
let nestMotion = 0;
const NEST_MOTION_FRAMES = 90;
const NEST_U_SPEED = 0.001;
const NEST_LAYERS = 4;   // each nest hoop's wall is a stack of this many sub-bands, each its own texture + drift
const NEST_INNER_SHADE = 160;   // tint (0-255) darkening the inside face of nest hoops, for depth

function preload() {
  theFont = loadFont("resources/Executive-Medium.ttf");        // standard
  theFontBold = loadFont("resources/Executive-Bold-Italic.ttf"); // bold variation
  theFontThin = loadFont("resources/Executive-Thin.ttf");        // thin variation
  for (let i = 0; i <= 6; i++) capImages.push(loadImage(`resources/cTexture_${i}.png`));
  for (const f of ['stripTextures-01', 'stripTextures-02', 'stripTextures-03', 'stripTextures-04', 'stripTextures-05', 'stripTextures-07', 'stripTextures-08', 'stripTextures']) {
    stripImages.push(loadImage(`resources/${f}.png`));
  }
}

function setup() {
  // Left unset, this is the device's DPR — 2-3x on a phone, i.e. 4-9x the fragments.
  // The offscreen graphics in texture.js already pin themselves to 1; this is the one
  // that actually rasterizes. Desktop keeps p5's default.
  if (MOBILE.density) pixelDensity(MOBILE.density);
  // Every frame paints an opaque background; no previous drawing buffer is needed.
  setAttributes({ alpha: false, preserveDrawingBuffer: false });
  const canvas = createCanvas(CANVAS_W, CANVAS_H, WEBGL);
  canvas.parent("sketch-holder");

  textureWrap(CLAMP);

  buildUI(canvas);

  hoop = new Hoop();
  stripPool = [
    ...stripImages,
    buildGridStrip('#4b34ff', '#ffffff'),      // blue with thin white grid
    buildStippleStrip('#7a00de', '#ffffff'),   // small white dots on deep purple
  ];
  rebuildTexture();
  buildCapTextures();

  for (let i = 0; i < MAX_DUP * 2 + 1; i++) {
    rings.push({
      phase: random(1),
      speedMul: random(0.6, 1.4),
      uAlign: 0,
      tumbleX: random(-1, 1),
      tumbleY: random(-1, 1),
      tumbleZ: random(-1, 1),
      slot: i - MAX_DUP,
      bTicker: 0,
      bRotY1: 0, bRotY2: 0, bRotX0: 0, bRotX1: 0, bRad0: ONION_RADIUS,
      nestU: 0, nestUMul: random(0.4, 1) * (random() < 0.5 ? -1 : 1),
      texVar: Math.floor(random(hoop.texSets.length)), vaseSwap: -999,
      capVar: Math.floor(random(hoop.capSets.length)),
      capRot: random(TWO_PI),
      onionOVar: Math.floor(random(hoop.onionOuter.length)),
      onionIVar: Math.floor(random(hoop.onionInner.length)),
      layers: Array.from({ length: NEST_LAYERS }, () => ({
        texIdx: Math.floor(random(hoop.nestLayerTex.length)),
        u: random(1),
        uMul: random(0.5, 1.6) * (random() < 0.5 ? -1 : 1),
      })),
    });
  }
  for (const r of rings) rerollBurst(r);
}

function draw() {
  background(89, 79, 247);
  dbgVerts = 0; dbgShapes = 0;

  const state = readUI();

  let openTarget = (state >= 1) ? 1 : 0;
  if (spiralRaw > 0.001 || vaseRaw > 0.001) openTarget = 1;
  openRaw += constrain(openTarget - openRaw, -1 / STACK_FRAMES, 1 / STACK_FRAMES);

  const spiralTarget = (state === 2 && openRaw > 0.999) ? 1 : 0;
  spiralRaw += constrain(spiralTarget - spiralRaw, -1 / SPIRAL_FRAMES, 1 / SPIRAL_FRAMES);
  const spiral = easeInOutQuint(spiralRaw);

  const vaseTarget = (state >= 3 && openRaw > 0.999) ? 1 : 0;
  vaseRaw += constrain(vaseTarget - vaseRaw, -1 / SPIRAL_FRAMES, 1 / SPIRAL_FRAMES);
  const vase = easeInOutQuint(vaseRaw);

  const engagedTarget = (state >= 2 && openRaw > 0.999) ? 1 : 0;
  engagedRaw += constrain(engagedTarget - engagedRaw, -1 / SPIRAL_FRAMES, 1 / SPIRAL_FRAMES);
  const engaged = easeOutQuint(engagedRaw);

  const coinTarget = (state >= 4 && openRaw > 0.999) ? 1 : 0;
  coinRaw += constrain(coinTarget - coinRaw, -1 / SPIRAL_FRAMES, 1 / SPIRAL_FRAMES);
  const coin = easeInOutQuint(coinRaw);

  const onionTarget = (state >= 5 && openRaw > 0.999) ? 1 : 0;
  onionRaw += constrain(onionTarget - onionRaw, -1 / SPIRAL_FRAMES, 1 / SPIRAL_FRAMES);
  const onion = easeInOutQuint(onionRaw);

  const nestTarget = (state >= 6) ? 1 : 0;
  nestRaw += constrain(nestTarget - nestRaw, -1 / NEST_FRAMES, 1 / NEST_FRAMES);
  const nest = nestRaw;
  const converge = easeInExpo(constrain(nest / 0.5, 0, 1));
  const spread = constrain((nest - 0.5) / 0.5, 0, 1);

  if (nest >= 0.999) {
    nestMotion = Math.min(1, nestMotion + 1 / NEST_MOTION_FRAMES);
  } else {
    nestMotion = Math.max(0, nestMotion - 1 / NEST_MOTION_FRAMES);
  }
  nestGrow += NEST_GROW * easeInQuad(nestMotion);
  if (nest < 0.001) nestGrow = 0;

  if (nest > 0.001) for (const r of rings) {
    r.nestU += r.nestUMul * NEST_U_SPEED;
    for (const L of r.layers) L.u += L.uMul * NEST_U_SPEED;
  }

  if (coin < 0.001) fallTime = 0;
  if (onion < 0.001) fallTime += coin;

  if (onion < 0.001) {
    const order = [];
    for (let k = -MAX_DUP; k <= MAX_DUP; k++) {
      const so = (MAX_DUP - k) / (2 * MAX_DUP + 1);
      let fp = (fallTime * FALL_RATE + so) % 1;
      if (fp < 0) fp += 1;
      order.push({ k, fp });
    }
    order.sort((a, b) => a.fp - b.fp);
    for (let i = 0; i < order.length; i++) rings[order[i].k + MAX_DUP].slot = MAX_DUP - i;
  }

  const bursting = state >= 5 && onion > 0.999;
  if (bursting && !burstEngaged) burstRaw = 1;
  burstEngaged = bursting;
  burstRaw += constrain((bursting ? 1 : 0) - burstRaw, -1 / SPIRAL_FRAMES, 1 / SPIRAL_FRAMES);
  const burst = burstRaw * (1 - converge);
  if (bursting) {
    for (const r of rings) {
      r.bTicker++;
      if (r.bTicker >= BURST_D) { rerollBurst(r); r.bTicker = 0; }
    }
  } else if (burstRaw < 0.001) {
    for (const r of rings) r.bTicker = burstStart(r.slot + MAX_DUP);
  }

  const tileRate = -hoop.spinSpeed * hoop.springReps() * (1 - onion);
  for (const r of rings) r.phase += tileRate * r.speedMul;
  springScroll += tileRate;

  const gset = constrain(coin / COIN_SETTLE, 0, 1);
  const coinRound = constrain((coin - COIN_SETTLE) / (1 - COIN_SETTLE), 0, 1);

  const flatten = (coin > 0.001) ? coinRound : (vase > 0.001 ? 0 : 1);

  const innerAlpha = 255 * (1 - coin * (1 - onion));

  const coinReps = Math.max(1, Math.round((TWO_PI * COIN_RADIUS * hoop.bandH) / (hoop.hr * COIN_THICK)));
  const onionReps = Math.max(1, Math.round((TWO_PI * ONION_RADIUS * hoop.bandH) / (hoop.hr * ONION_THICK)));
  const bandReps = onion < 0.5 ? coinReps : onionReps;

  const vaseOnly = vase * (1 - coin);
  const vaseBandFactor = lerp(1, VASE_BAND_SCALE, vaseOnly);
  const spacing = hoop.bandH * lerp(1, PULL_APART, spiral) * vaseBandFactor;

  if (spiral < 0.001) crawl = 0;
  crawl += CRAWL_SPEED * spiral;
  const span = (2 * MAX_DUP + 3) * spacing;

  const dup = openRaw > 0.001 ? MAX_DUP : 0;
  const OFFSCREEN = 1600;

  const camZ0 = (height / 2) / Math.tan(PI / 6);

  const camZ = 1 / lerp(1 / camZ0, 1 / (camZ0 * ORTHO_ZOOM), onion);
  perspective(2 * Math.atan((height / 2) / camZ), width / height, camZ / 20, camZ * 20);
  camera(0, 0, camZ, 0, 0, 0, 0, 1, 0);

  if (nest >= 0.5) {

    drawNest(spread);
    if (debug) drawTexturePreview(hoop.tex);
    updateDebugHud(state);
    return;
  }

  const seed = nestHoopParams(((1 + nestGrow) % NEST_COUNT + NEST_COUNT) % NEST_COUNT);

  const groupX = lerp(PI/2 + PI/16 - coin * COIN_TILT, PI/2, onion);
  const groupY = lerp(PI/16, 0, onion);
  const groupZ = SEAM_FACE * (1 - vase) * (1 - onion);

  push();
    translate(0, 0, -VASE_PUSH * vaseOnly);
    translate(-150 * converge, 0, 0);
    rotateX(lerp(groupX, -PI / 16, converge));
    rotateY(lerp(groupY, -PI / 4, converge));
    rotateZ(lerp(groupZ, PI / 16, converge));

    for (let k = -dup; k <= dup; k++) {
      const r = rings[k + MAX_DUP];

      const rank = (abs(k) - 1) * 2 + (k < 0 ? 1 : 0);
      const maxRank = 2 * MAX_DUP - 1;
      const delay = maxRank > 0 ? (rank / maxRank) * MAX_STAGGER : 0;
      const p = constrain((openRaw - delay) / (1 - MAX_STAGGER), 0, 1);
      const open = easeOutQuint(p);

      const theta = crawl + k * CRAWL_OFFSET;
      const f = theta - Math.floor(theta);
      const a = inchA(f);
      const b = inchB(f);

      let base = k * spacing + 2 * spacing * (Math.floor(theta) + a);
      base -= span * Math.floor((base + span / 2) / span);
      if (r.prevBase !== undefined && base - r.prevBase < -span / 2) {
        r.phase = random(1);
        r.speedMul = random(0.6, 1.4);
      }
      r.prevBase = base;

      const shear = spacing * spiral * (1 + 2 * (b - a));

      const appear = (abs(k) <= 2) ? open : open * engaged;

      const startSign = (spiral > 0.001) ? Math.sign(base) : Math.sign(k);
      const startZ = startSign * Math.abs(k) * OFFSCREEN;
      const finalZ = lerp(k * spacing, base, spiral);
      const z = lerp(startZ, finalZ, appear);

      const rTop = lerp(hoop.radius, vaseEdgeRadius(k - 0.5), vase);
      const rBot = lerp(hoop.radius, vaseEdgeRadius(k + 0.5), vase);

      const cRTop = lerp(lerp(rTop, COIN_RADIUS, gset), ONION_RADIUS, onion);
      const cRBot = lerp(lerp(rBot, COIN_RADIUS, gset), ONION_RADIUS, onion);
      const thickness = lerp(lerp(hoop.bandH, COIN_THICK, gset), ONION_THICK, onion) * vaseBandFactor;

      const fallBlend = constrain((coin - 0.35) / 0.65, 0, 1);

      const streamOffset = (MAX_DUP - k) / (2 * MAX_DUP + 1);
      let fp = (fallTime * FALL_RATE + streamOffset) % 1;
      if (fp < 0) fp += 1;
      if (r.prevFp !== undefined && fp < r.prevFp - 0.5) {
        r.tumbleX = random(-1, 1);
        r.tumbleY = random(-1, 1);
        r.tumbleZ = random(-1, 1);
      }
      r.prevFp = fp;

      const d = Math.max(0, fp - COIN_DEVIATE);
      const t = d / (1 - COIN_DEVIATE);
      const fpe = (fp < COIN_DEVIATE)
        ? fp * COIN_SLOPE
        : COIN_DEVIATE * COIN_SLOPE + COIN_SLOPE * d + COIN_ACCEL * d ** COIN_FALL_POW;
      const fallZ = lerp(COIN_TOP, COIN_BOT, fpe);

      const drawZ = lerp(lerp(z, fallZ, fallBlend), r.slot * ONION_THICK, onion);

      const dev = t * t;
      const tumX = r.tumbleX * dev * MAX_TUMBLE * fallBlend * (1 - onion);
      const tumY = r.tumbleY * dev * MAX_TUMBLE * fallBlend * (1 - onion);
      const tumZ = r.tumbleZ * dev * MAX_SPIN * fallBlend * (1 - onion);

      if (Math.abs(drawZ) < 1600) {

        if (spiral < 0.001) {
          r.uAlign = Math.round(springScroll - r.phase);
        }
        const texPhase = lerp(r.phase, springScroll - r.uAlign, spiral);

        const bp = burstPose(r);
        const bSpin = bp.spin * burst;
        const bTilt = bp.tilt * burst;
        const bRadTop = lerp(cRTop, bp.rad, burst);
        const bRadBot = lerp(cRBot, bp.rad, burst);
        const burstFlatten = 1 - constrain(Math.abs(bp.rad - ONION_RADIUS) / (0.1 * ONION_RADIUS), 0, 1);

        const startOffset = NEST_CASCADE * (1 - Math.abs(r.slot) / MAX_DUP);
        const convK = easeInExpo(constrain((nest - startOffset) / (0.5 - startOffset), 0, 1));
        push();
          translate(lerp(0, seed.xBump, convK), lerp(0, seed.yBump, convK), lerp(drawZ, 0, convK));
          rotateX(tumX);
          rotateY(tumY);
          rotateZ(tumZ);
          rotateZ(bSpin);
          rotateX(bTilt);
          rotateX(lerp(0, seed.rotX, convK));
          rotateZ(lerp(0, seed.rotZ, convK));
          rotateX(lerp(0, HALF_PI, convK));
          if (vase > 0.5 && coin < 0.5) {
            const swapCycle = Math.floor((frameCount + k * NUDGE_LAYER) / NUDGE_WINDOW - 0.5);
            if (swapCycle !== r.vaseSwap) { r.vaseSwap = swapCycle; r.texVar = Math.floor(random(hoop.texSets.length)); }
          }
          const useVariant = (vase > 0.5 && coin < 0.5) || (coin > 0.5 && onion < 0.5);
          let set = null;
          if (spiral > 0.05) set = hoop.springSet;
          if (useVariant) set = hoop.texSets[r.texVar];
          if (burst > 0.5 && r.bTicker >= BURST_A && r.bTicker < BURST_SWAP) {
            set = { outer: hoop.onionOuter[r.onionOVar], inner: hoop.onionInner[r.onionIVar] };
          }
          hoop.display(texPhase, shear,
                       lerp(bRadTop, seed.rad, convK),
                       lerp(bRadBot, seed.rad, convK),
                       lerp(thickness, seed.stripH, convK),
                       0,
                       innerAlpha,
                       set ? set.outer : null,
                       set ? set.inner : null,
                       coin > 0.5 && burst < 0.5 ? bandReps : 0);

          const capAlpha = 255 * constrain((1 - onion) / 0.15, 0, 1) * (1 - convK);
          if (coin > 0.01 && capAlpha > 1) hoop.displayCaps(bRadTop, bRadBot, thickness, capAlpha, hoop.capSets[r.capVar], r.capRot);
        pop();
      }
    }
  pop();

  if (debug) drawTexturePreview(hoop.tex);
  updateDebugHud(state);
}

// d toggles the vertex overlay; [ and ] thin or thicken the points it draws.
// uiIsActive() guards it so typing "d" into the text field doesn't trip it.
function keyPressed() {
  if (uiIsActive()) return;
  if (key === 'd' || key === 'D') {
    debug = !debug;
    if (debugToggle) debugToggle.checked(debug);
  } else if (key === '[') {
    DEBUG_STRIDE = Math.max(1, DEBUG_STRIDE - 1);
  } else if (key === ']') {
    DEBUG_STRIDE = Math.min(40, DEBUG_STRIDE + 1);
  }
}

function nestHoopParams(index) {
  const rad = map(index, 0, NEST_COUNT - 1, NEST_BIRTH_SIZE, NEST_RAD_MAX);
  const stripH = map(index, 0, NEST_COUNT - 1, NEST_BIRTH_SIZE, NEST_STRIPH_MAX);
  let xAnim = 0, yAnim = 0, rotZanim = 0;
  if (index <= 1) {
    const tk = easeOutExpo(index);
    xAnim = lerp(NEST_XANIM_ORG, 0, tk);
    yAnim = NEST_POP * (1 - index) * cos(index * PI * 1.5);
    rotZanim = lerp(PI, 0, tk);
  }
  const xBump = map(index, 0, NEST_COUNT - 1, 0, NEST_XBUMP_MAX);
  const yBump = map(index, 0, NEST_COUNT - 1, 0, NEST_YBUMP_MAX);
  const rotX = map(index, 0, NEST_COUNT - 1, 0, NEST_ROTX_MAX);
  const rotZ = map(index, 0, NEST_COUNT - 1, 0, NEST_ROTZ_MAX);
  return { rad, stripH, xBump, yBump, rotX, rotZ, xAnim, yAnim, rotZanim };
}

function nestRnd(a, b) {
  const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function drawNest(spread) {
  push();
    translate(-150, 0, 0);
    rotateZ(PI / 16);
    rotateY(-PI / 4);
    rotateX(-PI / 16);

    for (let p = 0; p < NEST_COUNT; p++) {

      const target = NEST_COUNT - 1 - p;
      const dur = lerp(NEST_SPREAD_MIN_DUR, 1, target / (NEST_COUNT - 1));
      const sp = easeOutExpo(constrain(spread / dur, 0, 1));
      const idxRaw = lerp(1, target, sp) + nestGrow;
      const cycle = Math.floor(idxRaw / NEST_COUNT);
      const index = ((idxRaw % NEST_COUNT) + NEST_COUNT) % NEST_COUNT;
      const q = nestHoopParams(index);

      let flipX = 0, flipY = 0;
      if (index <= 1) {
        const e = 1 - easeInOutQuint(index);
        flipX = PI * lerp(-1.5, 1.5, nestRnd(p, cycle)) * e;
        flipY = lerp(-0.6, 0.6, nestRnd(p, cycle + 41)) * e;
      }

      push();
        translate(q.xBump + q.xAnim, q.yBump + q.yAnim, 0);
        rotateX(q.rotX + flipX);
        rotateY(flipY);
        rotateZ(q.rotZ + q.rotZanim);

        rotateY(NEST_SEAM * sp);
        rotateX(HALF_PI);
        rotateZ(NEST_SEAM_TURN * sp);

        const layers = rings[p].layers.map((L) => ({ tex: hoop.nestLayerTex[L.texIdx], texDark: hoop.nestLayerTexDark[L.texIdx], scroll: L.u }));
        hoop.displayLayered(q.rad, q.stripH, layers);
      pop();
    }
  pop();
}

function burstStart(i) {
  const N = 2 * MAX_DUP + 1;
  if (i < N / 2) {
    return map(easeInQuad(map(i, 0, N / 2, 0, 1)), 0, 1, -BURST_STAGGER, 0);
  }
  return map(easeOutQuad(map(i, N / 2, N - 1, 0, 1)), 0, 1, 0, -BURST_STAGGER);
}

function rerollBurst(r) {
  r.bRotY1 = HALF_PI + random(PI, PI * 1.5);
  r.bRotY2 = Math.round(r.bRotY1 / TWO_PI) * TWO_PI;
  r.bRotX0 = random(-PI / 3, PI / 3);
  r.bRotX1 = Math.round(r.bRotX0 / TWO_PI) * TWO_PI;
  r.bRad0 = ONION_RADIUS + random(-0.75 * ONION_RADIUS, ONION_RADIUS);
  r.onionOVar = Math.floor(random(hoop.onionOuter.length));   // reroll outer texture each explosion (some land on black type)
}

function burstPose(r) {
  const t = r.bTicker;
  let spin = 0, tilt = 0, rad = ONION_RADIUS;
  if (t < 0) {

  } else if (t < BURST_A) {
    spin = easeInQuint(map(t, 1, BURST_A - 1, 0, 1)) * HALF_PI;
  } else if (t < BURST_B) {
    const tk = map(t, BURST_A, BURST_B - 1, 0, 1);
    spin = lerp(HALF_PI, r.bRotY1, easeOutQuint(tk));
    tilt = lerp(0, r.bRotX0, easeOutElastic(tk));
    rad = lerp(ONION_RADIUS, r.bRad0, easeOutExpo(tk));
  } else if (t < BURST_C) {
    const tk = map(t, BURST_B, BURST_C - 1, 0, 1);
    spin = lerp(r.bRotY1, r.bRotY2, easeOutQuint(tk));
    tilt = lerp(r.bRotX0, r.bRotX1, easeInOutExpo(tk));
    rad = lerp(r.bRad0, ONION_RADIUS, easeInOutExpo(tk));
  }

  let glide = 0;
  if (t >= BURST_A / 2 && t < BURST_C) {
    glide = easeInOutSine(map(t, BURST_A / 2, BURST_C - 1, 0, 1)) * TWO_PI;
  } else if (t >= BURST_C) {
    glide = TWO_PI;
  }
  return { spin: spin + glide, tilt, rad };
}

function smoothStep(e0, e1, x) {
  const t = constrain((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

function morphEase(f) {
  return easeInOutQuint(constrain((f - 0.2) / 0.6, 0, 1));
}

function vaseEdgeRadius(e) {
  const win = (frameCount + e * NUDGE_LAYER) / NUDGE_WINDOW;
  const noiseOff = (Math.floor(win) + morphEase(win - Math.floor(win))) * NUDGE_STEP;
  return map(noise((e + MAX_DUP + 1) * VASE_NOISE_STEP + noiseOff),
             0, 1, VASE_MIN_R, VASE_MAX_R);
}

function inchA(f) { return easeInOutQuint(constrain((f - 0.10) / 0.25, 0, 1)); }
function inchB(f) { return easeInOutQuint(constrain((f - 0.60) / 0.25, 0, 1)); }

function buildCapTextures() {
  const distinct = (n) => {
    const out = [];
    let g = 0;
    while (out.length < n && g++ < 80) {
      const c = colorSet[Math.floor(random(colorSet.length))];
      if (!out.includes(c)) out.push(c);
    }
    while (out.length < n) out.push(colorSet[Math.floor(random(colorSet.length))]);
    return out;
  };
  const grid = (w, h, gap) => { const [bg, c] = distinct(2); const s = random(0.8, 1.3); return buildGridTexture(bg, c, w * s, h * s, gap * s); };
  const combo = (big, gap) => { const [bg, cb, cs] = distinct(3); const s = random(0.8, 1.3); return buildComboGridTexture(bg, cb, cs, big * s, gap * s); };
  const lineGrid = (cell, weight) => { const [bg, c] = distinct(2); const s = random(0.8, 1.3); return buildLineGridTexture(bg, c, cell * s, weight); };
  const grad = () => { const [a, b] = distinct(2); return buildGradientSquare(a, b); };
  const radial = () => { const [a, b] = distinct(2); return buildRadialGradient(a, b); };
  const stipple = () => buildStippleTexture('#000000', '#ffffff', 1.1, 1.5, 9000);
  const dotField = () => {
    const bw = random() < 0.5 ? '#000000' : '#ffffff';   // ensure one side is black or white
    const c = colorSet[Math.floor(random(6))];           // the other a chromatic palette color
    return random() < 0.5 ? buildDotFieldTexture(bw, c, 40, 7) : buildDotFieldTexture(c, bw, 40, 7);
  };
  hoop.capSets = [
    ...capImages, ...capImages,              // PNG cap textures (prioritized: each appears twice)
    grid(10, 10, 64),                        // small squares
    grid(8, 225, 45),                        // long bars (even longer, slightly thinner)
    grid(80, 80, 12),                        // very big blocks
    lineGrid(22, 2),                         // straight thin-line grid
    combo(110, 14),                          // big blocks + gap-sized small blocks, three colors
    grad(),                                  // linear gradient
    radial(),                                // radial gradient
    stipple(),                               // black dots on white
    dotField(), dotField(),                  // circle field, shrinking toward the center
  ];

  // onion explode inner wall: looping crops of the band strips (mapped proportionally)
  hoop.onionInner = [...stripPool];
}

// Images from the PREVIOUS rebuild. Freed only after the new set is live, so nothing
// still being drawn is ever pulled out from under the renderer.
let texTrash = [];

function releaseTextures(list) {
  for (const img of new Set(list)) {
    if (!img) continue;
    // p5 1.11.13 owns a WebGL handle per cached source. Delete it before evicting
    // the source; Map.delete alone leaks the GPU allocation. Recheck on p5 upgrades.
    const renderer = typeof _renderer !== 'undefined' && _renderer;
    const cache = renderer && renderer.textures;
    if (cache && typeof cache.get === 'function' && typeof cache.delete === 'function') {
      const texture = cache.get(img);
      if (texture && texture.glTex && renderer.GL && typeof renderer.GL.deleteTexture === 'function') {
        renderer.GL.deleteTexture(texture.glTex);
      }
      cache.delete(img);
    }
    if (typeof img.remove === 'function') img.remove();
  }
}

function rebuildTexture() {
  // Every image this function creates gets registered, so the previous generation can be
  // released at the end. The PNGs and the setup-built stripPool/capSets are never in here.
  const made = [];
  const keep = (g) => { made.push(g); return g; };
  const b = (font, bg, fg, hs = 1, pad = 0, grad = null, box = false, corner = null, topRow = null, botRow = null, rowGap = 1, jitter = false) => keep(buildTextTexture(uiText, font, debug, bg, fg, hs, pad, grad, box, corner, topRow, botRow, rowGap, jitter));
  const pc = () => colorSet[Math.floor(random(6))];
  const BLUE = '#4b34ff';
  const GREEN = '#acdf4e';
  const ORANGE = '#fc862a';
  const PINK = '#fc86ff';
  hoop.setTexture(b(theFont, 255, 0));
  hoop.innerTex = b(theFont, 165, 0);
  hoop.texSets = [
    { outer: hoop.tex,                                  inner: hoop.innerTex },
    { outer: b(theFontBold, 255, 0),                    inner: b(theFontBold, 165, 0) },
    { outer: b(theFont, 0, 255),                        inner: b(theFont, 60, 255) },
    { outer: b(theFontBold, 0, 255),                    inner: b(theFontBold, 60, 255) },
    { outer: b(theFontBold, 255, 0, 0.875, 1.5, null, true), inner: b(theFontBold, 165, 0, 0.875, 1.5, null, true) },
    { outer: b(theFontBold, 0, 255, 0.875, 1.5),          inner: b(theFontBold, 60, 255, 0.875, 1.5) },
    { outer: b(theFont, 255, 0, 1, 0, [255, 0, 0.15]),  inner: b(theFont, 165, 0, 1, 0, [165, 0, 0.15]) },
    { outer: b(theFont, 255, pc()),                     inner: b(theFont, 165, pc()) },
    { outer: b(theFontBold, 255, pc()),                 inner: b(theFontBold, 165, pc()) },
    { outer: b(theFont, 255, pc()),                     inner: b(theFont, 165, pc()) },
    { outer: b(theFont, pc(), 255),                     inner: b(theFont, 60, 255) },
    { outer: b(theFontBold, pc(), 255),                 inner: b(theFontBold, 60, 255) },
    { outer: b(theFont, 255, 0, 1, 0, null, false, BLUE, BLUE, BLUE, 6, true), inner: b(theFont, 165, 0, 1, 0, null, false, BLUE, BLUE, BLUE, 6, true) },  // corners + top/bottom rows (non-uniform)
    { outer: b(theFont, 255, 0, 1, 0, null, false, null, GREEN, GREEN, 6, true), inner: b(theFont, 165, 0, 1, 0, null, false, null, GREEN, GREEN, 6, true) },  // top + bottom rows (non-uniform)
    { outer: b(theFont, 255, 0, 1, 0, null, false, null, ORANGE, ORANGE, 9, true), inner: b(theFont, 165, 0, 1, 0, null, false, null, ORANGE, ORANGE, 9, true) },  // top + bottom rows, very spread
    { outer: b(theFont, 0, 255, 1, 0, null, false, null, PINK, PINK, 6, true), inner: b(theFont, 0, 255, 1, 0, null, false, null, PINK, PINK, 6, true) },  // top + bottom rows on black
    { outer: b(theFontThin, 255, 0),                    inner: b(theFontThin, 165, 0) },   // thin
    { outer: b(theFontThin, 0, 255),                    inner: b(theFontThin, 60, 255) },  // thin, inverted
  ];

  // Texture pool for the subdivided nest-hoop layers: the strip PNGs plus a spread of the type
  // variants (regular, bold, inverted, half-size, gradient, palette, and the corner-squares one).
  hoop.nestLayerTex = [
    ...stripPool,
    hoop.texSets[0].outer,   // regular
    hoop.texSets[1].outer,   // bold
    hoop.texSets[2].outer,   // inverted (color)
    hoop.texSets[4].outer,   // half-size bold (size)
    hoop.texSets[6].outer,   // gradient (color)
    hoop.texSets[7].outer,   // palette (color)
    hoop.texSets[12].outer,  // corner squares
    hoop.texSets[13].outer,  // top + bottom rows
    hoop.texSets[14].outer,  // bottom row, very spread
    hoop.texSets[15].outer,  // bottom row on black
    hoop.texSets[16].outer,  // thin (font)
  ];
  // pre-darkened copies for the recessed inside faces (avoids a runtime tint)
  hoop.nestLayerTexDark = hoop.nestLayerTex.map((t) => keep(darkenTex(t, NEST_INNER_SHADE)));

  const sc = pc();
  hoop.springSet = {
    outer: hoop.tex,
    inner: b(theFont, sc, 255),
  };

  const anyC = () => colorSet[Math.floor(random(colorSet.length))];
  hoop.onionOuter = [];
  for (let i = 0; i < 8; i++) {
    const fg = anyC(); let bg = anyC(), g = 0;
    while (bg === fg && g++ < 10) bg = anyC();
    hoop.onionOuter.push(b(theFont, bg, fg));
  }
  // mix a few black-background type variations into the explode pool, so some rings
  // randomly show black type on the outside during the onion burst
  hoop.onionOuter.push(b(theFont, 0, 255));
  hoop.onionOuter.push(b(theFontBold, 0, 255));
  hoop.onionOuter.push(b(theFontThin, 0, 255));

  releaseTextures(texTrash);   // the new set is assigned; the old one is now unreferenced
  texTrash = made;
}
