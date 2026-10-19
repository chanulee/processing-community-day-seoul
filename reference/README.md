# Processing Foundation — Processing 25 sketch (reference)

Local study of the opening p5.js graphic on [Processing Foundation](https://processingfoundation.org/), inspected October 8, 2026. Adaptation of the [complete sketch](https://processingfoundation.org/sketches/processing25/) by **Kiel Danger Mutschelknaus**. Kept here as a technical reference for hoop meshes, texture scrolling, and morph animations while exploring PCD @ Seoul 2026 poster experiments.

## Run

From this directory:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open http://127.0.0.1:8000. `sketch/index.html` is the standalone embeddable graphic.

Edit the text (up to 48 characters), drag the bottom slider, or use its arrow keys. Click the canvas and press **D** for the mesh overlay; **[** and **]** change the debug sampling density.

## Check

```sh
node check.mjs
```

## Attribution

- Artwork and sketch source: [Kiel Danger Mutschelknaus](https://www.kielm.com/) / [Processing Foundation](https://processingfoundation.org/).
- Site content is described as [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) on the Foundation website. Verify font and artwork rights before redistribution or commercial use.
- p5.js 1.11.13 license: `vendor/p5.LICENSE.txt`.
