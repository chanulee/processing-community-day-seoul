// Data layers drawn under the text. Each layer can draw itself and report which x-intervals
// it occupies inside a horizontal band, so Pretext lines can flow around it.

const mulberry = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Repositories created per year: Processing-language repos stacked under p5.js projects.
export function growthLayer(data, { W, H, margin, height, cumulative, gap, pad }) {
  const all = Object.keys(data.processing_repos).map(Number).sort((a, b) => a - b);
  // GitHub opened in 2008, so the earliest years are empty; start at the first year with data.
  const years = all.slice(all.findIndex((y) => data.processing_repos[y] + (data.p5_repos?.[y] || 0) > 0));
  let accP = 0;
  let accJ = 0;
  const rows = years.map((y) => {
    accP += data.processing_repos[y];
    accJ += data.p5_repos?.[y] || 0;
    return cumulative
      ? { year: y, p: accP, j: accJ }
      : { year: y, p: data.processing_repos[y], j: data.p5_repos?.[y] || 0 };
  });
  const max = Math.max(...rows.map((r) => r.p + r.j));
  const x0 = margin;
  const span = W - margin * 2;
  const colW = span / rows.length;
  const floor = H - margin;
  const top = floor - height;
  const bars = rows.map((r, i) => {
    const hp = (r.p / max) * height;
    const hj = (r.j / max) * height;
    return { ...r, x: x0 + i * colW + gap / 2, w: colW - gap, yp: floor - hp, yj: floor - hp - hj };
  });

  return {
    name: 'growth',
    yieldsText: true,
    draw(ctx, { ink, accent, labels }) {
      for (const b of bars) {
        ctx.fillStyle = ink;
        ctx.fillRect(b.x, b.yp, b.w, floor - b.yp);
        ctx.fillStyle = accent;
        ctx.fillRect(b.x, b.yj, b.w, b.yp - b.yj);
      }
      if (!labels) return;
      ctx.save();
      ctx.font = '400 13px Areal';
      ctx.textAlign = 'center';
      ctx.fillStyle = ink;
      for (const b of bars) {
        ctx.save();
        ctx.translate(b.x + b.w / 2, b.yj - 8);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'left';
        ctx.fillText(`${b.year} · ${(b.p + b.j).toLocaleString('en')}`, 0, 4);
        ctx.restore();
      }
      ctx.restore();
    },
    blocked(y0, y1) {
      if (y1 < top - pad) return [];
      return bars.filter((b) => y1 > b.yj - pad).map((b) => [b.x - pad, b.x + b.w + pad]);
    },
  };
}

// Every contributor to Processing, Processing 4 and p5.js as a dot sized by their commits.
export function peopleLayer(data, { W, H, margin, scale, pad, seed }) {
  const byLogin = new Map();
  for (const list of Object.values(data.contributors)) {
    for (const c of list) byLogin.set(c.login, (byLogin.get(c.login) || 0) + c.n);
  }
  const people = [...byLogin].map(([login, n]) => ({ login, n })).sort((a, b) => b.n - a.n);
  const rnd = mulberry(seed);
  const placed = [];
  // Rejection placement, largest first, so big contributors claim space and small ones fill in.
  for (const p of people) {
    const r = Math.max(2.5, Math.sqrt(p.n) * scale);
    for (let tries = 0; tries < 400; tries++) {
      const x = margin + r + rnd() * (W - 2 * margin - 2 * r);
      const y = margin + r + rnd() * (H - 2 * margin - 2 * r);
      if (placed.every((q) => (q.x - x) ** 2 + (q.y - y) ** 2 > (q.r + r + 2) ** 2)) {
        placed.push({ ...p, x, y, r });
        break;
      }
    }
  }

  return {
    name: 'people',
    yieldsText: false,
    count: people.length,
    // Dots make way for the text: any dot touching an inked line is pushed out past its nearest edge.
    draw(ctx, { ink, accent, labels, text = [] }) {
      const shown = placed.map((d) => {
        let { x, y } = d;
        for (let pass = 0; pass < 3; pass++) {
          for (const r of text) {
            const R = d.r + pad;
            if (x + R <= r.x || x - R >= r.x + r.w || y + R <= r.y || y - R >= r.y + r.h) continue;
            const moves = [[r.x - R - x, 0], [r.x + r.w + R - x, 0], [0, r.y - R - y], [0, r.y + r.h + R - y]];
            const [mx, my] = moves.reduce((a, m) => (Math.abs(m[0] + m[1]) < Math.abs(a[0] + a[1]) ? m : a));
            x += mx;
            y += my;
          }
        }
        return { ...d, x, y };
      });
      for (const d of shown) {
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = d.r > 14 ? accent : ink;
        ctx.fill();
      }
      if (!labels) return;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const d of shown) {
        const size = Math.min(d.r * 0.42, 22);
        if (size < 6) continue;
        ctx.font = `500 ${size}px Areal`;
        if (ctx.measureText(d.login).width > d.r * 1.8) continue;
        ctx.fillStyle = '#fff';
        ctx.fillText(d.login, d.x, d.y);
      }
      ctx.textBaseline = 'alphabetic';
    },
    blocked(y0, y1) {
      const out = [];
      for (const d of placed) {
        const R = d.r + pad;
        // Half-width of the circle at the band row closest to its centre.
        const dy = d.y < y0 ? y0 - d.y : d.y > y1 ? d.y - y1 : 0;
        if (dy >= R) continue;
        const hw = Math.sqrt(R * R - dy * dy);
        out.push([d.x - hw, d.x + hw]);
      }
      return out;
    },
  };
}

// Widest free interval inside [x0, x1] after removing blocked intervals; null if narrower than minW.
export function freeInterval(x0, x1, blocked, minW) {
  const bs = blocked.filter(([a, b]) => b > x0 && a < x1).sort((p, q) => p[0] - q[0]);
  let best = null;
  let cur = x0;
  for (const [a, b] of bs) {
    if (a > cur && (!best || a - cur > best[1] - best[0])) best = [cur, a];
    cur = Math.max(cur, b);
  }
  if (x1 > cur && (!best || x1 - cur > best[1] - best[0])) best = [cur, x1];
  return best && best[1] - best[0] >= minW ? best : null;
}
