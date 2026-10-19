// Modular 5 × 7 letterforms. Each cell code is a primitive inside a unit cell (y down):
//   #  full square            .  empty
//   1  quarter disc, rounds the top-left corner     2  rounds top-right
//   3  rounds bottom-right                          4  rounds bottom-left
//   b  triangle filling the lower-right half        d  triangle filling the upper-left half
export const GLYPHS = {
  P: ['####2', '#...#', '#...#', '####3', '#....', '#....', '#....'],
  C: ['1###2', '#....', '#....', '#....', '#....', '#....', '4###3'],
  D: ['####2', '#...#', '#...#', '#...#', '#...#', '#...#', '####3'],
  2: ['1###2', '#...#', '....#', '..b#3', '.b#d.', 'b#d..', '#####'],
  0: ['1###2', '#...#', '#..b#', '#.bd#', '#bd.#', '#d..#', '4###3'],
  6: ['1###2', '#....', '#....', '####2', '#...#', '#...#', '4###3'],
  S: ['1###2', '#....', '#....', '4###2', '....#', '....#', '4###3'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  O: ['1###2', '#...#', '#...#', '#...#', '#...#', '#...#', '4###3'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '4###3'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  5: ['#####', '#....', '#....', '####2', '....#', '....#', '4###3'],
};
export const GW = 5;
export const GH = 7;

export function glyphCells(ch) {
  const rows = GLYPHS[ch];
  const cells = [];
  if (!rows) return cells;
  rows.forEach((row, y) => [...row].forEach((code, x) => code !== '.' && cells.push({ x, y, code })));
  return cells;
}

export function cellHit(code, fx, fy) {
  switch (code) {
    case '#': return true;
    case '1': return (1 - fx) ** 2 + (1 - fy) ** 2 <= 1;
    case '2': return fx ** 2 + (1 - fy) ** 2 <= 1;
    case '3': return fx ** 2 + fy ** 2 <= 1;
    case '4': return (1 - fx) ** 2 + fy ** 2 <= 1;
    case 'b': return fx + fy >= 1;
    case 'd': return fx + fy <= 1;
    default: return false;
  }
}

const QUARTER = { 1: [1, 1, 180], 2: [0, 1, 270], 3: [0, 0, 0], 4: [1, 0, 90] };

// Convex polygon (unit cell, y down) for a cell code.
export function cellPolygon(code, seg = 12) {
  if (code === '#') return [[0, 0], [1, 0], [1, 1], [0, 1]];
  if (code === 'b') return [[1, 0], [1, 1], [0, 1]];
  if (code === 'd') return [[0, 0], [1, 0], [0, 1]];
  const q = QUARTER[code];
  if (!q) return [];
  const [cx, cy, a0] = q;
  const pts = [[cx, cy]];
  for (let i = 0; i <= seg; i++) {
    const a = ((a0 + (90 * i) / seg) * Math.PI) / 180;
    pts.push([cx + Math.cos(a), cy + Math.sin(a)]);
  }
  return pts;
}

export function pathCell(ctx, code, x, y, s) {
  const poly = cellPolygon(code, 16);
  if (!poly.length) return;
  ctx.moveTo(x + poly[0][0] * s, y + poly[0][1] * s);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(x + poly[i][0] * s, y + poly[i][1] * s);
  ctx.closePath();
}
