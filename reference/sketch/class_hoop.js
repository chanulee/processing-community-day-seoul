// Where the texture seam sits, as an offset to the band's start angle. -HALF_PI points it
// toward the right of the canvas (instead of the front) so it reads less prominently.
const SEAM_ANGLE = -Math.PI / 2;

// ── Vertex debug ────────────────────────────────────────────────────────────
// With `debug` on, every display method also draws the vertices it just emitted: a point per
// vertex() call, a rung joining each triangle-strip pair, and a running tally of the frame's
// real vertex/shape count for the HUD.
//   orange  = the v=1 edge (top of the band)     cyan  = the v=0 edge (bottom)
//   yellow  = the ends of each strip — the texture seam and the front split
// DEBUG_STRIDE thins the drawn points out; at segments=160 every vertex is an unreadable smear.
// The TALLY always counts the real mesh, never the thinned overlay.
let DEBUG_STRIDE = 8;
let dbgVerts = 0, dbgShapes = 0;
const DBG_OFF = 2;   // sit this far proud of the surface, so the overlay isn't z-fought by it

class Hoop {
  constructor() {
    this.radius = 220;
    this.bandH = 75;
    this.segments = MOBILE.segments;
    const circle = Array.from({ length: this.segments + 1 }, (_, p) => {
      const a = p / this.segments * TWO_PI;
      return { x: Math.cos(a + SEAM_ANGLE), y: Math.sin(a + SEAM_ANGLE),
               capX: Math.cos(a), capY: Math.sin(a) };
    });
    const splitP = Math.round(-SEAM_ANGLE / TWO_PI * this.segments);
    this.mesh = new HoopMesh(circle, this.segments,
      [[0, splitP, 1], [splitP, this.segments, 0]], [[0, this.segments, 0]]);

    this.degStep = TWO_PI/this.segments;
    this.segLength = this.radius * this.degStep;

    this.tex = null;
    this.hr = null;

    this.uOffset = 0;
    this.spinSpeed = 0.0005;
  }

  setTexture(g) {
    this.tex = g;
    this.hr = this.tex.width * this.bandH/this.tex.height;
  }

  update() {
    this.uOffset += this.spinSpeed;
  }

  springReps() {
    return this.hr ? Math.max(1, Math.round(TWO_PI * this.radius / this.hr)) : 1;
  }

  // Traces the vertices of one band, using the SAME position math as display(). Points are
  // batched into one shape per colour rather than looped point() calls — 21 rings of loose
  // point()/line() calls is thousands of draw calls a frame and tanks the very framerate
  // the HUD is trying to report.
  debugBand(halves, phase, radiusTop, radiusBot, top, bot, shear) {
    const topPts = [], botPts = [], endPts = [], rungs = [];
    for (const [pa, pb, zo] of halves) {
      const ps = [];
      for (let p = pa; p < pb; p += DEBUG_STRIDE) ps.push(p);
      ps.push(pb);   // always keep both ends, whatever the stride — that's where the seam is
      for (const p of ps) {
        const gt = p / this.segments;
        const a = gt * TWO_PI + SEAM_ANGLE;
        const z = shear * (gt - phase + zo);
        const ca = cos(a), sa = sin(a);
        const vT = [ca * (radiusTop + DBG_OFF), sa * (radiusTop + DBG_OFF), top + z];
        const vB = [ca * (radiusBot + DBG_OFF), sa * (radiusBot + DBG_OFF), bot + z];
        rungs.push(vT, vB);
        if (p === pa || p === pb) endPts.push(vT, vB);
        else { topPts.push(vT); botPts.push(vB); }
      }
    }

    const pts = (arr, w, cr, cg, cb) => {
      if (!arr.length) return;
      strokeWeight(w);
      stroke(cr, cg, cb);
      beginShape(POINTS);
      for (const v of arr) vertex(v[0], v[1], v[2]);
      endShape();
    };

    push();
      resetShader();
      noFill();
      noTint();
      strokeWeight(1);
      stroke(255, 255, 255, 80);
      beginShape(LINES);
      for (const v of rungs) vertex(v[0], v[1], v[2]);   // one rung = one triangle-strip step
      endShape();
      pts(topPts, 6, 255, 70, 0);
      pts(botPts, 6, 0, 210, 255);
      pts(endPts, 11, 255, 235, 0);
    pop();
  }

