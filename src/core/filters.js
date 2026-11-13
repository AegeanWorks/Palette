import { clamp, hexToRgb } from "./color.js";

export const DEFAULT_ADJUSTMENTS = Object.freeze({
  brightness: 0,
  contrast: 0,
  saturation: 0,
  hue: 0,
  grayscale: 0,
  sepia: 0,
  invert: 0,
  blur: 0,
});

const ADJUSTMENT_RANGES = Object.freeze({
  brightness: [-100, 100],
  contrast: [-100, 100],
  saturation: [-100, 100],
  hue: [-180, 180],
  grayscale: [0, 100],
  sepia: [0, 100],
  invert: [0, 100],
  blur: [0, 20],
});

export function clampAdjustments(input = {}) {
  const result = { ...DEFAULT_ADJUSTMENTS };
  for (const [key, [min, max]] of Object.entries(ADJUSTMENT_RANGES)) {
    const number = Number(input[key] ?? DEFAULT_ADJUSTMENTS[key]);
    result[key] = Number.isFinite(number) ? clamp(number, min, max) : DEFAULT_ADJUSTMENTS[key];
  }
  return result;
}

export function isNeutralAdjustments(input = {}) {
  const values = clampAdjustments(input);
  return Object.keys(DEFAULT_ADJUSTMENTS).every((key) => values[key] === DEFAULT_ADJUSTMENTS[key]);
}

export function buildCssFilter(input = {}) {
  const values = clampAdjustments(input);
  const parts = [];
  if (values.brightness !== 0) parts.push(`brightness(${(1 + values.brightness / 100).toFixed(3)})`);
  if (values.contrast !== 0) parts.push(`contrast(${(1 + values.contrast / 100).toFixed(3)})`);
  if (values.saturation !== 0) parts.push(`saturate(${(1 + values.saturation / 100).toFixed(3)})`);
  if (values.hue !== 0) parts.push(`hue-rotate(${values.hue}deg)`);
  if (values.grayscale !== 0) parts.push(`grayscale(${(values.grayscale / 100).toFixed(3)})`);
  if (values.sepia !== 0) parts.push(`sepia(${(values.sepia / 100).toFixed(3)})`);
  if (values.invert !== 0) parts.push(`invert(${(values.invert / 100).toFixed(3)})`);
  if (values.blur !== 0) parts.push(`blur(${values.blur.toFixed(2)}px)`);
  return parts.length ? parts.join(" ") : "none";
}

export function clonePixels(pixels) {
  return {
    width: pixels.width,
    height: pixels.height,
    data: new Uint8ClampedArray(pixels.data),
  };
}

export function applySharpen(pixels, amount = 1) {
  const strength = clamp(amount, 0, 4);
  if (strength === 0) return clonePixels(pixels);
  const { width, height, data } = pixels;
  const out = new Uint8ClampedArray(data.length);
  const center = 1 + strength * 4;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        out.set(data.subarray(index, index + 4), index);
        continue;
      }
      const above = ((y - 1) * width + x) * 4;
      const below = ((y + 1) * width + x) * 4;
      const left = (y * width + x - 1) * 4;
      const right = (y * width + x + 1) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const value =
          data[index + channel] * center -
          (data[above + channel] + data[below + channel] + data[left + channel] + data[right + channel]) * strength;
        out[index + channel] = clamp(value, 0, 255);
      }
      out[index + 3] = data[index + 3];
    }
  }
  return { width, height, data: out };
}

export function applyVignette(pixels, strength = 0.5) {
  const amount = clamp(strength, 0, 1);
  if (amount === 0) return clonePixels(pixels);
  const { width, height, data } = pixels;
  const out = new Uint8ClampedArray(data.length);
  const centerX = (width - 1) / 2;
  const centerY = (height - 1) / 2;
  const maxDistance = Math.hypot(centerX, centerY) || 1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const distance = Math.hypot(x - centerX, y - centerY) / maxDistance;
      const factor = clamp(1 - amount * distance * distance, 0, 1);
      out[index] = data[index] * factor;
      out[index + 1] = data[index + 1] * factor;
      out[index + 2] = data[index + 2] * factor;
      out[index + 3] = data[index + 3];
    }
  }
  return { width, height, data: out };
}

