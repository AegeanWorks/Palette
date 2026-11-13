import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_ADJUSTMENTS,
  applyLevels,
  applyInvert,
  applyDesaturate,
  applyThreshold,
  applyPosterize,
  applyPixelate,
  applySharpen,
  applyVignette,
  buildCssFilter,
  clampAdjustments,
  isNeutralAdjustments,
} from "../src/core/filters.js";

function pixels(width, height, value = 128) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }
  return { width, height, data };
}

test("adjustments clamp to their ranges", () => {
  const values = clampAdjustments({ brightness: 300, contrast: -500, hue: 720, blur: 99 });
  assert.equal(values.brightness, 100);
  assert.equal(values.contrast, -100);
  assert.equal(values.hue, 180);
  assert.equal(values.blur, 20);
  assert.deepEqual(clampAdjustments(), { ...DEFAULT_ADJUSTMENTS });
});

test("non-numeric adjustments fall back to neutral defaults", () => {
  const values = clampAdjustments({ brightness: "abc", contrast: NaN, saturation: "oops", hue: "50", blur: "5px" });
  assert.equal(values.brightness, 0);
  assert.equal(values.contrast, 0);
  assert.equal(values.saturation, 0);
  assert.equal(values.hue, 50);
  assert.equal(values.blur, 0);
  assert.equal(isNeutralAdjustments({ brightness: "abc" }), true);
  assert.equal(buildCssFilter({ brightness: "abc" }), "none");
});

test("neutral adjustments produce no CSS filter", () => {
  assert.equal(buildCssFilter({}), "none");
  assert.equal(isNeutralAdjustments({}), true);
  assert.equal(isNeutralAdjustments({ brightness: 1 }), false);
});

test("CSS filter order is stable", () => {
  const filter = buildCssFilter({
    brightness: 25,
    contrast: -20,
    saturation: 40,
    hue: 90,
    grayscale: 100,
    sepia: 50,
    invert: 10,
    blur: 2,
  });
  assert.equal(
    filter,
    "brightness(1.250) contrast(0.800) saturate(1.400) hue-rotate(90deg) grayscale(1.000) sepia(0.500) invert(0.100) blur(2.00px)",
  );
});

test("sharpen returns a clone and leaves alpha intact", () => {
  const source = pixels(3, 3, 100);
  const sharpened = applySharpen(source, 0);
  assert.notStrictEqual(sharpened.data, source.data);
  assert.deepEqual(Array.from(sharpened.data), Array.from(source.data));

  const edges = pixels(5, 5, 100);
  edges.data[(2 * 5 + 2) * 4] = 200;
  const result = applySharpen(edges, 1);
  assert.equal(result.data[(2 * 5 + 2) * 4], 255);
  assert.equal(result.data[(2 * 5 + 2) * 4 + 3], 255);
});

test("vignette darkens the edges but keeps the centre and alpha", () => {
  const source = pixels(9, 9, 200);
  const result = applyVignette(source, 1);
  assert.equal(result.data[(4 * 9 + 4) * 4], 200);
  assert.ok(result.data[0] < 200);
  assert.equal(result.data[3], 255);
});

test("pixelate averages each block and keeps the original untouched", () => {
  const source = pixels(4, 4, 0);
  source.data.set([255, 0, 0, 255], 0);
  source.data.set([0, 255, 0, 255], (0 * 4 + 1) * 4);
  const result = applyPixelate(source, 2);
  const index = 0;
  assert.equal(result.data[index], 64);
  assert.equal(result.data[index + 1], 64);
  assert.equal(result.data[index + 3], 255);
  assert.equal(source.data[index], 255);
});

test("levels identity clones and black/white points map to the full range", () => {
  const source = pixels(2, 1, 128);
  const identity = applyLevels(source, { black: 0, white: 255, gamma: 1 });
  assert.notStrictEqual(identity.data, source.data);
  assert.deepEqual(Array.from(identity.data), Array.from(source.data));

  const mapped = applyLevels(source, { black: 64, white: 192, gamma: 1 });
  assert.equal(mapped.data[0], 128);
  assert.equal(mapped.data[3], 255);

  source.data[0] = 10;
  source.data[4] = 250;
  const clipped = applyLevels(source, { black: 64, white: 192, gamma: 1 });
  assert.equal(clipped.data[0], 0);
  assert.equal(clipped.data[4], 255);
});

test("levels gamma brightens midtones and clamps invalid ranges", () => {
  const source = pixels(1, 1, 64);
  const brighter = applyLevels(source, { black: 0, white: 255, gamma: 2 });
  assert.ok(brighter.data[0] > 64);
  const safe = applyLevels(source, { black: 200, white: 10, gamma: 99 });
  assert.equal(safe.width, 1);
  assert.equal(safe.data[3], 255);
});

