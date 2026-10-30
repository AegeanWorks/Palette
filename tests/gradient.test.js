import test from "node:test";
import assert from "node:assert/strict";

import {
  GRADIENT_TYPES,
  gradientRadius,
  gradientStops,
  isUsableGradient,
  normalizeGradientOptions,
  normalizeGradientType,
} from "../src/core/gradient.js";

test("gradient types whitelist and default to linear", () => {
  assert.equal(normalizeGradientType("radial"), "radial");
  assert.equal(normalizeGradientType("linear"), "linear");
  assert.equal(normalizeGradientType("conic"), "linear");
  assert.equal(normalizeGradientType(null), "linear");
  assert.ok(Object.isFrozen(GRADIENT_TYPES));
  assert.equal(GRADIENT_TYPES.radial, "Radial");
});

test("gradient options normalise colours, fade and opacity", () => {
  const options = normalizeGradientOptions({ type: "radial", from: "#ABC", to: "not-a-colour", fade: false, opacity: 2 });
  assert.deepEqual(options, { type: "radial", from: "#aabbcc", to: "#a78bfa", fade: false, opacity: 1 });
  assert.deepEqual(normalizeGradientOptions({ opacity: -1 }).opacity, 0);
});

test("gradient stops expose the start and fade/end alpha", () => {
  assert.deepEqual(gradientStops({ from: "#000000", to: "#ffffff", fade: true }), [
    { offset: 0, color: "#000000", alpha: 1 },
    { offset: 1, color: "#ffffff", alpha: 0 },
  ]);
  assert.deepEqual(gradientStops({ from: "#000000", to: "#ffffff", fade: false })[1].alpha, 1);
});

test("gradient radius and drag usability stay positive", () => {
  assert.equal(gradientRadius({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  assert.equal(gradientRadius({ x: 0, y: 0 }, { x: 0, y: 0 }), 1);
  assert.equal(isUsableGradient({ x: 0, y: 0 }, { x: 3, y: 4 }), true);
  assert.equal(isUsableGradient({ x: 0, y: 0 }, { x: 0, y: 0 }), false);
});