export function applyPixelate(pixels, blockSize = 8) {
  const size = Math.max(1, Math.round(blockSize));
  if (size <= 1) return clonePixels(pixels);
  const { width, height, data } = pixels;
  const out = new Uint8ClampedArray(data.length);
  for (let blockY = 0; blockY < height; blockY += size) {
    for (let blockX = 0; blockX < width; blockX += size) {
      const maxY = Math.min(height, blockY + size);
      const maxX = Math.min(width, blockX + size);
      const totals = [0, 0, 0, 0];
      let count = 0;
      for (let y = blockY; y < maxY; y += 1) {
        for (let x = blockX; x < maxX; x += 1) {
          const index = (y * width + x) * 4;
          totals[0] += data[index];
          totals[1] += data[index + 1];
          totals[2] += data[index + 2];
          totals[3] += data[index + 3];
          count += 1;
        }
      }
      const average = totals.map((total) => Math.round(total / count));
      for (let y = blockY; y < maxY; y += 1) {
        for (let x = blockX; x < maxX; x += 1) {
          const index = (y * width + x) * 4;
          out[index] = average[0];
          out[index + 1] = average[1];
          out[index + 2] = average[2];
          out[index + 3] = average[3];
        }
      }
    }
  }
  return { width, height, data: out };
}

export function applyLevels(pixels, { black = 0, white = 255, gamma = 1 } = {}) {
  const low = clamp(Math.round(Number(black) || 0), 0, 254);
  const high = clamp(Math.round(Number(white) || 255), low + 1, 255);
  const power = clamp(Number(gamma) || 1, 0.1, 3);
  if (low === 0 && high === 255 && power === 1) return clonePixels(pixels);
  const { width, height, data } = pixels;
  const out = new Uint8ClampedArray(data.length);
  const range = high - low;
  const exponent = 1 / power;
  for (let index = 0; index < data.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const normalized = clamp((data[index + channel] - low) / range, 0, 1);
      out[index + channel] = Math.round(Math.pow(normalized, exponent) * 255);
    }
    out[index + 3] = data[index + 3];
  }
  return { width, height, data: out };
}

export function applyInvert(pixels) {
  const { width, height, data } = pixels;
  const out = new Uint8ClampedArray(data.length);
  for (let index = 0; index < data.length; index += 4) {
    out[index] = 255 - data[index];
    out[index + 1] = 255 - data[index + 1];
    out[index + 2] = 255 - data[index + 2];
    out[index + 3] = data[index + 3];
  }
  return { width, height, data: out };
}

export function applyDesaturate(pixels) {
  const { width, height, data } = pixels;
  const out = new Uint8ClampedArray(data.length);
  for (let index = 0; index < data.length; index += 4) {
    const luma = Math.round(data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722);
    out[index] = luma;
    out[index + 1] = luma;
    out[index + 2] = luma;
    out[index + 3] = data[index + 3];
  }
  return { width, height, data: out };
}

export function applyThreshold(pixels, threshold = 128) {
  const cutoff = clamp(Math.round(Number(threshold) || 128), 0, 255);
  const { width, height, data } = pixels;
  const out = new Uint8ClampedArray(data.length);
  for (let index = 0; index < data.length; index += 4) {
    const luma = data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722;
    const value = luma >= cutoff ? 255 : 0;
    out[index] = value;
    out[index + 1] = value;
    out[index + 2] = value;
    out[index + 3] = data[index + 3];
  }
  return { width, height, data: out };
}

export function applyPosterize(pixels, levels = 4) {
  const steps = clamp(Math.round(Number(levels) || 4), 2, 32);
  const { width, height, data } = pixels;
  const out = new Uint8ClampedArray(data.length);
  const step = 255 / (steps - 1);
  for (let index = 0; index < data.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      out[index + channel] = Math.round(Math.round(data[index + channel] / step) * step);
    }
    out[index + 3] = data[index + 3];
  }
  return { width, height, data: out };
}

export function applySepia(pixels, amount = 1) {
  const parsed = Number(amount);
  const strength = clamp(Number.isFinite(parsed) ? parsed : 1, 0, 1);
  if (strength === 0) return clonePixels(pixels);
  const { width, height, data } = pixels;
  const out = new Uint8ClampedArray(data.length);
  for (let index = 0; index < data.length; index += 4) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const sr = clamp(Math.round(r * 0.393 + g * 0.769 + b * 0.189), 0, 255);
    const sg = clamp(Math.round(r * 0.349 + g * 0.686 + b * 0.168), 0, 255);
    const sb = clamp(Math.round(r * 0.272 + g * 0.534 + b * 0.131), 0, 255);
    out[index] = Math.round(r * (1 - strength) + sr * strength);
    out[index + 1] = Math.round(g * (1 - strength) + sg * strength);
    out[index + 2] = Math.round(b * (1 - strength) + sb * strength);
    out[index + 3] = data[index + 3];
  }
  return { width, height, data: out };
}

