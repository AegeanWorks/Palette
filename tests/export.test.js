import test from "node:test";
import assert from "node:assert/strict";

import {
  EXPORT_FORMATS,
  downloadName,
  exportDimensions,
  exportFormat,
  formatBytes,
  normalizeExportScale,
  normalizeQuality,
  safeFileName,
} from "../src/core/export.js";
import { MAX_PIXELS } from "../src/core/project.js";

test("known export formats answer with their MIME type and extension", () => {
  assert.equal(exportFormat("png").mime, "image/png");
  assert.equal(exportFormat("JPEG").extension, "jpg");
  assert.equal(exportFormat("webp").quality, true);
  assert.equal(exportFormat("unknown"), EXPORT_FORMATS.png);
});

test("quality is bounded and defaults safely", () => {
  assert.equal(normalizeQuality(1.4), 1);
  assert.equal(normalizeQuality(-1), 0.05);
  assert.equal(normalizeQuality("0.7"), 0.7);
  assert.equal(normalizeQuality("bad"), 0.92);
});

test("download names are safe on every platform", () => {
  assert.equal(safeFileName('  a/b:c*?"<>|  '), "a-b-c-");
  assert.equal(safeFileName(""), "palette");
  assert.equal(downloadName("My edit", "jpeg"), "My edit.jpg");
  assert.equal(downloadName("photo.PNG", "webp"), "photo.PNG.webp");
});

test("byte counts render in readable units", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(12 * 1024 * 1024), "12 MB");
});

test("export scale defaults and clamps to a safe range", () => {
  assert.equal(normalizeExportScale(0.5), 0.5);
  assert.equal(normalizeExportScale("2"), 2);
  assert.equal(normalizeExportScale(0), 1);
  assert.equal(normalizeExportScale(-1), 1);
  assert.equal(normalizeExportScale("bad"), 1);
  assert.equal(normalizeExportScale(9), 4);
  assert.equal(normalizeExportScale(0.01), 0.1);
});

test("export dimensions keep the aspect ratio inside the pixel budget", () => {
  assert.deepEqual(exportDimensions(640, 400, 1), { width: 640, height: 400 });
  assert.deepEqual(exportDimensions(640, 400, 0.5), { width: 320, height: 200 });

  const capped = exportDimensions(8000, 4000, 4);
  assert.ok(capped.width * capped.height <= MAX_PIXELS);
  assert.ok(capped.width <= 8192 && capped.height <= 8192);
  assert.ok(Math.abs(capped.width / capped.height - 2) < 0.01);
});
