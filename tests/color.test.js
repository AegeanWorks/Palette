import test from "node:test";
import assert from "node:assert/strict";

import { clamp, hexToRgb, normalizeHex, rgbaString, rgbToHex } from "../src/core/color.js";

test("hex values parse in short and long form", () => {
  assert.deepEqual(hexToRgb("#0af"), { r: 0, g: 170, b: 255 });
  assert.deepEqual(hexToRgb("22d3ee"), { r: 34, g: 211, b: 238 });
  assert.equal(hexToRgb("#xyz"), null);
  assert.equal(hexToRgb(null), null);
});

test("rgb values render as lowercase six-digit hex", () => {
  assert.equal(rgbToHex({ r: 34, g: 211, b: 238 }), "#22d3ee");
  assert.equal(rgbToHex({ r: 300, g: -20, b: 15.6 }), "#ff0010");
  assert.equal(normalizeHex("#ABC", "#000000"), "#aabbcc");
  assert.equal(normalizeHex("not-a-color", "#123456"), "#123456");
});

test("rgba strings clamp alpha and reject malformed colours", () => {
  assert.equal(rgbaString("#ffffff", 0.5), "rgba(255, 255, 255, 0.5)");
  assert.equal(rgbaString("nope", 2), "rgba(0, 0, 0, 1)");
  assert.equal(clamp(Number.NaN, 2, 8), 2);
  assert.equal(clamp(12, 2, 8), 8);
});
