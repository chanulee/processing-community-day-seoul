let uiText = "25 YEARS OF PROCESSING";
let sliderState = 0;
let debug = false;

const STATE_COUNT = 7;

let textInput;
let debugToggle;
let complexitySlider;
let debugHud;

let inputFocused = false;
let sliderDragging = false;
function uiIsActive() {
  return inputFocused || sliderDragging;
}

function buildUI(canvas) {

  textInput = createInput(uiText);
  textInput.id("text-input");
  textInput.attribute("aria-label", "Text on the rings");
  // Bound the texture allocation: each phrase is rendered into many GPU textures.
  textInput.attribute("maxlength", "48");
  textInput.parent("sketch-holder");
  textInput.input(onTextChanged);

  debugToggle = createCheckbox(" debug", debug);
  debugToggle.id("debug-toggle");
  debugToggle.parent("sketch-holder");
  debugToggle.changed(onDebugChanged);

  complexitySlider = createSlider(0, STATE_COUNT - 1, 0, 1);
  complexitySlider.id("complexity-slider");
  complexitySlider.attribute("aria-label", "Shape: hoop, stack, spring, vase, coins, burst, nested rings");
  complexitySlider.parent("sketch-holder");

  // The vertex readout lives in the DOM, not the canvas: the WEBGL camera zooms ~80x during
  // the onion state, so anything drawn in world space would not hold still on screen.
  debugHud = createDiv("");
  debugHud.id("debug-hud");
  debugHud.parent("sketch-holder");

  textInput.elt.addEventListener("focus", () => inputFocused = true);
  textInput.elt.addEventListener("blur", () => inputFocused = false);
  complexitySlider.elt.addEventListener("pointerdown", () => sliderDragging = true);
  window.addEventListener("pointerup", () => sliderDragging = false);
}

// rebuildTexture() builds ~70 offscreen canvases. Firing it per keystroke meant typing a
// 22-character phrase allocated ~1500 of them. Coalesce to one rebuild once typing settles.
// Set REBUILD_DELAY to 0 for the old per-keystroke behaviour.
const REBUILD_DELAY = 250;
let rebuildTimer = null;

function onTextChanged() {
  uiText = textInput.value();
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(rebuildTexture, REBUILD_DELAY);
}

function onDebugChanged() {
  debug = debugToggle.checked();
}

// The tally is the REAL mesh — every vertex() the frame issued, not the strided overlay.
function updateDebugHud(state) {
  if (!debugHud) return;
  if (!debug) { debugHud.style("display", "none"); return; }
  debugHud.style("display", "block");
  debugHud.html(
    `state ${state} &middot; ${nf(frameRate(), 2, 1)} fps<br>` +
    `${dbgShapes} shapes<br>` +
    `${dbgVerts.toLocaleString()} vertices<br>` +
    `stride ${DEBUG_STRIDE} &nbsp;[ / ]`
  );
}

function readUI() {
  if (complexitySlider) sliderState = complexitySlider.value();
  return sliderState;
}
