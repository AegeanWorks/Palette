import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const theme = readFileSync(new URL("../src/theme.css", import.meta.url), "utf8");
const main = readFileSync(new URL("../src/ui/main.js", import.meta.url), "utf8");

function ids() {
  return new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
}

function uiNames() {
  return [...html.matchAll(/data-ui="([^"]+)"/g)].map((match) => match[1]);
}

test("the shell carries every critical editor surface", () => {
  const found = ids();
  for (const id of [
    "stage",
    "overlay",
    "doc-frame",
    "layer-list",
    "text-editor",
    "new-dialog",
    "export-dialog",
    "resize-dialog",
    "help-dialog",
    "btn-undo",
    "btn-redo",
    "btn-save",
    "btn-export",
    "btn-layer-add",
    "btn-layer-image",
    "btn-layer-merge",
    "btn-layer-lock",
    "btn-layer-clip",
    "btn-layer-delete",
    "file-layer",
    "layer-blend",
    "options-gradient",
    "gradient-type",
    "gradient-end",
    "gradient-fade",
    "gradient-opacity",
    "options-marquee",
    "marquee-shape",
    "btn-select-all",
    "btn-deselect",
    "btn-invert-selection",
    "btn-crop-selection",
    "level-black",
    "level-white",
    "level-gamma",
    "btn-filter-levels",
    "histogram",
    "histogram-range",
    "btn-auto-levels",
    "crop-aspect",
    "btn-flatten",
    "btn-canvas-size",
    "btn-transform",
    "canvas-dialog",
    "canvas-width",
    "canvas-height",
    "transform-dialog",
    "transform-scale-x",
    "transform-scale-y",
    "transform-rotation",
    "transform-flip-h",
    "transform-flip-v",
    "export-scale",
    "btn-copy",
    "btn-cut",
    "btn-paste",
    "btn-layer-via-copy",
    "btn-layer-via-cut",
    "status-autosave",
    "restore-dialog",
    "restore-summary",
    "restore-confirm",
    "restore-discard",
    "crop-apply",
    "crop-cancel",
  ]) {
    assert.ok(found.has(id), `missing #${id}`);
  }
});

test("every tool and panel control is named once", () => {
  const tools = [...html.matchAll(/data-tool="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(tools, [
    "move",
    "brush",
    "eraser",
    "clone",
    "dodge",
    "crop",
    "marquee",
    "text",
    "rect",
    "ellipse",
    "line",
    "gradient",
    "eyedropper",
    "hand",
    "zoom",
  ]);
  const names = uiNames();
  assert.ok(names.length >= 40, "the UI inventory is unexpectedly small");
  assert.equal(new Set(names).size, names.length, "duplicate data-ui name");
  for (const button of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    const [, attributes, body] = button;
    const text = body.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    assert.ok(text.length > 0 || /aria-label="[^"]+"/.test(attributes), `unlabelled button: ${attributes}`);
  }
  assert.doesNotMatch(html, /\son\w+=/i);
});

test("the layer panel exposes the full blend mode set", () => {
  const select = html.match(/<select id="layer-blend">([\s\S]*?)<\/select>/);
  assert.ok(select, "missing layer-blend select");
  const values = [...select[1].matchAll(/value="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(values, [
    "normal",
    "multiply",
    "screen",
    "overlay",
    "darken",
    "lighten",
    "color-dodge",
    "color-burn",
    "hard-light",
    "soft-light",
    "difference",
    "exclusion",
    "hue",
    "saturation",
    "color",
    "luminosity",
  ]);
  assert.match(html, /data-ui="layer-merge"/);
  assert.match(html, /data-ui="layer-lock"/);
  assert.match(html, /data-ui="layer-clip"/);
  assert.match(styles, /\.blend-row/);
  assert.match(styles, /\.layer-lock/);
  assert.match(styles, /\.layer-clip/);
});

