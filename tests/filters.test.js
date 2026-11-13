import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_ADJUSTMENTS,
  applyLevels,
  applyInvert,
  applyDesaturate,
  applyThreshold,
  applyPosterize,
  applySepia,
  applyEmboss,
  applyBrightnessContrast,
  applyColorBalance,
  applyNoise,
  applyHighPass,
  applyTint,
  applyFindEdges,
  applySolarize,
  applyBlur,
  applyDither,
  applyDuotone,
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

test("sepia applies warm vintage tone while preserving alpha", () => {
  const source = pixels(1, 1, 100);
  source.data[3] = 210;

  // Amount 0 returns clone
  const neutral = applySepia(source, 0);
  assert.notStrictEqual(neutral.data, source.data);
  assert.equal(neutral.data[0], 100);
  assert.equal(neutral.data[1], 100);
  assert.equal(neutral.data[2], 100);
  assert.equal(neutral.data[3], 210);

  // Full sepia: r=135, g=120, b=94
  const sepia = applySepia(source, 1);
  assert.equal(sepia.data[0], 135);
  assert.equal(sepia.data[1], 120);
  assert.equal(sepia.data[2], 94);
  assert.equal(sepia.data[3], 210); // alpha preserved
});

test("emboss calculates directional relief and preserves alpha", () => {
  const uniform = pixels(3, 3, 150);
  uniform.data[(1 * 3 + 1) * 4 + 3] = 180;
  const embossedUniform = applyEmboss(uniform);
  assert.notStrictEqual(embossedUniform.data, uniform.data);
  // Center pixel with uniform surrounding has 0 difference -> 128 neutral gray
  assert.equal(embossedUniform.data[(1 * 3 + 1) * 4], 128);
  assert.equal(embossedUniform.data[(1 * 3 + 1) * 4 + 1], 128);
  assert.equal(embossedUniform.data[(1 * 3 + 1) * 4 + 2], 128);
  assert.equal(embossedUniform.data[(1 * 3 + 1) * 4 + 3], 180);

  // Steeper gradient: top-left dark (0), bottom-right bright (200)
  const edge = pixels(3, 3, 100);
  edge.data[0] = 0; // top-left (0, 0)
  edge.data[(2 * 3 + 2) * 4] = 200; // bottom-right (2, 2)
  const embossedEdge = applyEmboss(edge);
  // Center pixel difference: 200 - 0 = 200 -> 128 + 200 clamped to 255
  assert.equal(embossedEdge.data[(1 * 3 + 1) * 4], 255);
  assert.equal(embossedEdge.data[0], 128); // edge pixels default to 128
});

test("brightness and contrast modifies tone and preserves alpha", () => {
  const source = pixels(2, 1, 100);
  source.data[3] = 190;
  source.data[4] = 180;
  source.data[7] = 240;

  // Neutral settings return clone
  const neutral = applyBrightnessContrast(source, { brightness: 0, contrast: 0 });
  assert.notStrictEqual(neutral.data, source.data);
  assert.equal(neutral.data[0], 100);
  assert.equal(neutral.data[3], 190);
  assert.equal(neutral.data[4], 180);
  assert.equal(neutral.data[7], 240);

  // Increase brightness (+20)
  const brighter = applyBrightnessContrast(source, { brightness: 20, contrast: 0 });
  // 100 + 20 * 2.55 = 100 + 51 = 151
  assert.equal(brighter.data[0], 151);
  assert.equal(brighter.data[3], 190); // alpha preserved

  // Increase contrast (+50)
  const contrasted = applyBrightnessContrast(source, { brightness: 0, contrast: 50 });
  // factor = (259 * 305) / (255 * 209) = 1.4822
  // low value 100: 1.4822 * (100 - 128) + 128 = 128 - 41.5 = 86
  // high value 180: 1.4822 * (180 - 128) + 128 = 128 + 77 = 205
  assert.ok(contrasted.data[0] < 100);
  assert.ok(contrasted.data[4] > 180);
  assert.equal(contrasted.data[3], 190);
  assert.equal(contrasted.data[7], 240);
});

