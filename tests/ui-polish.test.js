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
    "btn-open-project": "Open a .palette project (Ctrl+Shift+O)",
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

test("the status bar reflects the active Gradient type", () => {
  assert.match(editor, /this\.tool === "gradient" && this\.options\.gradient\.type === "radial"\) modeNote = " · Radial"/);
  assert.match(editor, /gradientType\.addEventListener\("change"[\s\S]{0,160}this\.syncToolOptions\(\)/);
});

test("Manage icons fit a single compact row", () => {
  assert.match(styles, /\.panel-group \.icon-btn \{[^}]*width: 26px/);
  assert.match(styles, /\.panel-group \.button-row\.compact \{[^}]*gap: 3px/);
});

test("a pixel grid appears at high zoom", () => {
  assert.match(editor, /if \(this\.view\.scale >= 8\) \{/);
  assert.match(editor, /rgba\(233, 238, 251, 0\.12\)/);
  assert.match(editor, /for \(let x = firstX; x <= lastX; x \+= 1\)/);
});

test("Tool options header names the active tool", () => {
  assert.match(html, /id="options-heading"><span id="options-tool-name">Move<\/span> options<\/h2>/);
  assert.match(editor, /optionsToolName\.textContent = meta\.label/);
});

test("collapsed filter categories persist across reloads", () => {
  assert.match(editor, /const key = `filter:\$\{head\.textContent\.trim\(\)\}`/);
  assert.match(editor, /this\.saveFilterGroupState\(head\)/);
  assert.match(editor, /while \(node && !node\.classList\.contains\("filter-group"\)\) \{[\s\S]{0,120}node\.hidden = true/);
});

test("filter category headers respond to Enter and Space", () => {
  assert.match(editor, /filter-grid"\)\?\.addEventListener\("keydown"/);
  assert.match(editor, /event\.key !== "Enter" && event\.key !== " "/);
  assert.match(editor, /event\.target\.closest\("\.filter-group"\)[\s\S]{0,120}head\.click\(\)/);
});

test("filter categories can be collapsed individually", () => {
  assert.equal((html.match(/class="filter-group" role="button"/g) || []).length, 7);
  assert.match(editor, /const head = event\.target\.closest\("\.filter-group"\)/);
  assert.match(editor, /while \(node && !node\.classList\.contains\("filter-group"\)\)/);
  assert.match(styles, /\.filter-group\[data-collapsed="true"\]::before/);
});

test("Filters Reset disables when everything is already default", () => {
  assert.match(editor, /filterReset\.disabled = !changed/);
  assert.match(editor, /"Filters already at defaults"/);
});

test("filter category headers and gaps are tighter", () => {
  assert.match(styles, /\.filter-grid \{[^}]*gap: 4px/);
  assert.match(styles, /\.filter-group \{[^}]*margin: 7px 0 1px/);
});

test("collapsed panel states persist across reloads", () => {
  assert.match(editor, /localStorage\.getItem\("palette\.panels"\)/);
  assert.match(editor, /localStorage\.setItem\("palette\.panels", JSON\.stringify\(saved\)\)/);
  assert.match(editor, /this\.restorePanelStates\(\)/);
  assert.match(editor, /this\.savePanelState\(panel\)/);
});

test("the Filters panel can reset all settings", () => {
  assert.match(html, /id="filter-reset"[^>]*title="Reset all filter settings to their defaults"/);
  assert.match(editor, /if \(input\.type === "checkbox"\) input\.checked = input\.defaultChecked/);
  assert.match(editor, /this\.announce\("Filter settings reset\."\)/);
});

test("layer thumbnails toggle visibility with a tooltip", () => {
  assert.match(editor, /thumb\.title = `\$\{layer\.visible \? "Hide" : "Show"\} \$\{layer\.name\}`/);
  assert.match(editor, /thumb\.addEventListener\("click"[\s\S]{0,140}this\.toggleLayerVisibility\(layer\.id\)/);
  assert.match(styles, /\.layer-thumb \{[^}]*cursor: pointer/);
});

test("the layer list scrolls and keeps the active layer visible", () => {
  assert.match(styles, /\.layer-list \{[^}]*max-height: 210px/);
  assert.match(styles, /\.layer-list \{[^}]*overflow-y: auto/);
  assert.match(editor, /lastActiveLayerId !== this\.doc\.activeLayerId/);
  assert.match(editor, /scrollIntoView\(\{ block: "nearest" \}\)/);
});

test("Noise lives with the texture filters", () => {
  const textures = html.search(/filter-group"[^>]*>Textures<\/h3>/);
  const colorBalance = html.search(/filter-group"[^>]*>Colour balance<\/h3>/);
  const noise = html.indexOf('id="filter-noise-amount"');
  assert.ok(textures > 0 && noise > textures, "noise should follow Textures");
  assert.ok(noise > colorBalance);
});

test("the layer lock icon toggles that layer's lock", () => {
  assert.match(editor, /toggleLayerLock\(id = this\.doc\?\.activeLayerId\)/);
  assert.match(editor, /lock\.addEventListener\("click"[\s\S]{0,140}this\.toggleLayerLock\(layer\.id\)/);
  assert.match(editor, /"Locked — click to unlock"/);
});

test("the zoom readout indicates fit-to-view", () => {
  assert.match(editor, /this\.autoFit \? " · Fit" : ""/);
});

test("the matching new-document size preset is highlighted", () => {
  assert.match(editor, /newPresets\.querySelectorAll\("button\[data-w\]"\)/);
  assert.match(editor, /button\.setAttribute\("aria-pressed", matches \? "true" : "false"\)/);
});

test("new document size presets fill the dimensions", () => {
  assert.match(html, /id="new-presets"[^>]*aria-label="Common document sizes"/);
  assert.match(html, /data-w="1920" data-h="1080"/);
  assert.match(editor, /newPresets\.addEventListener\("click"/);
  assert.match(editor, /this\.el\.newWidth\.value = button\.dataset\.w/);
});

test("export format options show their file extensions", () => {
  assert.match(html, /value="png">PNG \(\.png\)<\/option>/);
  assert.match(html, /value="jpeg">JPEG \(\.jpg\)<\/option>/);
  assert.match(html, /value="webp">WebP \(\.webp\)<\/option>/);
});

test("help shortcuts are grouped into categories", () => {
  const groups = [...html.matchAll(/class="shortcut-heading">([^<]+)</g)].map((m) => m[1]);
  assert.ok(groups.includes("Tools"));
  assert.ok(groups.includes("Selection &amp; edit"));
  assert.ok(groups.includes("Brush &amp; view"));
  assert.match(styles, /div\.shortcut-heading \{[^}]*text-transform: uppercase/);
});

test("the dodge cursor marks the active mode with plus or minus", () => {
  assert.match(editor, /else if \(this\.tool === "dodge"\) \{/);
  assert.match(editor, /if \(this\.options\.dodge\.mode !== "burn"\) \{/);
  assert.match(editor, /context\.moveTo\(this\.pointer\.x, this\.pointer\.y - 4\)/);
});

test("the brush cursor shows the active colour at its centre", () => {
  assert.match(editor, /if \(this\.tool === "brush"\) \{[\s\S]{0,180}context\.arc\(this\.pointer\.x, this\.pointer\.y, 2\.5/);
  assert.match(editor, /context\.fillStyle = this\.options\.color/);
});

test("export scale options show the resulting dimensions", () => {
  assert.match(editor, /for \(const option of this\.el\.exportScale\.options\)/);
  assert.match(editor, /option\.textContent = `\$\{Math\.round\(scale \* 100\)\}% · \$\{width\}×\$\{height\}`/);
});

test("the levels group is labelled Levels", () => {
  assert.match(html, /filter-group"[^>]*>Levels<\/h3>[\s\S]{0,200}id="level-black"/);
  assert.doesNotMatch(html, /filter-group"[^>]*>Tone &amp; levels<\/h3>/);
});

test("brightness and contrast have their own Tone category", () => {
  const tone = html.search(/filter-group"[^>]*>Tone<\/h3>/);
  assert.ok(tone > 0 && tone < html.indexOf('id="filter-brightness"'));
  assert.ok(tone > html.indexOf('id="btn-filter-levels"'));
});

test("texture filters have their own category", () => {
  const textures = html.search(/filter-group"[^>]*>Textures<\/h3>/);
  assert.ok(textures > 0 && textures < html.indexOf('id="btn-filter-dither"'));
  assert.ok(textures < html.indexOf('id="btn-filter-oil"'));
});

test("filters are split into named categories", () => {
  const groups = html.match(/<h3 class="filter-group"[^>]*>([^<]+)<\/h3>/g)?.map((g) => g.replace(/<[^>]+>/g, "")) ?? [];
  assert.ok(groups.includes("Stylize"));
  assert.ok(groups.includes("Effects"));
  assert.match(html, /filter-group"[^>]*>Stylize<\/h3>[\s\S]{0,300}id="btn-filter-invert"/);
});

test("parameterless filters are packed into compact rows", () => {
  const rows = html.match(/class="button-row compact filter-shortcuts"/g) || [];
  assert.equal(rows.length, 4);
  assert.match(html, /filter-shortcuts[\s\S]{0,200}id="btn-filter-sharpen"/);
  assert.match(html, /filter-shortcuts[\s\S]{0,600}id="btn-filter-solarize"/);
  assert.match(styles, /\.filter-shortcuts \.btn \{[^}]*flex: 1 1 auto/);
});

test("filter buttons use short labels", () => {
  const filterButtons = html.match(/<button[^>]*data-ui="filter-[^"]*"[^>]*>[^<]*<\/button>/g) || [];
  assert.ok(filterButtons.every((b) => !/>Apply /.test(b)));
  assert.match(html, /id="btn-filter-blur"[^>]*>Blur<\/button>/);
  assert.match(html, /id="btn-filter-oil"[^>]*>Oil paint<\/button>/);
});

test("sidebar panels use tighter spacing", () => {
  assert.match(styles, /\.panel \{[^}]*padding: 10px 12px 12px/);
  assert.match(styles, /\.panel-head \{[^}]*margin-bottom: 8px/);
  assert.match(styles, /\.panel-group \{[^}]*margin-top: 8px/);
});

test("adjustment sliders are grouped into Tone, Colour and Detail", () => {
  for (const label of ["Tone", "Colour", "Detail"]) {
    assert.match(html, new RegExp(`panel-group-label">${label}</span>`));
  }
  assert.match(html, /panel-group-label">Tone<\/span>[\s\S]{0,200}id="adj-brightness"/);
  assert.match(html, /panel-group-label">Detail<\/span>[\s\S]{0,200}id="adj-blur"/);
});

test("the Layers header stays minimal with layer tools in a labelled group", () => {
  const header = html.match(/<header class="panel-head"[^>]*>\s*<h2 id="layers-heading">[\s\S]*?<\/header>/)?.[0] ?? "";
  assert.equal((header.match(/<button/g) || []).length, 1);
  assert.match(html, /panel-group-label">Manage<\/span>[\s\S]{0,500}id="btn-layer-duplicate"/);
});

test("layer actions are grouped into labelled categories", () => {
  for (const label of ["Canvas", "Layer", "Combine"]) {
    assert.match(html, new RegExp(`panel-group-label">${label}</span>`));
  }
  assert.match(html, /id="btn-layer-rotate-cw"[^>]*>Rotate ↻<\/button>/);
  assert.match(styles, /\.panel-group-label \{[^}]*text-transform: uppercase/);
});

test("the active tool uses a minimal accent instead of a heavy gradient", () => {
  assert.match(styles, /\.tool-btn\[aria-pressed="true"\] \{[^}]*background: rgba\(34, 211, 238, 0\.08\)/);
  assert.match(styles, /\.tool-btn\[aria-pressed="true"\]::before \{[^}]*width: 2px/);
  assert.doesNotMatch(styles, /\.tool-btn\[aria-pressed="true"\] \{[^}]*linear-gradient/);
});

test("sidebar panels can be collapsed to reduce clutter", () => {
  assert.equal((html.match(/class="panel-head" role="button"/g) || []).length, 4);
  assert.match(styles, /\.panel\[data-collapsed="true"\] \.panel-head h2::before/);
  assert.match(styles, /\.panel\[data-collapsed="true"\] > :not\(\.panel-head\)/);
  assert.match(editor, /event\.target\.closest\("button"\)/);
  assert.match(editor, /event\.target\.closest\("\.panel-head"\)/);
  assert.match(editor, /panel\.dataset\.collapsed = collapsed \? "false" : "true"/);
  assert.match(editor, /event\.key !== "Enter" && event\.key !== " "/);
});

test("the bucket tool shows its fill colour at the cursor", () => {
  assert.match(editor, /this\.tool === "bucket" && this\.pointer && this\.pointInsideDoc/);
  assert.match(editor, /const hex = this\.options\.color/);
  assert.match(editor, /context\.fillText\(hex, chipX \+ 22, chipY \+ 10\)/);
});

test("paint tool hints advertise the bracket size shortcuts", () => {
  for (const tool of ["brush", "eraser", "clone", "dodge"]) {
    const hint = editor.match(new RegExp(`${tool}: \\{[^}]*hint: "([^"]*)"`))?.[1] ?? "";
    assert.match(hint, /\[ and \] change the size/);
  }
});

test("the Gradient hint advertises the Shift-angle snap", () => {
  assert.match(editor, /Shift snaps the angle/);
});

test("the Move hint advertises the Shift-axis constraint", () => {
  assert.match(editor, /Shift constrains to an axis; arrow keys nudge it/);
});

test("Shift constrains layer moves to one axis", () => {
  assert.match(editor, /if \(event\.shiftKey\) \{[\s\S]{0,140}Math\.abs\(dx\) >= Math\.abs\(dy\)/);
  assert.match(editor, /action\.shift = event\.shiftKey/);
  assert.match(editor, /px\$\{this\.action\.shift \? " · axis" : ""\}/);
});

test("the histogram shows per-channel values on hover", () => {
  assert.match(html, /id="histogram-hover"[^>]*>Hover to inspect channel levels<\/output>/);
  assert.match(editor, /histogram\.addEventListener\("mousemove"/);
  assert.match(editor, /R\$\{data\.red\[level\]\} G\$\{data\.green\[level\]\} B\$\{data\.blue\[level\]\} · Y\$\{data\.luma\[level\]\}/);
  assert.match(editor, /this\.histogramData = histogram/);
});

test("the selection badge is clickable to deselect", () => {
  assert.match(html, /button id="status-selection"[^>]*type="button"/);
  assert.match(editor, /statusSelection\.addEventListener\("click", \(\) => this\.deselect\(\)\)/);
});

test("double-clicking with the Hand tool fits the view", () => {
  assert.match(editor, /this\.tool === "hand"\) this\.fitView\(\)/);
  assert.match(editor, /Double-click to fit/);
});

test("double-clicking with the Crop tool applies a ready crop", () => {
  assert.match(editor, /this\.tool === "crop" && isUsableRect\(this\.cropRect\)\) this\.applyCrop\(\)/);
  assert.match(editor, /Double-click or Enter to apply/);
});

test("double-clicking with the Zoom tool resets to 100%", () => {
  assert.match(editor, /this\.tool === "zoom"\) this\.actualSize\(\)/);
  assert.match(editor, /Double-click for 100%/);
});

test("double-clicking with the Marquee tool selects all", () => {
  assert.match(editor, /stage\.addEventListener\("dblclick"[\s\S]{0,120}if \(this\.textDraft\) return;/);
  assert.match(editor, /this\.tool === "marquee"\) this\.selectAll\(\)/);
  assert.match(editor, /Double-click or Ctrl\+A selects all/);
});

test("zoom buttons disable with a reason at the scale limits", () => {
  assert.match(editor, /btnZoomIn\.disabled = this\.view\.scale >= MAX_SCALE/);
  assert.match(editor, /"Zoom in — already at maximum"/);
  assert.match(editor, /btnZoomOut\.disabled = this\.view\.scale <= MIN_SCALE/);
  assert.match(editor, /"Zoom out — already at minimum"/);
});

test("the text input placeholder shows its Enter/Escape shortcuts", () => {
  assert.match(html, /id="text-input"[^>]*placeholder="Type text — Enter to add, Esc to cancel"/);
});

test("the idle status message points to the shortcut help", () => {
  assert.match(html, /id="status-message"[^>]*>Ready · F1 for shortcuts<\/span>/);
  assert.match(editor, /target\.textContent = "Ready · F1 for shortcuts"/);
});

test("the Save tooltip names the project file it will download", () => {
  assert.match(editor, /btnSave\.title = `Save \$\{safeFileName\(name\)\}\.palette \(Ctrl\+S\)`/);
});

test("the document size readout opens the Resize dialog", () => {
  assert.match(html, /button id="doc-size"[^>]*title="Click to resize the document"/);
  assert.match(editor, /docSize\.addEventListener\("click", \(\) => this\.openResizeDialog\(\)\)/);
});

test("non-default filter values are highlighted", () => {
  assert.match(editor, /syncFilterOutputs\(\) \{[\s\S]{0,360}out\.dataset\.active = input\.value !== input\.dataset\.neutral \? "true" : "false"/);
  assert.match(editor, /\.filter-grid"\)/);
  assert.match(styles, /\.filter-grid \.field output\[data-active="true"\] \{[^}]*font-weight: 700/);
});

test("the zoom readout toggles between fit and actual size", () => {
  assert.match(html, /button id="status-zoom"[^>]*type="button"/);
  assert.match(editor, /statusZoom\.addEventListener\("click"[\s\S]{0,160}this\.fitView\(\)[\s\S]{0,60}this\.actualSize\(\)/);
});

test("Auto levels disables when tones already span the full range", () => {
  assert.match(editor, /range\.black === 0 && range\.white === 255/);
  assert.match(editor, /"Auto levels — tones already span the full range"/);
});

test("the status bar shows active layer opacity and blend", () => {
  assert.match(editor, /opacityPct !== 100 && `\$\{opacityPct\}%`/);
  assert.match(editor, /layer\.blendMode && layer\.blendMode !== "normal" && layer\.blendMode/);
});

test("Adjustments Reset explains why it is disabled", () => {
  assert.match(editor, /adjustReset\.title = cannotEditLayer[\s\S]{0,160}"Reset — adjustments are already neutral"/);
  assert.match(editor, /adjustReset\.title = isNeutralAdjustments\(adjustments\)[\s\S]{0,120}"Reset adjustments on the active layer"/);
});

test("the export dialog previews the final filename", () => {
  assert.match(html, /id="export-filename"[^>]*aria-live="polite"/);
  assert.match(editor, /exportFilename\.textContent = `Saves as \$\{downloadName\(name, this\.el\.exportFormat\.value\)\}`/);
  assert.match(editor, /exportName\.addEventListener\("input", \(\) => this\.syncExportFormat\(\)\)/);
});

test("the status bar reports the selection position", () => {
  assert.match(editor, /@ \$\{Math\.round\(selectionRect\.x\)\},\$\{Math\.round\(selectionRect\.y\)\}\$\{mode\}`/);
});

test("non-neutral adjustment values are highlighted", () => {
  assert.match(editor, /output\.dataset\.active = value !== 0 \? "true" : "false"/);
  assert.match(styles, /\.adjust-list \.field output\[data-active="true"\] \{[^}]*font-weight: 700/);
});

test("the text editor shows a live character counter", () => {
  assert.match(html, /id="text-count"[^>]*>0\/200<\/output>/);
  assert.match(editor, /textCount\.textContent = `\$\{length\}\/200`/);
  assert.match(editor, /textCount\.dataset\.near = length >= 180 \? "true" : "false"/);
  assert.match(styles, /\.text-count\[data-near="true"\]/);
});

test("the text Add button disables when the input is empty", () => {
  assert.match(editor, /syncTextCommit\(\) \{[\s\S]{0,180}textCommit\.disabled = empty/);
  assert.match(editor, /textCommit\.title = empty \? "Add text — type something first" : "Add text to the layer \(Enter\)"/);
  assert.match(editor, /textInput\.addEventListener\("input"[\s\S]{0,80}this\.syncTextCommit\(\)/);
});

test("the shape badge marks when Shift snaps the geometry", () => {
  assert.match(editor, /Math\.round\(angle\)\}° @ \$\{Math\.round\(start\.x\)\},\$\{Math\.round\(start\.y\)\}\$\{this\.action\.shift \? " · snapped" : ""\}/);
  assert.match(editor, /this\.action\.shift \? \(this\.action\.tool === "ellipse" \? " · circle" : " · square"\) : ""/);
});

test("the crop badge shows the locked aspect ratio", () => {
  assert.match(html, /<option value="1\.7777777778" data-label="16:9">16:9<\/option>/);
  assert.match(editor, /this\.el\.cropAspect\.selectedOptions\[0\]\?\.dataset\.label \|\| aspect/);
  assert.match(editor, /Math\.round\(crop\.y\)\}\$\{aspectLabel \? ` · \$\{aspectLabel\}` : ""\}/);
});

test("keyboard nudges announce the direction and distance", () => {
  assert.match(editor, /const direction = dx < 0 \? "left" : dx > 0 \? "right" : dy < 0 \? "up" : "down"/);
  assert.match(editor, /this\.announce\(`Nudged \$\{layer\.name\} \$\{direction\} \$\{Math\.abs\(dx \|\| dy\)\} px\.`\)/);
});

test("the clone guide shows the exact source offset", () => {
  assert.match(editor, /const offX = Math\.round\(pointerDoc\.x - currentSource\.x\)/);
  assert.match(editor, /const label = `Clone Δ \$\{offX >= 0 \? "\+" : ""\}\$\{offX\}, \$\{offY >= 0 \? "\+" : ""\}\$\{offY\} px`/);
});

test("the histogram has a visible RGB and luminance legend", () => {
  assert.match(html, /class="histogram-legend"[^>]*>[\s\S]{0,300}data-ch="r"[\s\S]{0,240}data-ch="l"/);
  for (const ch of ["r", "g", "b", "l"]) {
    assert.ok(styles.includes(`.histogram-legend i[data-ch="${ch}"]`));
  }
});

test("moving a layer shows a live offset badge", () => {
  assert.match(editor, /\(this\.action\?\.type === "move" \|\| this\.action\?\.type === "move-selection"\)/);
  assert.match(editor, /const label = `Δ \$\{dx >= 0 \? "\+" : ""\}\$\{dx\}, \$\{dy >= 0 \? "\+" : ""\}\$\{dy\} px\$\{this\.action\.shift \? " · axis" : ""\}`/);
});

test("signed adjustment readouts show an explicit plus for positive values", () => {
  assert.match(editor, /const signed = \["brightness", "contrast", "saturation", "hue"\]\.includes\(key\)/);
  assert.match(editor, /return signed && rounded > 0 \? `\+\$\{rounded\}` : String\(rounded\)/);
});

test("the eyedropper shows a live colour loupe at the cursor", () => {
  assert.match(editor, /this\.tool === "eyedropper" && this\.pointer && this\.pointInsideDoc/);
  assert.match(editor, /getImageData\(sx, sy, 1, 1\)\.data/);
  assert.match(editor, /rgbToHex\(\{ r: sample\[0\], g: sample\[1\], b: sample\[2\] \}\)/);
  assert.match(editor, /context\.fillText\(hex \?\? "transparent"/);
});

test("the brush cursor shows an inner ring for brush hardness", () => {
  assert.match(editor, /const hardness =\s*this\.tool === "brush"[\s\S]{0,260}this\.options\.dodge\.hardness/);
  assert.match(editor, /if \(hardness < 0\.98\) \{[\s\S]{0,200}radius \* hardness/);
  assert.match(editor, /context\.setLineDash\(\[3, 3\]\)/);
});

test("layers with non-default opacity or blend show a compact badge", () => {
  assert.match(editor, /if \(opacityPct !== 100\) meta\.push\(`\$\{opacityPct\}%`\)/);
  assert.match(editor, /if \(layer\.blendMode && layer\.blendMode !== "normal"\) meta\.push\(layer\.blendMode\)/);
  assert.match(editor, /badge\.className = "layer-meta"/);
  assert.match(styles, /\.layer-name \.layer-meta \{[\s\S]{0,160}var\(--cyan\)/);
});

test("a locked or hidden layer shows a visible notice in Tool options", () => {
  assert.match(html, /id="edit-lock-notice"[^>]*hidden/);
  assert.match(editor, /editLockNotice\.hidden = !cannotEditLayer/);
  assert.match(editor, /\$\{layer\.name\} is \$\{layer\.locked \? "locked" : "hidden"\} — \$\{editLock\} to edit it\./);
  assert.match(styles, /\.edit-lock-notice \{[\s\S]{0,200}var\(--pink\)/);
});

test("destructive controls explain why a locked layer disables them", () => {
  assert.match(editor, /if \(control\.dataset\.baseTitle === undefined\) control\.dataset\.baseTitle = control\.title/);
  assert.match(editor, /control\.title = cannotEditLayer \? `Unavailable — \$\{editLock\}` : control\.dataset\.baseTitle/);
});

test("opacity, blend and adjustment sliders explain why a locked layer blocks them", () => {
  assert.match(editor, /const editLock = layer\.locked \? "unlock the layer first" : "show the layer first"/);
  assert.match(editor, /layerOpacity\.title = cannotEditLayer \? `Layer opacity — \$\{editLock\}` : "Layer opacity"/);
  assert.match(editor, /layerBlend\.title = cannotEditLayer \? `Blend mode — \$\{editLock\}` : "Blend mode"/);
  assert.match(editor, /input\.title = cannotEditLayer[\s\S]{0,120}\$\{editLock\}/);
});

test("crop Apply and Cancel explain why they are disabled", () => {
  assert.match(editor, /cropApply\.title = isUsableRect\(this\.cropRect\)[\s\S]{0,100}"Apply crop — draw a crop region first"/);
  assert.match(editor, /cropCancel\.title = this\.cropRect \? "Cancel the crop \(Escape\)" : "Cancel — no active crop"/);
});

test("Paste explains why it is disabled when the clipboard is empty", () => {
  assert.match(editor, /btnPaste\.title = this\.clipboard[\s\S]{0,80}"Paste — copy or cut something first"/);
});

test("the text draft shows a live bounding box and size", () => {
  assert.match(editor, /FONT_STACKS\[this\.options\.text\.family\] \?\? FONT_STACKS\.system/);
  assert.match(editor, /const label = `\$\{Math\.round\(maxWidth\)\} × \$\{Math\.round\(\(lines\.length - 1\) \* lineHeight \+ fontSize\)\} px @ \$\{Math\.round\(this\.textDraft\.point\.x\)\},\$\{Math\.round\(this\.textDraft\.point\.y\)\}`/);
  assert.match(editor, /context\.strokeRect\(tx - 2, ty - 2, boxW \+ 4, boxH \+ 4\)/);
});

test("the clone source links to the cursor with a dashed guide", () => {
  assert.match(editor, /if \(this\.pointer && this\.pointInsideDoc\(this\.toDoc\(this\.pointer\)\)\) \{[\s\S]{0,240}context\.moveTo\(source\.x, source\.y\);[\s\S]{0,60}context\.lineTo\(this\.pointer\.x, this\.pointer\.y\)/);
  assert.match(editor, /context\.setLineDash\(\[5, 4\]\)/);
});

test("the shape drag shows a live length/angle or size badge", () => {
  assert.match(editor, /if \(this\.action\.tool === "line"\) \{[\s\S]{0,220}const angle = \(Math\.atan2\(dy, dx\) \* 180\) \/ Math\.PI/);
  assert.match(editor, /label = `\$\{Math\.round\(Math\.abs\(dx\)\)\} × \$\{Math\.round\(Math\.abs\(dy\)\)\} px @ \$\{Math\.round\(Math\.min\(start\.x, end\.x\)\)\},\$\{Math\.round\(Math\.min\(start\.y, end\.y\)\)\}\$\{constrained\}`/);
  assert.match(editor, /context\.fillText\(label, bx \+ 6, by \+ 9\)/);
});

test("the gradient drag shows a live angle and length guide", () => {
  assert.match(editor, /const length = Math\.hypot\(end\.x - start\.x, end\.y - start\.y\)/);
  assert.match(editor, /const angle = \(Math\.atan2\(end\.y - start\.y, end\.x - start\.x\) \* 180\) \/ Math\.PI/);
  assert.match(editor, /const label = `\$\{Math\.round\(length\)\} px · \$\{Math\.round\(angle\)\}° @ \$\{Math\.round\(start\.x\)\},\$\{Math\.round\(start\.y\)\}\$\{this\.action\.shift \? " · snapped" : ""\}`/);
  assert.match(editor, /context\.arc\(hx, hy, 4, 0, Math\.PI \* 2\)/);
});

test("the selection marquee shows its live size and position while dragging", () => {
  assert.match(editor, /const label = `\$\{Math\.round\(marquee\.rect\.w\)\} × \$\{Math\.round\(marquee\.rect\.h\)\} px @ \$\{Math\.round\(marquee\.rect\.x\)\},\$\{Math\.round\(marquee\.rect\.y\)\}`/);
  assert.match(editor, /const sx = this\.view\.offsetX \+ marquee\.rect\.x \* this\.view\.scale/);
  assert.match(editor, /context\.fillText\(label, bx \+ 6, by \+ 9\)/);
});

test("the crop overlay shows a live dimension badge", () => {
  assert.match(editor, /const label = `\$\{Math\.round\(crop\.w\)\} × \$\{Math\.round\(crop\.h\)\} px @ \$\{Math\.round\(crop\.x\)\},\$\{Math\.round\(crop\.y\)\}\$\{aspectLabel \? ` · \$\{aspectLabel\}` : ""\}`/);
  assert.match(editor, /context\.measureText\(label\)\.width/);
  assert.match(editor, /context\.fillText\(label, bx \+ 6, by \+ 9\)/);
});

test("the status bar reflects the active Marquee shape", () => {
  assert.match(editor, /this\.tool === "marquee" && this\.options\.marquee\.kind === "ellipse"\) modeNote = " · Ellipse"/);
  assert.match(editor, /marqueeShape\.addEventListener\("change"[\s\S]{0,180}this\.syncToolOptions\(\)/);
});

test("selection controls explain why they are disabled with no selection", () => {
  assert.match(editor, /btnDeselect\.title = this\.selection[\s\S]{0,60}"Deselect — no active selection"/);
  assert.match(editor, /btnExpandSelection\.title = this\.selection[\s\S]{0,80}"Expand — no active selection"/);
  assert.match(editor, /btnContractSelection\.title = this\.selection[\s\S]{0,80}"Contract — no active selection"/);
  assert.match(editor, /btnClearSelection\.title = this\.selection[\s\S]{0,90}"Clear — no active selection"/);
});

test("Crop to selection explains why it is disabled for an inverted selection", () => {
  assert.match(editor, /Crop to selection — deselect inversion first/);
  assert.match(editor, /Crop to selection — make a selection first/);
});

test("the Adjustments Reset button disables on locked or hidden layers too", () => {
  assert.match(editor, /adjustReset\.disabled = cannotEditLayer \|\| isNeutralAdjustments\(layer\.adjustments\)/);
});

test("the drop hint advertises both supported file types", () => {
  assert.match(html, /id="drop-hint"[^>]*>Drop an image or a \.palette project to open it<\/div>/);
  assert.match(editor, /palette\|json.*test\(file\.name\)/);
});

test("the Zoom tool shows a zoom-out cursor while Alt is held", () => {
  assert.match(editor, /this\.altDown = false/);
  assert.match(editor, /this\.tool === "zoom" && this\.altDown\) cursor = "zoom-out"/);
  assert.match(editor, /event\.altKey !== this\.altDown/);
  assert.match(editor, /event\.key === "Alt" \|\| event\.altKey === false/);
  assert.match(styles, /\.stage\[data-cursor="zoom-out"\] \{ cursor: zoom-out; \}/);
});

test("paint cursor and size ring hide when the active layer is not editable", () => {
  assert.match(editor, /activeLayerEditable\(\)\s*\{[\s\S]{0,160}layer\.visible && !layer\.locked/);
  assert.match(editor, /paintTool && !this\.activeLayerEditable\(\)\) cursor = "not-allowed"/);
  assert.match(editor, /this\.tool === "dodge"\) &&\s*this\.activeLayerEditable\(\)/);
  assert.match(styles, /\.stage\[data-cursor="not-allowed"\]\s*\{[^}]*cursor:\s*not-allowed/);
});

test("the status bar reflects the active Dodge/Burn mode", () => {
  assert.match(editor, /this\.tool === "dodge" && this\.options\.dodge\.mode === "burn"\) modeNote = " · Burn"/);
  assert.match(editor, /const statusLabel = `\$\{meta\.label\}\$\{modeNote\}`/);
  assert.match(editor, /dodgeMode\.addEventListener\("change"[\s\S]{0,160}this\.syncToolOptions\(\)/);
});

test("Flatten and Stamp Visible disable when there is nothing to merge", () => {
  assert.match(editor, /const canFlatten = hasVisible && this\.doc\.layers\.length > 1/);
  assert.match(editor, /btnFlatten\.disabled = !canFlatten/);
  assert.match(editor, /btnStampVisible\.disabled = !hasVisible/);
  assert.match(editor, /Flatten — show at least one layer/);
});

test("successful file operations get a positive status tone", () => {
  assert.match(editor, /announce\(message, \{ error = false, ok = false \} = \{\}\)/);
  assert.match(editor, /target\.dataset\.tone = error \? "error" : ok \? "ok" : ""/);
  assert.match(editor, /Saved \$\{name\}[\s\S]{0,60}\{ ok: true \}/);
  assert.match(editor, /Exported \$\{format\.label\}[\s\S]{0,60}\{ ok: true \}/);
  assert.match(styles, /#status-message\[data-tone="ok"\]\s*\{[^}]*color:\s*var\(--good\)/);
});

test("the transform dialog previews the resulting content size", () => {
  assert.match(html, /id="transform-size"[^>]*aria-live="polite"/);
  assert.match(editor, /"transform-rotation-value",\s*"transform-size"/);
  assert.match(editor, /syncTransformSize\(\)\s*\{[\s\S]{0,900}Content will be \$\{nextW\} × \$\{nextH\} px/);
  assert.match(editor, /transformScaleX\.addEventListener\("input", \(\) => this\.syncTransformSize\(\)\)/);
  assert.match(editor, /transformSize\.dataset\.tone = offCanvas \? "warn" : "muted"/);
});

test("discarding a recovered session reads as a destructive choice", () => {
  assert.match(html, /class="btn btn-ghost btn-danger"[^>]*id="restore-discard"[^>]*title="Discard the local autosave/);
  assert.match(html, /id="restore-confirm"[^>]*title="Restore the autosaved document"/);
  assert.match(styles, /\.btn-ghost\.btn-danger\s*\{[^}]*color:\s*var\(--danger\)/);
});

test("the export size readout warns visually when capped", () => {
  assert.match(editor, /syncExportFormat\(\)\s*\{[\s\S]{0,700}const capped = percent < Math\.round\(scale \* 100\)/);
  assert.match(editor, /exportSize\.dataset\.tone = capped \? "warn" : "muted"/);
});

test("the histogram marks the tonal range used by Auto levels", () => {
  assert.match(editor, /drawHistogram\(\)\s*\{[\s\S]{0,2600}for \(const level of \[range\.black, range\.white\]\)/);
  assert.match(editor, /Math\.round\(\(level \/ 255\) \* \(canvas\.width - 1\)\)/);
});

test("every filter button explains its effect on hover", () => {
  const filterButtons = [...html.matchAll(/<button[^>]*id="btn-filter-[^"]+"[^>]*>/g)].map((m) => m[0]);
  assert.equal(filterButtons.length, 22);
  for (const tag of filterButtons) {
    assert.match(tag, /title="[^"]+"/);
  }
  assert.match(html, /id="btn-filter-high-pass"[^>]*title="Isolate high-frequency detail for sharpening"/);
  assert.match(html, /id="btn-filter-median"[^>]*title="Remove noise spikes with a 3x3 median filter"/);
  assert.match(html, /id="btn-filter-bc"[^>]*title="Adjust brightness and contrast together"/);
});

test("the inline text and crop actions show their Enter/Escape shortcuts", () => {
  assert.match(html, /id="text-commit"[^>]*title="Add text to the layer \(Enter\)"/);
  assert.match(html, /id="text-cancel"[^>]*title="Discard the text \(Escape\)"/);
  assert.match(html, /id="crop-apply"[^>]*title="Apply the crop \(Enter\)"/);
  assert.match(html, /id="crop-cancel"[^>]*title="Cancel the crop \(Escape\)"/);
});

test("preset colour swatches show their name and hex on hover", () => {
  const swatches = [...html.matchAll(/<button class="btn-swatch"[^>]*>/g)].map((m) => m[0]);
  assert.equal(swatches.length, 9);
  for (const tag of swatches) {
    assert.match(tag, /title="[A-Z][a-z]+ \(#[0-9a-f]{6}\)"/);
  }
  assert.match(html, /title="Cyan \(#22d3ee\)"/);
  assert.match(html, /title="Purple \(#a855f7\)"/);
});

test("a Clear selection button exposes the Delete action", () => {
  assert.match(html, /id="btn-clear-selection"[^>]*data-ui="clear-selection"[^>]*disabled[^>]*title="Clear pixels inside the selection \(Delete\)"/);
  assert.match(editor, /"btn-contract-selection", "btn-clear-selection"/);
  assert.match(editor, /btnClearSelection\.disabled = !this\.selection/);
  assert.match(editor, /btnClearSelection\.addEventListener\("click", \(\) => this\.clearSelectedPixels\(\)\)/);
});

test("Ctrl+Shift+O opens a project and is advertised everywhere", () => {
  assert.match(editor, /key === "o"[\s\S]{0,160}if \(event\.shiftKey\) this\.el\.fileProject\.click\(\)/);
  assert.match(editor, /btnOpenProject: "Control\+Shift\+O Meta\+Shift\+O"/);
  assert.match(html, /<dt>Ctrl \/ Cmd \+ Shift \+ O<\/dt><dd>Open a \.palette project<\/dd>/);
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
  assert.match(editor, /control\.disabled = cannotEditLayer/);
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
  assert.match(editor, /for \(const name of DESTRUCTIVE_ACTIONS\)[\s\S]{0,220}control\.disabled = cannotEditLayer/);
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
  assert.match(editor, /adjustReset\.disabled = cannotEditLayer \|\| isNeutralAdjustments\(layer\.adjustments\)/);
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
  const body = editor.slice(editor.indexOf("  onKeyDown("), editor.indexOf("  onKeyDown(") + 800);
  assert.match(body, /event\.key === "F1"[\s\S]{0,140}helpDialog\.showModal\(\)/);
  assert.match(html, /<dt>F1<\/dt><dd>Open this shortcut list<\/dd>/);
});

test("the status bar readouts explain themselves", () => {
  assert.match(html, /id="status-cursor"[^>]*title="Pointer position in document pixels"/);
  assert.match(html, /id="status-zoom"[^>]*title="Click to toggle Fit \/ 100%"/);
});

test("the status bar names the active tool and its shortcut", () => {
  assert.match(editor, /const TOOL_KEYS = Object\.freeze\(\{[\s\S]*?move: "V"[\s\S]*?zoom: "Z"/);
  assert.match(editor, /statusTool\.textContent = toolKey \? `\$\{statusLabel\} \(\$\{toolKey\}\)`/);
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

test("the Layers panel shows the count without repeating the word layers", () => {
  assert.match(html, /id="layers-heading"[^>]*>Layers <span id="layer-count"/);
  assert.match(styles, /\.layer-count\s*\{[^}]*font-family:\s*var\(--mono\)/);
  assert.match(editor, /"layer-blend",\s*"layer-count"/);
  assert.match(editor, /layerCount\.textContent = String\(layers\.length\)/);
  assert.match(editor, /layerCount\.setAttribute\("aria-label", label\)/);
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
  const body = editor.slice(editor.indexOf("  openExportDialog()"), editor.indexOf("  openExportDialog()") + 900);
  assert.match(body, /exportName\.value\s*=\s*this\.doc\.name/);
  assert.match(body, /exportDialog\.showModal\(\)[\s\S]*?exportName\.focus\(\)/);
  assert.match(body, /exportName\.select\(\)/);
});

test("the filters panel is grouped into scannable sections", () => {
  for (const label of ["Essentials", "Stylize", "Levels", "Tone", "Colour balance", "Effects", "Textures"]) {
    assert.match(html, new RegExp(`<h3 class="filter-group"[^>]*>${label}</h3>`), `${label} group`);
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
  assert.match(editor, /`Selection \$\{Math\.round\(selectionRect\.w\)\}×\$\{Math\.round\(selectionRect\.h\)\} @ \$\{Math\.round\(selectionRect\.x\)\},\$\{Math\.round\(selectionRect\.y\)\}\$\{mode\}`/);
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