test("the dodge panel exposes mode, size, hardness and strength", () => {
  assert.match(html, /data-ui="tool-dodge"/);
  assert.match(html, /id="options-dodge"/);
  assert.match(html, /id="dodge-mode"[\s\S]*?value="burn"/);
  assert.match(html, /id="dodge-size" type="range"/);
  assert.match(html, /id="dodge-hardness" type="range"/);
  assert.match(html, /id="dodge-strength" type="range"/);
});

test("the clone panel exposes size, hardness and opacity", () => {
  assert.match(html, /data-ui="tool-clone"/);
  assert.match(html, /id="options-clone"/);
  assert.match(html, /id="clone-size" type="range"/);
  assert.match(html, /id="clone-hardness" type="range"/);
  assert.match(html, /id="clone-opacity" type="range"/);
  assert.match(html, /Alt-click a source point/);
});

test("the gradient panel exposes type, end colour, fade and opacity", () => {
  assert.match(html, /id="gradient-type"[\s\S]*?value="radial"/);
  assert.match(html, /id="gradient-end" type="color"/);
  assert.match(html, /id="gradient-fade" type="checkbox" checked/);
  assert.match(html, /id="gradient-opacity" type="range"/);
});

test("the marquee panel exposes shape and selection commands", () => {
  assert.match(html, /id="options-marquee"/);
  assert.match(html, /id="marquee-shape"[\s\S]*?value="ellipse"/);
  assert.match(html, /id="btn-select-all"/);
  assert.match(html, /id="btn-deselect"/);
  assert.match(html, /id="btn-invert-selection"/);
  assert.match(html, /id="btn-crop-selection"/);
  assert.match(html, /id="btn-copy"/);
  assert.match(html, /id="btn-cut"/);
  assert.match(html, /id="btn-paste" type="button" data-ui="paste" disabled/);
  assert.match(html, /id="btn-layer-via-copy"/);
  assert.match(html, /id="btn-layer-via-cut"/);
  assert.match(html, /adjustments stay layer-wide/i);
});

test("the shell exposes the local autosave restore surface", () => {
  assert.match(html, /id="status-autosave"/);
  assert.match(html, /id="restore-dialog"/);
  assert.match(html, /id="restore-summary"/);
  assert.match(html, /id="restore-confirm"/);
  assert.match(html, /id="restore-discard"/);
  assert.match(styles, /\.status-autosave/);
});

test("the filter panel exposes Levels controls", () => {
  assert.match(html, /id="level-black" type="range"/);
  assert.match(html, /id="level-white" type="range"/);
  assert.match(html, /id="level-gamma" type="range"/);
  assert.match(html, /id="btn-filter-levels"/);
});

test("the crop panel exposes ratio presets and the document row exposes Flatten", () => {
  assert.match(html, /id="crop-aspect"[\s\S]*?value="1"[\s\S]*?value="1\.3333333333"/);
  assert.match(html, /id="btn-flatten"/);
  assert.match(html, /data-ui="flatten"/);
});

test("the adjustments panel exposes a histogram and Auto levels", () => {
  assert.match(html, /id="histogram" width="256" height="64"/);
  assert.match(html, /id="histogram-range"/);
  assert.match(html, /id="btn-auto-levels"/);
  assert.match(styles, /\.histogram-panel/);
});

test("the layer transform dialog exposes scale, rotation and flips", () => {
  assert.match(html, /id="btn-transform"/);
  assert.match(html, /id="transform-dialog"/);
  assert.match(html, /id="transform-scale-x"/);
  assert.match(html, /id="transform-scale-y"/);
  assert.match(html, /id="transform-rotation"/);
  assert.match(html, /id="transform-flip-h"/);
  assert.match(html, /id="transform-flip-v"/);
});