test("color balance adjusts color channels, preserves luminosity and alpha", () => {
  const source = pixels(2, 1, 120);
  source.data[3] = 200;
  source.data[7] = 220;

  // Neutral settings return clone
  const neutral = applyColorBalance(source, { cyanRed: 0, magentaGreen: 0, yellowBlue: 0 });
  assert.notStrictEqual(neutral.data, source.data);
  assert.equal(neutral.data[0], 120);
  assert.equal(neutral.data[3], 200);

  // Add Red (+40) with preserveLuminosity
  const warmer = applyColorBalance(source, { cyanRed: 40, magentaGreen: 0, yellowBlue: 0, preserveLuminosity: true });
  // R should be higher than original
  assert.ok(warmer.data[0] > 120);
  // G and B should be lowered to preserve total luminance
  assert.ok(warmer.data[1] < 120);
  assert.ok(warmer.data[2] < 120);
  assert.equal(warmer.data[3], 200); // alpha preserved

  // Check perceptual luminance is approximately equal
  const origLuma = 0.2126 * 120 + 0.7152 * 120 + 0.0722 * 120; // 120
  const warmLuma = 0.2126 * warmer.data[0] + 0.7152 * warmer.data[1] + 0.0722 * warmer.data[2];
  assert.ok(Math.abs(origLuma - warmLuma) <= 2, `Luminance shifted too much: ${origLuma} vs ${warmLuma}`);

  // Without preserveLuminosity (raw offset)
  const rawShift = applyColorBalance(source, { cyanRed: 20, magentaGreen: -20, yellowBlue: 10, preserveLuminosity: false });
  // R offset = 20 * 2.55 = 51 -> 120 + 51 = 171
  assert.equal(rawShift.data[0], 171);
  // G offset = -20 * 2.55 = -51 -> 120 - 51 = 69
  assert.equal(rawShift.data[1], 69);
  // B offset = 10 * 2.55 = 25.5 -> 120 + 26 = 146
  assert.equal(rawShift.data[2], 146);
  assert.equal(rawShift.data[3], 200);
});

test("noise adds monochrome and colored variation with deterministic seed and preserves alpha", () => {
  const source = pixels(4, 1, 128);
  source.data[3] = 195;
  source.data[7] = 215;
  source.data[11] = 235;
  source.data[15] = 255;

  // Monochrome noise with seed 42
  const mono1 = applyNoise(source, { amount: 20, monochrome: true, seed: 42 });
  const mono2 = applyNoise(source, { amount: 20, monochrome: true, seed: 42 });

  // Determinism check
  assert.deepEqual(Array.from(mono1.data), Array.from(mono2.data));

  // Alpha preserved on all pixels
  assert.equal(mono1.data[3], 195);
  assert.equal(mono1.data[7], 215);
  assert.equal(mono1.data[11], 235);
  assert.equal(mono1.data[15], 255);

  // In monochrome mode, R === G === B for every pixel
  for (let p = 0; p < 4; p += 1) {
    const idx = p * 4;
    assert.equal(mono1.data[idx], mono1.data[idx + 1]);
    assert.equal(mono1.data[idx + 1], mono1.data[idx + 2]);
    // Values modified from 128
    assert.notEqual(mono1.data[idx], 128);
  }

  // Colored (non-monochrome) noise with seed 42
  const colorNoise = applyNoise(source, { amount: 30, monochrome: false, seed: 42 });
  assert.equal(colorNoise.data[3], 195);
  // Channels should vary independently
  const hasIndependentChannels =
    colorNoise.data[0] !== colorNoise.data[1] ||
    colorNoise.data[1] !== colorNoise.data[2] ||
    colorNoise.data[4] !== colorNoise.data[5];
  assert.ok(hasIndependentChannels, "Color noise channels should vary independently");
});

test("high pass retains high-frequency edge detail, neutralizes flat areas, and preserves alpha", () => {
  // Uniform 5x5 image -> everywhere diff is 0, so output is exactly 128 neutral gray
  const uniform = pixels(5, 5, 140);
  uniform.data[3] = 190;
  uniform.data[(2 * 5 + 2) * 4 + 3] = 210;
  const hpUniform = applyHighPass(uniform, 2);
  assert.notStrictEqual(hpUniform.data, uniform.data);
  for (let i = 0; i < hpUniform.data.length; i += 4) {
    assert.equal(hpUniform.data[i], 128);
    assert.equal(hpUniform.data[i + 1], 128);
    assert.equal(hpUniform.data[i + 2], 128);
  }
  // Alpha preserved
  assert.equal(hpUniform.data[3], 190);
  assert.equal(hpUniform.data[(2 * 5 + 2) * 4 + 3], 210);

  // High contrast center point (center = 240, surrounding = 40)
  const edge = pixels(5, 5, 40);
  const centerIdx = (2 * 5 + 2) * 4;
  edge.data[centerIdx] = 240;
  edge.data[centerIdx + 1] = 240;
  edge.data[centerIdx + 2] = 240;

  const hpEdge = applyHighPass(edge, 1);
  // Center pixel is higher than local blur -> highlight (> 128)
  assert.ok(hpEdge.data[centerIdx] > 128, `Expected center > 128, got ${hpEdge.data[centerIdx]}`);
  // Immediately adjacent pixel has orig=40 < blur -> shadow (< 128)
  const adjIdx = (2 * 5 + 1) * 4;
  assert.ok(hpEdge.data[adjIdx] < 128, `Expected adjacent < 128, got ${hpEdge.data[adjIdx]}`);
});

