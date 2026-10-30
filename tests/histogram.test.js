import test from "node:test";
import assert from "node:assert/strict";

import { autoLevelsRange, buildHistogram, percentileRange } from "../src/core/histogram.js";

function pixels(values) {
  const data = new Uint8ClampedArray(values.length * 4);
  values.forEach((value, index) => {
    const alpha = Array.isArray(value) ? value[1] : 255;
    const level = Array.isArray(value) ? value[0] : value;
    data[index * 4] = level;
    data[index * 4 + 1] = level;
    data[index * 4 + 2] = level;
    data[index * 4 + 3] = alpha;
  });
  return { width: values.length, height: 1, data };
}

test("histogram counts visible pixels in every channel", () => {
  const histogram = buildHistogram(pixels([0, 128, 255, [255, 0]]), 256);
  assert.equal(histogram.bins, 256);
  assert.equal(histogram.total, 3);
  assert.equal(histogram.red[0], 1);
  assert.equal(histogram.red[128], 1);
  assert.equal(histogram.red[255], 1);
  assert.equal(histogram.luma[0], 1);
  assert.equal(histogram.luma[128], 1);
  assert.equal(histogram.luma[255], 1);
  assert.equal(histogram.red.reduce((sum, value) => sum + value, 0), 3);
});

test("transparent pixels are ignored and empty images have a safe fallback", () => {
  assert.equal(buildHistogram(pixels([[10, 0], [20, 0]])).total, 0);
  assert.deepEqual(percentileRange(buildHistogram(pixels([[10, 0]]))), { black: 0, white: 255 });
  const allBlack = percentileRange(buildHistogram(pixels([0, 0, 0])));
  assert.equal(allBlack.black, 0);
  assert.equal(allBlack.white, 1);
});

test("percentile ranges find the tonal span of a ramp", () => {
  const ramp = Array.from({ length: 256 }, (_, index) => index);
  const histogram = buildHistogram(pixels(ramp), 256);
  const full = percentileRange(histogram, 0, 0);
  assert.equal(full.black, 0);
  assert.equal(full.white, 255);
  const clipped = percentileRange(histogram, 0.05, 0.05);
  assert.ok(clipped.black > 0 && clipped.black < 30);
  assert.ok(clipped.white > 225 && clipped.white < 255);
  const auto = autoLevelsRange(pixels(ramp));
  assert.ok(auto.black < auto.white);
});

test("histogram bins are bounded and invalid input is empty", () => {
  const tiny = buildHistogram(pixels([0, 255]), 1);
  assert.equal(tiny.bins, 2);
  assert.equal(buildHistogram(null).total, 0);
  assert.equal(buildHistogram({ data: new Uint8ClampedArray(0) }).bins, 256);
});
