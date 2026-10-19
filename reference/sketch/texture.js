// ── Textures ────────────────────────────────────────────────────────────────
// Type variants (buildTextTexture — the word tiled around the band). Each also has
// a matching gray "inner wall" (shadow) version. Indices are the texSets[] order:
//   0. Regular                 — black on white
//   1. Bold
//   2. Inverted                — white on black
//   3. Inverted bold
//   4. Half-size bold          — half scale, centered vertically, extra side padding
//   5. Half-size bold inverted — same, white on black
//   6. Gradient                — regular type over a black-bottom -> white-top gradient
//   7-11. Palette              — type in a palette color on white, or white on a palette-color ground
// Spring type (springSet): regular outer; inner wall only is white type on one darkened palette color.
// Onion explode (onionOuter / onionInner): during the fast-spin burst, outer swaps to random
//   color-on-color type; inner wall swaps to a linear-strip pattern (buildStripTexture: bars/lines/grad/grid/dots).
// Coin caps (square textures mapped centered on the circular coin face, randomly rotated per coin):
//   - Grid       — single-color squares/bars on a colored ground, evenly spaced (buildGridTexture: w,h,gap)
//   - Combo grid — big blocks + gap-sized small blocks, top-aligned, three colors (buildComboGridTexture)
//   - Line grid  — thin stroked graph-paper grid, two colors (buildLineGridTexture)
//   - Gradient   — linear (buildGradientSquare) or radial (buildRadialGradient) blend, two colors
//   - Stipple    — non-colliding black dots on white (buildStippleTexture)
// Each cap type has a couple color variations to reduce coin-to-coin repetition.
// ─────────────────────────────────────────────────────────────────────────────

// The type texture is sized to the bounds of the word with equal padding all around,
// so its width:height IS the type's true aspect (+padding). The band maps it proportionally.
// Each of these is roughly labelW x (CAP_H + padding) RGBA — for a 22-character phrase that
// is ~3500x260, ~3.7MB, and rebuildTexture() makes ~70 of them. Their size scales LINEARLY
// with the length of the typed string, so a long phrase is what actually exhausts a phone's
// texture budget. MOBILE.capScale is the dial: halving it quarters every one.
const CAP_H = 200 * MOBILE.capScale;   // cap height of the type, in texture pixels
const PAD_EMS = 0.15;   // padding on every side, in cap-heights
const SEAM_PAD = 0.12;  // a touch of EXTRA left/right padding, so repeats read apart at the seam

// Snapshot finished graphics at their existing resolution so p5 uploads each texture
// once. Scrolling animates UVs, so the source pixels never need to change.
function freezeTexture(g) {
  const img = g.get();
  // p5 1.11.13 Graphics.remove() calls the inherited Element.remove() on its
  // 2D renderer, whose graphics owner has no _elements array. These buffers have
  // no GPU resources; remove the graphics element directly in that case.
  if (g._renderer?.remove === p5.Element.prototype.remove) {
    p5.Element.prototype.remove.call(g);
  } else {
    g.remove();
  }
  return img;
}