test("tint blends optical color filter, preserves luminosity and alpha", () => {
  const source = pixels(2, 1, 100);
  source.data[3] = 180;
  source.data[7] = 220;

  // Warm tint (#ec8a15: r=236, g=138, b=21) with preserveLuminosity
  const warm = applyTint(source, { color: "#ec8a15", density: 40, preserveLuminosity: true });
  assert.notStrictEqual(warm.data, source.data);
  // Red channel increased, blue channel decreased
  assert.ok(warm.data[0] > 100);
  assert.ok(warm.data[2] < 100);
  assert.equal(warm.data[3], 180); // alpha preserved

  // Perceptual luminance check
  const origLuma = 0.2126 * 100 + 0.7152 * 100 + 0.0722 * 100; // 100
  const warmLuma = 0.2126 * warm.data[0] + 0.7152 * warm.data[1] + 0.0722 * warm.data[2];
  assert.ok(Math.abs(origLuma - warmLuma) <= 2, `Luminance shifted too much: ${origLuma} vs ${warmLuma}`);

  // Without preserveLuminosity (raw blend with blue #0073e6: r=0, g=115, b=230)
  const coolRaw = applyTint(source, { color: "#0073e6", density: 50, preserveLuminosity: false });
  // r = 100 * 0.5 + 0 * 0.5 = 50
  assert.equal(coolRaw.data[0], 50);
  // g = 100 * 0.5 + 115 * 0.5 = 107.5 -> 108
  assert.equal(coolRaw.data[1], 108);
  // b = 100 * 0.5 + 230 * 0.5 = 165
  assert.equal(coolRaw.data[2], 165);
  assert.equal(coolRaw.data[3], 180);
});

test("find edges isolates high contrast contours as dark lines on white and preserves alpha", () => {
  // Uniform 3x3 image -> gradients are 0, output is pure white (255)
  const uniform = pixels(3, 3, 100);
  uniform.data[3] = 190;
  uniform.data[(1 * 3 + 1) * 4 + 3] = 210;
  const edgesUniform = applyFindEdges(uniform);
  assert.notStrictEqual(edgesUniform.data, uniform.data);
  const centerIdx = (1 * 3 + 1) * 4;
  assert.equal(edgesUniform.data[centerIdx], 255);
  assert.equal(edgesUniform.data[centerIdx + 1], 255);
  assert.equal(edgesUniform.data[centerIdx + 2], 255);
  assert.equal(edgesUniform.data[centerIdx + 3], 210); // alpha preserved

  // Step edge: left column black (0), right column white (255)
  const step = pixels(3, 3, 128);
  for (let y = 0; y < 3; y += 1) {
    step.data[(y * 3 + 0) * 4] = 0;
    step.data[(y * 3 + 0) * 4 + 1] = 0;
    step.data[(y * 3 + 0) * 4 + 2] = 0;
    step.data[(y * 3 + 2) * 4] = 255;
    step.data[(y * 3 + 2) * 4 + 1] = 255;
    step.data[(y * 3 + 2) * 4 + 2] = 255;
  }
  const edgesStep = applyFindEdges(step);
  // Center pixel has strong horizontal gradient -> dark outline (< 255)
  assert.ok(edgesStep.data[centerIdx] < 100, `Expected dark edge, got ${edgesStep.data[centerIdx]}`);
});

test("solarize applies sabattier tonal inversion curve and preserves alpha", () => {
  const source = pixels(3, 1, 0);
  // Pixel 0: black (0)
  source.data[0] = 0;
  source.data[1] = 0;
  source.data[2] = 0;
  source.data[3] = 150;
  // Pixel 1: midtone (128)
  source.data[4] = 128;
  source.data[5] = 128;
  source.data[6] = 128;
  source.data[7] = 200;
  // Pixel 2: highlight (255)
  source.data[8] = 255;
  source.data[9] = 255;
  source.data[10] = 255;
  source.data[11] = 250;

  const solarized = applySolarize(source, 128);
  assert.notStrictEqual(solarized.data, source.data);
  // Black stays black (0)
  assert.equal(solarized.data[0], 0);
  assert.equal(solarized.data[3], 150); // alpha preserved
  // Midtone peaks to white (255)
  assert.equal(solarized.data[4], 255);
  assert.equal(solarized.data[7], 200); // alpha preserved
  // Highlight inverts to shadow (0)
  assert.equal(solarized.data[8], 0);
  assert.equal(solarized.data[11], 250); // alpha preserved
});

