import test from "node:test";
import assert from "node:assert/strict";

import { colorDistance, isInsideSelection, floodFillPixels } from "../src/core/fill.js";

function makePixels(width, height, r = 0, g = 0, b = 0, a = 255) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }
  return { width, height, data };
}

test("colorDistance calculates RGBA euclidean distance", () => {
  assert.equal(colorDistance(100, 100, 100, 255, 100, 100, 100, 255), 0);
  assert.equal(colorDistance(0, 0, 0, 0, 3, 4, 0, 0), 5);
  assert.equal(colorDistance(0, 0, 0, 0, 0, 0, 0, 10), 10);
});

test("isInsideSelection handles rect, ellipse, and invert modes", () => {
  assert.equal(isInsideSelection(5, 5, null, 100, 100), true);

  const rectSel = { kind: "rect", rect: { x: 10, y: 10, w: 20, h: 20 } };
  assert.equal(isInsideSelection(15, 15, rectSel, 100, 100), true);
  assert.equal(isInsideSelection(5, 5, rectSel, 100, 100), false);
  assert.equal(isInsideSelection(10, 10, rectSel, 100, 100), true);
  assert.equal(isInsideSelection(30, 30, rectSel, 100, 100), false);

  const invRectSel = { ...rectSel, invert: true };
  assert.equal(isInsideSelection(15, 15, invRectSel, 100, 100), false);
  assert.equal(isInsideSelection(5, 5, invRectSel, 100, 100), true);

  const ellipseSel = { kind: "ellipse", rect: { x: 0, y: 0, w: 20, h: 20 } };
  assert.equal(isInsideSelection(10, 10, ellipseSel, 100, 100), true);
  assert.equal(isInsideSelection(0, 0, ellipseSel, 100, 100), false);
  assert.equal(isInsideSelection(19, 19, ellipseSel, 100, 100), false);
});

test("floodFillPixels fills contiguous uniform area and respects boundaries", () => {
  // 4x4 image: left half is black (0,0,0,255), right half is white (255,255,255,255)
  const image = makePixels(4, 4, 0, 0, 0, 255);
  for (let y = 0; y < 4; y += 1) {
    for (let x = 2; x < 4; x += 1) {
      const idx = (y * 4 + x) * 4;
      image.data[idx] = 255;
      image.data[idx + 1] = 255;
      image.data[idx + 2] = 255;
    }
  }

  // Fill black area from (0,0) with red #ff0000
  const result = floodFillPixels(image, 0, 0, "#ff0000", { tolerance: 10, contiguous: true });
  assert.notStrictEqual(result.data, image.data);

  // Left half should be red (255, 0, 0, 255)
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 2; x += 1) {
      const idx = (y * 4 + x) * 4;
      assert.equal(result.data[idx], 255);
      assert.equal(result.data[idx + 1], 0);
      assert.equal(result.data[idx + 2], 0);
      assert.equal(result.data[idx + 3], 255);
    }
  }

  // Right half should remain white (255, 255, 255, 255)
  for (let y = 0; y < 4; y += 1) {
    for (let x = 2; x < 4; x += 1) {
      const idx = (y * 4 + x) * 4;
      assert.equal(result.data[idx], 255);
      assert.equal(result.data[idx + 1], 255);
      assert.equal(result.data[idx + 2], 255);
      assert.equal(result.data[idx + 3], 255);
    }
  }
});

test("floodFillPixels tolerance threshold fills similar shades", () => {
  const image = makePixels(3, 1, 100, 100, 100, 255);
  // Pixel 0: 100, Pixel 1: 110, Pixel 2: 180
  image.data[4] = 110;
  image.data[5] = 110;
  image.data[6] = 110;

  image.data[8] = 180;
  image.data[9] = 180;
  image.data[10] = 180;

  // Tolerance 10: distance between 100 and 110 is sqrt(3 * 10^2) = 17.32 <= 10 * 5.1 = 51.
  // Distance between 100 and 180 is sqrt(3 * 80^2) = 138.56 > 51.
  const result = floodFillPixels(image, 0, 0, "#00ff00", { tolerance: 10, contiguous: true });
  // Pixel 0 filled
  assert.equal(result.data[0], 0);
  assert.equal(result.data[1], 255);
  // Pixel 1 filled
  assert.equal(result.data[4], 0);
  assert.equal(result.data[5], 255);
  // Pixel 2 unchanged
  assert.equal(result.data[8], 180);
});

test("floodFillPixels non-contiguous replaces matching colors across disconnected regions", () => {
  // 5x1 image: black, white, black, white, black
  const image = makePixels(5, 1, 0, 0, 0, 255);
  image.data[4] = 255;
  image.data[5] = 255;
  image.data[6] = 255;
  image.data[12] = 255;
  image.data[13] = 255;
  image.data[14] = 255;

  const result = floodFillPixels(image, 0, 0, "#0000ff", { contiguous: false });
  // All black pixels (0, 2, 4) should be blue
  assert.equal(result.data[0], 0);
  assert.equal(result.data[2], 255);
  assert.equal(result.data[8], 0);
  assert.equal(result.data[10], 255);
  assert.equal(result.data[16], 0);
  assert.equal(result.data[18], 255);

  // White pixels (1, 3) remain white
  assert.equal(result.data[4], 255);
  assert.equal(result.data[12], 255);
});

test("floodFillPixels clips to selection", () => {
  const image = makePixels(6, 6, 0, 0, 0, 255);
  const selection = { kind: "rect", rect: { x: 2, y: 2, w: 2, h: 2 } };

  const result = floodFillPixels(image, 2, 2, "#ffff00", { selection });

  for (let y = 0; y < 6; y += 1) {
    for (let x = 0; x < 6; x += 1) {
      const idx = (y * 6 + x) * 4;
      if (x >= 2 && x < 4 && y >= 2 && y < 4) {
        assert.equal(result.data[idx], 255);
        assert.equal(result.data[idx + 1], 255);
        assert.equal(result.data[idx + 2], 0);
      } else {
        assert.equal(result.data[idx], 0);
        assert.equal(result.data[idx + 1], 0);
        assert.equal(result.data[idx + 2], 0);
      }
    }
  }
});

test("floodFillPixels returns unchanged on invalid coords or start outside selection", () => {
  const image = makePixels(2, 2, 10, 20, 30, 255);
  const out1 = floodFillPixels(image, -1, 0, "#ffffff");
  assert.deepEqual(Array.from(out1.data), Array.from(image.data));

  const out2 = floodFillPixels(image, 5, 5, "#ffffff");
  assert.deepEqual(Array.from(out2.data), Array.from(image.data));

  const selection = { kind: "rect", rect: { x: 1, y: 1, w: 1, h: 1 } };
  const out3 = floodFillPixels(image, 0, 0, "#ffffff", { selection });
  assert.deepEqual(Array.from(out3.data), Array.from(image.data));
});

test("floodFillPixels respects opacity when blending", () => {
  const image = makePixels(1, 1, 0, 0, 0, 255);
  const result = floodFillPixels(image, 0, 0, "#ffffff", { opacity: 0.5 });
  // Blended 50% white onto black -> ~128
  assert.ok(result.data[0] >= 120 && result.data[0] <= 135);
  assert.equal(result.data[3], 255);
});