function buildTextTexture(txt, font, debug, bg = 255, fg = 0, heightScale = 1, padEms = 0, grad = null, box = false, cornerSq = null, topSq = null, botSq = null, rowGapMul = 1, rowJitter = false) {

  const raw = (txt && txt.length > 0) ? txt : "25 YEARS OF PROCESSING";
  const label = raw.toUpperCase();

  const capH = CAP_H * heightScale;
  let size = capH;
  let capY = -capH;
  let labelW = label.length * size * 0.6;
  if (font && font.textBounds) {
    const probe = 100;
    const b0 = font.textBounds("X", 0, 0, probe);
    size = capH / (b0.h / probe);
    const bx = font.textBounds("X", 0, 0, size);
    capY = bx.y;
    labelW = font.textBounds(label, 0, 0, size).w;
  }

  const pad = CAP_H * (PAD_EMS + padEms);
  const padH = pad + CAP_H * SEAM_PAD;   // a hair more on the left/right
  const texW = Math.round(labelW + 2 * padH);
  const texH = Math.round(capH + 2 * pad);
  const baseline = pad - capY;   // cap sits at y=pad, centered with pad above and below

  const g = createGraphics(texW, texH);
  g.pixelDensity(1);
  if (grad) {
    const c0 = grad[0], c1 = grad[1], knot = grad[2] || 0;
    g.background(c1);
    g.noStroke();
    for (let y = 0; y < texH; y++) {
      const t = y / (texH - 1);
      g.fill(t <= knot ? c0 : lerp(c0, c1, (t - knot) / (1 - knot)));
      g.rect(0, y, texW, 1);
    }
  } else {
    g.background(bg);
  }

  if (font) g.textFont(font);
  g.fill(fg);
  g.noStroke();
  g.textSize(size);
  g.textAlign(CENTER, BASELINE);
  g.text(label, texW / 2, baseline);

  if (box) {
    const bpad = 12 * MOBILE.capScale;
    g.noFill();
    g.stroke(fg);
    g.strokeWeight(6 * MOBILE.capScale);
    g.rectMode(CENTER);
    g.rect(texW / 2, texH / 2, labelW + bpad * 2, capH + bpad * 2);
    g.rectMode(CORNER);
  }

  if (cornerSq) {
    // a square in each corner, its inner corner on the type's bounding box and its outer
    // side on the texture edge — bridging the type and the edge.
    g.noStroke();
    g.fill(cornerSq);
    const sq = pad;
    const x0 = padH, x1 = texW - padH, y0 = pad, y1 = texH - pad;
    g.rect(x0 - sq, y0 - sq, sq, sq);
    g.rect(x1, y0 - sq, sq, sq);
    g.rect(x0 - sq, y1, sq, sq);
    g.rect(x1, y1, sq, sq);
  }

  if (topSq || botSq) {
    // rows of squares along the top and/or bottom padding strips. rowGapMul widens the gap
    // (1 = square-sized gaps); rowJitter makes the gaps random (non-uniform) rather than even.
    const sq = pad;
    const baseGap = sq * rowGapMul;
    const drawRow = (color, yPos) => {
      g.noStroke();
      g.fill(color);
      if (rowJitter) {
        let x = random(0, baseGap);
        while (x + sq <= texW) {
          g.rect(x, yPos, sq, sq);
          x += sq + baseGap * random(0.4, 1.7);
        }
      } else {
        const pitch = sq + baseGap;
        const count = Math.max(1, Math.round(texW / pitch));
        const gap = (texW - count * sq) / (count + 1);
        for (let i = 0; i < count; i++) g.rect(gap + i * (sq + gap), yPos, sq, sq);
      }
    };
    if (topSq) drawRow(topSq, 0);
    if (botSq) drawRow(botSq, texH - sq);
  }

  return freezeTexture(g);
}

// A darkened copy of a texture (image or graphics), for the recessed inside faces of nest hoops.
function darkenTex(tex, shade) {
  const g = createGraphics(tex.width, tex.height);
  g.pixelDensity(1);
  g.image(tex, 0, 0, tex.width, tex.height);
  g.noStroke();
  g.fill(0, 255 - shade);
  g.rect(0, 0, tex.width, tex.height);
  return freezeTexture(g);
}

const CAP_TEX_SIZE = 512;

function buildGridTexture(bg, color, w, h, gap) {
  const g = createGraphics(CAP_TEX_SIZE, CAP_TEX_SIZE);
  g.pixelDensity(1);
  g.background(bg);
  g.noStroke();
  g.fill(color);
  const pitchX = w + gap, pitchY = h + gap;
  const nx = Math.max(1, Math.floor((CAP_TEX_SIZE + gap) / pitchX));
  const ny = Math.max(1, Math.floor((CAP_TEX_SIZE + gap) / pitchY));
  const startX = (CAP_TEX_SIZE - (nx * pitchX - gap)) / 2;
  const startY = (CAP_TEX_SIZE - (ny * pitchY - gap)) / 2;
  for (let i = -1; i <= nx; i++) {
    for (let j = -1; j <= ny; j++) {
      g.rect(startX + i * pitchX, startY + j * pitchY, w, h);
    }
  }
  return freezeTexture(g);
}

function buildComboGridTexture(bg, cBig, cSmall, big, gap) {
  const g = createGraphics(CAP_TEX_SIZE, CAP_TEX_SIZE);
  g.pixelDensity(1);
  g.background(bg);
  g.noStroke();
  const pitch = big + gap;
  const n = Math.max(1, Math.floor((CAP_TEX_SIZE + gap) / pitch));
  const start = (CAP_TEX_SIZE - (n * pitch - gap)) / 2;
  g.fill(cBig);
  for (let i = -1; i <= n; i++)
    for (let j = -1; j <= n; j++)
      g.rect(start + i * pitch, start + j * pitch, big, big);
  g.fill(cSmall);
  for (let i = -1; i <= n; i++)
    for (let j = -1; j <= n; j++)
      g.rect(start + i * pitch + big, start + j * pitch, gap, gap);
  return freezeTexture(g);
}

