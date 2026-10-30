import test from "node:test";
import assert from "node:assert/strict";

import { findContentBounds } from "../src/core/bounds.js";

function pixels(width, height, points = []) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y, alpha = 255] of points) {
    data[(y * width + x) * 4 + 3] = alpha;
  }
  return { width, height, data };
}

test("content bounds ignore transparent borders", () => {
  assert.deepEqual(findContentBounds(pixels(10, 10, [[2, 3], [7, 8], [5, 5]])), { x: 2, y: 3, w: 6, h: 6 });
  assert.deepEqual(findContentBounds(pixels(5, 5, [[0, 0]])), { x: 0, y: 0, w: 1, h: 1 });
  assert.deepEqual(findContentBounds(pixels(5, 5, [[4, 4]])), { x: 4, y: 4, w: 1, h: 1 });
});

test("alpha thresholds and empty images are handled", () => {
  assert.equal(findContentBounds(pixels(4, 4, [[1, 1, 4]])), null);
  assert.deepEqual(findContentBounds(pixels(4, 4, [[1, 1, 8]]), 8), { x: 1, y: 1, w: 1, h: 1 });
  assert.equal(findContentBounds(pixels(4, 4)), null);
  assert.equal(findContentBounds(null), null);
  assert.equal(findContentBounds({ width: 0, height: 0, data: new Uint8ClampedArray(0) }), null);
});
