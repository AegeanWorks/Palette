import { findContentBounds } from "../core/bounds.js";
import { clamp, normalizeHex, rgbToHex } from "../core/color.js";
import {
  activeLayer,
  addLayer,
  blendOperation,
  clippingBaseIndex,
  createDocument,
  createLayer,
  duplicateLayerRecord,
  indexOfLayer,
  layerById,
  moveLayer,
  nextLayerName,
  removeLayer,
  resizeDocument,
  setActiveLayer,
  updateLayer,
} from "../core/document.js";
import {
  downloadName,
  exportDimensions,
  exportFormat,
  formatBytes,
  normalizeExportScale,
  normalizeQuality,
  safeFileName,
} from "../core/export.js";
import {
  DEFAULT_ADJUSTMENTS,
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
  applyOilPaint,
  applyMedian,
  applyDesaturate,
  applyEmboss,
  applyInvert,
  applyLevels,
  applyPixelate,
  applyPosterize,
  applySepia,
  applySharpen,
  applyThreshold,
  applyVignette,
  buildCssFilter,
  isNeutralAdjustments,
} from "../core/filters.js";
import { floodFillPixels } from "../core/fill.js";
import {
  anchorOffset,
  clampRect,
  constrainAngle,
  constrainAspect,
  constrainSquare,
  containRect,
  docToScreen,
  expandSelection,
  fitView,
  isUsableRect,
  MAX_SCALE,
  MIN_SCALE,
  normalizeRect,
  roundRect,
  screenToDoc,
  selectionFromDrag,
  zoomAt,
} from "../core/geometry.js";
import { isUsableGradient } from "../core/gradient.js";
import { autoLevelsRange, buildHistogram, percentileRange } from "../core/histogram.js";
import { History, createCommand } from "../core/history.js";
import {
  boundedDimensions,
  cleanDocumentName,
  parseProject,
  requestedDimension,
  serializeProject,
} from "../core/project.js";
import {
  canvasToBlob,
  cloneCanvas,
  compositeDocument,
  context2d,
  createCanvas,
  downloadBlob,
  drawLayerStack,
  fillCanvas,
  getPixels,
  imageToCanvas,
  layerThumbnail,
  loadImage,
  putPixels,
  readFileText,
  samplePixel,
} from "./canvas.js";
import {
  autosaveAvailable,
  captureSession,
  clearAutosave,
  formatSavedAt,
  readAutosave,
  validateSessionRecord,
  writeAutosave,
} from "./autosave.js";
import {
  addSelectionPath,
  brushStamp,
  clearSelectionArea,
  cropCanvas,
  drawGradient,
  drawShape,
  drawText,
  drawTextOn,
  FONT_STACKS,
  extractSelection,
  flipCanvas,
  placeCanvas,
  redrawSelectedMove,
  replaceInsideSelection,
  rotateCanvas,
  scaleCanvas,
  shiftedCanvas,
  strokeBrush,
  strokeClone,
  strokeTone,
} from "./paint.js";

const TOOL_KEYS = Object.freeze({
  move: "V", brush: "B", eraser: "E", clone: "S", dodge: "D", bucket: "K",
  crop: "C", marquee: "M", text: "T", rect: "R", ellipse: "O", line: "L",
  gradient: "G", eyedropper: "I", hand: "H", zoom: "Z",
});

const BUTTON_SHORTCUTS = Object.freeze({
  btnNew: "Control+N Meta+N",
  btnOpen: "Control+O Meta+O",
  btnOpenProject: "Control+Shift+O Meta+Shift+O",
  btnSave: "Control+S Meta+S",
  btnExport: "Control+E Meta+E",
  btnStampVisible: "Control+Alt+Shift+E Meta+Alt+Shift+E",
  btnSelectAll: "Control+A Meta+A",
  btnDeselect: "Control+D Meta+D",
  btnInvertSelection: "Shift+I Control+Shift+I Meta+Shift+I",
  btnCopy: "Control+C Meta+C",
  btnCut: "Control+X Meta+X",
  btnPaste: "Control+V Meta+V",
  btnLayerViaCopy: "Control+J Meta+J",
  btnLayerViaCut: "Control+Shift+J Meta+Shift+J",
  btnActual: "Control+1 Meta+1",
  btnZoomIn: "= Control+= Meta+=",
  btnZoomOut: "- Control+- Meta+-",
  btnFit: "0 Control+0 Meta+0",
  btnHelp: "F1",
});

const TOOL_META = Object.freeze({
  move: { label: "Move", cursor: "move", hint: "Drag the active layer. Shift constrains to an axis; arrow keys nudge it." },
  brush: { label: "Brush", cursor: "crosshair", hint: "Paint on the active layer. [ and ] change the size." },
  eraser: { label: "Eraser", cursor: "crosshair", hint: "Erase pixels from the active layer. [ and ] change the size." },
  clone: { label: "Clone stamp", cursor: "crosshair", hint: "Alt-click a source, then drag to clone. [ and ] change the size." },
  dodge: { label: "Dodge & burn", cursor: "crosshair", hint: "Drag to lighten or darken pixels. [ and ] change the size." },
  bucket: { label: "Paint bucket", cursor: "crosshair", hint: "Click an area to fill with the active colour." },
  crop: { label: "Crop", cursor: "crosshair", hint: "Drag a region. Double-click or Enter to apply." },
  marquee: { label: "Marquee", cursor: "crosshair", hint: "Drag to select a region. Double-click or Ctrl+A selects all; Ctrl+D deselects." },
  text: { label: "Text", cursor: "text", hint: "Click the canvas, type a line, then press Add." },
  rect: { label: "Rectangle", cursor: "crosshair", hint: "Drag to draw a rectangle. Shift keeps it square." },
  ellipse: { label: "Ellipse", cursor: "crosshair", hint: "Drag to draw an ellipse. Shift keeps it circular." },
  line: { label: "Line", cursor: "crosshair", hint: "Drag to draw a line. Shift snaps to 45°." },
  gradient: { label: "Gradient", cursor: "crosshair", hint: "Drag to fill the active layer with a gradient. Shift snaps the angle." },
  eyedropper: { label: "Eyedropper", cursor: "eyedropper", hint: "Click a pixel to make it the active colour." },
  hand: { label: "Hand", cursor: "grab", hint: "Drag to pan. Space also pans. Double-click to fit." },
  zoom: { label: "Zoom", cursor: "zoom-in", hint: "Click to zoom in. Alt-click to zoom out. Double-click for 100%." },
});

const ADJUSTMENTS = [
  "brightness",
  "contrast",
  "saturation",
  "hue",
  "grayscale",
  "sepia",
  "invert",
  "blur",
];

// Actions that bake pixels into the active layer. They cannot run while the
// layer is locked, so they are disabled alongside opacity/blend/adjustments.
const DESTRUCTIVE_ACTIONS = [
  "btnAutoLevels",
  "btnFilterBlur", "btnFilterPixelate", "btnFilterSharpen", "btnFilterVignette",
  "btnFilterInvert", "btnFilterDesaturate", "btnFilterSepia", "btnFilterEmboss",
  "btnFilterThreshold", "btnFilterPosterize", "btnFilterLevels", "btnFilterBc",
  "btnFilterColorBalance", "btnFilterNoise", "btnFilterHighPass", "btnFilterTint",
  "btnFilterFindEdges", "btnFilterSolarize", "btnFilterDuotone", "btnFilterDither",
  "btnFilterOil", "btnFilterMedian",
  // Layer-level transforms also reject hidden/locked layers.
  "btnTransform", "btnLayerFlipH", "btnLayerFlipV", "btnLayerRotateCw", "btnLayerRotateCcw",
  // Filter parameter inputs are inert too while the layer cannot be edited.
  "filterBlurRadius", "filterPixelSize", "filterThresholdCutoff", "filterPosterizeSteps",
  "filterBrightness", "filterContrast", "filterCbCr", "filterCbMg", "filterCbYb",
  "filterCbPreserve", "filterNoiseAmount", "filterNoiseMonochrome", "filterHighPassRadius",
  "filterTintColor", "filterTintDensity", "filterTintPreserve", "filterDuotoneShadow",
  "filterDuotoneHighlight", "filterOilRadius", "levelBlack", "levelWhite", "levelGamma",
];

const IDS = [
  "doc-name", "doc-dirty", "doc-size", "btn-new", "btn-open", "btn-open-project", "btn-save", "btn-export",
  "btn-undo", "btn-redo", "btn-help", "file-image", "file-layer", "file-project", "stage-wrap", "doc-frame",
  "stage", "overlay", "text-editor", "text-input", "text-count", "text-commit", "text-cancel", "drop-hint",
  "stage-note", "btn-zoom-out", "btn-fit", "btn-zoom-in", "color-row", "color-input", "color-hex",
  "tool-hint", "edit-lock-notice", "options-brush", "options-eraser", "options-clone", "options-dodge", "options-bucket", "options-shape", "options-text", "options-gradient",
  "options-marquee", "options-crop", "options-move", "marquee-shape", "crop-aspect", "btn-select-all", "btn-deselect",
  "btn-crop-selection", "btn-invert-selection", "btn-expand-selection", "btn-contract-selection", "btn-clear-selection", "btn-copy", "btn-cut", "btn-paste",
  "btn-layer-via-copy", "btn-layer-via-cut", "brush-size", "brush-size-value", "brush-hardness",
  "brush-hardness-value", "brush-opacity", "brush-opacity-value", "eraser-size", "eraser-size-value",
  "eraser-hardness", "eraser-hardness-value", "eraser-opacity", "eraser-opacity-value", "shape-fill",
  "clone-size", "clone-size-value", "clone-hardness", "clone-hardness-value", "clone-opacity", "clone-opacity-value",
  "dodge-mode", "dodge-size", "dodge-size-value", "dodge-hardness", "dodge-hardness-value", "dodge-strength", "dodge-strength-value",
  "bucket-tolerance", "bucket-tolerance-value", "bucket-opacity", "bucket-opacity-value", "bucket-contiguous",
  "shape-outline", "shape-outline-color", "shape-outline-hex", "shape-width", "shape-width-value",
  "text-font", "text-size", "text-size-value", "text-weight", "gradient-type", "gradient-end",
  "gradient-end-hex", "gradient-fade", "gradient-opacity", "gradient-opacity-value", "crop-apply",
  "crop-cancel", "btn-layer-add", "btn-layer-image", "btn-layer-duplicate", "btn-layer-merge",
  "btn-layer-lock", "btn-layer-clip", "btn-layer-up", "btn-layer-down", "btn-layer-delete", "layer-opacity",
  "layer-opacity-value", "layer-blend", "layer-count", "layer-list",
  "btn-resize", "btn-canvas-size", "btn-transform", "btn-layer-flip-h", "btn-layer-flip-v", "btn-layer-rotate-cw", "btn-layer-rotate-ccw", "btn-flip-h", "btn-flip-v", "btn-rotate",
  "btn-flatten", "btn-stamp-visible",
  "adjust-reset", "histogram", "histogram-hover", "histogram-range", "btn-auto-levels", "filter-reset", "adj-brightness",
  "adj-brightness-value", "adj-contrast", "adj-contrast-value",
  "adj-saturation", "adj-saturation-value", "adj-hue", "adj-hue-value", "adj-grayscale",
  "adj-grayscale-value", "adj-sepia", "adj-sepia-value", "adj-invert", "adj-invert-value",
  "adj-blur", "adj-blur-value", "filter-blur-radius", "filter-blur-value", "btn-filter-blur",
  "filter-pixel-size", "filter-pixel-value", "btn-filter-pixelate", "btn-filter-sharpen",
  "btn-filter-vignette", "btn-filter-invert", "btn-filter-desaturate", "filter-threshold-cutoff",
  "filter-threshold-value", "btn-filter-threshold", "filter-posterize-steps", "filter-posterize-value",
  "btn-filter-posterize", "btn-filter-sepia", "btn-filter-emboss", "swatches-row", "level-black", "level-black-value", "level-white", "level-white-value",
  "level-gamma", "level-gamma-value", "btn-filter-levels", "filter-brightness", "filter-brightness-value",
  "filter-contrast", "filter-contrast-value", "btn-filter-bc",
  "filter-cb-cr", "filter-cb-cr-value", "filter-cb-mg", "filter-cb-mg-value", "filter-cb-yb", "filter-cb-yb-value",
  "filter-cb-preserve", "btn-filter-color-balance", "filter-noise-amount", "filter-noise-amount-value",
  "filter-noise-monochrome", "btn-filter-noise",
  "filter-high-pass-radius", "filter-high-pass-value", "btn-filter-high-pass",
  "filter-tint-color", "filter-tint-density", "filter-tint-density-value",
  "filter-tint-preserve", "btn-filter-tint",
  "btn-filter-find-edges", "btn-filter-solarize", "filter-duotone-shadow", "filter-duotone-highlight", "btn-filter-duotone", "btn-filter-dither",
  "filter-oil-radius", "filter-oil-value", "btn-filter-oil", "btn-filter-median",
  "status-tool", "status-layer", "status-selection", "status-message",
  "status-color", "status-cursor", "status-zoom",
  "btn-actual", "new-dialog", "new-form", "new-name", "new-width", "new-height", "new-color",
  "new-cancel", "new-create", "new-size", "export-dialog", "export-form", "export-name", "export-filename", "export-format",
  "export-quality-row", "export-quality", "export-quality-value", "export-scale", "export-size",
  "export-cancel", "export-confirm", "resize-dialog", "resize-form", "resize-width", "resize-height",
  "resize-lock", "resize-size", "resize-cancel", "resize-confirm", "canvas-dialog", "canvas-form", "canvas-width",
  "canvas-height", "canvas-size", "canvas-cancel", "canvas-confirm", "transform-dialog", "transform-form",
  "transform-scale-x", "transform-scale-y", "transform-rotation", "transform-rotation-value",
  "transform-size", "transform-flip-h", "transform-flip-v", "transform-cancel", "transform-confirm",
  "help-dialog", "help-close",
  "restore-dialog", "restore-summary", "restore-confirm", "restore-discard", "status-autosave",
];

function cacheIds(root, ids) {
  const cache = {};
  for (const id of ids) {
    const key = id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    cache[key] = root.getElementById(id);
  }
  return cache;
}

function historyLimitFor(doc) {
  const pixels = doc.width * doc.height;
  if (pixels <= 500_000) return 40;
  if (pixels <= 2_000_000) return 24;
  if (pixels <= 6_000_000) return 12;
  if (pixels <= 12_000_000) return 6;
  return 3;
}

function fileBaseName(name) {
  return String(name ?? "").replace(/\.[^.]+$/, "").trim() || "Image";
}

function cloneSelection(selection) {
  if (!selection) return null;
  return {
    kind: selection.kind,
    rect: { ...selection.rect },
    ...(selection.invert ? { invert: true } : {}),
  };
}

function fullDocumentSelection(doc) {
  return { kind: "rect", rect: { x: 0, y: 0, w: doc.width, h: doc.height } };
}

