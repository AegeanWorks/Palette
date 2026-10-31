import test from "node:test";
import assert from "node:assert/strict";

import {
  anchorOffset,
  clampRect,
  clampScale,
  constrainAngle,
  constrainAspect,
  constrainSquare,
  containRect,
  docToScreen,
  fitView,
  isUsableRect,
  normalizeRect,
  pointInRect,
  screenToDoc,
  selectionFromDrag,
  zoomAt,
} from "../src/core/geometry.js";

test("rectangles normalize from any drag direction", () => {
  assert.deepEqual(normalizeRect({ x: 30, y: 40 }, { x: 10, y: 15 }), { x: 10, y: 15, w: 20, h: 25 });
  assert.equal(isUsableRect({ x: 0, y: 0, w: 3, h: 2 }), true);
  assert.equal(isUsableRect({ x: 0, y: 0, w: 0.4, h: 2 }), false);
});

test("crop rectangles clamp to the document", () => {
  assert.deepEqual(clampRect({ x: -10, y: 20, w: 100, h: 200 }, 80, 100), { x: 0, y: 20, w: 80, h: 80 });
  assert.deepEqual(clampRect({ x: 90, y: 90, w: 20, h: 20 }, 80, 100), { x: 80, y: 90, w: 0, h: 10 });
});

test("shift constraints produce squares and 45 degree lines", () => {
  assert.deepEqual(constrainSquare({ x: 10, y: 10 }, { x: 40, y: 20 }), { x: 40, y: 40 });
  assert.deepEqual(constrainSquare({ x: 10, y: 10 }, { x: -20, y: 15 }), { x: -20, y: 40 });
  const angle = constrainAngle({ x: 0, y: 0 }, { x: 10, y: 9 });
  assert.ok(Math.abs(angle.x - angle.y) < 1e-9);
  assert.ok(Math.abs(Math.hypot(angle.x, angle.y) - Math.hypot(10, 9)) < 1e-9);
});

test("aspect constraints preserve direction and the larger dimension", () => {
  assert.deepEqual(constrainAspect({ x: 0, y: 0 }, { x: 100, y: 10 }, 1), { x: 100, y: 100 });
  assert.deepEqual(constrainAspect({ x: 0, y: 0 }, { x: 50, y: 100 }, 1), { x: 100, y: 100 });
  assert.deepEqual(constrainAspect({ x: 10, y: 10 }, { x: -110, y: -60 }, 4 / 3), { x: -110, y: -80 });
  assert.deepEqual(constrainAspect({ x: 0, y: 0 }, { x: 30, y: 40 }, 0), { x: 30, y: 40 });
  assert.deepEqual(constrainAspect({ x: 0, y: 0 }, { x: 0, y: 0 }, 1), { x: 0, y: 0 });
});

test("screen and document coordinates round-trip", () => {
  const view = { scale: 2, offsetX: 40, offsetY: 30 };
  assert.deepEqual(screenToDoc({ x: 140, y: 130 }, view), { x: 50, y: 50 });
  assert.deepEqual(docToScreen({ x: 50, y: 50 }, view), { x: 140, y: 130 });
  assert.equal(pointInRect({ x: 5, y: 5 }, { x: 0, y: 0, w: 10, h: 10 }), true);
});

test("zoom keeps the anchor point fixed", () => {
  const view = { scale: 1, offsetX: 0, offsetY: 0 };
  const next = zoomAt(view, { x: 100, y: 50 }, 2);
  assert.deepEqual(next, { scale: 2, offsetX: -100, offsetY: -50 });
  assert.deepEqual(screenToDoc({ x: 100, y: 50 }, next), { x: 100, y: 50 });
  assert.equal(clampScale(1000), 32);
  assert.equal(clampScale(0.0001), 0.02);
});

test("fit view centers the document at a bounded scale", () => {
  const view = fitView(1000, 500, 500, 500, 50);
  assert.equal(view.scale, 0.4);
  assert.equal(view.offsetX, 50);
  assert.equal(view.offsetY, 150);
});

test("marquee drags normalise, constrain, clamp and reject tiny regions", () => {
  assert.deepEqual(selectionFromDrag("rect", { x: 30, y: 40 }, { x: 10, y: 15 }, 200, 200), {
    kind: "rect",
    rect: { x: 10, y: 15, w: 20, h: 25 },
  });
  assert.equal(selectionFromDrag("ellipse", { x: 0, y: 0 }, { x: 5, y: 5 }, 100, 100).kind, "ellipse");
  assert.deepEqual(selectionFromDrag("rect", { x: 0, y: 0 }, { x: 50, y: 10 }, 100, 100, true).rect, {
    x: 0,
    y: 0,
    w: 50,
    h: 50,
  });
  assert.deepEqual(selectionFromDrag("rect", { x: 80, y: 80 }, { x: 120, y: 120 }, 100, 100).rect, {
    x: 80,
    y: 80,
    w: 20,
    h: 20,
  });
  assert.equal(selectionFromDrag("rect", { x: 10, y: 10 }, { x: 10, y: 10 }, 100, 100), null);
});

test("containment keeps small art at natural size and scales large art down", () => {
  assert.deepEqual(containRect(120, 80, 400, 300), { x: 140, y: 110, w: 120, h: 80 });
  assert.deepEqual(containRect(1600, 900, 800, 600), { x: 0, y: 75, w: 800, h: 450 });
  assert.deepEqual(containRect(200, 400, 200, 200), { x: 50, y: 0, w: 100, h: 200 });
  assert.deepEqual(containRect(20, 10, 100, 100, true), { x: 0, y: 25, w: 100, h: 50 });
  assert.deepEqual(containRect(0, 0, 10, 10), { x: 5, y: 5, w: 1, h: 1 });
  assert.deepEqual(containRect(0, 0, 10, 10, true), { x: 0, y: 0, w: 10, h: 10 });
});


test("canvas anchors place old art at the expected offset", () => {
  assert.deepEqual(anchorOffset(100, 100, 200, 200, "top-left"), { x: 0, y: 0 });
  assert.deepEqual(anchorOffset(100, 100, 200, 200, "center"), { x: 50, y: 50 });
  assert.deepEqual(anchorOffset(100, 100, 200, 200, "bottom-right"), { x: 100, y: 100 });
  assert.deepEqual(anchorOffset(100, 100, 50, 50, "top"), { x: -25, y: 0 });
  assert.deepEqual(anchorOffset(100, 100, 50, 50, "bottom"), { x: -25, y: -50 });
  assert.deepEqual(anchorOffset(100, 100, 200, 200, "unknown"), { x: 50, y: 50 });
});
