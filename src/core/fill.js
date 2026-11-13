import { clamp, hexToRgb } from "./color.js";

export function colorDistance(r1, g1, b1, a1, r2, g2, b2, a2) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  const da = a1 - a2;
  return Math.hypot(dr, dg, db, da);
}

export function isInsideSelection(x, y, selection, width, height) {
  if (!selection || !selection.rect) return true;
  const { kind, rect, invert } = selection;
  let insideBase = false;
  if (kind === "ellipse") {
    const rx = rect.w / 2;
    const ry = rect.h / 2;
    if (rx > 0 && ry > 0) {
      const cx = rect.x + rx;
      const cy = rect.y + ry;
      const normalizedX = (x + 0.5 - cx) / rx;
      const normalizedY = (y + 0.5 - cy) / ry;
      insideBase = normalizedX * normalizedX + normalizedY * normalizedY <= 1;
    }
  } else {
    insideBase = x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
  }
  if (invert) {
    return !insideBase && x >= 0 && x < width && y >= 0 && y < height;
  }
  return insideBase;
}

export function floodFillPixels(
  pixels,
  startX,
  startY,
  fillColor,
  { tolerance = 32, opacity = 1, contiguous = true, selection = null } = {},
) {
  const { width, height, data } = pixels;
  const out = new Uint8ClampedArray(data);
  const px = Math.floor(startX);
  const py = Math.floor(startY);

  if (px < 0 || px >= width || py < 0 || py >= height) {
    return { width, height, data: out };
  }

  if (selection && !isInsideSelection(px, py, selection, width, height)) {
    return { width, height, data: out };
  }

  const rgb = typeof fillColor === "string" ? hexToRgb(fillColor) : fillColor;
  const targetRgb = rgb ?? { r: 0, g: 0, b: 0 };
  const fillR = clamp(Math.round(targetRgb.r), 0, 255);
  const fillG = clamp(Math.round(targetRgb.g), 0, 255);
  const fillB = clamp(Math.round(targetRgb.b), 0, 255);
  const fillA = clamp(Math.round((targetRgb.a ?? 255) * clamp(opacity, 0, 1)), 0, 255);

  const startIdx = (py * width + px) * 4;
  const srcR = data[startIdx];
  const srcG = data[startIdx + 1];
  const srcB = data[startIdx + 2];
  const srcA = data[startIdx + 3];

  const maxThreshold = clamp(Number(tolerance) || 0, 0, 100) * 5.1;

  // If already identical color and opacity is full, no changes needed
  if (
    maxThreshold === 0 &&
    srcR === fillR &&
    srcG === fillG &&
    srcB === fillB &&
    srcA === fillA
  ) {
    return { width, height, data: out };
  }

  const applyFillAt = (idx) => {
    if (fillA === 255) {
      out[idx] = fillR;
      out[idx + 1] = fillG;
      out[idx + 2] = fillB;
      out[idx + 3] = 255;
    } else {
      const alphaFactor = fillA / 255;
      const invAlpha = 1 - alphaFactor;
      out[idx] = Math.round(data[idx] * invAlpha + fillR * alphaFactor);
      out[idx + 1] = Math.round(data[idx + 1] * invAlpha + fillG * alphaFactor);
      out[idx + 2] = Math.round(data[idx + 2] * invAlpha + fillB * alphaFactor);
      out[idx + 3] = Math.min(255, Math.round(data[idx + 3] + fillA));
    }
  };

  if (!contiguous) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (selection && !isInsideSelection(x, y, selection, width, height)) continue;
        const idx = (y * width + x) * 4;
        const dist = colorDistance(
          data[idx],
          data[idx + 1],
          data[idx + 2],
          data[idx + 3],
          srcR,
          srcG,
          srcB,
          srcA,
        );
        if (dist <= maxThreshold) {
          applyFillAt(idx);
        }
      }
    }
    return { width, height, data: out };
  }

  // Contiguous flood fill using scanline / BFS
  const visited = new Uint8Array(width * height);
  const queueX = new Int32Array(width * height);
  const queueY = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  visited[py * width + px] = 1;
  applyFillAt(startIdx);
  queueX[tail] = px;
  queueY[tail] = py;
  tail += 1;

  while (head < tail) {
    const cx = queueX[head];
    const cy = queueY[head];
    head += 1;

    const neighbors = [
      cx + 1, cy,
      cx - 1, cy,
      cx, cy + 1,
      cx, cy - 1,
    ];

    for (let i = 0; i < 8; i += 2) {
      const nx = neighbors[i];
      const ny = neighbors[i + 1];

      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const vIdx = ny * width + nx;
      if (visited[vIdx]) continue;

      if (selection && !isInsideSelection(nx, ny, selection, width, height)) continue;

      const idx = vIdx * 4;
      const dist = colorDistance(
        data[idx],
        data[idx + 1],
        data[idx + 2],
        data[idx + 3],
        srcR,
        srcG,
        srcB,
        srcA,
      );

      if (dist <= maxThreshold) {
        visited[vIdx] = 1;
        applyFillAt(idx);
        queueX[tail] = nx;
        queueY[tail] = ny;
        tail += 1;
      }
    }
  }

  return { width, height, data: out };
}
