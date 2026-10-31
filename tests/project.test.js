import test from "node:test";
import assert from "node:assert/strict";

import { createDocument, createLayer } from "../src/core/document.js";
import {
  MAX_DIMENSION,
  MAX_PIXELS,
  PROJECT_FORMAT,
  PROJECT_VERSION,
  boundedDimensions,
  cleanDimension,
  cleanDocumentName,
  parseProject,
  serializeProject,
} from "../src/core/project.js";

const IMAGE = "data:image/png;base64,iVBORw0KGgo=";

function sample() {
  const doc = createDocument({
    width: 640,
    height: 480,
    name: "  Study   one  ",
    layers: [
      createLayer({ id: "base", name: "Base", opacity: 0.8, adjustments: { brightness: 12 } }),
      createLayer({ id: "top", name: "Top", visible: false, blendMode: "multiply", locked: true }),
    ],
    activeLayerId: "top",
  });
  return doc;
}

test("projects round-trip through JSON", () => {
  const doc = sample();
  const text = serializeProject(doc, { base: IMAGE, top: IMAGE });
  const data = JSON.parse(text);
  assert.equal(data.format, PROJECT_FORMAT);
  assert.equal(data.version, PROJECT_VERSION);
  assert.equal(data.name, "Study one");
  assert.equal(data.layers[0].adjustments.brightness, 12);
  assert.equal(data.layers[0].blendMode, "normal");
  assert.equal(data.layers[0].locked, false);
  assert.equal(data.layers[1].blendMode, "multiply");
  assert.equal(data.layers[1].locked, true);

  const parsed = parseProject(text);
  assert.equal(parsed.name, "Study one");
  assert.equal(parsed.width, 640);
  assert.equal(parsed.layers.length, 2);
  assert.equal(parsed.activeLayerId, "top");
  assert.equal(parsed.layers[0].opacity, 0.8);
  assert.equal(parsed.layers[1].visible, false);
  assert.equal(parsed.layers[1].blendMode, "multiply");
  assert.equal(parsed.layers[1].locked, true);
});

test("names and dimensions are cleaned and bounded", () => {
  assert.equal(cleanDocumentName("   "), "Untitled");
  assert.equal(cleanDocumentName("a\u0000b"), "a b");
  assert.equal(cleanDimension("300"), 300);
  assert.equal(cleanDimension(0), 1);
  assert.equal(cleanDimension(999999), MAX_DIMENSION);
  assert.equal(cleanDimension("x", 12), 12);
  assert.deepEqual(boundedDimensions(640, 480), { width: 640, height: 480 });
  const limited = boundedDimensions(MAX_DIMENSION, MAX_DIMENSION);
  assert.ok(limited.width * limited.height <= MAX_PIXELS);
  assert.ok(limited.width < MAX_DIMENSION);
});

test("bounding a wide or tall document keeps its aspect ratio", () => {
  for (const [width, height] of [
    [32000, 16000],
    [16000, 32000],
    [12000, 120],
  ]) {
    const bounded = boundedDimensions(width, height);
    assert.ok(bounded.width <= MAX_DIMENSION && bounded.height <= MAX_DIMENSION);
    assert.ok(bounded.width * bounded.height <= MAX_PIXELS);
    assert.ok(
      Math.abs(bounded.width / bounded.height - width / height) / (width / height) < 0.02,
      `${width}x${height} became ${bounded.width}x${bounded.height}`,
    );
  }
});

test("invalid project files are rejected with a readable reason", () => {
  assert.throws(() => parseProject("{bad"), /valid JSON/);
  assert.throws(() => parseProject("{}"), /not a Palette project/);
  assert.throws(
    () => parseProject(JSON.stringify({ format: PROJECT_FORMAT, version: 99, layers: [] })),
    /Unsupported Palette project version/,
  );
  assert.throws(
    () => parseProject(JSON.stringify({ format: PROJECT_FORMAT, version: PROJECT_VERSION, layers: [] })),
    /no layers/,
  );
  assert.throws(
    () =>
      parseProject(
        JSON.stringify({
          format: PROJECT_FORMAT,
          version: PROJECT_VERSION,
          layers: [{ id: "a", image: IMAGE }, { id: "a", image: IMAGE }],
        }),
      ),
    /Duplicate layer id/,
  );
  assert.throws(
    () =>
      parseProject(
        JSON.stringify({ format: PROJECT_FORMAT, version: PROJECT_VERSION, layers: [{ id: "a", image: "nope" }] }),
      ),
    /no embedded image/,
  );
});

test("oversized projects are bounded by total pixels", () => {
  const parsed = parseProject({
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    width: MAX_DIMENSION,
    height: MAX_DIMENSION,
    layers: [{ image: IMAGE }],
  });
  assert.ok(parsed.width * parsed.height <= MAX_PIXELS);
  assert.ok(parsed.width < MAX_DIMENSION);
});

test("missing identity fields receive safe fallbacks", () => {
  const parsed = parseProject({
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    width: 0,
    height: 20,
    activeLayerId: "missing",
    layers: [{ name: "", opacity: 4, blendMode: "bogus", image: IMAGE }],
  });
  assert.equal(parsed.width, 1);
  assert.equal(parsed.height, 20);
  assert.equal(parsed.layers[0].opacity, 1);
  assert.equal(parsed.layers[0].name, "Layer 1");
  assert.equal(parsed.layers[0].blendMode, "normal");
  assert.equal(parsed.layers[0].locked, false);
  assert.equal(parsed.activeLayerId, parsed.layers[0].id);
});
