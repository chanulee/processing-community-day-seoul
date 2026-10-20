import { W, H, U, clamp, drawInfo, makeOverlay, blitOverlay } from '../app/lib/poster.js';

// 5 × 7 pixel font. '#' is a voxel.
const FONT5 = {
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  G: ['.####', '#....', '#....', '#.###', '#...#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
};
const COLS = 5;
const ROWS = 7;
const GRID = 9; // a face is GRID voxels wide; the 5 × 7 glyph sits centred with a margin

export default {
  id: 'letter-cube',
  title: 'Letter Cube',
  description: 'A lit 3D cube seen from a three-quarter angle turns one face at a time, and each face pushes a voxel letter out of its surface: P C D S E O U L 2 0 2 6. Drop the perspective to zero for the isometric view, where the blocks read both as standing out and as cut in. Drag to orbit.',
  renderer: 'webgl',
  palettes: [
    ['#f4f1ea', '#e6e1d3', '#e03a2f', '#0b0b12'],
    ['#0b0b12', '#2a2a3a', '#c8ff2e', '#0b0b12'],
    ['#1a3cff', '#f4f1ea', '#ff5a1f', '#0b0b12'],
    ['#ffffff', '#ffffff', '#000000', '#000000'],
  ],
  params: [
    { type: 'section', label: 'Sequence' },
    { key: 'seq', type: 'text', label: 'Letters', value: 'PCDSEOUL2026' },
    { key: 'dur', type: 'range', label: 'Turn', min: 0.2, max: 4, step: 0.05, value: 1.1, unit: 's' },
    { key: 'hold', type: 'range', label: 'Hold', min: 0, max: 4, step: 0.05, value: 0.9, unit: 's' },
    { key: 'ease', type: 'select', label: 'Ease', options: ['power3.inOut', 'expo.inOut', 'back.inOut(1.4)', 'elastic.out(1,0.7)', 'none'], value: 'power3.inOut' },
    { key: 'axis', type: 'select', label: 'Turn axis', note: 'tumble alternates Y and X turns', options: ['Y', 'tumble'], value: 'Y' },

    { type: 'section', label: 'Camera' },
    { key: 'pitch', type: 'range', label: 'Pitch', note: '35.26° = isometric', min: -80, max: 80, step: 0.01, value: 28, unit: '°' },
    { key: 'yaw', type: 'range', label: 'Yaw', note: 'Three-quarter view at 30–45°', min: -90, max: 90, step: 0.5, value: 35, unit: '°' },
    { key: 'fov', type: 'range', label: 'Perspective', note: '0 = orthographic / isometric', min: 0, max: 90, step: 1, value: 32, unit: '°' },
    { key: 'size', type: 'range', label: 'Cube size', min: 0.2, max: 0.9, step: 0.01, value: 0.42 },
    { key: 'orbit', type: 'range', label: 'Drift', min: 0, max: 1, step: 0.01, value: 0.15 },

    { type: 'section', label: 'Letters' },
    { key: 'depth', type: 'range', label: 'Extrusion', note: 'In voxels', min: 0.1, max: 6, step: 0.05, value: 1.6 },
    { key: 'gap', type: 'range', label: 'Voxel gap', min: 0, max: 0.4, step: 0.01, value: 0.04 },
    { key: 'carve', type: 'toggle', label: 'Carve instead', note: 'Push the letter into the cube instead of out', value: false },
    { key: 'top', type: 'toggle', label: 'Letter on lid', value: true },
    { key: 'edge', type: 'range', label: 'Edge line', min: 0, max: 4, step: 0.1, value: 0.8, unit: 'px' },

    { type: 'section', label: 'Light' },
    { key: 'ambient', type: 'range', label: 'Ambient', min: 0, max: 1, step: 0.01, value: 0.45 },
    { key: 'key', type: 'range', label: 'Key light', min: 0, max: 1.5, step: 0.01, value: 0.75 },
    { key: 'shine', type: 'range', label: 'Specular', min: 0, max: 1, step: 0.01, value: 0.15 },

    { type: 'section', label: 'Colour' },
    { key: 'palette', type: 'palette', label: 'Palette · bg / cube / letter / edge', value: ['#f4f1ea', '#e6e1d3', '#e03a2f', '#0b0b12'] },
    { key: 'info', type: 'select', label: 'Info block', options: ['none', 'bottom', 'top', 'corners'], value: 'bottom' },
  ],

  create(p, P, api) {
    let overlay = null;
    let drag = null;
    let userYaw = 0;
    let userPitch = 0;
    const buildOverlay = () => {
      overlay = P.info === 'none' ? null : makeOverlay(p, (ctx) => {
        // The overlay quad lands upside down after this camera setup, so pre-flip it.
        ctx.translate(0, H);
        ctx.scale(1, -1);
        drawInfo(ctx, { layout: P.info, color: P.palette[3], margin: 44 * U });
      });
    };
    buildOverlay();

    const glyphs = () => [...P.seq.toUpperCase()].filter((c) => FONT5[c]);
    const wrap = (i, n) => ((i % n) + n) % n;

    // One letter of voxels on the current face plane (z = cube half size), facing +z.
    function letter(ch, half, cell, col) {
      const rows = FONT5[ch];
      if (!rows) return;
      const d = cell * P.depth;
      const s = cell * (1 - P.gap);
      p.fill(col);
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          if (rows[y][x] !== '#') continue;
          p.push();
          p.translate((x - (COLS - 1) / 2) * cell, (y - (ROWS - 1) / 2) * cell, P.carve ? half - d / 2 + 0.5 : half + d / 2);
          p.box(s, s, P.carve ? d + 1 : d);
          p.pop();
        }
      }
    }

    return {
      onParam(key) { if (key === 'info' || key === 'palette') buildOverlay(); },
      mousePressed() { drag = { x: p.mouseX, y: p.mouseY, yaw: userYaw, pitch: userPitch }; },
      mouseDragged() {
        if (!drag) return;
        userYaw = drag.yaw + (p.mouseX - drag.x) * 0.006;
        userPitch = drag.pitch - (p.mouseY - drag.y) * 0.006;
      },
      mouseReleased() { drag = null; },
      draw() {
        const [bg, cubeCol, letterCol, edgeCol] = P.palette;
        const t = api.clock.t;
        p.background(bg);

        // Camera: perspective, or orthographic when the field of view is zero.
        const fov = Math.max(1, P.fov) * (Math.PI / 180);
        const z = H / 2 / Math.tan(fov / 2);
        if (P.fov < 1) p.ortho(-W / 2, W / 2, -H / 2, H / 2, -W * 4, W * 4);
        else p.perspective(fov, W / H, z / 20, z * 20);
        p.camera(0, 0, P.fov < 1 ? W * 2 : z, 0, 0, 0, 0, 1, 0);

        const seq = glyphs();
        if (!seq.length) return;
        const period = P.dur + P.hold;
        const k = Math.floor(t / period);
        const f = clamp((t - k * period - P.hold) / P.dur);
        const e = api.gsap.parseEase(P.ease)(f);
        const front = k;

        // Light from the upper left, in camera space so the shading stays put while the cube turns.
        const amb = P.ambient * 255;
        p.ambientLight(amb, amb, amb);
        const kl = P.key * 255;
        p.directionalLight(kl, kl, kl, -0.5, 0.8, -0.6);
        p.directionalLight(kl * 0.35, kl * 0.35, kl * 0.35, 0.7, -0.2, -0.4);
        p.specularMaterial(P.shine * 255);
        p.shininess(30);

        p.push();
        p.rotateX((-P.pitch * Math.PI) / 180 + userPitch + Math.sin(t * 0.21) * P.orbit * 0.2);
        p.rotateY((-P.yaw * Math.PI) / 180 + userYaw + Math.sin(t * 0.13) * P.orbit * 0.3);

        const S = W * P.size;
        const half = S / 2;
        const cell = S / GRID;
        if (P.edge > 0) { p.stroke(edgeCol); p.strokeWeight(P.edge * U); } else p.noStroke();

        // Turn: Y axis every step, or tumble between Y and X so the lid comes round too.
        const tumbleX = P.axis === 'tumble' && k % 2 === 1;
        if (P.axis === 'tumble') {
          // Completed turns, then the current one. Each completed pair is a Y then an X quarter turn.
          for (let i = 0; i < k; i++) (i % 2 ? p.rotateX(-Math.PI / 2) : p.rotateY(-Math.PI / 2));
          (tumbleX ? p.rotateX(-e * Math.PI / 2) : p.rotateY(-e * Math.PI / 2));
        } else {
          p.rotateY(-(k + e) * Math.PI / 2);
        }

        p.fill(cubeCol);
        p.box(S, S, S);

        // Face slots: in Y mode side j shows the letter for the turn that brings it to the front.
        if (P.axis === 'Y') {
          for (let j = -1; j <= 2; j++) {
            p.push();
            p.rotateY(((front + j) * Math.PI) / 2);
            letter(seq[wrap(front + j, seq.length)], half, cell, letterCol);
            p.pop();
          }
          if (P.top) {
            p.push();
            p.rotateX(Math.PI / 2);
            letter(seq[wrap(front + 1, seq.length)], half, cell, letterCol);
            p.pop();
          }
        } else {
          // Tumble: put letters on all six faces, current on the face turning toward us.
          const faces = [[0, 0], [Math.PI / 2, 0], [Math.PI, 0], [-Math.PI / 2, 0], [0, Math.PI / 2], [0, -Math.PI / 2]];
          faces.forEach(([ry, rx], i) => {
            p.push();
            p.rotateY(ry);
            p.rotateX(rx);
            letter(seq[wrap(front + i, seq.length)], half, cell, letterCol);
            p.pop();
          });
        }
        p.pop();
        p.noLights();
        blitOverlay(p, overlay);
      },
    };
  },
};