export function applyEmboss(pixels) {
  const { width, height, data } = pixels;
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        out[index] = 128;
        out[index + 1] = 128;
        out[index + 2] = 128;
        out[index + 3] = data[index + 3];
        continue;
      }
      const aboveLeft = ((y - 1) * width + x - 1) * 4;
      const belowRight = ((y + 1) * width + x + 1) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const diff = data[belowRight + channel] - data[aboveLeft + channel];
        out[index + channel] = clamp(128 + diff, 0, 255);
      }
      out[index + 3] = data[index + 3];
    }
  }
  return { width, height, data: out };
}

export function applyBrightnessContrast(pixels, { brightness = 0, contrast = 0 } = {}) {
  const b = clamp(Math.round(Number(brightness) || 0), -100, 100);
  const c = clamp(Math.round(Number(contrast) || 0), -100, 100);
  if (b === 0 && c === 0) return clonePixels(pixels);
  const { width, height, data } = pixels;
  const out = new Uint8ClampedArray(data.length);
  const factor = (259 * (c + 255)) / (255 * (259 - c));
  const bOffset = b * 2.55;
  for (let index = 0; index < data.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const val = factor * (data[index + channel] - 128) + 128 + bOffset;
      out[index + channel] = clamp(Math.round(val), 0, 255);
    }
    out[index + 3] = data[index + 3];
  }
  return { width, height, data: out };
}

export function applyColorBalance(
  pixels,
  { cyanRed = 0, magentaGreen = 0, yellowBlue = 0, preserveLuminosity = true } = {},
) {
  const cr = clamp(Math.round(Number(cyanRed) || 0), -100, 100);
  const mg = clamp(Math.round(Number(magentaGreen) || 0), -100, 100);
  const yb = clamp(Math.round(Number(yellowBlue) || 0), -100, 100);
  const preserve = Boolean(preserveLuminosity);
  if (cr === 0 && mg === 0 && yb === 0) return clonePixels(pixels);

  const { width, height, data } = pixels;
  const out = new Uint8ClampedArray(data.length);
  const rOffset = cr * 2.55;
  const gOffset = mg * 2.55;
  const bOffset = yb * 2.55;

  for (let index = 0; index < data.length; index += 4) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const a = data[index + 3];

    const adjR = clamp(Math.round(r + rOffset), 0, 255);
    const adjG = clamp(Math.round(g + gOffset), 0, 255);
    const adjB = clamp(Math.round(b + bOffset), 0, 255);

    if (preserve) {
      const origLuma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const newLuma = 0.2126 * adjR + 0.7152 * adjG + 0.0722 * adjB;
      if (newLuma > 0 && origLuma > 0) {
        const ratio = origLuma / newLuma;
        out[index] = clamp(Math.round(adjR * ratio), 0, 255);
        out[index + 1] = clamp(Math.round(adjG * ratio), 0, 255);
        out[index + 2] = clamp(Math.round(adjB * ratio), 0, 255);
      } else {
        out[index] = adjR;
        out[index + 1] = adjG;
        out[index + 2] = adjB;
      }
    } else {
      out[index] = adjR;
      out[index + 1] = adjG;
      out[index + 2] = adjB;
    }
    out[index + 3] = a;
  }
  return { width, height, data: out };
}