function buildRadialGradient(cInner, cOuter) {
  const g = createGraphics(CAP_TEX_SIZE, CAP_TEX_SIZE);
  g.pixelDensity(1);
  const a = color(cInner), b = color(cOuter);
  g.background(b);
  g.noStroke();
  const c = CAP_TEX_SIZE / 2, maxR = CAP_TEX_SIZE / 2;
  for (let r = maxR; r >= 1; r--) {
    g.fill(lerpColor(a, b, r / maxR));
    g.circle(c, c, r * 2);
  }
  return freezeTexture(g);
}

function buildStippleTexture(bg, dotColor, dotR, pad, count) {
  const g = createGraphics(CAP_TEX_SIZE, CAP_TEX_SIZE);
  g.pixelDensity(1);
  g.background(bg);
  g.noStroke();
  g.fill(dotColor);
  const minDist = dotR * 2 + pad;
  const md2 = minDist * minDist;
  const cell = minDist;
  const cols = Math.ceil(CAP_TEX_SIZE / cell);
  const buckets = new Array(cols * cols);
  let placed = 0, tries = 0;
  const maxTries = count * 30;
  while (placed < count && tries < maxTries) {
    tries++;
    const x = random(CAP_TEX_SIZE), y = random(CAP_TEX_SIZE);
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    let ok = true;
    for (let a = -1; a <= 1 && ok; a++) {
      for (let b = -1; b <= 1 && ok; b++) {
        const nx = cx + a, ny = cy + b;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= cols) continue;
        const arr = buckets[nx + ny * cols];
        if (arr) for (const p of arr) { const dx = p.x - x, dy = p.y - y; if (dx * dx + dy * dy < md2) { ok = false; break; } }
      }
    }
    if (ok) {
      const idx = cx + cy * cols;
      if (!buckets[idx]) buckets[idx] = [];
      buckets[idx].push({ x, y });
      g.circle(x, y, dotR * 2);
      placed++;
    }
  }
  return freezeTexture(g);
}

// STRIP_H is sized so the strip's aspect matches the onion band's arc-per-rep : thickness
// (arc-per-rep uses the onion rep count, which is in effect once onion > 0.5), which keeps the
// square/dot shapes square. The short height means only a horizontal slice of the pattern shows — intended.
const STRIP_W = 512, STRIP_H = 64;

function buildStripTexture(kind, c0, c1) {
  const g = createGraphics(STRIP_W, STRIP_H);
  g.pixelDensity(1);
  g.background(c0);
  g.noStroke();
  g.fill(c1);
  if (kind === 'bars') {
    const bh = 10, pitch = bh + 9;
    for (let y = -pitch; y <= STRIP_H + pitch; y += pitch) g.rect(0, y, STRIP_W, bh);
  } else if (kind === 'lines') {
    g.stroke(c1);
    g.strokeWeight(2);
    for (let y = 6; y <= STRIP_H; y += 13) g.line(0, y, STRIP_W, y);
  } else if (kind === 'grad') {
    const a = color(c0), b = color(c1);
    for (let y = 0; y < STRIP_H; y++) { g.fill(lerpColor(a, b, y / (STRIP_H - 1))); g.rect(0, y, STRIP_W, 1); }
  } else if (kind === 'grid') {
    const sq = 10, pitch = sq + 14;
    for (let x = -pitch; x <= STRIP_W + pitch; x += pitch)
      for (let y = -pitch; y <= STRIP_H + pitch; y += pitch) g.rect(x, y, sq, sq);
  } else if (kind === 'dots') {
    const minD = 12, md2 = minD * minD, cell = minD;
    const cols = Math.ceil(STRIP_W / cell), rows = Math.ceil(STRIP_H / cell);
    const buckets = new Array(cols * rows);
    let placed = 0, tries = 0;
    while (placed < 900 && tries < 30000) {
      tries++;
      const x = random(STRIP_W), y = random(STRIP_H);
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
      let ok = true;
      for (let a = -1; a <= 1 && ok; a++) for (let bb = -1; bb <= 1 && ok; bb++) {
        const nx = cx + a, ny = cy + bb;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const arr = buckets[nx + ny * cols];
        if (arr) for (const p of arr) { const dx = p.x - x, dy = p.y - y; if (dx * dx + dy * dy < md2) { ok = false; break; } }
      }
      if (ok) { const idx = cx + cy * cols; if (!buckets[idx]) buckets[idx] = []; buckets[idx].push({ x, y }); g.circle(x, y, 5); placed++; }
    }
  }
  return freezeTexture(g);
}

