# PCD @ Seoul 2026 — Poster Lab

Creative-code and motion-graphics explorations for **[Processing Community Day @ Seoul 2026](https://pcd2026.creative-computing.org/)** — *Creative Coding in the Age of Vibe Coding*.

| | |
| --- | --- |
| 일시 | 2026.10.31 (토) 12:30 – 17:30 |
| 장소 | 서강대학교 아트&테크놀로지학과 |
| 공식 사이트 | [pcd2026.creative-computing.org](https://pcd2026.creative-computing.org/) |

An A2-ratio canvas (1191 × 1684 px, 420 × 594 mm at 72 dpi) sits on the left; a parameter panel sits on the right. Each experiment is a self-contained p5.js sketch with GSAP motion, live sliders, and PNG / MP4 export (Rec starts at the current frame and stops when pressed again; Two Shapes is encoded at a steady 120 fps, the others record live).

## Run

From the repo root (no build step):

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open http://127.0.0.1:8000. The URL hash selects an experiment, e.g. `#type-fill`.

| Key | Action |
| --- | --- |
| Space | Play / pause |
| S | Save PNG |
| ← → | Previous / next experiment |

Params persist in `localStorage` under `pcd-lab:<id>`. Export density (1–3×) multiplies `pixelDensity` for stills.

## Pretext Layout

`pretext/` is a separate tool: an A2 canvas with a panel on the right. Text boxes are laid out by [Pretext](https://github.com/chenglou/pretext) in ABC Areal; drag a box to move it, drag its right edge to change the wrap width. Open http://127.0.0.1:8000/pretext/.

Under the text sits a data layer crawled by `pretext/data/crawl.py` into `pretext/data/data.json` (public GitHub + Discourse APIs, about 6 min unauthenticated; set `GITHUB_TOKEN` to go faster):

- **growth**: repositories created per year, Processing language (ink) + p5.js projects (accent). Text set to *Flow around data* wraps around the bars line by line through Pretext's `layoutNextLine()`.
- **people**: the 519 unique contributors to `processing/processing`, `processing4` and `p5.js`, as dots sized by commits. Here the dots move out of the text's way.

Flowing boxes also flow around boxes earlier in the list. Caveats: GitHub only starts in 2008, the forum totals cover only the Discourse forum (2018 onwards), and the 2026 p5.js count is a full-text search, so it also matches projects that only mention p5.js.

## Layout

```
index.html          main poster: Two Shapes (main/)
lab.html            experiment lab
main/               the main poster sketch and its entry
app/                shared shell: panel, clock, param schema, poster helpers
experiments/        one file per direction
pretext/            draggable Pretext text-box layout tool
vendor/             p5.js, GSAP, OFL fonts
reference/          Processing 25 study + still references
```

## Experiments

| id | Title | Idea |
| --- | --- | --- |
| `type-fill` | Type Fill | Event copy stretched to fill the poster; GSAP pop / flip / wave |
| `splat-field` | Splat Field | Anisotropic Gaussian-style quads assembling the letterforms |
| `gravity-letters` | Gravity Letters | Extruded 3D letters with rigid-body physics and mixed shaders |
| `wave-type` | Wave Type | Arc-length sine lines with a rippling Inter variable weight |
| `pretext-flow` | Pretext Flow | One ABC Areal paragraph that always fills the poster; a growing word squeezes its neighbours (mostly the lines above and below) and Pretext re-breaks the text every frame |

## Adding an experiment

Export a default object from `experiments/` and add it to the list in `app/lab.js`.

```js
export default {
  id: 'my-exp',
  title: 'My Experiment',
  description: 'One or two sentences.',
  renderer: 'p2d', // or 'webgl'
  palettes: [['#111', '#fff']],
  params: [
    { type: 'section', label: 'Type' },
    { key: 'size', type: 'range', label: 'Size', min: 1, max: 10, step: 0.1, value: 4 },
    { key: 'on', type: 'toggle', label: 'Enabled', value: true },
    { key: 'mode', type: 'select', label: 'Mode', options: ['a', 'b'], value: 'a' },
    { key: 'title', type: 'text', label: 'Title', value: 'PCD' },
    { key: 'palette', type: 'palette', label: 'Palette', value: ['#111', '#fff'] },
  ],
  create(p, P, api) {
    return {
      onParam(key) {},
      dispose() {},
      draw() {},
    };
  },
};
```

`type` is `range` | `toggle` | `select` | `text` | `palette` | `section`. Set `rebuild: true` to remount when that param changes; otherwise `onParam(key)` runs.

`api` gives `clock.t` / `clock.dt` (already multiplied by speed), `timeline` / `to` / `track` / `killTweens` (killed on unmount), and `W` `H` `U`. Shared drawing helpers live in `app/lib/poster.js` and modular glyphs in `app/lib/glyphs.js`.

## Reference

- [`reference/`](reference/) — local study of the Processing Foundation **Processing 25** opening sketch (hoop mesh, scrolling type, slider morphs). See [`reference/README.md`](reference/README.md).
- [`reference/images/`](reference/images/) — stills that directed the lab: ISO-style parameter panel, Bienal 26 geometric type, riso collage, airbrush glitch, checkbox grid, wave date type.

## License & credits

- PCD @ Seoul is organized by Creative Computing Group; this repo is an independent production workspace unless otherwise noted per experiment.
- [p5.js](https://p5js.org/) 1.11.13 — LGPL. See `vendor/p5.LICENSE.txt`.
- [GSAP](https://gsap.com/) 3.15 — [standard no-charge license](https://gsap.com/standard-license). See `vendor/gsap.README.md`.
- [Pretext](https://github.com/chenglou/pretext) 1.0.0 — MIT. See `vendor/pretext/LICENSE`.
- [ABC Areal](https://abcdinamo.com/typefaces/areal) (Dinamo), free font, in `vendor/fonts/areal/`.
- Fonts (SIL OFL): [Archivo Black](https://fonts.google.com/specimen/Archivo+Black), [Space Mono](https://fonts.google.com/specimen/Space+Mono), [Inter](https://rsms.me/inter/). License files sit next to the fonts in `vendor/fonts/`.
- Processing 25 reference sketch: [Kiel Danger Mutschelknaus](https://www.kielm.com/) / [Processing Foundation](https://processingfoundation.org/). See [`reference/README.md`](reference/README.md).
