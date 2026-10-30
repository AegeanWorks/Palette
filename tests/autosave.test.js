import test from "node:test";
import assert from "node:assert/strict";

import {
  AUTOSAVE_FORMAT,
  AUTOSAVE_VERSION,
  autosaveAvailable,
  formatSavedAt,
  validateSessionRecord,
} from "../src/ui/autosave.js";

const IMAGE = { fake: "blob" };

function sample(overrides = {}) {
  return {
    format: AUTOSAVE_FORMAT,
    version: AUTOSAVE_VERSION,
    savedAt: 1700000000000,
    name: "Recovered",
    width: 640,
    height: 480,
    activeLayerId: "top",
    layers: [
      { id: "base", name: "Base", visible: true, opacity: 0.5, blendMode: "multiply", locked: true, adjustments: { brightness: 12 }, image: IMAGE },
      { id: "top", name: "Top", visible: false, opacity: 2, blendMode: "bogus", locked: false, adjustments: {}, image: IMAGE },
    ],
    ...overrides,
  };
}

test("a valid autosave record is normalized and keeps its active layer", () => {
  const record = validateSessionRecord(sample());
  assert.ok(record);
  assert.equal(record.name, "Recovered");
  assert.equal(record.width, 640);
  assert.equal(record.height, 480);
  assert.equal(record.activeLayerId, "top");
  assert.equal(record.layers[0].blendMode, "multiply");
  assert.equal(record.layers[0].locked, true);
  assert.equal(record.layers[1].opacity, 1);
  assert.equal(record.layers[1].blendMode, "bogus");
});

test("missing image, bad format, bad version and empty layers are rejected", () => {
  assert.equal(validateSessionRecord(null), null);
  assert.equal(validateSessionRecord({}), null);
  assert.equal(validateSessionRecord(sample({ format: "other" })), null);
  assert.equal(validateSessionRecord(sample({ version: 99 })), null);
  assert.equal(validateSessionRecord(sample({ layers: [] })), null);
  assert.equal(validateSessionRecord(sample({ width: 0 })), null);
  assert.equal(validateSessionRecord(sample({ width: 99999 })), null);
  assert.equal(
    validateSessionRecord(
      sample({ layers: [{ id: "a", name: "A", image: null }] }),
    ),
    null,
  );
  assert.equal(
    validateSessionRecord(
      sample({ layers: [{ id: "", name: "A", image: IMAGE }] }),
    ),
    null,
  );
});

test("a missing active layer falls back to the top layer", () => {
  const record = validateSessionRecord(sample({ activeLayerId: "missing" }));
  assert.equal(record.activeLayerId, "top");
});

test("autosave availability and time formatting are safe outside a browser", () => {
  assert.equal(autosaveAvailable(), false);
  assert.equal(typeof formatSavedAt(1700000000000), "string");
  assert.equal(formatSavedAt("nope"), "");
});