function buildLineGridTexture(bg, lineColor, cell, weight) {
  const g = createGraphics(CAP_TEX_SIZE, CAP_TEX_SIZE);
  g.pixelDensity(1);
  g.background(bg);
  g.stroke(lineColor);
  g.strokeWeight(weight);
  for (let x = 0; x <= CAP_TEX_SIZE; x += cell) g.line(x, 0, x, CAP_TEX_SIZE);
  for (let y = 0; y <= CAP_TEX_SIZE; y += cell) g.line(0, y, CAP_TEX_SIZE, y);
  return freezeTexture(g);
}

function buildGradientSquare(cA, cB) {
  const g = createGraphics(CAP_TEX_SIZE, CAP_TEX_SIZE);
  g.pixelDensity(1);
  const a = color(cA), b = color(cB);
  g.background(a);
  g.noStroke();
  for (let y = 0; y < CAP_TEX_SIZE; y++) {
    g.fill(lerpColor(a, b, y / (CAP_TEX_SIZE - 1)));
    g.rect(0, y, CAP_TEX_SIZE, 1);
  }
  return freezeTexture(g);
}

// An even 2D grid of circles whose radius grows from 0 at the center out to the edges.
function buildDotFieldTexture(bg, dotColor, pitch = 48, maxR = 20) {
  const g = createGraphics(CAP_TEX_SIZE, CAP_TEX_SIZE);
  g.pixelDensity(1);
  g.background(bg);
  g.noStroke();
  g.fill(dotColor);
  const c = CAP_TEX_SIZE / 2;
  const count = Math.round(CAP_TEX_SIZE / pitch);
  const start = c - (count - 1) * pitch / 2;
  for (let i = 0; i < count; i++) {
    for (let j = 0; j < count; j++) {
      const x = start + i * pitch;
      const y = start + j * pitch;
      const r = maxR * Math.min(1, Math.hypot(x - c, y - c) / c);
      if (r > 0.5) g.circle(x, y, r * 2);
    }
  }
  return freezeTexture(g);
}

// Extra band strips (same 5:1 aspect as the dropped-in strip PNGs) for the onion inner wall / nest layers.
const BAND_W = 1000, BAND_H = 200;

function buildGridStrip(bg, lineColor, cell = 50, weight = 3) {
  const g = createGraphics(BAND_W, BAND_H);
  g.pixelDensity(1);
  g.background(bg);
  g.stroke(lineColor);
  g.strokeWeight(weight);
  for (let x = 0; x <= BAND_W; x += cell) g.line(x, 0, x, BAND_H);
  for (let y = 0; y <= BAND_H; y += cell) g.line(0, y, BAND_W, y);
  return freezeTexture(g);
}

function buildStippleStrip(bg, dotColor, dotR = 3, pad = 8, count = 500) {
  const g = createGraphics(BAND_W, BAND_H);
  g.pixelDensity(1);
  g.background(bg);
  g.noStroke();
  g.fill(dotColor);
  const md2 = (dotR * 2 + pad) ** 2, cell = dotR * 2 + pad;
  const cols = Math.ceil(BAND_W / cell), rows = Math.ceil(BAND_H / cell);
  const buckets = new Array(cols * rows);
  let placed = 0, tries = 0;
  while (placed < count && tries < count * 40) {
    tries++;
    const x = random(BAND_W), y = random(BAND_H);
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    let ok = true;
    for (let a = -1; a <= 1 && ok; a++) for (let b = -1; b <= 1 && ok; b++) {
      const nx = cx + a, ny = cy + b;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const arr = buckets[nx + ny * cols];
      if (arr) for (const p of arr) { const dx = p.x - x, dy = p.y - y; if (dx * dx + dy * dy < md2) { ok = false; break; } }
    }
    if (ok) { const idx = cx + cy * cols; if (!buckets[idx]) buckets[idx] = []; buckets[idx].push({ x, y }); g.circle(x, y, dotR * 2); placed++; }
  }
  return freezeTexture(g);
}

function drawTexturePreview(g) {
  if (!g) return;

  const w = 1000;
  const h = w * g.height / g.width;
  const x = -w / 2;
  const y = -CANVAS_H / 2 + 20;

  push();
    noStroke();
    imageMode(CORNER);
    image(g, x, y, w, h);

    noFill();
    stroke(0, 180, 255);
    strokeWeight(1);
    rectMode(CORNER);
    rect(x, y, w, h);
  pop();
}
