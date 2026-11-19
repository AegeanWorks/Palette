import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const editor = readFileSync(new URL("../src/ui/editor.js", import.meta.url), "utf8");
const dogfood = readFileSync(new URL("../scripts/dogfood.mjs", import.meta.url), "utf8");

test("reforge finding: dogfood asserts Ctrl+0 actually changes the zoom scale", () => {
  assert.match(dogfood, /scaleSeed: 0\.5, scaleFit, scaleActual/);
  assert.match(
    dogfood,
    /zoomKeys\.scaleFit === zoomKeys\.scaleSeed \|\| zoomKeys\.scaleFit <= 0/,
  );
  assert.match(dogfood, /Ctrl\+0 shortcut did not change the scale to fit/);
});

test("reforge finding: dogfood exercises the CCW rotate branch and checks its direction", () => {
  assert.match(dogfood, /btn-layer-rotate-ccw'\)\.click\(\)/);
  assert.match(dogfood, /rotCcw\.label !== "Rotate layer 90° CCW"/);
  assert.match(dogfood, /Rotate layer 90 CCW committed the wrong direction/);
});

test("disabled text buttons look disabled and cannot look hovered", () => {
  assert.match(styles, /\.btn:disabled\s*\{[^}]*opacity:\s*0\.[0-9]+/);
  assert.match(styles, /\.btn:disabled\s*\{[^}]*cursor:\s*not-allowed/);
  assert.match(styles, /\.btn-ghost:not\(:disabled\):hover/);
  assert.match(styles, /\.btn-primary:not\(:disabled\):hover/);
  assert.doesNotMatch(styles, /\.btn-ghost:hover/);
  assert.doesNotMatch(styles, /\.btn-primary:hover/);
});

test("desktop file actions expose accurate hover tooltips", () => {
  const hints = {
    "btn-new": "New document (Ctrl+N)",
    "btn-open": "Open an image (Ctrl+O)",
    "btn-open-project": "Open a .palette project",
    "btn-save": "Save project (Ctrl+S)",
    "btn-export": "Export image (Ctrl+E)",
  };
  for (const [id, hint] of Object.entries(hints)) {
    assert.match(html, new RegExp(`id="${id}"[^>]*title="${hint.replace(/[.+()]/g, "\\$&")}"`), `${id} tooltip`);
  }
  assert.match(editor, /key === "o"[\s\S]{0,120}fileImage\.click/);
  assert.match(editor, /key === "s"[\s\S]{0,120}saveProject/);
  assert.match(editor, /key === "e"[\s\S]{0,160}openExportDialog/);
});

test("the desktop title bar shows the document name and unsaved state", () => {
  assert.match(html, /id="doc-dirty"[^>]*hidden[^>]*title="Unsaved changes"/);
  assert.match(styles, /\.doc-dirty\s*\{[^}]*color:\s*var\(--cyan\)/);
  assert.match(editor, /"doc-name",\s*"doc-dirty"/);
  assert.match(editor, /syncDocumentState\(\)\s*\{[\s\S]*?this\.el\.docDirty\.hidden\s*=\s*!dirty/);
  assert.match(editor, /syncDocumentState\(\)\s*\{[\s\S]*?document\.title\s*=\s*title/);
  for (const method of ["setDocument", "applyDoc", "commit", "setDocumentName", "saveProject"]) {
    const body = editor.slice(editor.indexOf(`  ${method}(`), editor.indexOf(`  ${method}(`) + 1600);
    assert.match(body, /syncDocumentState\(\)/, `${method} must refresh the title marker`);
  }
});

test("action buttons expose their shortcuts to assistive tech", () => {
  assert.match(editor, /const BUTTON_SHORTCUTS = Object\.freeze\(\{/);
  assert.match(editor, /btnInvertSelection: "Shift\+I Control\+Shift\+I Meta\+Shift\+I"/);
  assert.match(editor, /Object\.entries\(BUTTON_SHORTCUTS\)[\s\S]{0,160}aria-keyshortcuts/);
});

test("tool buttons expose their shortcuts to assistive tech", () => {
  assert.match(editor, /setAttribute\("aria-keyshortcuts", key\)/);
  assert.match(editor, /querySelectorAll\("\[data-tool\]"\)[\s\S]{0,200}aria-keyshortcuts/);
});

test("the histogram tonal range is announced when it changes", () => {
  assert.match(html, /id="histogram-range"[^>]*aria-live="polite"/);
});

test("preset swatches show which one is active", () => {
  assert.match(editor, /syncSwatches\(\)\s*\{[\s\S]{0,240}aria-pressed/);
  assert.match(editor, /refreshUI\(\)\s*\{[\s\S]{0,120}syncSwatches\(\)/);
  assert.match(styles, /\.btn-swatch\[aria-pressed="true"\]\s*\{[^}]*outline:\s*2px solid var\(--cyan\)/);
});

test("the document size readout is announced when it changes", () => {
  assert.match(html, /id="doc-size"[^>]*aria-live="polite"/);
});

test("layer reorder buttons disable at the stack boundaries", () => {
  assert.match(editor, /btnLayerUp\.disabled = layerIndex >= this\.doc\.layers\.length - 1/);
  assert.match(editor, /btnLayerDown\.disabled = layerIndex <= 0/);
  assert.match(editor, /Move layer up — already at the top/);
  assert.match(editor, /Move layer down — already at the bottom/);
});

test("the export size readout is announced when it changes", () => {
  assert.match(html, /id="export-size"[^>]*aria-live="polite"/);
});

test("the Merge down control explains when it is unavailable", () => {
  assert.match(editor, /btnLayerMerge\.disabled = !canClip/);
  assert.match(editor, /Merge layer down — select a layer above the bottom/);
});

test("the layer Delete control explains when it is unavailable", () => {
  assert.match(editor, /const isOnlyLayer = this\.doc\.layers\.length <= 1/);
  assert.match(editor, /btnLayerDelete\.disabled = isOnlyLayer/);
  assert.match(editor, /Delete layer — keep at least one layer/);
});

test("the disabled Clip control explains why it is unavailable", () => {
  assert.match(editor, /Clip to layer below — select a layer above the bottom/);
  assert.match(editor, /const canClip = indexOfLayer\(this\.doc, layer\.id\) > 0/);
  assert.match(editor, /btnLayerClip\.disabled = !canClip/);
});

test("layer count changes are announced to assistive tech", () => {
  assert.match(html, /id="layer-count"[^>]*aria-live="polite"/);
});

test("the Move options note adds detail instead of duplicating the header hint", () => {
  assert.match(html, /id="options-move"[^>]*>[\s\S]{0,120}Arrow keys nudge the layer 1 px; hold Shift for 10 px\./);
  assert.doesNotMatch(html, /id="options-move"[^>]*>[\s\S]{0,120}Drag the active layer\. Arrow keys nudge it\./);
});

test("the Help button advertises the F1 shortcut", () => {
  assert.match(html, /id="btn-help"[^>]*title="Keyboard shortcuts \(F1\)"/);
  assert.match(editor, /btnHelp: "F1"/);
});

test("Ctrl+N opens a new document and is advertised everywhere", () => {
  assert.match(editor, /key === "n"[\s\S]{0,120}this\.openNewDialog\(\)/);
  assert.match(editor, /btnNew: "Control\+N Meta\+N"/);
  assert.match(html, /id="btn-new"[^>]*title="New document \(Ctrl\+N\)"/);
  assert.match(html, /<dt>Ctrl \/ Cmd \+ N<\/dt><dd>New document<\/dd>/);
});

test("the histogram draws RGB channel overlays behind luminance", () => {
  assert.match(editor, /drawHistogram\(\)\s*\{[\s\S]{0,900}globalCompositeOperation = "lighter"/);
  assert.match(editor, /\[histogram\.red, "rgba\(255, 64, 64, 0\.55\)"\]/);
  assert.match(editor, /\[histogram\.green, "rgba\(64, 220, 64, 0\.55\)"\]/);
  assert.match(editor, /\[histogram\.blue, "rgba\(64, 128, 255, 0\.55\)"\]/);
  assert.match(editor, /channelMax = Math\.max\(\s*1,\s*\.\.\.histogram\.red/);
});

test("the colour hex readout copies the hex on click with feedback", () => {
  assert.match(html, /id="color-hex"[^>]*class="mono color-hex-btn"[^>]*title="Copy hex colour"/);
  assert.match(editor, /copyColorHex\(\)\s*\{[\s\S]{0,600}navigator\.clipboard\.writeText\(hex\)/);
  assert.match(editor, /Copied \$\{hex\} to clipboard\./);
  assert.match(editor, /colorHex\.addEventListener\("click", \(\) => this\.copyColorHex\(\)\)/);
  assert.match(styles, /\.color-hex-btn:hover\s*\{[^}]*color:\s*var\(--cyan\)/);
});

test("the status bar colour swatch opens the colour picker on click", () => {
  assert.match(html, /id="status-color"[^>]*type="button"[^>]*aria-label="Active colour — click to change"/);
  assert.match(editor, /"status-color", "status-cursor"/);
  assert.match(editor, /syncStatusColor\(\)\s*\{[\s\S]{0,240}statusColor\.style\.background = this\.options\.color/);
  assert.match(editor, /this\.syncStatusColor\(\);/);
  assert.match(editor, /statusColor\.addEventListener\("click", \(\) => this\.el\.colorInput\.click\(\)\)/);
  assert.match(styles, /\.status-color:hover\s*\{[^}]*border-color:\s*var\(--cyan\)/);
});

test("the zoom controls expose their shortcuts to assistive tech", () => {
  assert.match(editor, /btnZoomIn: "= Control\+= Meta\+="/);
  assert.match(editor, /btnZoomOut: "- Control\+- Meta\+-"/);
  assert.match(editor, /btnFit: "0 Control\+0 Meta\+0"/);
});

test("the zoom controls show their keyboard shortcuts on hover", () => {
  assert.match(html, /id="btn-zoom-in"[^>]*title="Zoom in \(\+\)"/);
  assert.match(html, /id="btn-zoom-out"[^>]*title="Zoom out \(-\)"/);
  assert.match(html, /id="btn-fit"[^>]*title="Fit to view \(0\)"/);
  assert.match(editor, /event\.key === "\+" \|\| event\.key === "="[\s\S]{0,80}zoomIn\(\)/);
  assert.match(editor, /event\.key === "-" \|\| event\.key === "_"[\s\S]{0,80}zoomOut\(\)/);
});

test("layer names advertise the double-click rename affordance", () => {
  assert.match(editor, /name\.title = `\$\{layer\.name\} — double-click to rename`/);
});

test("the Clone option note describes the source marker instead of repeating the header", () => {
  assert.match(html, /The cyan crosshair marks the source; Alt-click again to move it\./);
  assert.doesNotMatch(html, /<p class="panel-note">Alt-click a source point, then drag to clone from it\.<\/p>/);
});

test("the tool hint sits on its own full-width line in the panel header", () => {
  assert.match(styles, /\.panel-head:has\(#tool-hint\)\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(styles, /#tool-hint\s*\{[^}]*flex:\s*1 1 100%/);
  assert.match(styles, /#tool-hint\s*\{[^}]*text-align:\s*left/);
});

test("the Bucket and Crop option notes add detail instead of duplicating the header", () => {
  assert.match(html, /Uncheck Contiguous to fill every matching area in the layer\./);
  assert.match(html, /Press Enter to apply the crop or Escape to cancel it\./);
  assert.doesNotMatch(html, /<p class="panel-note">Click an area to fill with the active colour\.<\/p>/);
  assert.doesNotMatch(html, /<p class="panel-note">Drag a region, then confirm\.<\/p>/);
});

test("the fit-to-view button shows a pressed state when auto-fitted", () => {
  assert.match(editor, /btnFit\.setAttribute\("aria-pressed", this\.autoFit \? "true" : "false"\)/);
});

test("a hidden layer disables editing controls just like a locked one", () => {
  assert.match(editor, /const cannotEditLayer = layer\.locked \|\| !layer\.visible/);
  assert.match(editor, /layerOpacity\.disabled = cannotEditLayer/);
  assert.match(editor, /layerBlend\.disabled = cannotEditLayer/);
  assert.match(editor, /input\.disabled = cannotEditLayer/);
  assert.match(editor, /this\.el\[name\]\.disabled = cannotEditLayer/);
});

test("the actual-size button shows a pressed state at 100% zoom", () => {
  assert.match(editor, /btnActual\.setAttribute\("aria-pressed", Math\.abs\(this\.view\.scale - 1\) < 0\.001/);
});

test("an inverted selection gets a distinct status colour", () => {
  assert.match(editor, /statusSelection\.dataset\.inverted = this\.selection\.invert \? "true" : "false"/);
  assert.match(styles, /\.status-selection\[data-inverted="true"\]\s*\{[^}]*color:\s*var\(--violet\)/);
});

test("a locked layer disables the layer-level transform buttons", () => {
  const start = editor.indexOf("const DESTRUCTIVE_ACTIONS");
  const list = editor.slice(start, editor.indexOf("];", start));
  for (const name of ["btnTransform", "btnLayerFlipH", "btnLayerFlipV", "btnLayerRotateCw", "btnLayerRotateCcw"]) {
    assert.match(list, new RegExp(`"${name}"`), `${name} must be disabled on a locked layer`);
  }
});

test("Resize and Canvas dialogs preview the effective size and capping warning", () => {
  assert.match(html, /id="resize-size"[^>]*aria-live="polite"/);
  assert.match(html, /id="canvas-size"[^>]*aria-live="polite"/);
  assert.match(editor, /"resize-lock", "resize-size"/);
  assert.match(editor, /"canvas-height", "canvas-size"/);
  assert.match(editor, /syncDimensionSize\(readout, widthInput, heightInput, fallbackWidth, fallbackHeight\)/);
  assert.match(editor, /readout\.textContent = capped/);
  assert.match(editor, /canvasWidth\.addEventListener\("input", \(\) => this\.syncDimensionSize/);
});

test("the New dialog previews the effective size and capping warning", () => {
  assert.match(html, /id="new-size"[^>]*aria-live="polite"/);
  assert.match(editor, /"new-cancel", "new-create", "new-size"/);
  assert.match(editor, /syncNewSize\(\)\s*\{[\s\S]{0,500}boundedDimensions\(requestedWidth, requestedHeight\)/);
  assert.match(editor, /will be capped to \$\{width\} × \$\{height\} pixels/);
  assert.match(editor, /newWidth\.addEventListener\("input", \(\) => this\.syncNewSize\(\)\)/);
  assert.match(styles, /\.dialog-note\[data-tone="warn"\]\s*\{[^}]*color:\s*var\(--pink\)/);
});

test("toggle buttons show a visible pressed state", () => {
  assert.match(styles, /\.icon-btn\[aria-pressed="true"\],\s*\.btn\[aria-pressed="true"\]/);
  assert.match(styles, /\.btn\[aria-pressed="true"\]\s*\{|aria-pressed="true"\][\s\S]{0,120}background:\s*rgba\(34, 211, 238/);
});

test("hidden layers dim their row in the Layers panel", () => {
  assert.match(editor, /item\.dataset\.visible = layer\.visible \? "true" : "false"/);
  assert.match(styles, /\.layer-item\[data-visible="false"\] \.layer-thumb/);
  assert.match(styles, /\.layer-item\[data-visible="false"\] \.layer-name\s*\{[^}]*opacity:\s*0\.4/);
});

test("the autosave status has a tone-driven dot and announces changes", () => {
  assert.match(html, /id="status-autosave"[^>]*aria-live="polite"/);
  assert.match(styles, /\.status-autosave\s*\{[^}]*display:\s*inline-flex/);
  assert.match(styles, /\.status-autosave::before\s*\{[^}]*border-radius:\s*50%/);
  assert.match(styles, /\.status-autosave::before\s*\{[^}]*background:\s*currentColor/);
});

test("a locked layer disables the destructive filter buttons and their inputs", () => {
  const start = editor.indexOf("const DESTRUCTIVE_ACTIONS");
  const list = editor.slice(start, editor.indexOf("];", start));
  assert.match(list, /"btnFilterBlur"/);
  assert.match(list, /"btnFilterMedian"/);
  assert.match(list, /"btnTransform", "btnLayerFlipH", "btnLayerFlipV", "btnLayerRotateCw", "btnLayerRotateCcw"/);
  assert.match(list, /"filterBlurRadius"/);
  assert.match(list, /"filterTintColor"/);
  assert.match(list, /"levelGamma"/);
  assert.match(editor, /for \(const name of DESTRUCTIVE_ACTIONS\)[\s\S]{0,160}this\.el\[name\]\.disabled = cannotEditLayer/);
});

test("a locked layer disables its opacity and blend controls", () => {
  assert.match(editor, /layerOpacity\.disabled = cannotEditLayer/);
  assert.match(editor, /layerBlend\.disabled = cannotEditLayer/);
});

test("the Adjustments Reset button says what it resets", () => {
  assert.match(html, /id="adjust-reset"[^>]*title="Reset adjustments on the active layer"/);
});

test("the Adjustments Reset button disables when nothing is adjusted", () => {
  assert.match(editor, /isNeutralAdjustments,/);
  assert.match(editor, /adjustReset\.disabled = isNeutralAdjustments\(layer\.adjustments\)/);
  assert.match(editor, /adjustReset\.disabled = isNeutralAdjustments\(adjustments\)/);
});

test("the status bar marks hidden, locked and clipped layers", () => {
  assert.match(editor, /!layer\.visible && "hidden"/);
  assert.match(editor, /layer\.locked && "locked"/);
  assert.match(editor, /layer\.clipToBelow && "clipped"/);
});

test("the status bar marks an inverted selection", () => {
  assert.match(editor, /this\.selection\.invert \? " \(inverted\)" : ""/);
});

test("F1 opens the keyboard shortcuts dialog", () => {
  const body = editor.slice(editor.indexOf("  onKeyDown("), editor.indexOf("  onKeyDown(") + 600);
  assert.match(body, /event\.key === "F1"[\s\S]{0,140}helpDialog\.showModal\(\)/);
  assert.match(html, /<dt>F1<\/dt><dd>Open this shortcut list<\/dd>/);
});

test("the status bar readouts explain themselves", () => {
  assert.match(html, /id="status-cursor"[^>]*title="Pointer position in document pixels"/);
  assert.match(html, /id="status-zoom"[^>]*title="Current zoom level"/);
});

test("the status bar names the active tool and its shortcut", () => {
  assert.match(editor, /const TOOL_KEYS = Object\.freeze\(\{[\s\S]*?move: "V"[\s\S]*?zoom: "Z"/);
  assert.match(editor, /statusTool\.textContent = toolKey \? `\$\{meta\.label\} \(\$\{toolKey\}\)`/);
  assert.match(editor, /statusTool\.title = toolKey/);
});

test("document action buttons explain their effect on hover", () => {
  const hints = {
    "btn-resize": "Resize the document",
    "btn-canvas-size": "Change the canvas size",
    "btn-transform": "Transform the active layer",
    "btn-layer-flip-h": "Flip the active layer horizontally",
    "btn-layer-flip-v": "Flip the active layer vertically",
    "btn-layer-rotate-cw": "Rotate the active layer 90° clockwise",
    "btn-layer-rotate-ccw": "Rotate the active layer 90° counter-clockwise",
    "btn-flip-h": "Flip the whole document horizontally",
    "btn-flip-v": "Flip the whole document vertically",
    "btn-rotate": "Rotate the whole document 90°",
    "btn-flatten": "Flatten all visible layers",
    "btn-stamp-visible": "Stamp visible layers to a new layer (Ctrl+Alt+Shift+E)",
  };
  for (const [id, hint] of Object.entries(hints)) {
    assert.match(html, new RegExp(`id="${id}"[^>]*title="${hint.replace(/[.+()]/g, "\\$&")}"`), `${id} tooltip`);
  }
  assert.match(editor, /key === "e"[\s\S]{0,120}event\.altKey && event\.shiftKey[\s\S]{0,80}stampVisible/);
});

test("layer visibility toggles explain their action on hover", () => {
  assert.match(editor, /visibility\.setAttribute\("aria-label", `\$\{layer\.visible \? "Hide" : "Show"\} \$\{layer\.name\}`\)/);
  assert.match(editor, /visibility\.title\s*=\s*`\$\{layer\.visible \? "Hide" : "Show"\} \$\{layer\.name\}`/);
});

test("layer selection changes animate smoothly on desktop", () => {
  assert.match(styles, /\.layer-item\s*\{[^}]*transition:\s*background 0\.15s var\(--ease\), border-color 0\.15s var\(--ease\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test("resize and canvas dialogs select their pre-filled width on open", () => {
  for (const method of ["openResizeDialog", "openCanvasDialog"]) {
    const start = editor.indexOf(`  ${method}()`);
    const body = editor.slice(start, start + 600);
    assert.match(body, /showModal\(\)[\s\S]*?Width\.focus\(\)/, `${method} focuses width`);
    assert.match(body, /Width\.select\(\)/, `${method} selects width`);
  }
});

test("the Layers panel shows how many layers exist", () => {
  assert.match(html, /id="layers-heading"[^>]*>Layers <span id="layer-count"/);
  assert.match(styles, /\.layer-count\s*\{[^}]*font-family:\s*var\(--mono\)/);
  assert.match(editor, /"layer-blend",\s*"layer-count"/);
  assert.ok(editor.includes("layerCount.textContent ="));
  assert.match(editor, /layers\.length === 1 \? "" : "s"/);
});

test("the remaining selection controls explain what they do", () => {
  const hints = {
    "btn-crop-selection": "Crop the document to the active selection",
    "btn-expand-selection": "Grow the active selection by 5 px",
    "btn-contract-selection": "Shrink the active selection by 5 px",
  };
  for (const [id, hint] of Object.entries(hints)) {
    assert.match(html, new RegExp(`id="${id}"[^>]*title="${hint.replace(/[.+()]/g, "\\$&")}"`), `${id} tooltip`);
  }
});

test("the export dialog starts with its pre-filled name selected", () => {
  const body = editor.slice(editor.indexOf("  openExportDialog()"), editor.indexOf("  openExportDialog()") + 600);
  assert.match(body, /exportName\.value\s*=\s*this\.doc\.name/);
  assert.match(body, /exportDialog\.showModal\(\)[\s\S]*?exportName\.focus\(\)/);
  assert.match(body, /exportName\.select\(\)/);
});

test("the filters panel is grouped into scannable sections", () => {
  for (const label of ["Essentials", "Tone &amp; levels", "Colour balance", "Effects"]) {
    assert.match(html, new RegExp(`<h3 class="filter-group">${label}</h3>`), `${label} group`);
  }
  assert.match(styles, /\.filter-group\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/);
  assert.match(styles, /\.filter-group\s*\{[^}]*text-transform:\s*uppercase/);
});

test("the canvas keyboard focus ring is drawn inside the clipped workspace", () => {
  assert.match(styles, /\.stage-wrap\s*\{[^}]*overflow:\s*hidden/);
  assert.match(styles, /\.stage:focus-visible\s*\{[^}]*outline-offset:\s*-3px/);
  assert.match(html, /id="stage"[^>]*tabindex="0"/);
});

test("selection and clipboard controls show their shortcuts on hover", () => {
  const hints = {
    "btn-select-all": "Select all (Ctrl+A)",
    "btn-deselect": "Deselect (Ctrl+D)",
    "btn-invert-selection": "Invert selection (Shift+I)",
    "btn-copy": "Copy selection or layer (Ctrl+C)",
    "btn-cut": "Cut selection or layer (Ctrl+X)",
    "btn-paste": "Paste clipboard (Ctrl+V)",
    "btn-layer-via-copy": "Layer via copy (Ctrl+J)",
    "btn-layer-via-cut": "Layer via cut (Ctrl+Shift+J)",
  };
  for (const [id, hint] of Object.entries(hints)) {
    const escaped = hint.replace(/[.+()]/g, "\\$&");
    assert.match(html, new RegExp(`id="${id}"[^>]*title="${escaped}"`), `${id} tooltip`);
  }
  assert.match(editor, /key === "a"[\s\S]{0,200}selectAll/);
  assert.match(editor, /key === "c"[\s\S]{0,200}copySelection/);
  assert.match(editor, /key === "x"[\s\S]{0,200}cutSelection/);
  assert.match(editor, /key === "j"[\s\S]{0,200}layerViaCopy/);
});

test("the histogram explains its RGB channels and tonal-range readout", () => {
  assert.match(html, /id="histogram"[^>]*aria-label="Active layer RGB and luminance histogram"/);
  assert.match(html, /id="histogram"[^>]*title="Active layer RGB channels \(red, green, blue\) with luminance/);
  assert.match(html, /id="histogram-range"[^>]*title="Tonal range \(0\.5%–99\.5% percentiles\) used by Auto levels"/);
  assert.match(editor, /percentileRange\(histogram, 0\.005, 0\.005\)/);
});

test("the Auto Levels button explains what it does", () => {
  assert.match(html, /id="btn-auto-levels"[^>]*title="Auto levels — stretch tones to the visible range/);
});

test("the zoom reset control explains itself on hover", () => {
  assert.match(html, /id="btn-actual"[^>]*title="Actual size — 100% \(Ctrl\+1\)"/);
  assert.match(editor, /key === "1"[\s\S]{0,120}actualSize\(\)/);
  assert.match(editor, /btnActual\.addEventListener\("click",\s*\(\)\s*=>\s*this\.actualSize\(\)\)/);
});

test("the desktop status bar shows an active selection", () => {
  assert.match(html, /id="status-selection"[^>]*class="status-selection"[^>]*hidden/);
  assert.match(styles, /\.status-selection\s*\{[^}]*color:\s*var\(--cyan\)/);
  assert.match(editor, /"status-layer",\s*"status-selection"/);
  assert.match(editor, /statusSelection\.hidden\s*=\s*!selectionRect/);
  assert.match(editor, /`Selection \$\{Math\.round\(selectionRect\.w\)\}×\$\{Math\.round\(selectionRect\.h\)\}\$\{mode\}`/);
});

test("the active layer name is visually and semantically marked", () => {
  assert.match(editor, /name\.setAttribute\("aria-pressed",\s*layer\.id === this\.doc\.activeLayerId/);
  assert.match(styles, /\.layer-name\[aria-pressed="true"\]\s*\{[^}]*font-weight:\s*700/);
});

test("the document name selects all on focus for quick renaming", () => {
  assert.match(html, /id="doc-name"[^>]*title="Document name — click to rename"/);
  assert.match(editor, /docName\.addEventListener\("focus",\s*\(\)\s*=>\s*this\.el\.docName\.select\(\)\)/);
});

test("locked-layer adjustment sliders look disabled", () => {
  assert.match(styles, /input\[type\]:disabled,\s*select:disabled\s*\{[^}]*opacity:\s*0\.45/);
  assert.match(styles, /input\[type\]:disabled,\s*select:disabled\s*\{[^}]*cursor:\s*not-allowed/);
  assert.match(editor, /input\.disabled\s*=\s*cannotEditLayer/);
});

test("the desktop status bar names the active layer and hints clipping", () => {
  assert.match(html, /id="status-layer"[^>]*class="status-layer"/);
  assert.match(styles, /\.status-layer\s*\{[^}]*color:\s*var\(--muted\)/);
  assert.match(editor, /"status-tool",\s*"status-layer"/);
  assert.match(editor, /syncActiveLayer\(\)\s*\{[\s\S]*?this\.el\.statusLayer\.textContent\s*=\s*`\$\{layer\.name\}\$\{suffix\}`/);
  assert.match(editor, /Ctrl\+Alt\+G/);
});

test("the buttons that start disabled still exist with their data-ui hooks", () => {
  for (const id of ["btn-deselect", "btn-crop-selection", "btn-paste", "crop-apply"]) {
    assert.match(html, new RegExp(`id="${id}"[^>]*disabled`), `${id} should start disabled`);
  }
  assert.match(styles, /\.icon-btn:disabled/);
});