test("invert inverts RGB channels while preserving alpha", () => {
  const source = pixels(2, 1, 0);
  source.data[0] = 50;
  source.data[1] = 100;
  source.data[2] = 200;
  source.data[3] = 180;
  source.data[4] = 255;
  source.data[5] = 0;
  source.data[6] = 128;
  source.data[7] = 255;

  const inverted = applyInvert(source);
  assert.notStrictEqual(inverted.data, source.data);
  assert.equal(inverted.data[0], 205);
  assert.equal(inverted.data[1], 155);
  assert.equal(inverted.data[2], 55);
  assert.equal(inverted.data[3], 180); // alpha preserved
  assert.equal(inverted.data[4], 0);
  assert.equal(inverted.data[5], 255);
  assert.equal(inverted.data[6], 127);
  assert.equal(inverted.data[7], 255);
});

test("desaturate converts RGB channels to grayscale luminance while preserving alpha", () => {
  const source = pixels(2, 1, 0);
  source.data[0] = 255;
  source.data[1] = 0;
  source.data[2] = 0;
  source.data[3] = 200;
  source.data[4] = 0;
  source.data[5] = 255;
  source.data[6] = 0;
  source.data[7] = 150;

  const desaturated = applyDesaturate(source);
  assert.notStrictEqual(desaturated.data, source.data);
  // Red luma = round(255 * 0.2126) = 54
  assert.equal(desaturated.data[0], 54);
  assert.equal(desaturated.data[1], 54);
  assert.equal(desaturated.data[2], 54);
  assert.equal(desaturated.data[3], 200); // alpha preserved

  // Green luma = round(255 * 0.7152) = 182
  assert.equal(desaturated.data[4], 182);
  assert.equal(desaturated.data[5], 182);
  assert.equal(desaturated.data[6], 182);
  assert.equal(desaturated.data[7], 150); // alpha preserved
});

test("threshold maps pixels to pure black or white by cutoff while preserving alpha", () => {
  const source = pixels(3, 1, 0);
  // Pixel 0: dark gray (luma ~50)
  source.data[0] = 50;
  source.data[1] = 50;
  source.data[2] = 50;
  source.data[3] = 255;
  // Pixel 1: light gray (luma ~150)
  source.data[4] = 150;
  source.data[5] = 150;
  source.data[6] = 150;
  source.data[7] = 220;
  // Pixel 2: midtone gray (luma ~128)
  source.data[8] = 128;
  source.data[9] = 128;
  source.data[10] = 128;
  source.data[11] = 180;

  const result128 = applyThreshold(source, 128);
  assert.notStrictEqual(result128.data, source.data);
  // Pixel 0 < 128 -> black
  assert.equal(result128.data[0], 0);
  assert.equal(result128.data[1], 0);
  assert.equal(result128.data[2], 0);
  assert.equal(result128.data[3], 255);
  // Pixel 1 >= 128 -> white
  assert.equal(result128.data[4], 255);
  assert.equal(result128.data[5], 255);
  assert.equal(result128.data[6], 255);
  assert.equal(result128.data[7], 220); // alpha preserved
  // Pixel 2 >= 128 -> white
  assert.equal(result128.data[8], 255);
  assert.equal(result128.data[9], 255);
  assert.equal(result128.data[10], 255);
  assert.equal(result128.data[11], 180); // alpha preserved

  // Test higher threshold cutoff (200)
  const result200 = applyThreshold(source, 200);
  assert.equal(result200.data[4], 0); // 150 < 200 -> black
});

test("posterize quantizes RGB channels to distinct steps while preserving alpha", () => {
  const source = pixels(3, 1, 0);
  // Pixel 0: values near low range
  source.data[0] = 30;
  source.data[1] = 100;
  source.data[2] = 220;
  source.data[3] = 190;
  // Pixel 1: exact ends
  source.data[4] = 0;
  source.data[5] = 255;
  source.data[6] = 128;
  source.data[7] = 255;

  // 2 levels -> step = 255, quantizes to 0 or 255
  const result2 = applyPosterize(source, 2);
  assert.notStrictEqual(result2.data, source.data);
  assert.equal(result2.data[0], 0);
  assert.equal(result2.data[1], 0);
  assert.equal(result2.data[2], 255);
  assert.equal(result2.data[3], 190); // alpha preserved
  assert.equal(result2.data[4], 0);
  assert.equal(result2.data[5], 255);
  assert.equal(result2.data[6], 255);

  // 4 levels -> step = 85 (levels: 0, 85, 170, 255)
  const result4 = applyPosterize(source, 4);
  assert.equal(result4.data[0], 0); // 30 rounds to 0
  assert.equal(result4.data[1], 85); // 100 rounds to 85
  assert.equal(result4.data[2], 255); // 220 rounds to 255
  assert.equal(result4.data[3], 190); // alpha preserved
  assert.equal(result4.data[6], 170); // 128 rounds to 170
});