test("canvas size and export scale surfaces are complete", () => {
  assert.match(html, /id="btn-canvas-size"/);
  assert.match(html, /id="canvas-dialog"/);
  assert.equal((html.match(/name="canvas-anchor"/g) ?? []).length, 9);
  assert.match(html, /id="canvas-width"/);
  assert.match(html, /id="canvas-height"/);
  assert.match(html, /id="export-scale"[\s\S]*?value="0\.25"[\s\S]*?value="4"/);
  assert.match(styles, /\.anchor-grid/);
});

test("the page is self-contained and CSP-compatible", () => {
  assert.match(html, /<html lang="en">/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /http-equiv="Content-Security-Policy"/);
  assert.match(html, /script-src 'self'/);
  assert.match(html, /object-src 'none'/);
  assert.match(html, /base-uri 'none'/);
  assert.match(html, /<script type="module" src="\.\/src\/ui\/main\.js"><\/script>/);
  assert.match(html, /href="\.\/src\/theme\.css"/);
  assert.match(html, /href="\.\/src\/styles\.css"/);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/);
  assert.doesNotMatch(html, /(?:src|href)="https?:\/\/(?:fonts|cdn|unpkg|jsdelivr)/);
  assert.match(main, /globalThis\.palette = editor/);
});

test("the layout and theme expose the editor primitives", () => {
  for (const token of [".workspace", ".tool-rail", ".stage-wrap", ".doc-frame", ".panel-column", ".layer-item", ".dialog"]) {
    assert.ok(styles.includes(token), `missing ${token}`);
  }
  for (const token of ["--bg", "--panel", "--cyan", "--violet", "--sans", "--mono"]) {
    assert.ok(theme.includes(token), `missing ${token}`);
  }
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(styles, /prefers-reduced-motion/);
});

test("every local module import resolves", () => {
  const queue = ["src/ui/main.js", "src/ui/editor.js", "src/ui/canvas.js", "src/ui/paint.js"];
  const seen = new Set();
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(resolve(root, file), "utf8");
    for (const match of source.matchAll(/\bfrom\s+"([^"]+)"/g)) {
      const specifier = match[1];
      if (!specifier.startsWith(".")) continue;
      const target = resolve(dirname(resolve(root, file)), specifier);
      assert.ok(existsSync(target), `${file} imports missing ${specifier}`);
      const relative = target.slice(root.length + 1).replaceAll("\\", "/");
      if (relative.endsWith(".js")) queue.push(relative);
    }
  }
  assert.ok(seen.size >= 8);
});

test("editor keyboard shortcuts and paste routing cover retouching and placement", () => {
  const editorSource = readFileSync(resolve(root, "src/ui/editor.js"), "utf8");
  for (const tool of ["move", "brush", "eraser", "clone", "dodge", "crop", "marquee", "text", "rect", "ellipse", "line", "gradient", "eyedropper", "hand", "zoom"]) {
    assert.match(editorSource, new RegExp(`\\b${tool}\\b`));
  }
  assert.match(editorSource, /key === "g" && event\.altKey[\s\S]*?toggleClippingMask/);
  assert.match(editorSource, /if \(this\.doc\) \{\s*this\.addImageLayer\(file\);\s*\} else \{\s*this\.openImageFile\(file\);\s*\}/);
  assert.match(editorSource, /if \(this\.clipboard\) \{\s*event\.preventDefault\(\);\s*this\.pasteClipboard\(\);\s*\}/);
  assert.match(editorSource, /action\?\.type === "clone"[\s\S]*?action\.last\.x \+ this\.action\.offset\.x/);
  assert.match(editorSource, /copySelection\(\) \{\s*if \(!this\.doc\) return;\s*this\.finishText\(\);/);
  assert.match(editorSource, /cutSelection\(\) \{\s*if \(!this\.doc\) return;\s*this\.finishText\(\);/);
  assert.match(editorSource, /clearSelectedPixels\(\) \{\s*if \(!this\.selection\) return;\s*this\.finishText\(\);/);
});