function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function drawWaveLayer(width, height) {
  const canvas = createCanvas(width, height);
  const context = context2d(canvas);
  const colors = ["#67e8f9", "#22d3ee", "#a78bfa"];
  for (let line = 0; line < 3; line += 1) {
    context.beginPath();
    for (let x = 0; x <= width; x += 4) {
      const y = height * 0.68 + Math.sin(x / 118 + line * 0.85) * 34 + line * 30;
      if (x === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.globalAlpha = 0.9 - line * 0.22;
    context.strokeStyle = colors[line];
    context.lineWidth = 3.2 - line * 0.7;
    context.lineCap = "round";
    context.stroke();
  }
  return canvas;
}

function welcomeDocument() {
  const width = 1280;
  const height = 800;
  const background = createCanvas(width, height);
  const context = context2d(background);
  const base = context.createLinearGradient(0, 0, width, height);
  base.addColorStop(0, "#081321");
  base.addColorStop(0.55, "#0a0f1d");
  base.addColorStop(1, "#04060c");
  context.fillStyle = base;
  context.fillRect(0, 0, width, height);

  const cyanGlow = context.createRadialGradient(width * 0.76, height * 0.18, 0, width * 0.76, height * 0.18, 560);
  cyanGlow.addColorStop(0, "rgba(34, 211, 238, 0.30)");
  cyanGlow.addColorStop(1, "rgba(34, 211, 238, 0)");
  context.fillStyle = cyanGlow;
  context.fillRect(0, 0, width, height);

  const violetGlow = context.createRadialGradient(width * 0.16, height * 0.92, 0, width * 0.16, height * 0.92, 520);
  violetGlow.addColorStop(0, "rgba(167, 139, 250, 0.22)");
  violetGlow.addColorStop(1, "rgba(167, 139, 250, 0)");
  context.fillStyle = violetGlow;
  context.fillRect(0, 0, width, height);

  context.strokeStyle = "rgba(148, 163, 184, 0.055)";
  context.lineWidth = 1;
  for (let x = 64; x < width; x += 64) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let y = 64; y < height; y += 64) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  const waves = drawWaveLayer(width, height);

  const type = createCanvas(width, height);
  drawText(type, { x: 96, y: 226, text: "Palette", color: "#e9eefb", size: 152, weight: 700, family: "system" });
  context2d(type).save();
  context2d(type).fillStyle = "rgba(103, 232, 249, 0.9)";
  context2d(type).fillRect(100, 414, 300, 3);
  context2d(type).restore();
  drawText(type, { x: 100, y: 442, text: "A local-first image editor", color: "#9aa8c0", size: 34, weight: 400 });
  drawText(type, {
    x: 102,
    y: 506,
    text: "LAYERS   ·   TOOLS   ·   ADJUSTMENTS   ·   EXPORT",
    color: "#67e8f9",
    size: 19,
    weight: 600,
    family: "mono",
  });

  const layers = [
    createLayer({ name: "Background", canvas: background }),
    createLayer({ name: "Aegean ripple", canvas: waves }),
    createLayer({ name: "Welcome type", canvas: type }),
  ];
  return createDocument({
    width,
    height,
    name: "Welcome to Palette",
    layers,
    activeLayerId: layers[2].id,
  });
}

export class PaletteEditor {
  constructor(root = document) {
    this.root = root;
    this.el = cacheIds(root, IDS);
    for (const [name, keys] of Object.entries(BUTTON_SHORTCUTS)) {
      this.el[name]?.setAttribute("aria-keyshortcuts", keys);
    }
    this.history = new History({ limit: 24 });
    this.tool = "move";
    this.doc = null;
    this.view = { scale: 1, offsetX: 0, offsetY: 0 };
    this.viewport = { width: 1, height: 1, dpr: 1 };
    this.autoFit = true;
    this.space = false;
    this.altDown = false;
    this.pointer = null;
    this.action = null;
    this.cropRect = null;
    this.selection = null;
    this.clipboard = null;
    this.cloneSource = null;
    this.textDraft = null;
    this.autosaveArmed = false;
    this.autosaveHasContent = false;
    this.autosaveInFlight = false;
    this.autosavePending = false;
    this.autosaveTimer = null;
    this.documentDirty = false;
    this.histogramTimer = null;
    this.clipScratch = null;
    this.pendingRestore = null;
    this.restoreResolved = false;
    this.adjustStart = null;
    this.opacityStart = null;
    this.renderQueued = false;
    this.overlayQueued = false;
    this.messageTimer = null;
    this.started = false;
    this.options = {
      color: "#22d3ee",
      brush: { size: 32, hardness: 0.7, opacity: 1 },
      eraser: { size: 40, hardness: 0.6, opacity: 1 },
      clone: { size: 48, hardness: 0.6, opacity: 1 },
      dodge: { mode: "dodge", size: 64, hardness: 0.5, strength: 0.2 },
      bucket: { tolerance: 32, opacity: 1, contiguous: true },
      shape: { fill: true, outline: true, width: 4, outlineColor: "#e9eefb" },
      gradient: { type: "linear", to: "#a78bfa", fade: true, opacity: 1 },
      marquee: { kind: "rect" },
      crop: { aspect: "free" },
      text: { family: "system", size: 48, weight: 600 },
    };
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.history.subscribe(() => this.updateHistoryButtons());
    this.bindEvents();
    this.bindResizeObserver();
    this.syncFilterOutputs();
    this.setDocument(welcomeDocument(), {
      reset: true,
      fit: true,
      autosave: false,
      status: "Welcome to Palette. Open an image, drop one here, or press New for a blank canvas.",
    });
    this.initAutosave();
    setTimeout(() => this.el.stageNote?.setAttribute("data-hidden", "true"), 9000);
  }

  setDocument(doc, { reset = false, fit = false, autosave = true, status = "", dirty = false } = {}) {
    this.doc = doc;
    this.documentDirty = dirty;
    this.syncDocumentState();
    this.history.setLimit(historyLimitFor(doc));
    if (reset) this.history.clear();
    this.action = null;
    this.cancelText();
    this.cropRect = null;
    this.selection = null;
    this.cloneSource = null;
    this.adjustStart = null;
    this.opacityStart = null;
    this.autoFit = true;
    this.refreshUI();
    if (fit) this.fitView();
    else this.scheduleRender();
    if (autosave) {
      this.autosaveHasContent = true;
      this.scheduleAutosave();
    }
    if (status) this.announce(status);
  }

  applyDoc(doc) {
    const previous = this.doc;
    const dimensionsChanged =
      Boolean(previous) && (previous.width !== doc.width || previous.height !== doc.height);
    this.doc = doc;
    const limit = historyLimitFor(doc);
    if (limit !== this.history.limit) this.history.setLimit(limit);
    this.documentDirty = true;
    this.syncDocumentState();
    this.action = null;
    this.cropRect = null;
    if (dimensionsChanged) this.selection = null;
    if (dimensionsChanged) this.cloneSource = null;
    this.adjustStart = null;
    this.opacityStart = null;
    this.cancelText();
    this.refreshUI();
    if (dimensionsChanged && this.autoFit) this.fitView();
    else this.scheduleRender();
    this.autosaveHasContent = true;
    this.scheduleAutosave();
  }

  commit(beforeDoc, label) {
    if (!beforeDoc || beforeDoc === this.doc) {
      this.refreshUI();
      this.scheduleRender();
      return;
    }
    const afterDoc = this.doc;
    const limit = historyLimitFor(afterDoc);
    if (limit !== this.history.limit) this.history.setLimit(limit);
    this.documentDirty = true;
    this.syncDocumentState();
    this.history.push(
      createCommand(
        label,
        () => this.applyDoc(beforeDoc),
        () => this.applyDoc(afterDoc),
      ),
    );
    this.refreshUI();
    this.scheduleRender();
    this.autosaveHasContent = true;
    this.scheduleAutosave();
  }

  announce(message, { error = false, ok = false } = {}) {
    const target = this.el.statusMessage;
    if (!target) return;
    target.textContent = message;
    target.dataset.tone = error ? "error" : ok ? "ok" : "";
    clearTimeout(this.messageTimer);
    this.messageTimer = setTimeout(() => {
      target.textContent = "Ready · F1 for shortcuts";
      target.dataset.tone = "";
    }, error ? 6500 : 4200);
  }

  syncDocumentState() {
    const dirty = Boolean(this.documentDirty);
    const name = cleanDocumentName(this.doc?.name, "Untitled");
    if (this.el.docDirty) this.el.docDirty.hidden = !dirty;
    const title = `${name}${dirty ? " •" : ""} — Palette`;
    if (document.title !== title) document.title = title;
    if (this.el.btnSave) this.el.btnSave.title = `Save ${safeFileName(name)}.palette (Ctrl+S)`;
  }

  dismissNote() {
    this.el.stageNote?.setAttribute("data-hidden", "true");
  }

  updateHistoryButtons() {
    this.el.btnUndo.disabled = !this.history.canUndo;
    this.el.btnRedo.disabled = !this.history.canRedo;
    this.el.btnUndo.title = this.history.canUndo ? `Undo ${this.history.undoLabel} (Ctrl+Z)` : "Nothing to undo";
    this.el.btnRedo.title = this.history.canRedo ? `Redo ${this.history.redoLabel} (Ctrl+Shift+Z)` : "Nothing to redo";
  }

  refreshUI() {
    if (!this.doc) return;
    this.syncSwatches();
    if (this.root.activeElement !== this.el.docName) this.el.docName.value = this.doc.name;
    this.el.docSize.textContent = `${this.doc.width} × ${this.doc.height}`;
    this.updateHistoryButtons();
    this.renderLayerList();
    this.syncActiveLayer();
    this.syncToolOptions();
    this.syncOptionControls();
    this.updateZoomLabel();
    this.el.cropApply.disabled = !isUsableRect(this.cropRect);
    this.el.cropApply.title = isUsableRect(this.cropRect)
      ? "Apply the crop (Enter)"
      : "Apply crop — draw a crop region first";
    this.el.cropCancel.disabled = !this.cropRect;
    this.el.cropCancel.title = this.cropRect ? "Cancel the crop (Escape)" : "Cancel — no active crop";
    const hasVisible = this.doc.layers.some((layer) => layer.visible);
    const canFlatten = hasVisible && this.doc.layers.length > 1;
    this.el.btnFlatten.disabled = !canFlatten;
    this.el.btnFlatten.title = !hasVisible
      ? "Flatten — show at least one layer"
      : !canFlatten
        ? "Flatten — add another layer first"
        : "Flatten all visible layers into one";
    this.el.btnStampVisible.disabled = !hasVisible;
    this.el.btnStampVisible.title = hasVisible
      ? "Stamp visible layers into a new layer (Ctrl+Alt+Shift+E)"
      : "Stamp visible — show at least one layer";
    this.el.btnDeselect.disabled = !this.selection;
    this.el.btnDeselect.title = this.selection
      ? "Deselect (Ctrl+D)"
      : "Deselect — no active selection";
    this.el.btnCropSelection.disabled = !this.selection || Boolean(this.selection.invert);
    this.el.btnCropSelection.title = !this.selection
      ? "Crop to selection — make a selection first"
      : this.selection.invert
        ? "Crop to selection — deselect inversion first"
        : "Crop the document to the active selection";
    this.el.btnExpandSelection.disabled = !this.selection;
    this.el.btnExpandSelection.title = this.selection ? "Grow the active selection by 5 px" : "Expand — no active selection";
    this.el.btnContractSelection.disabled = !this.selection;
    this.el.btnContractSelection.title = this.selection ? "Shrink the active selection by 5 px" : "Contract — no active selection";
    this.el.btnClearSelection.disabled = !this.selection;
    this.el.btnClearSelection.title = this.selection ? "Clear pixels inside the selection (Delete)" : "Clear — no active selection";
    this.el.btnInvertSelection.setAttribute("aria-pressed", this.selection?.invert ? "true" : "false");
    const selectionRect = this.selection?.rect;
    if (this.el.statusSelection) {
      this.el.statusSelection.hidden = !selectionRect;
      if (selectionRect) {
        const mode = this.selection.invert ? " (inverted)" : "";
        this.el.statusSelection.textContent =
          `Selection ${Math.round(selectionRect.w)}×${Math.round(selectionRect.h)} @ ${Math.round(selectionRect.x)},${Math.round(selectionRect.y)}${mode}`;
        this.el.statusSelection.dataset.inverted = this.selection.invert ? "true" : "false";
      }
    }
    this.el.btnPaste.disabled = !this.clipboard;
    this.el.btnPaste.title = this.clipboard
      ? "Paste clipboard (Ctrl+V)"
      : "Paste — copy or cut something first";
    if (this.el.statusSelection) {
      this.el.statusSelection.title = this.selection
        ? `Selection ${Math.round(selectionRect?.w ?? 0)}×${Math.round(selectionRect?.h ?? 0)} — click to deselect`
        : "Active selection";
    }
    this.scheduleHistogram();
  }

  scheduleHistogram(delay = 100) {
    clearTimeout(this.histogramTimer);
    this.histogramTimer = setTimeout(() => this.drawHistogram(), Math.max(0, delay));
  }

  drawHistogram() {
    if (!this.doc) return;
    const layer = activeLayer(this.doc);
    const canvas = this.el.histogram;
    if (!layer?.canvas || !canvas) return;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!layer.canvas.width) return;
    const histogram = buildHistogram(getPixels(layer.canvas), 256);
    this.histogramData = histogram;
    const range = percentileRange(histogram, 0.005, 0.005);
    this.histogramRange = range;
    const channelMax = Math.max(
      1,
      ...histogram.red,
      ...histogram.green,
      ...histogram.blue,
    );
    // Draw the RGB channels additively, then luminance on top, so colour
    // distribution is visible at a glance in the histogram.
    context.save();
    context.globalCompositeOperation = "lighter";
    const channels = [
      [histogram.red, "rgba(255, 64, 64, 0.55)"],
      [histogram.green, "rgba(64, 220, 64, 0.55)"],
      [histogram.blue, "rgba(64, 128, 255, 0.55)"],
    ];
    for (const [data, color] of channels) {
      context.fillStyle = color;
      for (let index = 0; index < data.length; index += 1) {
        const height = Math.round((data[index] / channelMax) * canvas.height);
        if (height > 0) context.fillRect(index, canvas.height - height, 1, height);
      }
    }
    context.restore();
    const max = Math.max(1, ...histogram.luma);
    context.fillStyle = "rgba(103, 232, 249, 0.78)";
    for (let index = 0; index < histogram.luma.length; index += 1) {
      const height = Math.round((histogram.luma[index] / max) * canvas.height);
      if (height > 0) context.fillRect(index, canvas.height - height, 1, height);
    }
    // Mark the tonal range Auto levels will stretch to, so the numbers have a
    // visible position on the histogram.
    context.save();
    context.strokeStyle = "rgba(233, 238, 251, 0.9)";
    context.lineWidth = 1;
    for (const level of [range.black, range.white]) {
      const x = Math.min(canvas.width - 1, Math.max(0, Math.round((level / 255) * (canvas.width - 1))));
      context.beginPath();
      context.moveTo(x + 0.5, 0);
      context.lineTo(x + 0.5, canvas.height);
      context.stroke();
    }
    context.restore();
    this.el.histogramRange.textContent = `${range.black}–${range.white}`;
  }

  autoLevels() {
    const layer = this.requireActiveLayer();
    if (!layer) return;
    const source = this.selection ? extractSelection(layer.canvas, this.selection) : layer.canvas;
    const range = autoLevelsRange(getPixels(source), 0.005, 0.005);
    this.applyPixelsToActive("Auto levels", (pixels) =>
      applyLevels(pixels, { black: range.black, white: range.white, gamma: 1 }),
    );
    this.announce(`Auto levels (${range.black}–${range.white}) applied.`);
  }

  syncActiveLayer() {
    const layer = activeLayer(this.doc);
    if (!layer) return;
    const percent = Math.round(layer.opacity * 100);
    if (this.root.activeElement !== this.el.layerOpacity) this.el.layerOpacity.value = String(percent);
    this.el.layerOpacityValue.textContent = `${percent}%`;
    if (this.root.activeElement !== this.el.layerBlend) this.el.layerBlend.value = layer.blendMode;
    this.el.btnLayerLock.setAttribute("aria-pressed", layer.locked ? "true" : "false");
    this.el.btnLayerLock.title = layer.locked ? "Unlock layer" : "Lock layer";
    this.el.btnLayerClip.setAttribute("aria-pressed", layer.clipToBelow ? "true" : "false");
    const canClip = indexOfLayer(this.doc, layer.id) > 0;
    this.el.btnLayerClip.title = !canClip
      ? "Clip to layer below — select a layer above the bottom"
      : layer.clipToBelow
        ? "Release clipping mask (Ctrl+Alt+G)"
        : "Clip to layer below (Ctrl+Alt+G)";
    if (this.el.statusLayer) {
      const opacityPct = Math.round(layer.opacity * 100);
      const flags = [
        !layer.visible && "hidden",
        layer.locked && "locked",
        layer.clipToBelow && "clipped",
        opacityPct !== 100 && `${opacityPct}%`,
        layer.blendMode && layer.blendMode !== "normal" && layer.blendMode,
      ].filter(Boolean);
      const suffix = flags.length ? ` (${flags.join(", ")})` : "";
      this.el.statusLayer.textContent = `${layer.name}${suffix}`;
      this.el.statusLayer.title = `Active layer: ${layer.name}${suffix}`;
    }
    const layerIndex = indexOfLayer(this.doc, layer.id);
    this.el.btnLayerUp.disabled = layerIndex >= this.doc.layers.length - 1;
    this.el.btnLayerUp.title = this.el.btnLayerUp.disabled
      ? "Move layer up — already at the top"
      : "Move layer up";
    this.el.btnLayerDown.disabled = layerIndex <= 0;
    this.el.btnLayerDown.title = this.el.btnLayerDown.disabled
      ? "Move layer down — already at the bottom"
      : "Move layer down";
    this.el.btnLayerClip.disabled = !canClip;
    this.el.btnLayerMerge.disabled = !canClip;
    this.el.btnLayerMerge.title = !canClip
      ? "Merge layer down — select a layer above the bottom"
      : "Merge layer down";
    const isOnlyLayer = this.doc.layers.length <= 1;
    this.el.btnLayerDelete.disabled = isOnlyLayer;
    this.el.btnLayerDelete.title = isOnlyLayer
      ? "Delete layer — keep at least one layer"
      : "Delete layer";
    const cannotEditLayer = layer.locked || !layer.visible;
    const editLock = layer.locked ? "unlock the layer first" : "show the layer first";
    if (this.el.editLockNotice) {
      this.el.editLockNotice.hidden = !cannotEditLayer;
      if (cannotEditLayer) {
        this.el.editLockNotice.textContent =
          `${layer.name} is ${layer.locked ? "locked" : "hidden"} — ${editLock} to edit it.`;
      }
    }
    this.el.layerOpacity.disabled = cannotEditLayer;
    this.el.layerOpacity.title = cannotEditLayer ? `Layer opacity — ${editLock}` : "Layer opacity";
    this.el.layerBlend.disabled = cannotEditLayer;
    this.el.layerBlend.title = cannotEditLayer ? `Blend mode — ${editLock}` : "Blend mode";
    for (const name of DESTRUCTIVE_ACTIONS) {
      const control = this.el[name];
      if (!control) continue;
      if (control.dataset.baseTitle === undefined) control.dataset.baseTitle = control.title;
      control.disabled = cannotEditLayer;
      control.title = cannotEditLayer ? `Unavailable — ${editLock}` : control.dataset.baseTitle;
      const range = this.histogramRange;
      if (name === "btnAutoLevels" && !cannotEditLayer && range && range.black === 0 && range.white === 255) {
        control.disabled = true;
        control.title = "Auto levels — tones already span the full range";
      }
    }
    for (const key of ADJUSTMENTS) {
      const input = this.el[`adj${key[0].toUpperCase()}${key.slice(1)}`];
      const output = this.el[`adj${key[0].toUpperCase()}${key.slice(1)}Value`];
      if (!input || !output) continue;
      const value = layer.adjustments[key];
      input.disabled = cannotEditLayer;
      input.title = cannotEditLayer
        ? `${key[0].toUpperCase()}${key.slice(1)} — ${editLock}`
        : `${key[0].toUpperCase()}${key.slice(1)} adjustment`;
      if (this.root.activeElement !== input) input.value = String(value);
      output.textContent = formatAdjustment(key, value);
      output.dataset.active = value !== 0 ? "true" : "false";
    }
    this.el.adjustReset.disabled = cannotEditLayer || isNeutralAdjustments(layer.adjustments);
    this.el.adjustReset.title = cannotEditLayer
      ? `Reset adjustments — ${editLock}`
      : isNeutralAdjustments(layer.adjustments)
        ? "Reset — adjustments are already neutral"
        : "Reset adjustments on the active layer";
  }

  syncToolOptions() {
    const groups = {
      brush: this.el.optionsBrush,
      eraser: this.el.optionsEraser,
      clone: this.el.optionsClone,
      dodge: this.el.optionsDodge,
      bucket: this.el.optionsBucket,
      shape: this.el.optionsShape,
      text: this.el.optionsText,
      gradient: this.el.optionsGradient,
      marquee: this.el.optionsMarquee,
      crop: this.el.optionsCrop,
      move: this.el.optionsMove,
    };
    for (const [name, node] of Object.entries(groups)) node.hidden = name !== this.tool && !(name === "shape" && ["rect", "ellipse", "line"].includes(this.tool));
    const usesColor = ["brush", "text", "rect", "ellipse", "line", "gradient", "eyedropper", "bucket"].includes(this.tool);
    this.el.colorRow.hidden = !usesColor;
    const meta = TOOL_META[this.tool] ?? TOOL_META.move;
    this.el.toolHint.textContent = meta.hint;
    const toolKey = TOOL_KEYS[this.tool];
    let modeNote = "";
    if (this.tool === "dodge" && this.options.dodge.mode === "burn") modeNote = " · Burn";
    if (this.tool === "marquee" && this.options.marquee.kind === "ellipse") modeNote = " · Ellipse";
    if (this.tool === "gradient" && this.options.gradient.type === "radial") modeNote = " · Radial";
    const statusLabel = `${meta.label}${modeNote}`;
    this.el.statusTool.textContent = toolKey ? `${statusLabel} (${toolKey})` : statusLabel;
    this.el.statusTool.title = toolKey ? `${statusLabel} tool (${toolKey})` : `${statusLabel} tool`;
    for (const button of this.root.querySelectorAll("[data-tool]")) {
      const key = TOOL_KEYS[button.dataset.tool];
      if (key) button.setAttribute("aria-keyshortcuts", key);
      button.setAttribute("aria-pressed", button.dataset.tool === this.tool ? "true" : "false");
    }
    this.updateCursor();
  }

  syncOptionControls() {
    const { brush, eraser, clone, dodge, bucket, shape, gradient, text } = this.options;
    this.el.brushSize.value = String(brush.size);
    this.el.brushSizeValue.textContent = String(brush.size);
    this.el.brushHardness.value = String(Math.round(brush.hardness * 100));
    this.el.brushHardnessValue.textContent = String(Math.round(brush.hardness * 100));
    this.el.brushOpacity.value = String(Math.round(brush.opacity * 100));
    this.el.brushOpacityValue.textContent = String(Math.round(brush.opacity * 100));
    this.el.eraserSize.value = String(eraser.size);
    this.el.eraserSizeValue.textContent = String(eraser.size);
    this.el.eraserHardness.value = String(Math.round(eraser.hardness * 100));
    this.el.eraserHardnessValue.textContent = String(Math.round(eraser.hardness * 100));
    this.el.eraserOpacity.value = String(Math.round(eraser.opacity * 100));
    this.el.eraserOpacityValue.textContent = String(Math.round(eraser.opacity * 100));
    this.el.cloneSize.value = String(clone.size);
    this.el.cloneSizeValue.textContent = String(clone.size);
    this.el.cloneHardness.value = String(Math.round(clone.hardness * 100));
    this.el.cloneHardnessValue.textContent = String(Math.round(clone.hardness * 100));
    this.el.cloneOpacity.value = String(Math.round(clone.opacity * 100));
    this.el.cloneOpacityValue.textContent = String(Math.round(clone.opacity * 100));
    this.el.dodgeMode.value = dodge.mode;
    this.el.dodgeSize.value = String(dodge.size);    this.el.dodgeSizeValue.textContent = String(dodge.size);
    this.el.dodgeHardness.value = String(Math.round(dodge.hardness * 100));
    this.el.dodgeHardnessValue.textContent = String(Math.round(dodge.hardness * 100));
    this.el.dodgeStrength.value = String(Math.round(dodge.strength * 100));
    this.el.dodgeStrengthValue.textContent = String(Math.round(dodge.strength * 100));
    this.el.bucketTolerance.value = String(bucket.tolerance);
    this.el.bucketToleranceValue.textContent = String(bucket.tolerance);
    this.el.bucketOpacity.value = String(Math.round(bucket.opacity * 100));
    this.el.bucketOpacityValue.textContent = String(Math.round(bucket.opacity * 100));
    this.el.bucketContiguous.checked = Boolean(bucket.contiguous);
    this.el.shapeFill.checked = shape.fill;
    this.el.shapeOutline.checked = shape.outline;
    this.el.shapeWidth.value = String(shape.width);
    this.el.shapeWidthValue.textContent = String(shape.width);
    this.el.shapeOutlineColor.value = shape.outlineColor;
    this.el.shapeOutlineHex.textContent = shape.outlineColor;
    this.el.gradientType.value = gradient.type;
    this.el.gradientEnd.value = gradient.to;
    this.el.gradientEndHex.textContent = gradient.to;
    this.el.gradientFade.checked = gradient.fade;
    this.el.gradientOpacity.value = String(Math.round(gradient.opacity * 100));
    this.el.gradientOpacityValue.textContent = String(Math.round(gradient.opacity * 100));
    this.el.marqueeShape.value = this.options.marquee.kind;
    this.el.cropAspect.value = this.options.crop.aspect;
    this.el.textFont.value = text.family;
    this.el.textSize.value = String(text.size);
    this.el.textSizeValue.textContent = String(text.size);
    this.el.textWeight.value = String(text.weight);
    if (this.root.activeElement !== this.el.colorInput) this.el.colorInput.value = this.options.color;
    this.el.colorHex.textContent = this.options.color;
    this.el.textInput.style.color = this.options.color;
    this.syncStatusColor();
  }

  renderLayerList() {
    const list = this.el.layerList;
    list.replaceChildren();
    const layers = this.doc.layers.slice().reverse();
    if (this.el.layerCount) {
      this.el.layerCount.textContent = String(layers.length);
      const label = `${layers.length} layer${layers.length === 1 ? "" : "s"}`;
      this.el.layerCount.title = label;
      this.el.layerCount.setAttribute("aria-label", label);
    }
    for (const layer of layers) {
      const item = this.root.createElement("li");
      item.className = "layer-item";
      item.dataset.active = layer.id === this.doc.activeLayerId ? "true" : "false";
      item.dataset.locked = layer.locked ? "true" : "false";
      item.dataset.clipped = layer.clipToBelow ? "true" : "false";
      item.dataset.visible = layer.visible ? "true" : "false";

      const visibility = this.root.createElement("button");
      visibility.type = "button";
      visibility.className = "layer-visibility";
      visibility.setAttribute("aria-label", `${layer.visible ? "Hide" : "Show"} ${layer.name}`);
      visibility.title = `${layer.visible ? "Hide" : "Show"} ${layer.name}`;
      visibility.setAttribute("aria-pressed", layer.visible ? "true" : "false");
      visibility.innerHTML = layer.visible
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.6"/></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4l16 16"/><path d="M2.5 12s3.5-6 9.5-6c1.7 0 3.2.5 4.5 1.2M21.5 12s-3.5 6-9.5 6c-1.7 0-3.2-.5-4.5-1.2"/></svg>';
      visibility.addEventListener("click", (event) => {
        event.stopPropagation();
        this.toggleLayerVisibility(layer.id);
      });

      const thumb = this.root.createElement("img");
      thumb.className = "layer-thumb";
      thumb.alt = "";
      thumb.src = layerThumbnail(layer.canvas);
      thumb.width = 44;
      thumb.height = 34;

      const name = this.root.createElement("button");
      name.type = "button";
      name.className = "layer-name";
      name.textContent = layer.name;
      name.title = `${layer.name} — double-click to rename`;
      const meta = [];
      const opacityPct = Math.round(layer.opacity * 100);
      if (opacityPct !== 100) meta.push(`${opacityPct}%`);
      if (layer.blendMode && layer.blendMode !== "normal") meta.push(layer.blendMode);
      if (meta.length) {
        const badge = this.root.createElement("span");
        badge.className = "layer-meta";
        badge.textContent = meta.join(" · ");
        badge.title = meta.join(" · ");
        name.append(badge);
      }
      name.setAttribute("aria-pressed", layer.id === this.doc.activeLayerId ? "true" : "false");
      name.addEventListener("click", () => this.selectLayer(layer.id));
      name.addEventListener("dblclick", (event) => {
        event.preventDefault();
        this.beginRename(layer.id, name);
      });

      const lock = this.root.createElement("span");
      lock.className = "layer-lock";
      lock.title = layer.locked ? "Locked" : "";
      if (layer.locked) {
        lock.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';
      }

      const clip = this.root.createElement("span");
      clip.className = "layer-clip";
      clip.title = layer.clipToBelow ? "Clipped to layer below" : "";
      if (layer.clipToBelow) {
        clip.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a4 4 0 0 0 5.7 0l2.3-2.3a4 4 0 0 0-5.7-5.7L11 6.3"/><path d="M14 11a4 4 0 0 0-5.7 0L6 13.3a4 4 0 0 0 5.7 5.7l1.3-1.3"/></svg>';
      }

      item.addEventListener("click", () => this.selectLayer(layer.id));
      item.append(visibility, thumb, name, clip, lock);
      list.append(item);
    }
  }

  updateZoomLabel() {
    const percent = this.view.scale * 100;
    this.el.statusZoom.textContent = `${percent < 10 ? percent.toFixed(1) : Math.round(percent)}%`;
    if (this.el.btnActual) {
      this.el.btnActual.setAttribute("aria-pressed", Math.abs(this.view.scale - 1) < 0.001 ? "true" : "false");
    }
    if (this.el.btnFit) {
      this.el.btnFit.setAttribute("aria-pressed", this.autoFit ? "true" : "false");
    }
    if (this.el.btnZoomIn) {
      this.el.btnZoomIn.disabled = this.view.scale >= MAX_SCALE;
      this.el.btnZoomIn.title = this.el.btnZoomIn.disabled ? "Zoom in — already at maximum" : "Zoom in (+)";
    }
    if (this.el.btnZoomOut) {
      this.el.btnZoomOut.disabled = this.view.scale <= MIN_SCALE;
      this.el.btnZoomOut.title = this.el.btnZoomOut.disabled ? "Zoom out — already at minimum" : "Zoom out (-)";
    }
  }

  activeLayerEditable() {
    const layer = activeLayer(this.doc);
    return Boolean(layer && layer.canvas && layer.visible && !layer.locked);
  }

  updateCursor() {
    let cursor = TOOL_META[this.tool]?.cursor ?? "crosshair";
    const paintTool = this.tool === "brush" || this.tool === "eraser" || this.tool === "clone" || this.tool === "dodge";
    if (paintTool && !this.activeLayerEditable()) cursor = "not-allowed";
    if (this.tool === "zoom" && this.altDown) cursor = "zoom-out";
    if (this.space) cursor = "grab";
    if (this.action?.type === "pan") cursor = "grabbing";
    this.el.stage.dataset.cursor = cursor;
  }

  setTool(tool) {
    if (!TOOL_META[tool]) return;
    if (tool === this.tool) {
      this.el.stage.focus({ preventScroll: true });
      return;
    }
    this.finishText();
    if (this.action) this.cancelAction();
    if (this.tool === "crop") this.cropRect = null;
    this.tool = tool;
    this.refreshUI();
    this.scheduleRender();
    this.el.stage.focus({ preventScroll: true });
  }

  fitView() {
    if (!this.doc) return;
    const rect = this.el.stageWrap.getBoundingClientRect();
    this.view = fitView(this.doc.width, this.doc.height, Math.max(1, rect.width), Math.max(1, rect.height), 56);
    this.autoFit = true;
    this.updateZoomLabel();
    this.scheduleRender();
  }

  actualSize() {
    if (!this.doc) return;
    const rect = this.el.stageWrap.getBoundingClientRect();
    this.view = {
      scale: 1,
      offsetX: Math.round((rect.width - this.doc.width) / 2),
      offsetY: Math.round((rect.height - this.doc.height) / 2),
    };
    this.autoFit = false;
    this.updateZoomLabel();
    this.scheduleRender();
  }

  zoomBy(factor) {
    const rect = this.el.stageWrap.getBoundingClientRect();
    this.zoomAtPoint({ x: rect.width / 2, y: rect.height / 2 }, factor);
  }

  zoomIn() {
    this.zoomBy(1.25);
  }

  zoomOut() {
    this.zoomBy(0.8);
  }

  zoomAtPoint(screen, factor) {
    this.view = zoomAt(this.view, screen, this.view.scale * factor);
    this.autoFit = false;
    this.updateZoomLabel();
    this.scheduleRender();
  }

  scheduleRender() {
    if (this.renderQueued || !this.doc) return;
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      this.render();
    });
  }

  scheduleOverlay() {
    if (this.overlayQueued || !this.doc) return;
    this.overlayQueued = true;
    requestAnimationFrame(() => {
      this.overlayQueued = false;
      this.renderOverlay();
    });
  }

  resizeCanvases() {
    const rect = this.el.stageWrap.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const backingWidth = Math.max(1, Math.round(width * dpr));
    const backingHeight = Math.max(1, Math.round(height * dpr));
    for (const canvas of [this.el.stage, this.el.overlay]) {
      if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
        canvas.width = backingWidth;
        canvas.height = backingHeight;
      }
    }
    this.viewport = { width, height, dpr };
  }

  render() {
    if (!this.doc) return;
    this.resizeCanvases();
    const { width, height, dpr } = this.viewport;
    const context = this.el.stage.getContext("2d");
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    const frame = this.el.docFrame;
    frame.style.left = `${this.view.offsetX}px`;
    frame.style.top = `${this.view.offsetY}px`;
    frame.style.width = `${Math.max(1, this.doc.width * this.view.scale)}px`;
    frame.style.height = `${Math.max(1, this.doc.height * this.view.scale)}px`;

    context.save();
    context.translate(this.view.offsetX, this.view.offsetY);
    context.scale(this.view.scale, this.view.scale);
    context.imageSmoothingEnabled = this.view.scale < 1;
    context.imageSmoothingQuality = "high";
    context.beginPath();
    context.rect(0, 0, this.doc.width, this.doc.height);
    context.clip();
    const moving = this.action?.type === "move" ? this.action : null;
    if (this.doc.layers.some((layer) => layer.clipToBelow)) {
      if (!this.clipScratch || this.clipScratch.width !== this.doc.width || this.clipScratch.height !== this.doc.height) {
        this.clipScratch = createCanvas(this.doc.width, this.doc.height);
      }
    }
    drawLayerStack(context, this.doc, { moving, scratch: this.clipScratch });
    context.restore();

    this.renderOverlay();
    this.updateZoomLabel();
    if (this.textDraft) this.positionTextEditor();
  }

  renderOverlay() {
    const overlay = this.el.overlay;
    const { dpr } = this.viewport;
    const context = overlay.getContext("2d");
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, overlay.width, overlay.height);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    const crop =
      this.cropRect ??
      (this.action?.type === "crop"
        ? roundRect(clampRect(normalizeRect(this.action.start, this.action.end), this.doc.width, this.doc.height))
        : null);
    if (crop && crop.w > 0.5 && crop.h > 0.5) {
      const x = this.view.offsetX + crop.x * this.view.scale;
      const y = this.view.offsetY + crop.y * this.view.scale;
      const w = crop.w * this.view.scale;
      const h = crop.h * this.view.scale;
      context.save();
      context.fillStyle = "rgba(2, 6, 14, 0.62)";
      context.fillRect(
        this.view.offsetX,
        this.view.offsetY,
        this.doc.width * this.view.scale,
        this.doc.height * this.view.scale,
      );
      context.clearRect(x, y, w, h);
      context.strokeStyle = "rgba(103, 232, 249, 0.95)";
      context.lineWidth = 1.5;
      context.setLineDash([7, 5]);
      context.strokeRect(x + 0.5, y + 0.5, Math.max(0, w - 1), Math.max(0, h - 1));
      context.setLineDash([]);
      context.strokeStyle = "rgba(103, 232, 249, 0.32)";
      context.lineWidth = 1;
      for (const ratio of [1 / 3, 2 / 3]) {
        context.beginPath();
        context.moveTo(x + w * ratio, y);
        context.lineTo(x + w * ratio, y + h);
        context.stroke();
        context.beginPath();
        context.moveTo(x, y + h * ratio);
        context.lineTo(x + w, y + h * ratio);
        context.stroke();
      }
      // Live dimension badge for the crop region.
      const aspect = this.options.crop.aspect;
      const aspectLabel = aspect && aspect !== "free"
        ? this.el.cropAspect.selectedOptions[0]?.dataset.label || aspect
        : "";
      const label = `${Math.round(crop.w)} × ${Math.round(crop.h)} px @ ${Math.round(crop.x)},${Math.round(crop.y)}${aspectLabel ? ` · ${aspectLabel}` : ""}`;
      context.font = '600 12px ui-monospace, "Cascadia Mono", Consolas, monospace';
      const tw = context.measureText(label).width;
      const bx = Math.max(0, Math.min(x, this.viewport.width - tw - 14));
      const by = y > 26 ? y - 24 : y + 4;
      context.fillStyle = "rgba(2, 6, 14, 0.85)";
      context.fillRect(bx, by, tw + 12, 18);
      context.fillStyle = "rgba(103, 232, 249, 0.95)";
      context.textBaseline = "middle";
      context.fillText(label, bx + 6, by + 9);
      context.restore();
    }

    let marquee = this.selection;
    if (this.action?.type === "marquee") {
      marquee = selectionFromDrag(
        this.options.marquee.kind,
        this.action.start,
        this.action.end,
        this.doc.width,
        this.doc.height,
        this.action.shift,
      );
    } else if (this.action?.type === "move-selection") {
      marquee = {
        ...this.action.selection,
        rect: {
          ...this.action.selection.rect,
          x: this.action.selection.rect.x + this.action.dx,
          y: this.action.selection.rect.y + this.action.dy,
        },
      };
    }
    if (marquee) {
      context.save();
      context.translate(this.view.offsetX, this.view.offsetY);
      context.scale(this.view.scale, this.view.scale);
      addSelectionPath(context, marquee);
      context.lineWidth = 3 / this.view.scale;
      context.strokeStyle = "rgba(2, 6, 14, 0.9)";
      context.stroke();
      addSelectionPath(context, marquee);
      context.lineWidth = 1 / this.view.scale;
      context.strokeStyle = "rgba(103, 232, 249, 0.95)";
      context.setLineDash([6 / this.view.scale, 4 / this.view.scale]);
      context.stroke();
      if (marquee.invert) {
        context.beginPath();
        context.rect(0, 0, this.doc.width, this.doc.height);
        context.lineWidth = 1 / this.view.scale;
        context.stroke();
      }
      context.restore();
      // Live size badge, in screen space, so the extent is readable while dragging.
      if (marquee.rect && marquee.rect.w >= 1 && marquee.rect.h >= 1) {
        const label = `${Math.round(marquee.rect.w)} × ${Math.round(marquee.rect.h)} px @ ${Math.round(marquee.rect.x)},${Math.round(marquee.rect.y)}`;
        context.save();
        context.font = '600 12px ui-monospace, "Cascadia Mono", Consolas, monospace';
        const tw = context.measureText(label).width;
        const sx = this.view.offsetX + marquee.rect.x * this.view.scale;
        const sy = this.view.offsetY + marquee.rect.y * this.view.scale;
        const bx = Math.max(0, Math.min(sx, this.viewport.width - tw - 14));
        const by = sy > 26 ? sy - 24 : sy + 4;
        context.fillStyle = "rgba(2, 6, 14, 0.85)";
        context.fillRect(bx, by, tw + 12, 18);
        context.fillStyle = "rgba(103, 232, 249, 0.95)";
        context.textBaseline = "middle";
        context.fillText(label, bx + 6, by + 9);
        context.restore();
      }
    }

    if ((this.action?.type === "move" || this.action?.type === "move-selection") && (this.action.dx || this.action.dy)) {
      // Live offset for layer/pixel moves, which otherwise give no numeric
      // feedback until the drag ends.
      const { dx, dy } = this.action;
      const label = `Δ ${dx >= 0 ? "+" : ""}${dx}, ${dy >= 0 ? "+" : ""}${dy} px${this.action.shift ? " · axis" : ""}`;
      const px = this.pointer ?? { x: this.viewport.width / 2, y: this.viewport.height / 2 };
      context.save();
      context.font = '600 12px ui-monospace, "Cascadia Mono", Consolas, monospace';
      const tw = context.measureText(label).width;
      const bx = Math.max(0, Math.min(px.x + 14, this.viewport.width - tw - 14));
      const by = Math.max(0, Math.min(px.y - 26, this.viewport.height - 22));
      context.fillStyle = "rgba(2, 6, 14, 0.85)";
      context.fillRect(bx, by, tw + 12, 18);
      context.fillStyle = "rgba(103, 232, 249, 0.95)";
      context.textBaseline = "middle";
      context.fillText(label, bx + 6, by + 9);
      context.restore();
    }

    if (this.action?.type === "gradient") {
      context.save();
      context.translate(this.view.offsetX, this.view.offsetY);
      context.scale(this.view.scale, this.view.scale);
      drawGradient(context, {
        type: this.options.gradient.type,
        start: this.action.start,
        end: this.action.end,
        from: this.options.color,
        to: this.options.gradient.to,
        fade: this.options.gradient.fade,
        opacity: this.options.gradient.opacity,
        width: this.doc.width,
        height: this.doc.height,
        selection: this.selection,
      });
      context.restore();
      // Screen-space guide line with handles and a live angle/length readout.
      const { start, end } = this.action;
      const length = Math.hypot(end.x - start.x, end.y - start.y);
      if (length >= 1) {
        const sx = this.view.offsetX + start.x * this.view.scale;
        const sy = this.view.offsetY + start.y * this.view.scale;
        const ex = this.view.offsetX + end.x * this.view.scale;
        const ey = this.view.offsetY + end.y * this.view.scale;
        const angle = (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI;
        const label = `${Math.round(length)} px · ${Math.round(angle)}° @ ${Math.round(start.x)},${Math.round(start.y)}${this.action.shift ? " · snapped" : ""}`;
        context.save();
        context.strokeStyle = "rgba(255, 255, 255, 0.85)";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(sx, sy);
        context.lineTo(ex, ey);
        context.stroke();
        for (const [hx, hy] of [[sx, sy], [ex, ey]]) {
          context.beginPath();
          context.arc(hx, hy, 4, 0, Math.PI * 2);
          context.fillStyle = "rgba(103, 232, 249, 0.95)";
          context.fill();
          context.strokeStyle = "rgba(2, 6, 14, 0.9)";
          context.stroke();
        }
        context.font = '600 12px ui-monospace, "Cascadia Mono", Consolas, monospace';
        const tw = context.measureText(label).width;
        const lx = Math.max(0, Math.min((sx + ex) / 2 + 8, this.viewport.width - tw - 14));
        const ly = Math.max(14, (sy + ey) / 2 - 8);
        context.fillStyle = "rgba(2, 6, 14, 0.85)";
        context.fillRect(lx, ly, tw + 12, 18);
        context.fillStyle = "rgba(103, 232, 249, 0.95)";
        context.textBaseline = "middle";
        context.fillText(label, lx + 6, ly + 9);
        context.restore();
      }
    }

    if (this.action?.type === "shape") {
      context.save();
      context.translate(this.view.offsetX, this.view.offsetY);
      context.scale(this.view.scale, this.view.scale);
      drawShape(context, {
        tool: this.action.tool,
        start: this.action.start,
        end: this.action.end,
        color: this.options.color,
        outlineColor: this.options.shape.outlineColor,
        fill: this.options.shape.fill,
        outline: this.options.shape.outline,
        width: this.options.shape.width,
        opacity: 0.92,
        selection: this.selection,
      });
      context.restore();
      // Live measurement badge in screen space: length/angle for lines,
      // width × height for rectangles and ellipses.
      const { start, end } = this.action;
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      let label = "";
      let ax = 0;
      let ay = 0;
      if (this.action.tool === "line") {
        const length = Math.hypot(dx, dy);
        if (length >= 1) {
          const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
          label = `${Math.round(length)} px · ${Math.round(angle)}° @ ${Math.round(start.x)},${Math.round(start.y)}${this.action.shift ? " · snapped" : ""}`;
          ax = end.x;
          ay = end.y;
        }
      } else if (Math.abs(dx) >= 1 && Math.abs(dy) >= 1) {
        const constrained = this.action.shift ? (this.action.tool === "ellipse" ? " · circle" : " · square") : "";
        label = `${Math.round(Math.abs(dx))} × ${Math.round(Math.abs(dy))} px @ ${Math.round(Math.min(start.x, end.x))},${Math.round(Math.min(start.y, end.y))}${constrained}`;
        ax = (start.x + end.x) / 2;
        ay = Math.min(start.y, end.y);
      }
      if (label) {
        context.save();
        context.font = '600 12px ui-monospace, "Cascadia Mono", Consolas, monospace';
        const tw = context.measureText(label).width;
        const bx = Math.max(0, Math.min(this.view.offsetX + ax * this.view.scale + 8, this.viewport.width - tw - 14));
        const by = Math.max(14, this.view.offsetY + ay * this.view.scale - 24);
        context.fillStyle = "rgba(2, 6, 14, 0.85)";
        context.fillRect(bx, by, tw + 12, 18);
        context.fillStyle = "rgba(103, 232, 249, 0.95)";
        context.textBaseline = "middle";
        context.fillText(label, bx + 6, by + 9);
        context.restore();
      }
    }

    if (this.textDraft?.value?.trim()) {
      context.save();
      context.translate(this.view.offsetX, this.view.offsetY);
      context.scale(this.view.scale, this.view.scale);
      drawTextOn(context, {
        x: this.textDraft.point.x,
        y: this.textDraft.point.y,
        text: this.textDraft.value,
        color: this.options.color,
        size: this.options.text.size,
        weight: this.options.text.weight,
        family: this.options.text.family,
        selection: this.selection,
      });
      context.restore();
      // Live bounding box + size for the text draft, measured with the exact
      // font the draft is drawn with (same stack, weight and line height).
      const fontSize = Math.max(1, Math.round(this.options.text.size));
      const lines = String(this.textDraft.value).split(/\r?\n/);
      const lineHeight = fontSize * 1.22;
      context.save();
      context.font = `${this.options.text.weight} ${fontSize}px ${FONT_STACKS[this.options.text.family] ?? FONT_STACKS.system}`;
      let maxWidth = 0;
      for (const line of lines) maxWidth = Math.max(maxWidth, context.measureText(line).width);
      context.restore();
      const boxW = maxWidth * this.view.scale;
      const boxH = ((lines.length - 1) * lineHeight + fontSize) * this.view.scale;
      const tx = this.view.offsetX + this.textDraft.point.x * this.view.scale;
      const ty = this.view.offsetY + this.textDraft.point.y * this.view.scale;
      context.save();
      context.strokeStyle = "rgba(103, 232, 249, 0.7)";
      context.lineWidth = 1;
      context.setLineDash([4, 3]);
      context.strokeRect(tx - 2, ty - 2, boxW + 4, boxH + 4);
      context.setLineDash([]);
      const label = `${Math.round(maxWidth)} × ${Math.round((lines.length - 1) * lineHeight + fontSize)} px @ ${Math.round(this.textDraft.point.x)},${Math.round(this.textDraft.point.y)}`;
      context.font = '600 12px ui-monospace, "Cascadia Mono", Consolas, monospace';
      const tw = context.measureText(label).width;
      const lx = Math.max(0, Math.min(tx - 2, this.viewport.width - tw - 14));
      const ly = Math.max(14, ty - 24);
      context.fillStyle = "rgba(2, 6, 14, 0.85)";
      context.fillRect(lx, ly, tw + 12, 18);
      context.fillStyle = "rgba(103, 232, 249, 0.95)";
      context.textBaseline = "middle";
      context.fillText(label, lx + 6, ly + 9);
      context.restore();
    }

    if (
      this.pointer &&
      (this.tool === "brush" || this.tool === "eraser" || this.tool === "clone" || this.tool === "dodge") &&
      this.activeLayerEditable()
    ) {
      const size =
        this.tool === "brush"
          ? this.options.brush.size
          : this.tool === "eraser"
            ? this.options.eraser.size
            : this.tool === "clone"
              ? this.options.clone.size
              : this.options.dodge.size;
      const hardness =
        this.tool === "brush"
          ? this.options.brush.hardness
          : this.tool === "eraser"
            ? this.options.eraser.hardness
            : this.tool === "clone"
              ? this.options.clone.hardness
              : this.options.dodge.hardness;
      const radius = Math.max(1, (size * this.view.scale) / 2);
      context.save();
      context.beginPath();
      context.arc(this.pointer.x, this.pointer.y, radius, 0, Math.PI * 2);
      context.lineWidth = 3;
      context.strokeStyle = "rgba(2, 6, 14, 0.8)";
      context.stroke();
      context.beginPath();
      context.arc(this.pointer.x, this.pointer.y, radius, 0, Math.PI * 2);
      context.lineWidth = 1;
      context.strokeStyle = "rgba(233, 238, 251, 0.9)";
      context.stroke();
      // Inner ring marks the hard core so hardness is visible at a glance.
      if (hardness < 0.98) {
        context.beginPath();
        context.arc(this.pointer.x, this.pointer.y, Math.max(1, radius * hardness), 0, Math.PI * 2);
        context.lineWidth = 1;
        context.strokeStyle = "rgba(103, 232, 249, 0.6)";
        context.setLineDash([3, 3]);
        context.stroke();
        context.setLineDash([]);
      }
      context.restore();
    }

    if (this.tool === "clone" && this.cloneSource) {
      const currentSource =
        this.action?.type === "clone" && this.action.last && this.action.offset
          ? { x: this.action.last.x + this.action.offset.x, y: this.action.last.y + this.action.offset.y }
          : this.cloneSource;
      const source = docToScreen(currentSource, this.view);
      // Dashed link from the source anchor to the cursor makes the clone
      // offset readable at a glance while painting.
      if (this.pointer && this.pointInsideDoc(this.toDoc(this.pointer))) {
        context.save();
        context.strokeStyle = "rgba(103, 232, 249, 0.55)";
        context.lineWidth = 1;
        context.setLineDash([5, 4]);
        context.beginPath();
        context.moveTo(source.x, source.y);
        context.lineTo(this.pointer.x, this.pointer.y);
        context.stroke();
        context.restore();
        // Numeric offset so the exact clone delta is readable, not just its direction.
        const pointerDoc = this.toDoc(this.pointer);
        const offX = Math.round(pointerDoc.x - currentSource.x);
        const offY = Math.round(pointerDoc.y - currentSource.y);
        const label = `Clone Δ ${offX >= 0 ? "+" : ""}${offX}, ${offY >= 0 ? "+" : ""}${offY} px`;
        context.save();
        context.font = '600 12px ui-monospace, "Cascadia Mono", Consolas, monospace';
        const tw = context.measureText(label).width;
        const bx = Math.max(0, Math.min(this.pointer.x + 14, this.viewport.width - tw - 14));
        const by = Math.max(0, this.pointer.y - 26);
        context.fillStyle = "rgba(2, 6, 14, 0.85)";
        context.fillRect(bx, by, tw + 12, 18);
        context.fillStyle = "rgba(103, 232, 249, 0.95)";
        context.textBaseline = "middle";
        context.fillText(label, bx + 6, by + 9);
        context.restore();
      }
      context.save();
      context.strokeStyle = "rgba(103, 232, 249, 0.95)";
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(source.x, source.y, 7, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.moveTo(source.x - 11, source.y);
      context.lineTo(source.x - 3, source.y);
      context.moveTo(source.x + 3, source.y);
      context.lineTo(source.x + 11, source.y);
      context.moveTo(source.x, source.y - 11);
      context.lineTo(source.x, source.y - 3);
      context.moveTo(source.x, source.y + 3);
      context.lineTo(source.x, source.y + 11);
      context.stroke();
      context.restore();
    }

    if (this.tool === "eyedropper" && this.pointer && this.pointInsideDoc(this.toDoc(this.pointer))) {
      // Sample the already-composited stage canvas: one 1x1 read per frame,
      // no document recompositing, so the preview matches what the user sees.
      let sample = null;
      try {
        const { dpr } = this.viewport;
        const sx = Math.max(0, Math.min(this.el.stage.width - 1, Math.round(this.pointer.x * dpr)));
        const sy = Math.max(0, Math.min(this.el.stage.height - 1, Math.round(this.pointer.y * dpr)));
        sample = this.el.stage.getContext("2d").getImageData(sx, sy, 1, 1).data;
      } catch { /* canvas may be tainted; fall back to no swatch */ }
      const hex = sample && sample[3] >= 8 ? rgbToHex({ r: sample[0], g: sample[1], b: sample[2] }) : null;
      const chipW = 74;
      const chipX = Math.max(0, Math.min(this.pointer.x + 14, this.viewport.width - chipW));
      const chipY = Math.max(0, this.pointer.y - 24);
      context.save();
      context.fillStyle = "rgba(2, 6, 14, 0.9)";
      context.fillRect(chipX, chipY, chipW, 20);
      context.fillStyle = hex ?? "rgba(255, 255, 255, 0.08)";
      context.fillRect(chipX + 2, chipY + 2, 16, 16);
      context.strokeStyle = "rgba(103, 232, 249, 0.6)";
      context.lineWidth = 1;
      context.strokeRect(chipX + 2.5, chipY + 2.5, 15, 15);
      context.fillStyle = hex ? "rgba(103, 232, 249, 0.95)" : "rgba(233, 238, 251, 0.7)";
      context.font = '600 11px ui-monospace, "Cascadia Mono", Consolas, monospace';
      context.textBaseline = "middle";
      context.fillText(hex ?? "transparent", chipX + 22, chipY + 10);
      context.restore();
    }

    if (this.tool === "bucket" && this.pointer && this.pointInsideDoc(this.toDoc(this.pointer))) {
      // Show the colour that a click will fill with, so the active colour is
      // visible at the cursor instead of only in the panels.
      const hex = this.options.color;
      const chipW = 74;
      const chipX = Math.max(0, Math.min(this.pointer.x + 14, this.viewport.width - chipW));
      const chipY = Math.max(0, this.pointer.y - 24);
      context.save();
      context.fillStyle = "rgba(2, 6, 14, 0.9)";
      context.fillRect(chipX, chipY, chipW, 20);
      context.fillStyle = hex;
      context.fillRect(chipX + 2, chipY + 2, 16, 16);
      context.strokeStyle = "rgba(103, 232, 249, 0.6)";
      context.lineWidth = 1;
      context.strokeRect(chipX + 2.5, chipY + 2.5, 15, 15);
      context.fillStyle = "rgba(103, 232, 249, 0.95)";
      context.font = '600 11px ui-monospace, "Cascadia Mono", Consolas, monospace';
      context.textBaseline = "middle";
      context.fillText(hex, chipX + 22, chipY + 10);
      context.restore();
    }
  }

  eventPoint(event) {
    const rect = this.el.stage.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  toDoc(point) {
    return screenToDoc(point, this.view);
  }

  pointInsideDoc(point) {
    return point.x >= 0 && point.y >= 0 && point.x <= this.doc.width && point.y <= this.doc.height;
  }

  updateCursorStatus(point) {
    if (!point || !this.pointInsideDoc(point)) {
      this.el.statusCursor.textContent = "—, —";
      return;
    }
    this.el.statusCursor.textContent = `${Math.floor(point.x)}, ${Math.floor(point.y)}`;
  }

  onPointerDown(event) {
    if (!this.doc) return;
    if (event.button !== 0 && event.button !== 1) return;
    event.preventDefault();
    this.finishText();
    this.dismissNote();
    this.el.stage.focus({ preventScroll: true });
    const screen = this.eventPoint(event);
    const point = this.toDoc(screen);
    this.pointer = screen;
    this.updateCursorStatus(point);

    if (event.button === 1 || this.space || this.tool === "hand") {
      this.action = {
        type: "pan",
        pointerId: event.pointerId,
        startScreen: screen,
        startOffset: { x: this.view.offsetX, y: this.view.offsetY },
      };
      this.el.stage.setPointerCapture(event.pointerId);
      this.updateCursor();
      return;
    }
    if (this.tool === "zoom") {
      this.zoomAtPoint(screen, event.altKey ? 0.8 : 1.25);
      return;
    }
    if (this.tool === "eyedropper") {
      this.pickColor(point);
      return;
    }
    if (this.tool === "bucket") {
      this.fillArea(point);
      return;
    }
    if (!this.pointInsideDoc(point)) return;
    if (this.tool === "text") {
      this.openText(point);
      return;
    }
    if (this.tool === "crop") {
      this.cropRect = null;
      this.action = {
        type: "crop",
        pointerId: event.pointerId,
        start: point,
        end: point,
        aspect: this.options.crop.aspect,
      };
      this.el.stage.setPointerCapture(event.pointerId);
      this.scheduleOverlay();
      return;
    }
    if (this.tool === "marquee") {
      this.selection = null;
      this.action = {
        type: "marquee",
        pointerId: event.pointerId,
        start: point,
        end: point,
        shift: event.shiftKey,
      };
      this.el.stage.setPointerCapture(event.pointerId);
      this.refreshUI();
      this.scheduleOverlay();
      return;
    }
    const layer = this.requireActiveLayer();
    if (!layer) return;
    if (this.tool === "clone") {
      if (event.altKey) {
        this.cloneSource = point;
        this.announce(`Clone source set at ${Math.round(point.x)}, ${Math.round(point.y)}.`);
        this.scheduleOverlay();
        return;
      }
      if (!this.cloneSource) {
        this.announce("Alt-click the canvas to set a clone source first.", { error: true });
        return;
      }
      this.beginClone(point, event.pointerId);
      return;
    }
    if (this.tool === "dodge") {
      this.beginTone(point, event.pointerId);
      return;
    }
    if (this.tool === "move") {
      this.beginMove(point, event.pointerId);
      return;
    }
    if (this.tool === "brush" || this.tool === "eraser") {
      this.beginBrush(point, event.pointerId);
      return;
    }
    if (["rect", "ellipse", "line"].includes(this.tool)) {
      this.action = {
        type: "shape",
        pointerId: event.pointerId,
        tool: this.tool,
        before: this.doc,
        layerId: layer.id,
        start: point,
        end: point,
        shift: event.shiftKey,
      };
      this.el.stage.setPointerCapture(event.pointerId);
      this.scheduleRender();
      return;
    }
    if (this.tool === "gradient") {
      this.action = {
        type: "gradient",
        pointerId: event.pointerId,
        before: this.doc,
        layerId: layer.id,
        start: point,
        end: point,
      };
      this.el.stage.setPointerCapture(event.pointerId);
      this.scheduleOverlay();
    }
  }

  beginMove(point, pointerId) {
    const layer = this.requireActiveLayer();
    if (!layer) return;
    if (this.selection?.invert) {
      this.announce("Deselect inversion before moving selected pixels.", { error: true });
      return;
    }
    if (!this.selection) {
      this.action = { type: "move", pointerId, layerId: layer.id, before: this.doc, start: point, dx: 0, dy: 0 };
      this.el.stage.setPointerCapture(pointerId);
      return;
    }
    const before = this.doc;
    const patch = extractSelection(layer.canvas, this.selection);
    const preview = redrawSelectedMove(layer.canvas, patch, this.selection, 0, 0);
    this.doc = updateLayer(this.doc, layer.id, { canvas: preview });
    this.action = {
      type: "move-selection",
      pointerId,
      layerId: layer.id,
      before,
      base: layer.canvas,
      patch,
      preview,
      selection: this.selection,
      start: point,
      dx: 0,
      dy: 0,
    };
    this.el.stage.setPointerCapture(pointerId);
    this.scheduleRender();
  }

  beginBrush(point, pointerId) {
    const layer = this.requireActiveLayer();
    if (!layer) return;
    const erase = this.tool === "eraser";
    const options = erase ? this.options.eraser : this.options.brush;
    const before = this.doc;
    const working = cloneCanvas(layer.canvas);
    this.doc = updateLayer(this.doc, layer.id, { canvas: working });
    const stamp = brushStamp({
      size: options.size,
      hardness: options.hardness,
      opacity: options.opacity,
      color: this.options.color,
      erase,
    });
    strokeBrush(working, point, point, stamp, erase, this.selection);
    this.action = {
      type: "brush",
      pointerId,
      layerId: layer.id,
      before,
      canvas: working,
      last: point,
      stamp,
      erase,
      selection: this.selection,
    };
    this.el.stage.setPointerCapture(pointerId);
    this.scheduleRender();
  }

  beginClone(point, pointerId) {
    const layer = this.requireActiveLayer();
    if (!layer) return;
    const options = this.options.clone;
    const before = this.doc;
    const source = cloneCanvas(layer.canvas);
    const working = cloneCanvas(layer.canvas);
    this.doc = updateLayer(this.doc, layer.id, { canvas: working });
    const stamp = brushStamp({
      size: options.size,
      hardness: options.hardness,
      opacity: options.opacity,
      color: "#ffffff",
    });
    const offset = { x: this.cloneSource.x - point.x, y: this.cloneSource.y - point.y };
    strokeClone(working, point, point, stamp, source, offset, this.selection);
    this.action = {
      type: "clone",
      pointerId,
      layerId: layer.id,
      before,
      canvas: working,
      source,
      offset,
      last: point,
      stamp,
      selection: this.selection,
    };
    this.el.stage.setPointerCapture(pointerId);
    this.scheduleRender();
  }

  beginTone(point, pointerId) {
    const layer = this.requireActiveLayer();
    if (!layer) return;
    const options = this.options.dodge;
    const before = this.doc;
    const working = cloneCanvas(layer.canvas);
    this.doc = updateLayer(this.doc, layer.id, { canvas: working });
    const burn = options.mode === "burn";
    const stamp = brushStamp({
      size: options.size,
      hardness: options.hardness,
      opacity: options.strength,
      color: burn ? "#000000" : "#ffffff",
    });
    strokeTone(working, point, point, stamp, this.selection);
    this.action = {
      type: "tone",
      pointerId,
      layerId: layer.id,
      before,
      canvas: working,
      last: point,
      stamp,
      burn,
      selection: this.selection,
    };
    this.el.stage.setPointerCapture(pointerId);
    this.scheduleRender();
  }

  onPointerMove(event) {
    if (!this.doc) return;
    const screen = this.eventPoint(event);
    const point = this.toDoc(screen);
    this.pointer = screen;
    this.updateCursorStatus(point);
    const action = this.action;
    if (!action) {
      if (this.tool === "brush" || this.tool === "eraser" || this.tool === "clone" || this.tool === "dodge") {
        this.scheduleOverlay();
      }
      return;
    }
    if (action.type === "pan") {
      this.view = {
        ...this.view,
        offsetX: action.startOffset.x + (screen.x - action.startScreen.x),
        offsetY: action.startOffset.y + (screen.y - action.startScreen.y),
      };
      this.autoFit = false;
      this.scheduleRender();
      return;
    }
    if (action.type === "move" || action.type === "move-selection") {
      let dx = point.x - action.start.x;
      let dy = point.y - action.start.y;
      if (event.shiftKey) {
        if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      action.dx = Math.round(dx);
      action.dy = Math.round(dy);
      action.shift = event.shiftKey;
      if (action.type === "move-selection") {
        redrawSelectedMove(action.base, action.patch, action.selection, action.dx, action.dy, action.preview);
      }
      this.scheduleRender();
      return;
    }
    if (action.type === "marquee") {
      action.shift = event.shiftKey;
      action.end = point;
      this.scheduleOverlay();
      return;
    }
    if (action.type === "brush") {
      strokeBrush(action.canvas, action.last, point, action.stamp, action.erase, action.selection);
      action.last = point;
      this.scheduleRender();
      return;
    }
    if (action.type === "clone") {
      strokeClone(
        action.canvas,
        action.last,
        point,
        action.stamp,
        action.source,
        action.offset,
        action.selection,
      );
      action.last = point;
      this.scheduleRender();
      return;
    }
    if (action.type === "tone") {
      strokeTone(action.canvas, action.last, point, action.stamp, action.selection);
      action.last = point;
      this.scheduleRender();
      return;
    }
    if (action.type === "crop") {
      action.end =
        action.aspect && action.aspect !== "free"
          ? constrainAspect(action.start, point, Number(action.aspect))
          : point;
      this.scheduleOverlay();
      return;
    }
    if (action.type === "shape") {
      action.shift = event.shiftKey;
      action.end = action.shift
        ? action.tool === "line"
          ? constrainAngle(action.start, point)
          : constrainSquare(action.start, point)
        : point;
      this.scheduleOverlay();
      return;
    }
    if (action.type === "gradient") {
      action.end = event.shiftKey ? constrainAngle(action.start, point) : point;
      this.scheduleOverlay();
    }
  }

  onPointerUp(event) {
    const action = this.action;
    if (!action) {
      this.pointer = this.pointer ? this.eventPoint(event) : null;
      return;
    }
    if (action.type === "pan") {
      this.action = null;
      this.updateCursor();
      this.scheduleRender();
      return;
    }
    if (action.type === "move") {
      this.action = null;
      if (action.dx !== 0 || action.dy !== 0) {
        const layer = layerById(this.doc, action.layerId);
        if (layer) {
          const canvas = shiftedCanvas(layer.canvas, action.dx, action.dy);
          this.doc = updateLayer(this.doc, layer.id, { canvas });
          this.commit(action.before, "Move layer");
        }
      } else {
        this.scheduleRender();
      }
      return;
    }
    if (action.type === "move-selection") {
      this.action = null;
      if (action.dx !== 0 || action.dy !== 0) {
        const shifted = clampRect(
          {
            x: action.selection.rect.x + action.dx,
            y: action.selection.rect.y + action.dy,
            w: action.selection.rect.w,
            h: action.selection.rect.h,
          },
          this.doc.width,
          this.doc.height,
        );
        const rect = roundRect(shifted);
        this.selection = isUsableRect(rect) ? { kind: action.selection.kind, rect } : null;
        this.commit(action.before, "Move selection");
      } else {
        this.doc = action.before;
        this.refreshUI();
        this.scheduleRender();
      }
      return;
    }
    if (action.type === "marquee") {
      const selection = selectionFromDrag(
        this.options.marquee.kind,
        action.start,
        action.end,
        this.doc.width,
        this.doc.height,
        action.shift,
      );
      this.action = null;
      this.selection = selection;
      this.refreshUI();
      this.scheduleRender();
      if (selection) {
        this.announce("Selection ready. Paint, shapes, text, gradients and filters follow it.");
      } else {
        this.announce("Selection cleared.");
      }
      return;
    }
    if (action.type === "brush") {
      this.action = null;
      this.commit(action.before, action.erase ? "Erase" : "Brush stroke");
      return;
    }
    if (action.type === "clone") {
      this.action = null;
      this.commit(action.before, "Clone stamp");
      return;
    }
    if (action.type === "tone") {
      this.action = null;
      this.commit(action.before, action.burn ? "Burn" : "Dodge");
      return;
    }
    if (action.type === "crop") {
      const rect = roundRect(clampRect(normalizeRect(action.start, action.end), this.doc.width, this.doc.height));
      this.action = null;
      this.cropRect = isUsableRect(rect) ? rect : null;
      this.refreshUI();
      this.scheduleRender();
      if (this.cropRect) this.announce("Crop region ready. Press Enter or Apply crop.");
      return;
    }
    if (action.type === "shape") {
      this.action = null;
      const layer = layerById(this.doc, action.layerId);
      const rect = normalizeRect(action.start, action.end);
      const usable = action.tool === "line" ? Math.hypot(rect.w, rect.h) >= 1 : isUsableRect(rect, 1);
      if (layer && usable) {
        const canvas = cloneCanvas(layer.canvas);
        drawShape(context2d(canvas), {
          tool: action.tool,
          start: action.start,
          end: action.end,
          color: this.options.color,
          outlineColor: this.options.shape.outlineColor,
          fill: this.options.shape.fill,
          outline: this.options.shape.outline,
          width: this.options.shape.width,
          opacity: 1,
          selection: this.selection,
        });
        this.doc = updateLayer(this.doc, layer.id, { canvas });
        this.commit(action.before, `Draw ${action.tool}`);
      } else {
        this.scheduleRender();
      }
      return;
    }
    if (action.type === "gradient") {
      this.action = null;
      const layer = layerById(this.doc, action.layerId);
      if (layer && isUsableGradient(action.start, action.end)) {
        const canvas = cloneCanvas(layer.canvas);
        drawGradient(context2d(canvas), {
          type: this.options.gradient.type,
          start: action.start,
          end: action.end,
          from: this.options.color,
          to: this.options.gradient.to,
          fade: this.options.gradient.fade,
          opacity: this.options.gradient.opacity,
          width: this.doc.width,
          height: this.doc.height,
          selection: this.selection,
        });
        this.doc = updateLayer(this.doc, layer.id, { canvas });
        this.commit(action.before, "Gradient fill");
      } else {
        this.announce("Drag across the canvas to define the gradient.", { error: true });
        this.scheduleRender();
      }
    }
  }

  onPointerCancel() {
    const action = this.action;
    if (!action) return;
    if (action.type === "brush" || action.type === "clone" || action.type === "tone" || action.type === "move" || action.type === "move-selection") {
      this.doc = action.before;
    }
    this.action = null;
    this.refreshUI();
    this.scheduleRender();
  }

  onPointerLeave() {
    if (this.action) return;
    this.pointer = null;
    this.el.statusCursor.textContent = "—, —";
    this.scheduleOverlay();
  }

  applyCrop() {
    if (!this.doc) return;
    const rect = this.cropRect;
    if (!rect || !isUsableRect(rect)) {
      this.announce("Drag a crop region first.", { error: true });
      return;
    }
    this.finishText();
    const rounded = roundRect(clampRect(rect, this.doc.width, this.doc.height));
    if (!isUsableRect(rounded)) {
      this.cropRect = null;
      this.refreshUI();
      this.announce("That crop region is too small.", { error: true });
      return;
    }
    if (rounded.x === 0 && rounded.y === 0 && rounded.w === this.doc.width && rounded.h === this.doc.height) {
      this.cropRect = null;
      this.refreshUI();
      this.announce("The crop covers the whole document.");
      return;
    }
    const before = this.doc;
    const layers = this.doc.layers.map((layer) =>
      createLayer({ ...layer, canvas: cropCanvas(layer.canvas, rounded) }),
    );
    this.doc = { ...resizeDocument(this.doc, rounded.w, rounded.h), layers };
    this.cropRect = null;
    this.selection = null;
    this.commit(before, "Crop image");
    this.fitView();
    this.announce(`Cropped to ${rounded.w} × ${rounded.h}.`);
  }

  cancelCrop() {
    this.cropRect = null;
    this.action = null;
    this.refreshUI();
    this.scheduleRender();
    this.announce("Crop cancelled.");
  }

  cancelAction() {
    const action = this.action;
    if (!action) return;
    if (action.type === "brush" || action.type === "clone" || action.type === "tone" || action.type === "move" || action.type === "move-selection") {
      this.doc = action.before;
    }
    if (action.type === "crop") this.cropRect = null;
    this.action = null;
    this.refreshUI();
    this.scheduleRender();
    this.announce("Cancelled.");
  }

  selectAll() {
    if (!this.doc) return;
    this.selection = { kind: "rect", rect: { x: 0, y: 0, w: this.doc.width, h: this.doc.height } };
    this.refreshUI();
    this.scheduleOverlay();
    this.announce("Selected the whole document.");
  }

  deselect() {
    if (!this.selection) return;
    this.selection = null;
    this.refreshUI();
    this.scheduleOverlay();
    this.announce("Selection cleared.");
  }

  invertSelection() {
    if (!this.doc) return;
    if (!this.selection) {
      this.selectAll();
      this.announce("Selected the whole document; invert again to make a hole.");
      return;
    }
    const base = { kind: this.selection.kind, rect: { ...this.selection.rect } };
    this.selection = this.selection.invert ? base : { ...base, invert: true };
    this.refreshUI();
    this.scheduleOverlay();
    this.announce(this.selection.invert ? "Selection inverted." : "Selection restored.");
  }

  cropToSelection() {
    if (!this.doc || !this.selection) return;
    if (this.selection.invert) {
      this.announce("Deselect inversion before cropping to a selection.", { error: true });
      return;
    }
    this.cropRect = roundRect(clampRect(this.selection.rect, this.doc.width, this.doc.height));
    this.applyCrop();
  }

  modifySelection(delta) {
    if (!this.doc || !this.selection) return;
    const modified = expandSelection(this.selection, delta, this.doc.width, this.doc.height);
    if (!modified) {
      this.announce("Contracted selection disappeared.", { error: true });
      this.deselect();
      return;
    }
    this.selection = modified;
    this.refreshUI();
    this.scheduleOverlay();
    this.announce(`Selection ${delta >= 0 ? "expanded" : "contracted"} by ${Math.abs(delta)}px.`);
  }

  clearSelectedPixels() {
    if (!this.selection) return;
    this.finishText();
    const layer = this.requireActiveLayer();
    if (!layer) return;
    const before = this.doc;
    const canvas = cloneCanvas(layer.canvas);
    clearSelectionArea(canvas, this.selection);
    this.doc = updateLayer(this.doc, layer.id, { canvas });
    this.commit(before, "Clear selection");
    this.announce("Selected pixels cleared.");
  }

  clipboardSelection() {
    return cloneSelection(this.selection) ?? fullDocumentSelection(this.doc);
  }

  storeClipboard(layer, selection, displaySelection = selection) {
    this.clipboard = {
      canvas: extractSelection(layer.canvas, selection),
      width: this.doc.width,
      height: this.doc.height,
      selection: cloneSelection(displaySelection),
    };
  }

  copySelection() {
    if (!this.doc) return;
    this.finishText();
    const layer = activeLayer(this.doc);
    if (!layer) {
      this.announce("Select a layer first.", { error: true });
      return;
    }
    const selection = this.clipboardSelection();
    this.storeClipboard(layer, selection, this.selection);
    this.refreshUI();
    this.announce(this.selection ? "Copied the selection." : "Copied the active layer.");
  }

  cutSelection() {
    if (!this.doc) return;
    this.finishText();
    const layer = this.requireActiveLayer();
    if (!layer) return;
    const selection = this.clipboardSelection();
    this.storeClipboard(layer, selection, this.selection);
    const before = this.doc;
    const canvas = cloneCanvas(layer.canvas);
    clearSelectionArea(canvas, selection);
    this.doc = updateLayer(this.doc, layer.id, { canvas });
    this.commit(before, "Cut selection");
    this.announce(this.selection ? "Cut the selection." : "Cut the active layer.");
  }

  pasteClipboard() {
    if (!this.doc || !this.clipboard) {
      this.announce("Copy a selection or layer first.", { error: true });
      return;
    }
    this.finishText();
    const before = this.doc;
    const patch = this.clipboard.canvas;
    let canvas;
    let selection;
    if (patch.width === this.doc.width && patch.height === this.doc.height) {
      canvas = cloneCanvas(patch);
      selection = cloneSelection(this.clipboard.selection);
    } else {
      const rect = containRect(patch.width, patch.height, this.doc.width, this.doc.height);
      canvas = createCanvas(this.doc.width, this.doc.height);
      const context = context2d(canvas);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(patch, rect.x, rect.y, rect.w, rect.h);
      selection = { kind: "rect", rect };
    }
    const layer = createLayer({ name: "Pasted", canvas });
    const at = indexOfLayer(this.doc, this.doc.activeLayerId) + 1;
    this.doc = addLayer(this.doc, layer, at);
    this.selection = selection;
    this.commit(before, "Paste");
    this.announce("Pasted as a new layer.");
  }

  layerViaCopy() {
    if (!this.doc) return;
    this.finishText();
    const layer = activeLayer(this.doc);
    if (!layer) {
      this.announce("Select a layer first.", { error: true });
      return;
    }
    const selection = this.clipboardSelection();
    const before = this.doc;
    const copy = createLayer({
      name: `${layer.name} copy`,
      canvas: extractSelection(layer.canvas, selection),
    });
    const at = indexOfLayer(this.doc, layer.id) + 1;
    this.doc = addLayer(this.doc, copy, at);
    this.commit(before, "Layer via copy");
    this.announce(`Copied ${layer.name} to a new layer.`);
  }

  layerViaCut() {
    if (!this.doc) return;
    this.finishText();
    const layer = this.requireActiveLayer();
    if (!layer) return;
    const selection = this.clipboardSelection();
    const before = this.doc;
    const index = indexOfLayer(this.doc, layer.id);
    const patch = extractSelection(layer.canvas, selection);
    const cleared = cloneCanvas(layer.canvas);
    clearSelectionArea(cleared, selection);
    const cut = createLayer({ name: `${layer.name} cut`, canvas: patch });
    const layers = this.doc.layers.slice();
    layers[index] = createLayer({ ...layer, canvas: cleared });
    layers.splice(index + 1, 0, cut);
    this.doc = { ...this.doc, layers, activeLayerId: cut.id };
    this.commit(before, "Layer via cut");
    this.announce(`Cut ${layer.name} to a new layer.`);
  }

  requireActiveLayer() {
    const layer = activeLayer(this.doc);
    if (!layer) {
      this.announce("Select a layer first.", { error: true });
      return null;
    }
    if (!layer.canvas) {
      this.announce("That layer has no pixels.", { error: true });
      return null;
    }
    if (!layer.visible) {
      this.announce(`${layer.name} is hidden. Show it before drawing.`, { error: true });
      return null;
    }
    if (layer.locked) {
      this.announce(`${layer.name} is locked. Unlock it in the Layers panel.`, { error: true });
      return null;
    }
    return layer;
  }

  pickColor(point) {
    if (!this.pointInsideDoc(point)) return;
    const composite = compositeDocument(this.doc);
    const pixel = samplePixel(composite, point.x, point.y);
    if (pixel.a < 8) {
      this.announce("That pixel is transparent.", { error: true });
      return;
    }
    const hex = rgbToHex(pixel);
    this.setColor(hex);
    this.announce(`Picked ${hex}.`);
  }

  fillArea(point) {
    if (!this.pointInsideDoc(point)) return;
    this.finishText();
    const layer = this.requireActiveLayer();
    if (!layer) return;
    const px = Math.floor(point.x);
    const py = Math.floor(point.y);
    const before = this.doc;
    const pixels = getPixels(layer.canvas);
    const filled = floodFillPixels(pixels, px, py, this.options.color, {
      tolerance: this.options.bucket.tolerance,
      opacity: this.options.bucket.opacity,
      contiguous: this.options.bucket.contiguous,
      selection: this.selection,
    });
    const replacement = createCanvas(layer.canvas.width, layer.canvas.height);
    putPixels(replacement, filled);
    this.doc = updateLayer(this.doc, layer.id, { canvas: replacement });
    this.commit(before, "Paint bucket");
    this.scheduleRender();
    this.announce("Filled area.");
  }

  syncSwatches() {
    const hex = this.options.color.toLowerCase();
    for (const swatch of this.root.querySelectorAll("[data-swatch]")) {
      const active = swatch.dataset.swatch.toLowerCase() === hex;
      swatch.setAttribute("aria-pressed", active ? "true" : "false");
    }
  }

  syncStatusColor() {
    if (!this.el.statusColor) return;
    this.el.statusColor.style.background = this.options.color;
    const label = `Active colour ${this.options.color} — click to change`;
    this.el.statusColor.title = label;
    this.el.statusColor.setAttribute("aria-label", label);
  }

  copyColorHex() {
    const hex = this.options.color;
    const flash = (text) => {
      const btn = this.el.colorHex;
      if (!btn) return;
      btn.textContent = text;
      clearTimeout(this.colorCopyTimer);
      this.colorCopyTimer = setTimeout(() => {
        btn.textContent = this.options.color;
      }, 900);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(hex).then(
        () => {
          this.announce(`Copied ${hex} to clipboard.`);
          flash("Copied!");
        },
        () => this.announce("Could not copy the hex colour.", { error: true }),
      );
    } else {
      this.announce("Clipboard is unavailable in this context.", { error: true });
    }
  }

  setColor(value) {
    const hex = normalizeHex(value, this.options.color);
    this.options.color = hex;
    this.el.colorInput.value = hex;
    this.el.colorHex.textContent = hex;
    this.el.textInput.style.color = hex;
    this.syncSwatches();
    this.syncStatusColor();
    this.scheduleRender();
  }

  openText(point) {
    const layer = this.requireActiveLayer();
    if (!layer) return;
    this.finishText();
    this.textDraft = {
      point: { x: Math.round(point.x), y: Math.round(point.y) },
      value: "",
      before: this.doc,
      layerId: layer.id,
    };
    this.el.textInput.value = "";
    this.syncTextCommit();
    this.el.textEditor.hidden = false;
    this.positionTextEditor();
    this.el.textInput.focus();
    this.scheduleRender();
  }

  syncFilterOutputs() {
    for (const input of this.root.querySelectorAll('.filter-grid input[type="range"]')) {
      if (input.dataset.neutral === undefined) input.dataset.neutral = input.getAttribute("value") ?? "0";
      const out = this.root.querySelector(`output[for="${input.id}"]`);
      if (out) out.dataset.active = input.value !== input.dataset.neutral ? "true" : "false";
    }
  }

  syncTextCommit() {
    if (!this.el.textCommit) return;
    const length = this.el.textInput.value.length;
    const empty = !this.el.textInput.value.trim();
    this.el.textCommit.disabled = empty;
    this.el.textCommit.title = empty ? "Add text — type something first" : "Add text to the layer (Enter)";
    if (this.el.textCount) {
      this.el.textCount.textContent = `${length}/200`;
      this.el.textCount.dataset.near = length >= 180 ? "true" : "false";
    }
  }

  positionTextEditor() {
    if (!this.textDraft) return;
    const screen = docToScreen(this.textDraft.point, this.view);
    const left = clamp(screen.x + 14, 8, Math.max(8, this.viewport.width - 320));
    const top = clamp(screen.y - 20, 8, Math.max(8, this.viewport.height - 52));
    this.el.textEditor.style.left = `${left}px`;
    this.el.textEditor.style.top = `${top}px`;
  }

  commitText() {
    const draft = this.textDraft;
    if (!draft) return;
    const value = this.el.textInput.value.trim();
    this.textDraft = null;
    this.el.textEditor.hidden = true;
    this.el.textInput.value = "";
    if (!value) {
      this.scheduleRender();
      return;
    }
    const layer = layerById(this.doc, draft.layerId);
    if (!layer) {
      this.scheduleRender();
      return;
    }
    if (layer.locked || !layer.visible) {
      this.announce(`${layer.name} can no longer accept text. Unlock and show it first.`, { error: true });
      this.scheduleRender();
      return;
    }
    const canvas = cloneCanvas(layer.canvas);
    drawText(canvas, {
      x: draft.point.x,
      y: draft.point.y,
      text: value,
      color: this.options.color,
      size: this.options.text.size,
      weight: this.options.text.weight,
      family: this.options.text.family,
      selection: this.selection,
    });
    this.doc = updateLayer(this.doc, layer.id, { canvas });
    this.commit(draft.before, "Add text");
    this.announce("Text added.");
  }

  cancelText() {
    if (!this.textDraft) return;
    this.textDraft = null;
    this.el.textEditor.hidden = true;
    this.el.textInput.value = "";
    this.scheduleRender();
  }

  finishText() {
    if (this.textDraft) this.commitText();
  }

  selectLayer(id) {
    if (!this.doc || id === this.doc.activeLayerId) return;
    this.finishText();
    this.doc = setActiveLayer(this.doc, id);
    this.refreshUI();
    this.scheduleRender();
    this.scheduleAutosave();
  }

  toggleLayerVisibility(id) {
    const layer = layerById(this.doc, id);
    if (!layer) return;
    const before = this.doc;
    this.doc = updateLayer(this.doc, id, { visible: !layer.visible });
    this.commit(before, layer.visible ? "Hide layer" : "Show layer");
  }

  beginRename(id, nameButton) {
    const layer = layerById(this.doc, id);
    if (!layer) return;
    const before = this.doc;
    const input = this.root.createElement("input");
    input.type = "text";
    input.className = "layer-name-input";
    input.value = layer.name;
    input.maxLength = 80;
    input.setAttribute("aria-label", "Layer name");
    nameButton.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      const value = input.value.trim();
      input.replaceWith(nameButton);
      if (save && value && value !== layer.name) {
        this.doc = updateLayer(this.doc, id, { name: value });
        this.commit(before, "Rename layer");
      } else {
        this.refreshUI();
      }
    };
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        finish(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
      }
    });
    input.addEventListener("blur", () => finish(true));
  }

  addNewLayer() {
    if (!this.doc) return;
    this.finishText();
    const before = this.doc;
    const layer = createLayer({ name: nextLayerName(this.doc), canvas: createCanvas(this.doc.width, this.doc.height) });
    const at = indexOfLayer(this.doc, this.doc.activeLayerId) + 1;
    this.doc = addLayer(this.doc, layer, at);
    this.commit(before, "Add layer");
  }

  duplicateActiveLayer() {
    if (!this.doc) return;
    this.finishText();
    const source = activeLayer(this.doc);
    if (!source) return;
    const before = this.doc;
    const copy = duplicateLayerRecord(source, { canvas: cloneCanvas(source.canvas) });
    this.doc = addLayer(this.doc, copy, indexOfLayer(this.doc, source.id) + 1);
    this.commit(before, "Duplicate layer");
  }

  deleteActiveLayer() {
    if (!this.doc) return;
    this.finishText();
    if (this.doc.layers.length <= 1) {
      this.announce("Keep at least one layer.", { error: true });
      return;
    }
    const layer = activeLayer(this.doc);
    if (!layer) return;
    if (layer.locked) {
      this.announce(`${layer.name} is locked. Unlock it before deleting.`, { error: true });
      return;
    }
    const before = this.doc;
    this.doc = removeLayer(this.doc, layer.id);
    this.commit(before, "Delete layer");
  }

  mergeActiveLayerDown() {
    if (!this.doc) return;
    this.finishText();
    const index = indexOfLayer(this.doc, this.doc.activeLayerId);
    if (index <= 0) {
      this.announce("There is no layer below to merge into.", { error: true });
      return;
    }
    const lower = this.doc.layers[index - 1];
    const upper = this.doc.layers[index];
    if (!lower.visible || !upper.visible) {
      this.announce("Show both layers before merging.", { error: true });
      return;
    }
    if (lower.locked || upper.locked) {
      this.announce("Unlock both layers before merging.", { error: true });
      return;
    }
    if (!upper.clipToBelow && lower.clipToBelow) {
      this.announce("Unclip the lower layer or clip the upper layer before merging across a clipping group.", {
        error: true,
      });
      return;
    }
    const before = this.doc;
    const base = upper.clipToBelow && lower.clipToBelow ? clippingBaseIndex(this.doc, lower.id) : -1;
    const clipSource = upper.clipToBelow ? (lower.clipToBelow ? this.doc.layers[base]?.canvas : lower.canvas) : null;
    if (upper.clipToBelow && !clipSource) {
      this.announce("The clipping base is missing, so these layers cannot be merged.", { error: true });
      return;
    }
    const canvas = createCanvas(this.doc.width, this.doc.height);
    const context = context2d(canvas);
    const paint = (target, layer, operation) => {
      if (!layer.canvas) return;
      target.save();
      target.globalAlpha = layer.opacity;
      target.globalCompositeOperation = operation;
      target.filter = buildCssFilter(layer.adjustments);
      target.drawImage(layer.canvas, 0, 0);
      target.restore();
    };
    paint(context, lower, "source-over");
    if (upper.clipToBelow) {
      const clipped = createCanvas(this.doc.width, this.doc.height);
      paint(context2d(clipped), upper, "source-over");
      const mask = context2d(clipped);
      mask.globalCompositeOperation = "destination-in";
      mask.drawImage(clipSource, 0, 0);
      mask.globalCompositeOperation = "source-over";
      context.save();
      context.globalCompositeOperation = blendOperation(upper.blendMode);
      context.drawImage(clipped, 0, 0);
      context.restore();
    } else {
      paint(context, upper, blendOperation(upper.blendMode));
    }
    const merged = createLayer({
      name: lower.name,
      canvas,
      blendMode: lower.blendMode,
      clipToBelow: lower.clipToBelow,
    });
    const layers = this.doc.layers.slice();
    layers.splice(index - 1, 2, merged);
    this.doc = { ...this.doc, layers, activeLayerId: merged.id };
    this.commit(before, "Merge layer down");
    this.announce(`Merged ${upper.name} into ${lower.name}.`);
  }

  reorderActiveLayer(delta) {
    if (!this.doc) return;
    this.finishText();
    const layer = activeLayer(this.doc);
    if (!layer) return;
    const before = this.doc;
    this.doc = moveLayer(this.doc, layer.id, delta);
    this.commit(before, delta > 0 ? "Move layer up" : "Move layer down");
  }

  toggleLayerLock() {
    if (!this.doc) return;
    const layer = activeLayer(this.doc);
    if (!layer) return;
    const before = this.doc;
    this.doc = updateLayer(this.doc, layer.id, { locked: !layer.locked });
    this.commit(before, layer.locked ? "Unlock layer" : "Lock layer");
  }

  toggleClippingMask() {
    if (!this.doc) return;
    this.finishText();
    const layer = activeLayer(this.doc);
    if (!layer) return;
    if (indexOfLayer(this.doc, layer.id) <= 0) {
      this.announce("Pick a layer above the base before clipping.", { error: true });
      return;
    }
    const before = this.doc;
    this.doc = updateLayer(this.doc, layer.id, { clipToBelow: !layer.clipToBelow });
    this.commit(before, layer.clipToBelow ? "Release clipping mask" : "Clip to layer below");
    this.announce(
      layer.clipToBelow
        ? `${layer.name} is no longer clipped.`
        : `${layer.name} is clipped to the layer below.`,
    );
  }

  previewAdjustment(key, value) {
    const layer = activeLayer(this.doc);
    if (!layer) return;
    if (layer.locked) {
      this.announce(`${layer.name} is locked. Unlock it to adjust.`, { error: true });
      return;
    }
    if (!this.adjustStart) {
      this.finishText();
      this.adjustStart = this.doc;
      if (this.selection) {
        this.announce("Adjustments apply to the whole layer; selections limit paint, shapes, text, gradients and filters.");
      }
    }
    const adjustments = { ...layer.adjustments, [key]: value };
    this.doc = updateLayer(this.doc, layer.id, { adjustments });
    if (this.el.adjustReset) {
      this.el.adjustReset.disabled = isNeutralAdjustments(adjustments);
      this.el.adjustReset.title = isNeutralAdjustments(adjustments)
        ? "Reset — adjustments are already neutral"
        : "Reset adjustments on the active layer";
    }
    const output = this.el[`adj${key[0].toUpperCase()}${key.slice(1)}Value`];
    if (output) output.textContent = formatAdjustment(key, value);
    this.scheduleRender();
  }

  resetAdjustments() {
    const layer = activeLayer(this.doc);
    if (!layer) return;
    if (layer.locked) {
      this.announce(`${layer.name} is locked. Unlock it before resetting adjustments.`, { error: true });
      return;
    }
    this.finishText();
    const before = this.doc;
    this.adjustStart = null;
    this.doc = updateLayer(this.doc, layer.id, { adjustments: { ...DEFAULT_ADJUSTMENTS } });
    this.commit(before, "Reset adjustments");
  }

  previewLayerOpacity() {
    const layer = activeLayer(this.doc);
    if (!layer) return;
    if (!this.opacityStart) {
      this.finishText();
      this.opacityStart = this.doc;
    }
    const opacity = clamp(Number(this.el.layerOpacity.value) / 100, 0, 1);
    this.doc = updateLayer(this.doc, layer.id, { opacity });
    this.el.layerOpacityValue.textContent = `${Math.round(opacity * 100)}%`;
    this.scheduleRender();
  }

  applyPixelsToActive(label, transform) {
    this.finishText();
    const layer = this.requireActiveLayer();
    if (!layer) return;
    const before = this.doc;
    const filtered = createCanvas(layer.canvas.width, layer.canvas.height);
    putPixels(filtered, transform(getPixels(layer.canvas)));
    const canvas = this.selection ? replaceInsideSelection(layer.canvas, filtered, this.selection) : filtered;
    this.doc = updateLayer(this.doc, layer.id, { canvas });
    this.commit(before, label);
    this.announce(`${label} applied.`);
  }

  applyBlurFilter() {
    const radius = clamp(Number(this.el.filterBlurRadius.value) || 3, 1, 30);
    this.applyPixelsToActive(`Blur ${radius}px`, (pixels) => applyBlur(pixels, radius));
  }

  applyPixelateFilter() {
    const size = clamp(Number(this.el.filterPixelSize.value) || 8, 2, 64);
    this.applyPixelsToActive("Pixelate", (pixels) => applyPixelate(pixels, size));
  }

  applySharpenFilter() {
    this.applyPixelsToActive("Sharpen", (pixels) => applySharpen(pixels, 1.2));
  }

  applyVignetteFilter() {
    this.applyPixelsToActive("Vignette", (pixels) => applyVignette(pixels, 0.6));
  }

  applyInvertFilter() {
    this.applyPixelsToActive("Invert colours", (pixels) => applyInvert(pixels));
  }

  applyDesaturateFilter() {
    this.applyPixelsToActive("Desaturate", (pixels) => applyDesaturate(pixels));
  }

  applyThresholdFilter() {
    const cutoff = Number(this.el.filterThresholdCutoff.value) || 128;
    this.applyPixelsToActive("Threshold", (pixels) => applyThreshold(pixels, cutoff));
  }

  applyPosterizeFilter() {
    const steps = Number(this.el.filterPosterizeSteps.value) || 4;
    this.applyPixelsToActive("Posterize", (pixels) => applyPosterize(pixels, steps));
  }

  applySepiaFilter() {
    this.applyPixelsToActive("Sepia", (pixels) => applySepia(pixels, 1));
  }

  applyEmbossFilter() {
    this.applyPixelsToActive("Emboss", (pixels) => applyEmboss(pixels));
  }

  applyLevelsFilter() {
    const black = Number(this.el.levelBlack.value);
    const white = Number(this.el.levelWhite.value);
    const gamma = Number(this.el.levelGamma.value);
    this.applyPixelsToActive("Levels", (pixels) => applyLevels(pixels, { black, white, gamma }));
  }

  applyBrightnessContrastFilter() {
    const brightness = Number(this.el.filterBrightness.value) || 0;
    const contrast = Number(this.el.filterContrast.value) || 0;
    this.applyPixelsToActive("Brightness / contrast", (pixels) =>
      applyBrightnessContrast(pixels, { brightness, contrast }),
    );
  }

  applyColorBalanceFilter() {
    const cyanRed = Number(this.el.filterCbCr.value) || 0;
    const magentaGreen = Number(this.el.filterCbMg.value) || 0;
    const yellowBlue = Number(this.el.filterCbYb.value) || 0;
    const preserveLuminosity = Boolean(this.el.filterCbPreserve.checked);
    this.applyPixelsToActive("Color balance", (pixels) =>
      applyColorBalance(pixels, { cyanRed, magentaGreen, yellowBlue, preserveLuminosity }),
    );
  }

  applyNoiseFilter() {
    const amount = Number(this.el.filterNoiseAmount.value) || 15;
    const monochrome = Boolean(this.el.filterNoiseMonochrome.checked);
    this.applyPixelsToActive("Add noise", (pixels) =>
      applyNoise(pixels, { amount, monochrome }),
    );
  }

  applyHighPassFilter() {
    const radius = Number(this.el.filterHighPassRadius.value) || 10;
    this.applyPixelsToActive(`High pass ${radius}px`, (pixels) =>
      applyHighPass(pixels, radius),
    );
  }

  applyTintFilter() {
    const color = this.el.filterTintColor.value || "#ec8a15";
    const density = Number(this.el.filterTintDensity.value) || 25;
    const preserveLuminosity = Boolean(this.el.filterTintPreserve.checked);
    this.applyPixelsToActive("Photo tint", (pixels) =>
      applyTint(pixels, { color, density, preserveLuminosity }),
    );
  }

  applyFindEdgesFilter() {
    this.applyPixelsToActive("Find edges", (pixels) => applyFindEdges(pixels));
  }

  applySolarizeFilter() {
    this.applyPixelsToActive("Solarize", (pixels) => applySolarize(pixels));
  }

  applyDuotoneFilter() {
    const shadow = this.el.filterDuotoneShadow.value || "#0b1c3d";
    const highlight = this.el.filterDuotoneHighlight.value || "#ff6b6b";
    this.applyPixelsToActive("Duotone", (pixels) =>
      applyDuotone(pixels, { shadow, highlight }),
    );
  }

  applyDitherFilter() {
    this.applyPixelsToActive("Dither", (pixels) => applyDither(pixels, { monochrome: true }));
  }

  applyOilPaintFilter() {
    const radius = Number(this.el.filterOilRadius.value) || 2;
    this.applyPixelsToActive(`Oil paint ${radius}px`, (pixels) =>
      applyOilPaint(pixels, radius),
    );
  }

  applyMedianFilter() {
    this.applyPixelsToActive("Median despeckle", (pixels) => applyMedian(pixels));
  }

  flipActiveLayer(axis) {
    if (!this.doc) return;
    this.finishText();
    const layer = activeLayer(this.doc);
    if (!layer) return;
    if (!layer.visible) {
      this.announce(`${layer.name} is hidden. Show it first.`, { error: true });
      return;
    }
    if (layer.locked) {
      this.announce(`${layer.name} is locked. Unlock it first.`, { error: true });
      return;
    }
    const before = this.doc;
    this.doc = updateLayer(this.doc, layer.id, {
      canvas: flipCanvas(layer.canvas, axis),
    });
    this.selection = null;
    const label = axis === "horizontal" ? "Flip layer horizontal" : "Flip layer vertical";
    this.commit(before, label);
    this.announce(`${label} applied.`);
  }

  rotateActiveLayer(direction = 1) {
    if (!this.doc) return;
    this.finishText();
    const layer = activeLayer(this.doc);
    if (!layer) return;
    if (!layer.visible) {
      this.announce(`${layer.name} is hidden. Show it first.`, { error: true });
      return;
    }
    if (layer.locked) {
      this.announce(`${layer.name} is locked. Unlock it first.`, { error: true });
      return;
    }
    const bounds = findContentBounds(getPixels(layer.canvas), 8);
    const centerX = bounds ? bounds.x + bounds.w / 2 : this.doc.width / 2;
    const centerY = bounds ? bounds.y + bounds.h / 2 : this.doc.height / 2;
    const before = this.doc;
    const output = createCanvas(this.doc.width, this.doc.height);
    const context = context2d(output);
    context.save();
    context.translate(centerX, centerY);
    context.rotate((direction * Math.PI) / 2);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(layer.canvas, -centerX, -centerY);
    context.restore();
    this.doc = updateLayer(this.doc, layer.id, { canvas: output });
    this.selection = null;
    const label = direction > 0 ? "Rotate layer 90° CW" : "Rotate layer 90° CCW";
    this.commit(before, label);
    this.announce(`${label} applied.`);
  }

  openNewDialog() {
    if (this.isDialogOpen()) return;
    this.finishText();
    this.syncNewSize();
    this.el.newDialog.showModal();
    this.el.newName.focus();
    this.el.newName.select();
  }

  hasUnsavedChanges() {
    return this.documentDirty;
  }

  confirmDiscard(action) {
    if (!this.hasUnsavedChanges()) return true;
    if (typeof globalThis.confirm !== "function") return true;
    return globalThis.confirm(`Discard the current edit and ${action}?`);
  }

  syncNewSize() {
    if (!this.el.newSize) return;
    const requestedWidth = requestedDimension(this.el.newWidth.value, 1280);
    const requestedHeight = requestedDimension(this.el.newHeight.value, 800);
    const { width, height } = boundedDimensions(requestedWidth, requestedHeight);
    const capped = width !== requestedWidth || height !== requestedHeight;
    this.el.newSize.textContent = capped
      ? `${requestedWidth} × ${requestedHeight} will be capped to ${width} × ${height} pixels`
      : `${width} × ${height} pixels`;
    this.el.newSize.dataset.tone = capped ? "warn" : "muted";
  }

  createNewDocument() {
    if (!this.confirmDiscard("create a new document")) return;
    const requestedWidth = requestedDimension(this.el.newWidth.value, 1280);
    const requestedHeight = requestedDimension(this.el.newHeight.value, 800);
    const { width, height } = boundedDimensions(requestedWidth, requestedHeight);
    const name = cleanDocumentName(this.el.newName.value);
    const selected = this.root.querySelector('input[name="new-background"]:checked')?.value ?? "white";
    const canvas = createCanvas(width, height);
    if (selected === "white") fillCanvas(canvas, "#ffffff");
    if (selected === "color") fillCanvas(canvas, normalizeHex(this.el.newColor.value, "#0b1220"));
    const layer = createLayer({ name: "Background", canvas });
    const doc = createDocument({ width, height, name, layers: [layer], activeLayerId: layer.id });
    this.el.newDialog.close();
    const limited = width !== requestedWidth || height !== requestedHeight;
    this.setDocument(doc, {
      reset: true,
      fit: true,
      status: limited
        ? `Created ${width} × ${height} ${name} (capped to keep the editor responsive).`
        : `Created ${width} × ${height} ${name}.`,
    });
  }

  openExportDialog() {
    if (this.isDialogOpen()) return;
    this.finishText();
    this.el.exportName.value = this.doc.name;
    this.el.exportFormat.value = "png";
    this.el.exportQuality.value = "92";
    this.el.exportScale.value = "1";
    this.syncExportFormat();
    this.el.exportDialog.showModal();
    this.el.exportName.focus();
    this.el.exportName.select();
  }

  syncExportFormat() {
    const format = exportFormat(this.el.exportFormat.value);
    const scale = normalizeExportScale(this.el.exportScale.value);
    const output = exportDimensions(this.doc.width, this.doc.height, scale);
    if (this.el.exportFilename) {
      const name = this.el.exportName.value.trim() || this.doc.name;
      this.el.exportFilename.textContent = `Saves as ${downloadName(name, this.el.exportFormat.value)}`;
    }
    const percent = Math.round((output.width / this.doc.width) * 100);
    this.el.exportQualityRow.hidden = !format.quality;
    this.el.exportQualityValue.textContent = this.el.exportQuality.value;
    const capped = percent < Math.round(scale * 100);
    const limit = capped ? " (capped to the pixel budget)" : "";
    this.el.exportSize.textContent = `${output.width} × ${output.height} pixels (${percent}% of ${
      this.doc.width
    } × ${this.doc.height}${limit}), ${format.mime === "image/jpeg" ? "white background" : "transparent background"}.`;
    this.el.exportSize.dataset.tone = capped ? "warn" : "muted";
  }

  async exportImage() {
    const format = exportFormat(this.el.exportFormat.value);
    const quality = format.quality ? normalizeQuality(Number(this.el.exportQuality.value) / 100) : undefined;
    const scale = normalizeExportScale(this.el.exportScale.value);
    const name = this.el.exportName.value.trim() || this.doc.name;
    this.el.exportDialog.close();
    this.announce("Exporting image…");
    try {
      const base = compositeDocument(this.doc, { background: format.mime === "image/jpeg" ? "#ffffff" : null });
      const output = exportDimensions(this.doc.width, this.doc.height, scale);
      const canvas =
        output.width === this.doc.width && output.height === this.doc.height
          ? base
          : scaleCanvas(base, output.width, output.height);
      const blob = await canvasToBlob(canvas, format.mime, quality);
      downloadBlob(blob, downloadName(name, this.el.exportFormat.value));
      this.announce(`Exported ${format.label} (${formatBytes(blob.size)}).`, { ok: true });
    } catch (error) {
      this.announce(error.message || "The export failed.", { error: true });
    }
  }

  saveProject() {
    if (!this.doc) return;
    this.finishText();
    try {
      this.announce("Saving project…");
      const images = {};
      for (const layer of this.doc.layers) images[layer.id] = layer.canvas.toDataURL("image/png");
      const blob = new Blob([serializeProject(this.doc, images)], { type: "application/json" });
      const name = `${safeFileName(this.doc.name)}.palette`;
      downloadBlob(blob, name);
      this.documentDirty = false;
      this.syncDocumentState();
      this.announce(`Saved ${name} (${formatBytes(blob.size)}).`, { ok: true });
    } catch (error) {
      this.announce(error.message || "The project could not be saved.", { error: true });
    }
  }

  async addImageLayer(file) {
    if (!file) return;
    if (!String(file.type).startsWith("image/")) {
      this.announce("That file is not an image.", { error: true });
      this.el.fileLayer.value = "";
      return;
    }
    const target = this.doc;
    if (!target) return;
    this.finishText();
    this.announce("Placing image…");
    let url = "";
    try {
      url = URL.createObjectURL(file);
      const image = await loadImage(url);
      if (this.doc !== target) {
        this.announce("The document changed while the image loaded. Try again.");
        return;
      }
      const rect = containRect(image.naturalWidth, image.naturalHeight, target.width, target.height);
      const canvas = createCanvas(target.width, target.height);
      const context = context2d(canvas);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(image, rect.x, rect.y, rect.w, rect.h);
      const before = this.doc;
      const layer = createLayer({ name: fileBaseName(file.name), canvas });
      const at = indexOfLayer(this.doc, this.doc.activeLayerId) + 1;
      this.doc = addLayer(this.doc, layer, at);
      this.commit(before, "Place image layer");
      const displayName = file.name || "image";
      this.announce(`Placed ${displayName} as ${layer.name}.`);
    } catch (error) {
      this.announce(error.message || "That image could not be placed.", { error: true });
    } finally {
      if (url) URL.revokeObjectURL(url);
      this.el.fileLayer.value = "";
    }
  }

  async openImageFile(file) {
    if (!file) return;
    if (!String(file.type).startsWith("image/")) {
      this.announce("That file is not an image.", { error: true });
      return;
    }
    if (!this.confirmDiscard("open another image")) {
      this.el.fileImage.value = "";
      return;
    }
    this.finishText();
    this.announce("Opening image…");
    let url = "";
    try {
      url = URL.createObjectURL(file);
      const image = await loadImage(url);
      const { width, height } = boundedDimensions(image.naturalWidth, image.naturalHeight);
      const canvas = imageToCanvas(image, width, height);
      const name = fileBaseName(file.name);
      const layer = createLayer({ name: "Image", canvas });
      const doc = createDocument({ width, height, name, layers: [layer], activeLayerId: layer.id });
      const limited = width !== image.naturalWidth || height !== image.naturalHeight;
      this.setDocument(doc, {
        reset: true,
        fit: true,
        dirty: true,
        status: limited
          ? `Opened ${file.name} at ${width} × ${height} (scaled to fit the editor).`
          : `Opened ${file.name} at ${width} × ${height}.`,
      });
    } catch (error) {
      this.announce(error.message || "That image could not be opened.", { error: true });
    } finally {
      if (url) URL.revokeObjectURL(url);
      this.el.fileImage.value = "";
    }
  }

  async openProjectFile(file) {
    if (!file) return;
    if (!this.confirmDiscard("open a project")) {
      this.el.fileProject.value = "";
      return;
    }
    this.finishText();
    this.announce("Opening project…");
    try {
      const project = parseProject(await readFileText(file));
      const layers = [];
      for (const entry of project.layers) {
        const image = await loadImage(entry.image);
        const canvas = createCanvas(project.width, project.height);
        context2d(canvas).drawImage(image, 0, 0);
        layers.push(createLayer({ ...entry, canvas }));
      }
      const doc = createDocument({ ...project, layers });
      this.setDocument(doc, { reset: true, fit: true, dirty: true, status: `Opened ${file.name}.` });
    } catch (error) {
      this.announce(error.message || "That project could not be opened.", { error: true });
    } finally {
      this.el.fileProject.value = "";
    }
  }

  syncDimensionSize(readout, widthInput, heightInput, fallbackWidth, fallbackHeight) {
    if (!readout) return;
    const requestedWidth = requestedDimension(widthInput.value, fallbackWidth);
    const requestedHeight = requestedDimension(heightInput.value, fallbackHeight);
    const { width, height } = boundedDimensions(requestedWidth, requestedHeight);
    const capped = width !== requestedWidth || height !== requestedHeight;
    readout.textContent = capped
      ? `${requestedWidth} × ${requestedHeight} will be capped to ${width} × ${height} pixels`
      : `${width} × ${height} pixels`;
    readout.dataset.tone = capped ? "warn" : "muted";
  }

  openResizeDialog() {
    if (this.isDialogOpen()) return;
    this.finishText();
    this.resizeAspect = this.doc.width / this.doc.height;
    this.el.resizeWidth.value = String(this.doc.width);
    this.el.resizeHeight.value = String(this.doc.height);
    this.el.resizeLock.checked = true;
    this.syncDimensionSize(this.el.resizeSize, this.el.resizeWidth, this.el.resizeHeight, this.doc.width, this.doc.height);
    this.el.resizeDialog.showModal();
    this.el.resizeWidth.focus();
    this.el.resizeWidth.select();
  }

  openCanvasDialog() {
    if (this.isDialogOpen()) return;
    this.finishText();
    this.el.canvasWidth.value = String(this.doc.width);
    this.el.canvasHeight.value = String(this.doc.height);
    const center = this.root.querySelector('input[name="canvas-anchor"][value="center"]');
    if (center) center.checked = true;
    this.syncDimensionSize(this.el.canvasSize, this.el.canvasWidth, this.el.canvasHeight, this.doc.width, this.doc.height);
    this.el.canvasDialog.showModal();
    this.el.canvasWidth.focus();
    this.el.canvasWidth.select();
  }

  openTransformDialog() {
    if (this.isDialogOpen()) return;
    this.finishText();
    if (!this.requireActiveLayer()) return;
    this.el.transformScaleX.value = "100";
    this.el.transformScaleY.value = "100";
    this.el.transformRotation.value = "0";
    this.el.transformRotationValue.textContent = "0";
    this.el.transformFlipH.checked = false;
    this.el.transformFlipV.checked = false;
    this.syncTransformSize();
    this.el.transformDialog.showModal();
  }

  syncTransformSize() {
    if (!this.el.transformSize) return;
    const layer = activeLayer(this.doc);
    const scaleX = clamp(Number(this.el.transformScaleX.value) / 100 || 1, 0.01, 10);
    const scaleY = clamp(Number(this.el.transformScaleY.value) / 100 || 1, 0.01, 10);
    const bounds = layer?.canvas ? findContentBounds(getPixels(layer.canvas), 8) : null;
    const w = bounds ? bounds.w : this.doc.width;
    const h = bounds ? bounds.h : this.doc.height;
    const nextW = Math.max(1, Math.round(w * scaleX));
    const nextH = Math.max(1, Math.round(h * scaleY));
    const offCanvas = nextW > this.doc.width || nextH > this.doc.height;
    this.el.transformSize.textContent = `Content will be ${nextW} × ${nextH} px${offCanvas ? " — clipped to the canvas" : ""}`;
    this.el.transformSize.dataset.tone = offCanvas ? "warn" : "muted";
  }

  applyLayerTransform() {
    const layer = this.requireActiveLayer();
    if (!layer) return;
    const scaleX = clamp(Number(this.el.transformScaleX.value) / 100, 0.01, 10);
    const scaleY = clamp(Number(this.el.transformScaleY.value) / 100, 0.01, 10);
    const rotation = clamp(Number(this.el.transformRotation.value), -180, 180);
    const flipH = this.el.transformFlipH.checked;
    const flipV = this.el.transformFlipV.checked;
    this.el.transformDialog.close();
    if (scaleX === 1 && scaleY === 1 && rotation === 0 && !flipH && !flipV) return;
    const bounds = findContentBounds(getPixels(layer.canvas), 8);
    if (!bounds) {
      this.announce("This layer has no visible pixels to transform.", { error: true });
      return;
    }
    const before = this.doc;
    const output = createCanvas(this.doc.width, this.doc.height);
    const context = context2d(output);
    const centerX = bounds.x + bounds.w / 2;
    const centerY = bounds.y + bounds.h / 2;
    context.save();
    context.translate(centerX, centerY);
    context.rotate((rotation * Math.PI) / 180);
    context.scale(scaleX * (flipH ? -1 : 1), scaleY * (flipV ? -1 : 1));
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(layer.canvas, -centerX, -centerY);
    context.restore();
    this.doc = updateLayer(this.doc, layer.id, { canvas: output });
    this.selection = null;
    this.commit(before, "Transform layer");
    this.announce("Layer transformed.");
  }

  applyCanvasSize() {
    const requestedWidth = requestedDimension(this.el.canvasWidth.value, this.doc.width);
    const requestedHeight = requestedDimension(this.el.canvasHeight.value, this.doc.height);
    const { width, height } = boundedDimensions(requestedWidth, requestedHeight);
    this.el.canvasDialog.close();
    if (width === this.doc.width && height === this.doc.height) return;
    const anchor = this.root.querySelector('input[name="canvas-anchor"]:checked')?.value ?? "center";
    const offset = anchorOffset(this.doc.width, this.doc.height, width, height, anchor);
    const before = this.doc;
    const layers = this.doc.layers.map((layer) =>
      createLayer({ ...layer, canvas: placeCanvas(layer.canvas, width, height, offset.x, offset.y) }),
    );
    this.doc = { ...resizeDocument(this.doc, width, height), layers };
    this.selection = null;
    this.commit(before, "Canvas size");
    this.fitView();
    const limited = width !== requestedWidth || height !== requestedHeight;
    this.announce(
      limited
        ? `Canvas size set to ${width} × ${height} (capped to keep the editor responsive).`
        : `Canvas size set to ${width} × ${height}.`,
    );
  }

  applyResize() {
    const requestedWidth = requestedDimension(this.el.resizeWidth.value, this.doc.width);
    const requestedHeight = requestedDimension(this.el.resizeHeight.value, this.doc.height);
    const { width, height } = boundedDimensions(requestedWidth, requestedHeight);
    this.el.resizeDialog.close();
    if (width === this.doc.width && height === this.doc.height) return;
    const before = this.doc;
    const layers = this.doc.layers.map((layer) =>
      createLayer({ ...layer, canvas: scaleCanvas(layer.canvas, width, height) }),
    );
    this.doc = { ...resizeDocument(this.doc, width, height), layers };
    this.selection = null;
    this.commit(before, "Resize image");
    this.fitView();
    const limited = width !== requestedWidth || height !== requestedHeight;
    this.announce(
      limited
        ? `Resized to ${width} × ${height} (capped to keep the editor responsive).`
        : `Resized to ${width} × ${height}.`,
    );
  }

  flipDocument(axis) {
    if (!this.doc) return;
    this.finishText();
    this.selection = null;
    const before = this.doc;
    const layers = this.doc.layers.map((layer) =>
      createLayer({ ...layer, canvas: flipCanvas(layer.canvas, axis) }),
    );
    this.doc = { ...this.doc, layers };
    this.commit(before, axis === "horizontal" ? "Flip horizontal" : "Flip vertical");
  }

  rotateDocument() {
    if (!this.doc) return;
    this.finishText();
    this.selection = null;
    const before = this.doc;
    const layers = this.doc.layers.map((layer) =>
      createLayer({ ...layer, canvas: rotateCanvas(layer.canvas) }),
    );
    this.doc = { ...resizeDocument(this.doc, this.doc.height, this.doc.width), layers };
    this.commit(before, "Rotate 90°");
    this.fitView();
  }

  flattenImage() {
    if (!this.doc) return;
    this.finishText();
    const visible = this.doc.layers.some((layer) => layer.visible);
    if (!visible) {
      this.announce("Show at least one layer before flattening.", { error: true });
      return;
    }
    const before = this.doc;
    const layer = createLayer({ name: "Flattened", canvas: compositeDocument(this.doc) });
    this.doc = { ...this.doc, layers: [layer], activeLayerId: layer.id };
    this.commit(before, "Flatten image");
    this.announce("Flattened all visible layers into one.");
  }

  stampVisible() {
    if (!this.doc) return;
    this.finishText();
    const visible = this.doc.layers.some((layer) => layer.visible);
    if (!visible) {
      this.announce("Show at least one layer before stamping.", { error: true });
      return;
    }
    const before = this.doc;
    const layer = createLayer({ name: "Merged visible", canvas: compositeDocument(this.doc) });
    this.doc = addLayer(this.doc, layer, this.doc.layers.length);
    this.commit(before, "Stamp visible");
    this.announce("Created a merged layer from visible art.");
  }

  setDocumentName(value) {
    if (!this.doc) return;
    const name = cleanDocumentName(value, this.doc.name);
    this.el.docName.value = name;
    if (name === this.doc.name) return;
    this.doc = { ...this.doc, name };
    this.documentDirty = true;
    this.syncDocumentState();
    this.announce("Document renamed.");
    this.scheduleAutosave();
  }

  setAutosaveStatus(text, tone = "muted") {
    const node = this.el.statusAutosave;
    if (!node) return;
    node.textContent = text;
    node.dataset.tone = tone;
    node.title = text;
  }

  async initAutosave() {
    if (!autosaveAvailable()) {
      this.autosaveArmed = true;
      this.setAutosaveStatus("Autosave unavailable", "muted");
      return;
    }
    this.setAutosaveStatus("Checking autosave…", "muted");
    try {
      const record = validateSessionRecord(await readAutosave());
      if (!record) {
        this.autosaveArmed = true;
        this.setAutosaveStatus("Autosave ready", "muted");
        return;
      }
      this.pendingRestore = record;
      const saved = formatSavedAt(record.savedAt);
      this.el.restoreSummary.textContent = saved
        ? `A local autosave of "${record.name}" from ${saved} is available.`
        : `A local autosave of "${record.name}" is available.`;
      this.el.restoreDialog.showModal();
    } catch {
      this.autosaveArmed = true;
      this.setAutosaveStatus("Autosave unavailable", "error");
    }
  }

  scheduleAutosave(delay = 800) {
    if (!this.autosaveArmed || !this.autosaveHasContent || !this.doc || this.action) return;
    clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => this.runAutosave(), Math.max(0, delay));
  }

  async runAutosave() {
    if (!this.autosaveArmed || !this.autosaveHasContent || !this.doc || this.action) return;
    if (this.autosaveInFlight) {
      this.autosavePending = true;
      return;
    }
    this.autosaveInFlight = true;
    const snapshot = this.doc;
    try {
      this.setAutosaveStatus("Saving locally…", "muted");
      const record = await captureSession(snapshot);
      await writeAutosave(record);
      if (this.doc === snapshot) {
        this.setAutosaveStatus(`Saved locally ${formatSavedAt(record.savedAt)}`, "ok");
      }
    } catch (error) {
      const full = error?.name === "QuotaExceededError";
      this.setAutosaveStatus(full ? "Local save: storage full" : "Local save failed", "error");
    } finally {
      this.autosaveInFlight = false;
      if (this.autosavePending) {
        this.autosavePending = false;
        this.scheduleAutosave(0);
      }
    }
  }

  async restoreSession(record) {
    if (!record) return;
    this.restoreResolved = true;
    this.pendingRestore = null;
    if (this.el.restoreDialog.open) this.el.restoreDialog.close();
    this.announce("Restoring your last local session…");
    try {
      const layers = [];
      for (const entry of record.layers) {
        const url = URL.createObjectURL(entry.image);
        try {
          const image = await loadImage(url);
          const canvas = createCanvas(record.width, record.height);
          context2d(canvas).drawImage(image, 0, 0);
          layers.push(
            createLayer({
              id: entry.id,
              name: entry.name,
              visible: entry.visible,
              opacity: entry.opacity,
              blendMode: entry.blendMode,
              locked: entry.locked,
              clipToBelow: entry.clipToBelow,
              adjustments: entry.adjustments,
              canvas,
            }),
          );
        } finally {
          URL.revokeObjectURL(url);
        }
      }
      const doc = createDocument({
        width: record.width,
        height: record.height,
        name: record.name,
        layers,
        activeLayerId: record.activeLayerId,
      });
      this.autosaveArmed = true;
      this.autosaveHasContent = true;
      this.setDocument(doc, {
        reset: true,
        fit: true,
        autosave: false,
        dirty: true,
        status: "Restored your last local session.",
      });
      this.setAutosaveStatus("Saved locally", "ok");
      this.scheduleAutosave(0);
    } catch (error) {
      this.autosaveArmed = true;
      this.setAutosaveStatus("Autosave restore failed", "error");
      this.announce(error.message || "The local autosave could not be restored.", { error: true });
      clearAutosave().catch(() => {});
    }
  }

  discardAutosave() {
    this.restoreResolved = true;
    this.pendingRestore = null;
    if (this.el.restoreDialog.open) this.el.restoreDialog.close();
    this.autosaveArmed = true;
    this.setAutosaveStatus("Autosave ready", "muted");
    clearAutosave().catch(() => {});
    this.announce("Started fresh; the previous autosave was discarded.");
  }

  handleRestoreClose() {
    if (this.restoreResolved) return;
    this.restoreResolved = true;
    this.pendingRestore = null;
    this.autosaveArmed = true;
    this.setAutosaveStatus("Autosave ready", "muted");
  }

  adjustBrushSize(delta) {
    const target =
      this.tool === "eraser"
        ? this.options.eraser
        : this.tool === "clone"
          ? this.options.clone
          : this.tool === "dodge"
            ? this.options.dodge
            : this.options.brush;
    target.size = clamp(target.size + delta, 1, 200);
    this.syncOptionControls();
    this.scheduleRender();
    this.announce(`Brush size ${target.size} px.`);
  }

  nudgeActiveLayer(dx, dy) {
    const layer = this.requireActiveLayer();
    if (!layer) return;
    const before = this.doc;
    this.doc = updateLayer(this.doc, layer.id, { canvas: shiftedCanvas(layer.canvas, dx, dy) });
    this.commit(before, "Nudge layer");
    const direction = dx < 0 ? "left" : dx > 0 ? "right" : dy < 0 ? "up" : "down";
    this.announce(`Nudged ${layer.name} ${direction} ${Math.abs(dx || dy)} px.`);
  }

  undo() {
    if (!this.history.canUndo) return;
    const label = this.history.undoLabel;
    this.history.undo();
    this.announce(`Undid ${label}.`);
  }

  redo() {
    if (!this.history.canRedo) return;
    const label = this.history.redoLabel;
    this.history.redo();
    this.announce(`Redid ${label}.`);
  }

  isDialogOpen() {
    return Boolean(this.root.querySelector("dialog[open]"));
  }

  onKeyDown(event) {
    if (event.altKey !== this.altDown) {
      this.altDown = event.altKey;
      this.updateCursor();
    }
    if (this.isDialogOpen()) return;
    if (this.textDraft && event.target === this.el.textInput) {
      if (event.key === "Enter") {
        event.preventDefault();
        this.commitText();
      } else if (event.key === "Escape") {
        event.preventDefault();
        this.cancelText();
      }
      return;
    }
    if (isTypingTarget(event.target)) return;

    if (event.key === "F1") {
      event.preventDefault();
      if (!this.isDialogOpen()) this.el.helpDialog.showModal();
      return;
    }

    if (event.key === "Escape") {
      if (this.textDraft) {
        event.preventDefault();
        this.cancelText();
      } else if (this.cropRect) {
        event.preventDefault();
        this.cancelCrop();
      } else if (this.action) {
        event.preventDefault();
        this.cancelAction();
      } else if (this.selection) {
        event.preventDefault();
        this.deselect();
      }
      return;
    }
    if (event.code === "Space") {
      if (!this.space) {
        this.space = true;
        this.updateCursor();
      }
      event.preventDefault();
      return;
    }
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier) {
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) this.redo();
        else this.undo();
      } else if (key === "y") {
        event.preventDefault();
        this.redo();
      } else if (key === "s") {
        event.preventDefault();
        this.saveProject();
      } else if (key === "o") {
        event.preventDefault();
        if (event.shiftKey) this.el.fileProject.click();
        else this.el.fileImage.click();
      } else if (key === "n") {
        event.preventDefault();
        this.openNewDialog();
      } else if (key === "e") {
        event.preventDefault();
        if (event.altKey && event.shiftKey) this.stampVisible();
        else this.openExportDialog();
      } else if (key === "a") {
        event.preventDefault();
        this.selectAll();
      } else if (key === "d") {
        event.preventDefault();
        this.deselect();
      } else if (key === "i" && event.shiftKey) {
        event.preventDefault();
        this.invertSelection();
      } else if (key === "0") {
        event.preventDefault();
        this.fitView();
      } else if (key === "1") {
        event.preventDefault();
        this.actualSize();
      } else if (key === "c") {
        event.preventDefault();
        this.copySelection();
      } else if (key === "x") {
        event.preventDefault();
        this.cutSelection();
      } else if (key === "v" && this.clipboard) {
        event.preventDefault();
        this.pasteClipboard();
      } else if (key === "j") {
        event.preventDefault();
        if (event.shiftKey) this.layerViaCut();
        else this.layerViaCopy();
      } else if (key === "g" && event.altKey) {
        event.preventDefault();
        this.toggleClippingMask();
      } else if (key === "+" || key === "=") {
        event.preventDefault();
        this.zoomIn();
      } else if (key === "-" || key === "_") {
        event.preventDefault();
        this.zoomOut();
      }
      return;
    }
    if (event.shiftKey && event.key.toLowerCase() === "i" && !event.altKey) {
      event.preventDefault();
      this.invertSelection();
      return;
    }
    const shortcuts = {
      v: "move",
      b: "brush",
      e: "eraser",
      s: "clone",
      d: "dodge",
      k: "bucket",
      c: "crop",
      m: "marquee",
      t: "text",
      r: "rect",
      o: "ellipse",
      l: "line",
      g: "gradient",
      i: "eyedropper",
      h: "hand",
      z: "zoom",
    };
    const tool = shortcuts[event.key.toLowerCase()];
    if (tool && !event.altKey) {
      event.preventDefault();
      this.setTool(tool);
      return;
    }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      this.zoomIn();
      return;
    }
    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      this.zoomOut();
      return;
    }
    if (event.key === "[" || event.key === "]") {
      event.preventDefault();
      this.adjustBrushSize(event.key === "]" ? 4 : -4);
      return;
    }
    if (event.key === "0") {
      event.preventDefault();
      this.fitView();
      return;
    }
    if (event.key === "1") {
      event.preventDefault();
      this.actualSize();
      return;
    }
    if (event.key === "Enter" && this.tool === "crop" && this.cropRect) {
      event.preventDefault();
      this.applyCrop();
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && this.selection) {
      event.preventDefault();
      this.clearSelectedPixels();
      return;
    }
    if (event.key.startsWith("Arrow") && this.tool === "move") {
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
      const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
      if (dx || dy) this.nudgeActiveLayer(dx, dy);
    }
  }

  onKeyUp(event) {
    if (event.key === "Alt" || event.altKey === false) {
      if (this.altDown) {
        this.altDown = false;
        this.updateCursor();
      }
    }
    if (event.code === "Space") {
      this.space = false;
      this.updateCursor();
    }
  }

  onPaste(event) {
    const items = Array.from(event.clipboardData?.items ?? []);
    const image = items.find((item) => String(item.type).startsWith("image/"));
    if (image) {
      const file = image.getAsFile();
      if (!file) return;
      event.preventDefault();
      if (this.doc) {
        this.addImageLayer(file);
      } else {
        this.openImageFile(file);
      }
      return;
    }
    if (isTypingTarget(event.target)) return;
    if (this.clipboard) {
      event.preventDefault();
      this.pasteClipboard();
    }
  }

  onDragOver(event) {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    this.el.dropHint.hidden = false;
  }

  onDragLeave(event) {
    if (event.relatedTarget && this.el.stageWrap.contains(event.relatedTarget)) return;
    this.el.dropHint.hidden = true;
  }

  onDrop(event) {
    event.preventDefault();
    this.el.dropHint.hidden = true;
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    if (String(file.type).startsWith("image/")) {
      this.openImageFile(file);
    } else if (/\.(palette|json)$/i.test(file.name)) {
      this.openProjectFile(file);
    } else {
      this.announce("Drop an image or a .palette project.", { error: true });
    }
  }

  bindResizeObserver() {
    if (typeof ResizeObserver !== "function") return;
    this.resizeObserver = new ResizeObserver(() => {
      this.resizeCanvases();
      if (this.autoFit) this.fitView();
      else this.scheduleRender();
    });
    this.resizeObserver.observe(this.el.stageWrap);
  }

  bindEvents() {
    for (const button of this.root.querySelectorAll("[data-tool]")) {
      button.addEventListener("click", () => this.setTool(button.dataset.tool));
    }
    this.el.btnNew.addEventListener("click", () => this.openNewDialog());
    this.el.btnOpen.addEventListener("click", () => this.el.fileImage.click());
    this.el.btnOpenProject.addEventListener("click", () => this.el.fileProject.click());
    this.el.btnSave.addEventListener("click", () => this.saveProject());
    this.root.querySelector(".panel-column")?.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      const head = event.target.closest(".panel-head");
      if (!head) return;
      const panel = head.closest(".panel");
      const collapsed = panel.dataset.collapsed === "true";
      panel.dataset.collapsed = collapsed ? "false" : "true";
      head.setAttribute("aria-expanded", collapsed ? "true" : "false");
      head.title = collapsed ? "Click to collapse" : "Click to expand";
    });
    this.root.querySelector(".panel-column")?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const head = event.target.closest(".panel-head");
      if (!head) return;
      event.preventDefault();
      head.click();
    });
    this.el.btnExport.addEventListener("click", () => this.openExportDialog());
    this.el.btnUndo.addEventListener("click", () => this.undo());
    this.el.btnRedo.addEventListener("click", () => this.redo());
    this.el.btnHelp.addEventListener("click", () => this.el.helpDialog.showModal());
    this.el.btnZoomIn.addEventListener("click", () => this.zoomBy(1.25));
    this.el.btnZoomOut.addEventListener("click", () => this.zoomBy(0.8));
    this.el.btnFit.addEventListener("click", () => this.fitView());
    this.el.btnActual.addEventListener("click", () => this.actualSize());
    this.el.docSize.addEventListener("click", () => this.openResizeDialog());
    this.el.statusZoom.addEventListener("click", () => {
      if (Math.abs(this.view.scale - 1) < 0.001) this.fitView();
      else this.actualSize();
    });
    this.el.btnLayerAdd.addEventListener("click", () => this.addNewLayer());
    this.el.btnLayerImage.addEventListener("click", () => this.el.fileLayer.click());
    this.el.btnLayerDuplicate.addEventListener("click", () => this.duplicateActiveLayer());
    this.el.btnLayerMerge.addEventListener("click", () => this.mergeActiveLayerDown());
    this.el.btnLayerLock.addEventListener("click", () => this.toggleLayerLock());
    this.el.btnLayerClip.addEventListener("click", () => this.toggleClippingMask());
    this.el.btnLayerDelete.addEventListener("click", () => this.deleteActiveLayer());
    this.el.btnLayerUp.addEventListener("click", () => this.reorderActiveLayer(1));
    this.el.btnLayerDown.addEventListener("click", () => this.reorderActiveLayer(-1));
    this.el.layerBlend.addEventListener("change", () => {
      const layer = activeLayer(this.doc);
      if (!layer) return;
      this.finishText();
      const before = this.doc;
      this.doc = updateLayer(this.doc, layer.id, { blendMode: this.el.layerBlend.value });
      this.commit(before, "Layer blend mode");
    });
    this.el.btnResize.addEventListener("click", () => this.openResizeDialog());
    this.el.btnCanvasSize.addEventListener("click", () => this.openCanvasDialog());
    this.el.btnTransform.addEventListener("click", () => this.openTransformDialog());
    this.el.btnLayerFlipH.addEventListener("click", () => this.flipActiveLayer("horizontal"));
    this.el.btnLayerFlipV.addEventListener("click", () => this.flipActiveLayer("vertical"));
    this.el.btnLayerRotateCw.addEventListener("click", () => this.rotateActiveLayer(1));
    this.el.btnLayerRotateCcw.addEventListener("click", () => this.rotateActiveLayer(-1));
    this.el.btnFlipH.addEventListener("click", () => this.flipDocument("horizontal"));
    this.el.btnFlipV.addEventListener("click", () => this.flipDocument("vertical"));
    this.el.btnRotate.addEventListener("click", () => this.rotateDocument());
    this.el.btnFlatten.addEventListener("click", () => this.flattenImage());
    this.el.btnStampVisible.addEventListener("click", () => this.stampVisible());
    this.el.adjustReset.addEventListener("click", () => this.resetAdjustments());
    this.el.btnAutoLevels.addEventListener("click", () => this.autoLevels());
    this.el.histogram.addEventListener("mousemove", (event) => {
      const data = this.histogramData;
      if (!data || !this.el.histogramHover) return;
      const rect = this.el.histogram.getBoundingClientRect();
      const level = Math.max(0, Math.min(255, Math.round(((event.clientX - rect.left) / rect.width) * 255)));
      this.el.histogramHover.textContent =
        `L${level} · R${data.red[level]} G${data.green[level]} B${data.blue[level]} · Y${data.luma[level]}`;
    });
    this.el.histogram.addEventListener("mouseleave", () => {
      if (this.el.histogramHover) this.el.histogramHover.textContent = "Hover to inspect channel levels";
    });
    this.el.cropApply.addEventListener("click", () => this.applyCrop());
    this.el.cropCancel.addEventListener("click", () => this.cancelCrop());
    this.el.btnFilterBlur.addEventListener("click", () => this.applyBlurFilter());
    this.el.btnFilterPixelate.addEventListener("click", () => this.applyPixelateFilter());
    this.el.btnFilterSharpen.addEventListener("click", () => this.applySharpenFilter());
    this.el.btnFilterVignette.addEventListener("click", () => this.applyVignetteFilter());
    this.el.btnFilterInvert.addEventListener("click", () => this.applyInvertFilter());
    this.el.btnFilterDesaturate.addEventListener("click", () => this.applyDesaturateFilter());
    this.el.btnFilterSepia.addEventListener("click", () => this.applySepiaFilter());
    this.el.btnFilterEmboss.addEventListener("click", () => this.applyEmbossFilter());
    this.el.filterThresholdCutoff.addEventListener("input", () => {
      this.el.filterThresholdValue.textContent = this.el.filterThresholdCutoff.value;
    });
    this.el.btnFilterThreshold.addEventListener("click", () => this.applyThresholdFilter());
    this.el.filterPosterizeSteps.addEventListener("input", () => {
      this.el.filterPosterizeValue.textContent = this.el.filterPosterizeSteps.value;
    });
    this.el.btnFilterPosterize.addEventListener("click", () => this.applyPosterizeFilter());

    for (const swatch of this.root.querySelectorAll("[data-swatch]")) {
      swatch.addEventListener("click", () => {
        const color = swatch.dataset.swatch;
        if (color) this.setColor(color);
      });
    }
    this.el.btnFilterLevels.addEventListener("click", () => this.applyLevelsFilter());
    this.el.filterBrightness.addEventListener("input", () => {
      this.el.filterBrightnessValue.textContent = this.el.filterBrightness.value;
    });
    this.el.filterContrast.addEventListener("input", () => {
      this.el.filterContrastValue.textContent = this.el.filterContrast.value;
    });
    this.el.btnFilterBc.addEventListener("click", () => this.applyBrightnessContrastFilter());
    this.el.filterCbCr.addEventListener("input", () => {
      this.el.filterCbCrValue.textContent = this.el.filterCbCr.value;
    });
    this.el.filterCbMg.addEventListener("input", () => {
      this.el.filterCbMgValue.textContent = this.el.filterCbMg.value;
    });
    this.el.filterCbYb.addEventListener("input", () => {
      this.el.filterCbYbValue.textContent = this.el.filterCbYb.value;
    });
    this.el.btnFilterColorBalance.addEventListener("click", () => this.applyColorBalanceFilter());
    this.el.filterNoiseAmount.addEventListener("input", () => {
      this.el.filterNoiseAmountValue.textContent = this.el.filterNoiseAmount.value;
    });
    this.el.btnFilterNoise.addEventListener("click", () => this.applyNoiseFilter());
    this.el.filterHighPassRadius.addEventListener("input", () => {
      this.el.filterHighPassValue.textContent = this.el.filterHighPassRadius.value;
    });
    this.el.btnFilterHighPass.addEventListener("click", () => this.applyHighPassFilter());
    this.el.filterTintDensity.addEventListener("input", () => {
      this.el.filterTintDensityValue.textContent = this.el.filterTintDensity.value;
    });
    this.el.btnFilterTint.addEventListener("click", () => this.applyTintFilter());
    this.el.btnFilterFindEdges.addEventListener("click", () => this.applyFindEdgesFilter());
    this.el.btnFilterSolarize.addEventListener("click", () => this.applySolarizeFilter());
    this.el.btnFilterDuotone.addEventListener("click", () => this.applyDuotoneFilter());
    this.el.btnFilterDither.addEventListener("click", () => this.applyDitherFilter());
    this.el.filterOilRadius.addEventListener("input", () => {
      this.el.filterOilValue.textContent = this.el.filterOilRadius.value;
    });
    this.el.btnFilterOil.addEventListener("click", () => this.applyOilPaintFilter());
    this.el.btnFilterMedian.addEventListener("click", () => this.applyMedianFilter());

    this.el.colorInput.addEventListener("input", () => this.setColor(this.el.colorInput.value));
    this.el.statusColor.addEventListener("click", () => this.el.colorInput.click());
    this.el.colorHex.addEventListener("click", () => this.copyColorHex());
    this.el.brushSize.addEventListener("input", () => {
      this.options.brush.size = Number(this.el.brushSize.value);
      this.el.brushSizeValue.textContent = this.el.brushSize.value;
      this.scheduleRender();
    });
    this.el.brushHardness.addEventListener("input", () => {
      this.options.brush.hardness = Number(this.el.brushHardness.value) / 100;
      this.el.brushHardnessValue.textContent = this.el.brushHardness.value;
    });
    this.el.brushOpacity.addEventListener("input", () => {
      this.options.brush.opacity = Number(this.el.brushOpacity.value) / 100;
      this.el.brushOpacityValue.textContent = this.el.brushOpacity.value;
    });
    this.el.eraserSize.addEventListener("input", () => {
      this.options.eraser.size = Number(this.el.eraserSize.value);
      this.el.eraserSizeValue.textContent = this.el.eraserSize.value;
      this.scheduleRender();
    });
    this.el.eraserHardness.addEventListener("input", () => {
      this.options.eraser.hardness = Number(this.el.eraserHardness.value) / 100;
      this.el.eraserHardnessValue.textContent = this.el.eraserHardness.value;
    });
    this.el.eraserOpacity.addEventListener("input", () => {
      this.options.eraser.opacity = Number(this.el.eraserOpacity.value) / 100;
      this.el.eraserOpacityValue.textContent = this.el.eraserOpacity.value;
    });
    this.el.cloneSize.addEventListener("input", () => {
      this.options.clone.size = Number(this.el.cloneSize.value);
      this.el.cloneSizeValue.textContent = this.el.cloneSize.value;
      this.scheduleRender();
    });
    this.el.cloneHardness.addEventListener("input", () => {
      this.options.clone.hardness = Number(this.el.cloneHardness.value) / 100;
      this.el.cloneHardnessValue.textContent = this.el.cloneHardness.value;
    });
    this.el.cloneOpacity.addEventListener("input", () => {
      this.options.clone.opacity = Number(this.el.cloneOpacity.value) / 100;
      this.el.cloneOpacityValue.textContent = this.el.cloneOpacity.value;
    });
    this.el.dodgeMode.addEventListener("change", () => {
      this.options.dodge.mode = this.el.dodgeMode.value === "burn" ? "burn" : "dodge";
      this.syncToolOptions();
    });
    this.el.dodgeSize.addEventListener("input", () => {
      this.options.dodge.size = Number(this.el.dodgeSize.value);
      this.el.dodgeSizeValue.textContent = this.el.dodgeSize.value;
      this.scheduleRender();
    });
    this.el.dodgeHardness.addEventListener("input", () => {
      this.options.dodge.hardness = Number(this.el.dodgeHardness.value) / 100;
      this.el.dodgeHardnessValue.textContent = this.el.dodgeHardness.value;
    });
    this.el.dodgeStrength.addEventListener("input", () => {
      this.options.dodge.strength = Number(this.el.dodgeStrength.value) / 100;
      this.el.dodgeStrengthValue.textContent = this.el.dodgeStrength.value;
    });
    this.el.bucketTolerance.addEventListener("input", () => {
      this.options.bucket.tolerance = Number(this.el.bucketTolerance.value);
      this.el.bucketToleranceValue.textContent = this.el.bucketTolerance.value;
    });
    this.el.bucketOpacity.addEventListener("input", () => {
      this.options.bucket.opacity = Number(this.el.bucketOpacity.value) / 100;
      this.el.bucketOpacityValue.textContent = this.el.bucketOpacity.value;
    });
    this.el.bucketContiguous.addEventListener("change", () => {
      this.options.bucket.contiguous = this.el.bucketContiguous.checked;
    });
    this.el.shapeFill.addEventListener("change", () => {
      this.options.shape.fill = this.el.shapeFill.checked;
    });
    this.el.shapeOutline.addEventListener("change", () => {
      this.options.shape.outline = this.el.shapeOutline.checked;
    });
    this.el.shapeWidth.addEventListener("input", () => {
      this.options.shape.width = Number(this.el.shapeWidth.value);
      this.el.shapeWidthValue.textContent = this.el.shapeWidth.value;
    });
    this.el.shapeOutlineColor.addEventListener("input", () => {
      this.options.shape.outlineColor = normalizeHex(this.el.shapeOutlineColor.value, "#e9eefb");
      this.el.shapeOutlineHex.textContent = this.options.shape.outlineColor;
    });
    this.el.gradientType.addEventListener("change", () => {
      this.options.gradient.type = this.el.gradientType.value;
      this.syncToolOptions();
      this.scheduleOverlay();
    });
    this.el.gradientEnd.addEventListener("input", () => {
      this.options.gradient.to = normalizeHex(this.el.gradientEnd.value, "#a78bfa");
      this.el.gradientEndHex.textContent = this.options.gradient.to;
      this.scheduleOverlay();
    });
    this.el.gradientFade.addEventListener("change", () => {
      this.options.gradient.fade = this.el.gradientFade.checked;
      this.scheduleOverlay();
    });
    this.el.gradientOpacity.addEventListener("input", () => {
      this.options.gradient.opacity = Number(this.el.gradientOpacity.value) / 100;
      this.el.gradientOpacityValue.textContent = this.el.gradientOpacity.value;
      this.scheduleOverlay();
    });
    this.el.marqueeShape.addEventListener("change", () => {
      this.options.marquee.kind = this.el.marqueeShape.value === "ellipse" ? "ellipse" : "rect";
      this.syncToolOptions();
      this.scheduleOverlay();
    });
    this.el.cropAspect.addEventListener("change", () => {
      this.options.crop.aspect = this.el.cropAspect.value;
    });
    this.el.btnSelectAll.addEventListener("click", () => this.selectAll());
    this.el.btnDeselect.addEventListener("click", () => this.deselect());
    this.el.statusSelection.addEventListener("click", () => this.deselect());
    this.el.btnInvertSelection.addEventListener("click", () => this.invertSelection());
    this.el.btnCropSelection.addEventListener("click", () => this.cropToSelection());
    this.el.btnExpandSelection.addEventListener("click", () => this.modifySelection(5));
    this.el.btnClearSelection.addEventListener("click", () => this.clearSelectedPixels());
    this.el.btnContractSelection.addEventListener("click", () => this.modifySelection(-5));
    this.el.btnCopy.addEventListener("click", () => this.copySelection());
    this.el.btnCut.addEventListener("click", () => this.cutSelection());
    this.el.btnPaste.addEventListener("click", () => this.pasteClipboard());
    this.el.btnLayerViaCopy.addEventListener("click", () => this.layerViaCopy());
    this.el.btnLayerViaCut.addEventListener("click", () => this.layerViaCut());
    this.el.textFont.addEventListener("change", () => {
      this.options.text.family = this.el.textFont.value;
      this.scheduleRender();
    });
    this.el.textSize.addEventListener("input", () => {
      this.options.text.size = Number(this.el.textSize.value);
      this.el.textSizeValue.textContent = this.el.textSize.value;
      this.scheduleRender();
    });
    this.el.textWeight.addEventListener("change", () => {
      this.options.text.weight = Number(this.el.textWeight.value);
      this.scheduleRender();
    });
    this.el.textInput.addEventListener("input", () => {
      this.syncTextCommit();
      if (this.textDraft) {
        this.textDraft.value = this.el.textInput.value;
        this.scheduleRender();
      }
    });
    this.el.textCommit.addEventListener("click", () => this.commitText());
    this.el.textCancel.addEventListener("click", () => this.cancelText());

    for (const key of ADJUSTMENTS) {
      const input = this.el[`adj${key[0].toUpperCase()}${key.slice(1)}`];
      if (!input) continue;
      input.addEventListener("pointerdown", () => {
        this.finishText();
        if (!this.adjustStart) this.adjustStart = this.doc;
      });
      input.addEventListener("focus", () => {
        this.finishText();
        if (!this.adjustStart) this.adjustStart = this.doc;
      });
      input.addEventListener("input", () => this.previewAdjustment(key, Number(input.value)));
      input.addEventListener("change", () => {
        if (!this.adjustStart) return;
        const before = this.adjustStart;
        this.adjustStart = null;
        this.commit(before, `Adjust ${key}`);
      });
    }
    this.el.layerOpacity.addEventListener("pointerdown", () => {
      this.finishText();
      if (!this.opacityStart) this.opacityStart = this.doc;
    });
    this.el.layerOpacity.addEventListener("focus", () => {
      this.finishText();
      if (!this.opacityStart) this.opacityStart = this.doc;
    });
    this.el.layerOpacity.addEventListener("input", () => this.previewLayerOpacity());
    this.el.layerOpacity.addEventListener("change", () => {
      if (!this.opacityStart) return;
      const before = this.opacityStart;
      this.opacityStart = null;
      this.commit(before, "Layer opacity");
    });
    this.root.querySelector(".filter-grid")?.addEventListener("input", () => this.syncFilterOutputs());
    this.el.filterReset.addEventListener("click", () => {
      for (const input of this.root.querySelectorAll(".filter-grid input")) {
        if (input.type === "checkbox") input.checked = input.defaultChecked;
        else input.value = input.defaultValue;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
      this.syncFilterOutputs();
      this.announce("Filter settings reset.");
    });
    this.el.filterBlurRadius.addEventListener("input", () => {
      this.el.filterBlurValue.textContent = this.el.filterBlurRadius.value;
    });
    this.el.filterPixelSize.addEventListener("input", () => {
      this.el.filterPixelValue.textContent = this.el.filterPixelSize.value;
    });
    this.el.levelBlack.addEventListener("input", () => {
      this.el.levelBlackValue.textContent = this.el.levelBlack.value;
    });
    this.el.levelWhite.addEventListener("input", () => {
      this.el.levelWhiteValue.textContent = this.el.levelWhite.value;
    });
    this.el.levelGamma.addEventListener("input", () => {
      this.el.levelGammaValue.textContent = Number(this.el.levelGamma.value).toFixed(1);
    });

    this.el.docName.addEventListener("change", () => this.setDocumentName(this.el.docName.value));
    this.el.docName.addEventListener("focus", () => this.el.docName.select());
    this.el.docName.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.el.docName.blur();
      }
    });
    this.el.fileImage.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (file) this.openImageFile(file);
    });
    this.el.fileLayer.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (file) this.addImageLayer(file);
    });
    this.el.fileProject.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (file) this.openProjectFile(file);
    });

    this.el.newForm.addEventListener("submit", (event) => {
      event.preventDefault();
      this.createNewDocument();
    });
    this.el.newWidth.addEventListener("input", () => this.syncNewSize());
    this.el.newHeight.addEventListener("input", () => this.syncNewSize());
    this.el.newColor.addEventListener("input", () => {
      const radio = this.root.querySelector('input[name="new-background"][value="color"]');
      if (radio) radio.checked = true;
    });
    this.el.exportName.addEventListener("input", () => this.syncExportFormat());
    this.el.exportFormat.addEventListener("change", () => this.syncExportFormat());
    this.el.exportScale.addEventListener("change", () => this.syncExportFormat());
    this.el.exportQuality.addEventListener("input", () => {
      this.el.exportQualityValue.textContent = this.el.exportQuality.value;
    });
    this.el.exportForm.addEventListener("submit", (event) => {
      event.preventDefault();
      this.exportImage();
    });
    this.el.resizeForm.addEventListener("submit", (event) => {
      event.preventDefault();
      this.applyResize();
    });
    this.el.canvasForm.addEventListener("submit", (event) => {
      event.preventDefault();
      this.applyCanvasSize();
    });
    this.el.transformForm.addEventListener("submit", (event) => {
      event.preventDefault();
      this.applyLayerTransform();
    });
    this.el.transformRotation.addEventListener("input", () => {
      this.el.transformRotationValue.textContent = this.el.transformRotation.value;
    });
    this.el.transformScaleX.addEventListener("input", () => this.syncTransformSize());
    this.el.transformScaleY.addEventListener("input", () => this.syncTransformSize());
    this.el.resizeWidth.addEventListener("input", () => {
      if (this.el.resizeLock.checked && this.resizeAspect) {
        const width = Number(this.el.resizeWidth.value);
        if (width > 0) this.el.resizeHeight.value = String(Math.max(1, Math.round(width / this.resizeAspect)));
      }
      this.syncDimensionSize(this.el.resizeSize, this.el.resizeWidth, this.el.resizeHeight, this.doc.width, this.doc.height);
    });
    this.el.resizeHeight.addEventListener("input", () => {
      if (this.el.resizeLock.checked && this.resizeAspect) {
        const height = Number(this.el.resizeHeight.value);
        if (height > 0) this.el.resizeWidth.value = String(Math.max(1, Math.round(height * this.resizeAspect)));
      }
      this.syncDimensionSize(this.el.resizeSize, this.el.resizeWidth, this.el.resizeHeight, this.doc.width, this.doc.height);
    });
    this.el.canvasWidth.addEventListener("input", () => this.syncDimensionSize(this.el.canvasSize, this.el.canvasWidth, this.el.canvasHeight, this.doc.width, this.doc.height));
    this.el.canvasHeight.addEventListener("input", () => this.syncDimensionSize(this.el.canvasSize, this.el.canvasWidth, this.el.canvasHeight, this.doc.width, this.doc.height));
    for (const button of this.root.querySelectorAll("[data-close]")) {
      button.addEventListener("click", () => button.closest("dialog")?.close());
    }
    this.el.restoreConfirm.addEventListener("click", () => this.restoreSession(this.pendingRestore));
    this.el.restoreDiscard.addEventListener("click", () => this.discardAutosave());
    this.el.restoreDialog.addEventListener("close", () => this.handleRestoreClose());
    const flushAutosave = () => {
      if (this.autosaveArmed && this.autosaveHasContent && !this.autosaveInFlight && this.doc) {
        clearTimeout(this.autosaveTimer);
        this.runAutosave();
      }
    };
    window.addEventListener("pagehide", flushAutosave);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushAutosave();
    });

    this.el.stage.addEventListener("pointerdown", (event) => this.onPointerDown(event));
    this.el.stage.addEventListener("pointermove", (event) => this.onPointerMove(event));
    this.el.stage.addEventListener("dblclick", () => {
      if (this.textDraft) return;
      if (this.tool === "marquee") this.selectAll();
      else if (this.tool === "zoom") this.actualSize();
      else if (this.tool === "crop" && isUsableRect(this.cropRect)) this.applyCrop();
      else if (this.tool === "hand") this.fitView();
    });
    this.el.stage.addEventListener("pointerup", (event) => this.onPointerUp(event));
    this.el.stage.addEventListener("pointercancel", () => this.onPointerCancel());
    this.el.stage.addEventListener("pointerleave", () => this.onPointerLeave());
    this.el.stage.addEventListener("lostpointercapture", () => {
      if (this.action) this.onPointerCancel();
    });
    this.el.stage.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        if (event.ctrlKey || event.metaKey) {
          this.zoomAtPoint(this.eventPoint(event), Math.exp(-event.deltaY * 0.0015));
        } else {
          this.view = {
            ...this.view,
            offsetX: this.view.offsetX - event.deltaX,
            offsetY: this.view.offsetY - event.deltaY,
          };
          this.autoFit = false;
          this.scheduleRender();
        }
      },
      { passive: false },
    );
    this.el.stageWrap.addEventListener("dragover", (event) => this.onDragOver(event));
    this.el.stageWrap.addEventListener("dragleave", (event) => this.onDragLeave(event));
    this.el.stageWrap.addEventListener("drop", (event) => this.onDrop(event));
    window.addEventListener("keydown", (event) => this.onKeyDown(event));
    window.addEventListener("keyup", (event) => this.onKeyUp(event));
    window.addEventListener("blur", () => {
      this.space = false;
      this.altDown = false;
      this.updateCursor();
    });
    window.addEventListener("paste", (event) => this.onPaste(event));
  }
}

function formatAdjustment(key, value) {
  if (key === "blur") return String(Number(value));
  const rounded = Math.round(value);
  const signed = ["brightness", "contrast", "saturation", "hue"].includes(key);
  return signed && rounded > 0 ? `+${rounded}` : String(rounded);
}