export function applyNoise(
  pixels,
  { amount = 15, monochrome = true, seed = null } = {},
) {
  const amt = clamp(Math.round(Number(amount) || 15), 1, 100);
  const isMono = Boolean(monochrome);
  const { width, height, data } = pixels;
  const out = new Uint8ClampedArray(data.length);
  const maxDelta = amt * 2.55;

  let rand = Math.random;
  if (seed !== null && seed !== undefined) {
    let state = (Number(seed) >>> 0) || 1;
    rand = () => {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  for (let index = 0; index < data.length; index += 4) {
    if (isMono) {
      const delta = Math.round((rand() * 2 - 1) * maxDelta);
      out[index] = clamp(data[index] + delta, 0, 255);
      out[index + 1] = clamp(data[index + 1] + delta, 0, 255);
      out[index + 2] = clamp(data[index + 2] + delta, 0, 255);
    } else {
      const deltaR = Math.round((rand() * 2 - 1) * maxDelta);
      const deltaG = Math.round((rand() * 2 - 1) * maxDelta);
      const deltaB = Math.round((rand() * 2 - 1) * maxDelta);
      out[index] = clamp(data[index] + deltaR, 0, 255);
      out[index + 1] = clamp(data[index + 1] + deltaG, 0, 255);
      out[index + 2] = clamp(data[index + 2] + deltaB, 0, 255);
    }
    out[index + 3] = data[index + 3];
  }
  return { width, height, data: out };
}

export function applyHighPass(pixels, radius = 10) {
  const r = clamp(Math.round(Number(radius) || 10), 1, 50);
  const { width, height, data } = pixels;
  const out = new Uint8ClampedArray(data.length);
  const windowSize = 2 * r + 1;

  // Horizontal blur pass
  const hBlur = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width;
    for (let c = 0; c < 3; c += 1) {
      let sum = 0;
      for (let k = -r; k <= r; k += 1) {
        const sampleX = clamp(k, 0, width - 1);
        sum += data[(rowOffset + sampleX) * 4 + c];
      }
      for (let x = 0; x < width; x += 1) {
        hBlur[(rowOffset + x) * 3 + c] = sum / windowSize;
        const leftX = clamp(x - r, 0, width - 1);
        const rightX = clamp(x + r + 1, 0, width - 1);
        sum += data[(rowOffset + rightX) * 4 + c] - data[(rowOffset + leftX) * 4 + c];
      }
    }
  }

  // Vertical blur pass + High Pass difference
  for (let x = 0; x < width; x += 1) {
    for (let c = 0; c < 3; c += 1) {
      let sum = 0;
      for (let k = -r; k <= r; k += 1) {
        const sampleY = clamp(k, 0, height - 1);
        sum += hBlur[(sampleY * width + x) * 3 + c];
      }
      for (let y = 0; y < height; y += 1) {
        const blurVal = sum / windowSize;
        const topY = clamp(y - r, 0, height - 1);
        const bottomY = clamp(y + r + 1, 0, height - 1);
        sum += hBlur[(bottomY * width + x) * 3 + c] - hBlur[(topY * width + x) * 3 + c];

        const idx = (y * width + x) * 4;
        const orig = data[idx + c];
        const diff = orig - blurVal;
        out[idx + c] = clamp(Math.round(128 + diff), 0, 255);
      }
    }
  }

  // Preserve alpha channel
  for (let idx = 0; idx < data.length; idx += 4) {
    out[idx + 3] = data[idx + 3];
  }

  return { width, height, data: out };
}

export function applyTint(
  pixels,
  { color = "#ec8a15", density = 25, preserveLuminosity = true } = {},
) {
  const rgb = hexToRgb(color) ?? { r: 236, g: 138, b: 21 };
  const d = clamp(Math.round(Number(density) || 25), 1, 100);
  const weight = d / 100;
  const preserve = Boolean(preserveLuminosity);
  const { width, height, data } = pixels;
  const out = new Uint8ClampedArray(data.length);

  for (let index = 0; index < data.length; index += 4) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const a = data[index + 3];

    if (a === 0) {
      out[index] = r;
      out[index + 1] = g;
      out[index + 2] = b;
      out[index + 3] = 0;
      continue;
    }

    const tintR = r * (1 - weight) + rgb.r * weight;
    const tintG = g * (1 - weight) + rgb.g * weight;
    const tintB = b * (1 - weight) + rgb.b * weight;

    if (preserve) {
      const origLuma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const tintLuma = 0.2126 * tintR + 0.7152 * tintG + 0.0722 * tintB;
      if (tintLuma > 0 && origLuma > 0) {
        const ratio = origLuma / tintLuma;
        out[index] = clamp(Math.round(tintR * ratio), 0, 255);
        out[index + 1] = clamp(Math.round(tintG * ratio), 0, 255);
        out[index + 2] = clamp(Math.round(tintB * ratio), 0, 255);
      } else {
        out[index] = clamp(Math.round(tintR), 0, 255);
        out[index + 1] = clamp(Math.round(tintG), 0, 255);
        out[index + 2] = clamp(Math.round(tintB), 0, 255);
      }
    } else {
      out[index] = clamp(Math.round(tintR), 0, 255);
      out[index + 1] = clamp(Math.round(tintG), 0, 255);
      out[index + 2] = clamp(Math.round(tintB), 0, 255);
    }
    out[index + 3] = a;
  }
  return { width, height, data: out };
}