test("blur smooths sharp transitions, leaves flat regions intact, and preserves alpha", () => {
  // Flat image remains identical under blur
  const flat = pixels(5, 5, 120);
  flat.data[3] = 180;
  flat.data[(2 * 5 + 2) * 4 + 3] = 220;
  const blurredFlat = applyBlur(flat, 2);
  assert.notStrictEqual(blurredFlat.data, flat.data);
  const centerIdx = (2 * 5 + 2) * 4;
  assert.equal(blurredFlat.data[centerIdx], 120);
  assert.equal(blurredFlat.data[centerIdx + 3], 220); // alpha preserved

  // Step edge gets blurred
  const step = pixels(5, 5, 0);
  for (let y = 0; y < 5; y += 1) {
    for (let x = 3; x < 5; x += 1) {
      const idx = (y * 5 + x) * 4;
      step.data[idx] = 200;
      step.data[idx + 1] = 200;
      step.data[idx + 2] = 200;
    }
  }
  const blurredStep = applyBlur(step, 1);
  // Center pixel was 0, but surrounded by 200 on right -> now > 0 and < 200
  assert.ok(blurredStep.data[centerIdx] > 0 && blurredStep.data[centerIdx] < 200);
});

test("dither converts continuous tones to bayer pattern and preserves alpha", () => {
  // 4x4 black image remains 0
  const black = pixels(4, 4, 0);
  black.data[3] = 160;
  const ditheredBlack = applyDither(black, { monochrome: true });
  assert.notStrictEqual(ditheredBlack.data, black.data);
  assert.equal(ditheredBlack.data[0], 0);
  assert.equal(ditheredBlack.data[3], 160); // alpha preserved

  // 4x4 white image remains 255
  const white = pixels(4, 4, 255);
  const ditheredWhite = applyDither(white, { monochrome: true });
  assert.equal(ditheredWhite.data[0], 255);

  // 4x4 midtone (128) yields exact 50% dither pattern (8 black, 8 white pixels)
  const gray = pixels(4, 4, 128);
  const ditheredGray = applyDither(gray, { monochrome: true });
  let whiteCount = 0;
  let blackCount = 0;
  for (let i = 0; i < 16; i += 1) {
    const val = ditheredGray.data[i * 4];
    if (val === 255) whiteCount += 1;
    else if (val === 0) blackCount += 1;
  }
  assert.equal(whiteCount, 8);
  assert.equal(blackCount, 8);

  // Color dither decomposes channels independently
  const colored = pixels(4, 4, 0);
  colored.data[0] = 255; // Red channel on pixel 0
  colored.data[1] = 0;   // Green off
  colored.data[2] = 0;   // Blue off
  const ditheredColor = applyDither(colored, { monochrome: false });
  assert.equal(ditheredColor.data[0], 255);
  assert.equal(ditheredColor.data[1], 0);
  assert.equal(ditheredColor.data[2], 0);
});

test("duotone maps shadow and highlight colors across perceptual luminance and preserves alpha", () => {
  const source = pixels(3, 1, 0);
  // Pixel 0: pure black (0, 0, 0)
  source.data[0] = 0;
  source.data[1] = 0;
  source.data[2] = 0;
  source.data[3] = 175;
  // Pixel 1: pure white (255, 255, 255)
  source.data[4] = 255;
  source.data[5] = 255;
  source.data[6] = 255;
  source.data[7] = 210;
  // Pixel 2: midtone gray (128, 128, 128)
  source.data[8] = 128;
  source.data[9] = 128;
  source.data[10] = 128;
  source.data[11] = 240;

  // Shadow: navy #000080 (r=0, g=0, b=128)
  // Highlight: bright yellow #ffff00 (r=255, g=255, b=0)
  const duo = applyDuotone(source, { shadow: "#000080", highlight: "#ffff00" });
  assert.notStrictEqual(duo.data, source.data);

  // Black maps to pure shadow color
  assert.equal(duo.data[0], 0);
  assert.equal(duo.data[1], 0);
  assert.equal(duo.data[2], 128);
  assert.equal(duo.data[3], 175); // alpha preserved

  // White maps to pure highlight color
  assert.equal(duo.data[4], 255);
  assert.equal(duo.data[5], 255);
  assert.equal(duo.data[6], 0);
  assert.equal(duo.data[7], 210); // alpha preserved

  // Midtone interpolates (luma ~ 128/255 = ~0.502)
  assert.equal(duo.data[8], 128);
  assert.equal(duo.data[9], 128);
  assert.equal(duo.data[10], 64);
  assert.equal(duo.data[11], 240); // alpha preserved
});