  display(scrollTiles = 0, shear = 0, radiusTop = this.radius, radiusBot = this.radius, thickness = this.bandH, flatten = 1, innerAlpha = 0, tex = null, innerTex = null, fixedReps = 0) {
    const outerTex = tex || this.tex;
    const inTex = innerTex || this.innerTex;
    push();
      noStroke();

      const top = -thickness / 2;
      const bot = thickness / 2;

      const hr = outerTex ? outerTex.width * this.bandH / outerTex.height : this.hr;
      const circumference = TWO_PI * (radiusTop + radiusBot) / 2;
      const slant = Math.sqrt((radiusTop - radiusBot) ** 2 + thickness ** 2);
      // Proportional UV: one texture width spans (texW/texH) of the band's slant height,
      // so U stays proportional to V and the type is never stretched. The count is fractional,
      // so with textureWrap(REPEAT) it tiles cleanly and just leaves a seam where it wraps.
      const reps = hr ? (circumference * this.bandH) / (hr * slant) : 1;

      // Split the band at `phase` (the front) into two strips. For a sheared spring coil the two
      // halves are z-offset so the coil's step opens as a GAP at the front (the "shearing shuffle"),
      // while the mesh still closes at gt 0/1 — so the texture seam stays hidden on the right,
      // decoupled from the coil step. For flat bands (shear 0) the split is invisible.
      const phase = -SEAM_ANGLE / TWO_PI;
      const splitP = Math.round(phase * this.segments);
      const halves = [[0, splitP, 1], [splitP, this.segments, 0]];

      if (outerTex) {
        textureMode(NORMAL);
        textureWrap(REPEAT);
        texture(outerTex);
      } else {
        fill(255);
      }
      this.mesh.band(radiusTop, radiusBot, top, bot, shear, reps, scrollTiles, -1, true);
      if (debug) { dbgShapes++; dbgVerts += (this.segments + 2) * 2; }

      if (innerAlpha > 0.5 && inTex) {
        const io = 3;
        // the inner wall gets its OWN proportional count from its OWN aspect, so a strip
        // texture loops at true proportion instead of being stretched to the outer's tiling.
        const inHr = inTex.width * this.bandH / inTex.height;
        const innerReps = (circumference * this.bandH) / (inHr * slant);
        textureMode(NORMAL);
        textureWrap(REPEAT);
        texture(inTex);
        tint(255, innerAlpha);
        this.mesh.band(radiusTop - io, radiusBot - io, top, bot, shear, innerReps, scrollTiles, 1, true);
        if (debug) { dbgShapes++; dbgVerts += (this.segments + 2) * 2; }
      }

      // the inner wall sits 3 units in from the outer, so its points would land right on top
      // of these — it's counted in the tally but not drawn, or the overlay just doubles up.
      if (debug) this.debugBand(halves, phase, radiusTop, radiusBot, top, bot, shear);

    pop();
  }

  // Draws a flat ring wall as a vertical STACK of sub-band layers, each with its own texture and
  // its own U scroll — the "subdivided hoop" look. Each layer maps its texture at true proportion
  // for its own height, so nothing is stretched, and REPEAT lets it tile with a seam on the right.
  displayLayered(radius, thickness, layers) {
    push();
      noStroke();
      textureMode(NORMAL);
      textureWrap(REPEAT);
      const n = layers.length;
      const layerH = thickness / n;
      const top0 = -thickness / 2;
      const circ = TWO_PI * radius;
      const io = 3;
      for (let m = 0; m < n; m++) {
        const tex = layers[m].tex;
        const texDark = layers[m].texDark;
        const scroll = layers[m].scroll;
        const zTop = top0 + m * layerH;
        const zBot = zTop + layerH;
        const reps = tex ? (circ * tex.height) / (tex.width * layerH) : 1;

        // outer face
        if (tex) texture(tex); else fill(255);
        this.mesh.band(radius, radius, zTop, zBot, 0, reps, scroll, -1);
        if (debug) { dbgShapes++; dbgVerts += (this.segments + 1) * 2; }

        // inner face: mirrored U so the type stays legible from inside, pre-darkened for depth
        if (texDark) {
          texture(texDark);
          this.mesh.band(radius - io, radius - io, zTop, zBot, 0, reps, scroll, 1);
          if (debug) { dbgShapes++; dbgVerts += (this.segments + 1) * 2; }
        }

        // one unsplit strip per layer, so the rungs show where each sub-band starts and ends
        if (debug) this.debugBand([[0, this.segments, 0]], 0, radius, radius, zTop, zBot, 0);
      }
    pop();
  }

  displayCaps(radiusTop, radiusBot, thickness = this.bandH, alpha = 255, tex = null, rot = 0) {
    const h = thickness / 2;
    push();
      noStroke();
      if (tex) {
        textureMode(NORMAL);
        textureWrap(CLAMP);
        texture(tex);
        tint(255, alpha);
      } else {
        fill(165, alpha);
      }
      rotateZ(rot);
      for (const [zc, rad] of [[-h, radiusTop], [h, radiusBot]]) {
        this.mesh.disk(rad, zc);
        if (debug) { dbgShapes++; dbgVerts += this.segments + 2; }
      }

      // the fan is a different animal from the strips: one hub vertex, then a rim. Spokes are
      // drawn to the hub so the fan topology reads as a fan and not another ring of points.
      if (debug) {
        const hub = [], rim = [], spokes = [];
        for (const [zc, rad] of [[-h, radiusTop], [h, radiusBot]]) {
          const z = zc + Math.sign(zc || 1) * DBG_OFF;
          hub.push([0, 0, z]);
          for (let p = 0; p < this.segments; p += DEBUG_STRIDE) {
            const a = (p / this.segments) * TWO_PI;
            const v = [cos(a) * rad, sin(a) * rad, z];
            rim.push(v);
            spokes.push([0, 0, z], v);
          }
        }
        push();
          resetShader();
          noFill();
          noTint();
          strokeWeight(1);
          stroke(255, 255, 255, 60);
          beginShape(LINES);
          for (const v of spokes) vertex(v[0], v[1], v[2]);
          endShape();
          strokeWeight(6);
          stroke(120, 255, 90);
          beginShape(POINTS);
          for (const v of rim) vertex(v[0], v[1], v[2]);
          endShape();
          strokeWeight(11);
          stroke(255, 235, 0);
          beginShape(POINTS);
          for (const v of hub) vertex(v[0], v[1], v[2]);
          endShape();
        pop();
      }
    pop();
  }
}
