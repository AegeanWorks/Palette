import test from "node:test";
import assert from "node:assert/strict";

import {
  BLEND_MODES,
  activeLayer,
  addLayer,
  blendOperation,
  createDocument,
  createLayer,
  duplicateLayerRecord,
  layerById,
  moveLayer,
  nextLayerName,
  normalizeBlendMode,
  removeLayer,
  resizeDocument,
  setActiveLayer,
  updateLayer,
} from "../src/core/document.js";

test("a document always starts with a usable active layer", () => {
  const doc = createDocument({ width: 320, height: 200 });
  assert.equal(doc.width, 320);
  assert.equal(doc.height, 200);
  assert.equal(doc.layers.length, 1);
  assert.equal(doc.activeLayerId, doc.layers[0].id);
  assert.equal(activeLayer(doc).name, "Background");
});

test("layer creation clamps opacity and names", () => {
  const layer = createLayer({ name: "", opacity: 2 });
  assert.equal(layer.name, "Layer");
  assert.equal(layer.opacity, 1);
  assert.equal(createLayer({ opacity: -1 }).opacity, 0);
  assert.equal(createLayer({ visible: false }).visible, false);
});

test("blend modes are whitelisted and map to canvas operations", () => {
  assert.equal(createLayer().blendMode, "normal");
  assert.equal(createLayer({ blendMode: "multiply" }).blendMode, "multiply");
  assert.equal(createLayer({ blendMode: "not-real" }).blendMode, "normal");
  assert.equal(createLayer({ blendMode: null }).blendMode, "normal");
  assert.equal(createLayer().locked, false);
  assert.equal(createLayer({ locked: true }).locked, true);
  assert.equal(normalizeBlendMode("screen"), "screen");
  assert.equal(normalizeBlendMode("source-over"), "normal");
  assert.equal(blendOperation("normal"), "source-over");
  assert.equal(blendOperation("color-dodge"), "color-dodge");
  assert.equal(blendOperation("nope"), "source-over");
  assert.ok(Object.isFrozen(BLEND_MODES));
  assert.equal(BLEND_MODES.luminosity, "Luminosity");
});

test("adding, reordering and removing layers keeps references stable", () => {
  const first = createDocument({ width: 100, height: 100 });
  const second = createLayer({ name: "Second" });
  const withSecond = addLayer(first, second);
  assert.equal(withSecond.activeLayerId, second.id);
  assert.deepEqual(withSecond.layers.map((layer) => layer.name), ["Background", "Second"]);

  const moved = moveLayer(withSecond, second.id, -1);
  assert.deepEqual(moved.layers.map((layer) => layer.name), ["Second", "Background"]);
  assert.equal(layerById(moved, second.id).name, "Second");

  const removed = removeLayer(moved, second.id);
  assert.equal(removed.layers.length, 1);
  assert.equal(removed.activeLayerId, removed.layers[0].id);
  assert.equal(removeLayer(moved, "missing"), moved);
});

test("layer patches replace only the matching record", () => {
  const doc = createDocument({ width: 100, height: 100 });
  const other = createLayer({ name: "Other" });
  const two = addLayer(doc, other);
  const patched = updateLayer(two, doc.layers[0].id, { opacity: 0.5, name: "Base" });
  assert.equal(patched.layers[0].name, "Base");
  assert.equal(patched.layers[0].opacity, 0.5);
  assert.strictEqual(patched.layers[1], two.layers[1]);
  assert.strictEqual(updateLayer(two, "missing", { name: "x" }), two);
  assert.equal(setActiveLayer(two, "missing"), two);
});

test("duplicate records share pixels unless a canvas is supplied", () => {
  const source = createLayer({ name: "Photo", canvas: { id: "pixels" } });
  const copy = duplicateLayerRecord(source);
  assert.equal(copy.name, "Photo copy");
  assert.strictEqual(copy.canvas, source.canvas);
  const cloned = duplicateLayerRecord(source, { canvas: { id: "clone" } });
  assert.equal(cloned.canvas.id, "clone");
});

test("layer names skip existing entries and resizing rounds dimensions", () => {
  const doc = createDocument({
    width: 100,
    height: 100,
    layers: [createLayer({ name: "Layer 2" }), createLayer({ name: "Layer 3" })],
  });
  assert.equal(nextLayerName(doc), "Layer 4");
  const resized = resizeDocument(doc, 640.4, 0);
  assert.equal(resized.width, 640);
  assert.equal(resized.height, 1);
});
