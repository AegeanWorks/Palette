#!/usr/bin/env node
/**
 * Palette's browser dogfood pass.
 *
 * Starts the static server, launches an installed Edge/Chrome headlessly, drives
 * the real UI through every major editing path, and fails on a page exception.
 * It skips cleanly when no Chromium browser is available.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "./serve.mjs";
import { MAX_PIXELS } from "../src/core/project.js";

const WINDOWS_BROWSERS = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];

const MAC_BROWSERS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];

function findBrowser(platform = process.platform, exists = existsSync) {
  if (platform === "win32") return WINDOWS_BROWSERS.find((path) => exists(path)) ?? null;
  if (platform === "darwin") return MAC_BROWSERS.find((path) => exists(path)) ?? null;
  for (const command of ["google-chrome", "chromium", "chromium-browser", "microsoft-edge"]) {
    const result = spawnSync("which", [command], { encoding: "utf8" });
    if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
  }
  return null;
}

function freePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createNetServer();
    server.once("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolvePort(port));
    });
  });
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForTarget(port, url, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = targets.find((target) => target.type === "page" && target.url.startsWith(url));
      if (page?.webSocketDebuggerUrl) return page;
    } catch {
      // The debugging endpoint is not listening yet.
    }
    await wait(200);
  }
  throw new Error("The browser did not expose a Palette page over CDP.");
}

async function connect(webSocketUrl) {
  const ws = new WebSocket(webSocketUrl);
  const pending = new Map();
  const errors = [];
  let nextId = 0;
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") {
      const details = message.params?.exceptionDetails;
      errors.push(details?.exception?.description ?? details?.text ?? "Uncaught exception");
    }
    if (message.method === "Log.entryAdded" && message.params?.entry?.level === "error") {
      errors.push(message.params.entry.text);
    }
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    }
  };
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  return {
    ws,
    errors,
    send(method, params = {}) {
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    async evaluate(expression) {
      const result = await this.send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result.value;
    },
  };
}

async function pointInDocument(connection, x, y) {
  return connection.evaluate(`(() => {
    const editor = globalThis.palette;
    const rect = document.getElementById('stage').getBoundingClientRect();
    return {
      x: rect.left + editor.view.offsetX + ${x} * editor.view.scale,
      y: rect.top + editor.view.offsetY + ${y} * editor.view.scale,
    };
  })()`);
}

async function drag(connection, from, to) {
  await connection.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: from.x,
    y: from.y,
    button: "left",
    buttons: 1,
    clickCount: 1,
  });
  for (let step = 1; step <= 6; step += 1) {
    await connection.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: from.x + ((to.x - from.x) * step) / 6,
      y: from.y + ((to.y - from.y) * step) / 6,
      button: "left",
      buttons: 1,
    });
    await wait(16);
  }
  await connection.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: to.x,
    y: to.y,
    button: "left",
    buttons: 0,
    clickCount: 1,
  });
  await wait(140);
}

async function editorState(connection) {
  return connection.evaluate(`(() => {
    const editor = globalThis.palette;
    const layer = editor.doc.layers.find((item) => item.id === editor.doc.activeLayerId);
    return {
      name: editor.doc.name,
      doc: [editor.doc.width, editor.doc.height],
      layers: editor.doc.layers.length,
      active: layer ? [layer.name, layer.visible] : null,
      tool: editor.tool,
      action: editor.action ? editor.action.type : null,
      undo: editor.history.canUndo,
      redo: editor.history.canRedo,
      scale: editor.view.scale,
      crop: editor.cropRect,
    };
  })()`);
}

async function main() {
  if (typeof WebSocket !== "function") {
    console.log("[SKIP] Palette dogfood needs Node.js 22+ with a global WebSocket client.");
    return 0;
  }
  const browser = findBrowser();
  if (!browser) {
    console.log("[SKIP] No Edge/Chrome found; install one to run the browser dogfood pass.");
    return 0;
  }

  const { server, url } = await startServer({ port: 0 });
  const debuggingPort = await freePort();
  const profile = mkdtempSync(join(tmpdir(), "palette-dogfood-"));
  const downloads = mkdtempSync(join(tmpdir(), "palette-downloads-"));
  const child = spawn(
    browser,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${profile}`,
      `--remote-debugging-port=${debuggingPort}`,
      url,
    ],
    { stdio: "ignore", windowsHide: true },
  );

  let connection = null;
  try {
    const target = await waitForTarget(debuggingPort, url);
    connection = await connect(target.webSocketDebuggerUrl);
    await connection.send("Page.enable");
    await connection.send("Runtime.enable");
    await connection.send("Log.enable");
    try {
      await connection.send("Browser.setDownloadBehavior", {
        behavior: "allow",
        downloadPath: downloads,
        eventsEnabled: true,
      });
    } catch {
      await connection.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: downloads });
    }
    await wait(1200);

    const initial = await connection.evaluate(`(() => {
      const editor = globalThis.palette;
      return {
        layers: document.querySelectorAll('.layer-item').length,
        tools: document.querySelectorAll('[data-tool]').length,
        name: editor?.doc?.name ?? null,
        size: editor ? [editor.doc.width, editor.doc.height] : null,
        undo: editor?.history?.canUndo ?? null,
      };
    })()`);
    if (initial.layers !== 3 || initial.tools !== 13 || initial.name !== "Welcome to Palette") {
      throw new Error(`The welcome document did not mount: ${JSON.stringify(initial)}`);
    }
    if (!initial.size || initial.size[0] !== 1280 || initial.size[1] !== 800 || initial.undo !== false) {
      throw new Error(`The welcome document state is wrong: ${JSON.stringify(initial)}`);
    }

    const histogramDrawn = await connection.evaluate(`(() => {
      const canvas = document.getElementById('histogram');
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      return data.some((value) => value > 0);
    })()`);
    if (!histogramDrawn) throw new Error("The luminance histogram did not render.");

    await connection.evaluate("globalThis.palette.selectLayer(globalThis.palette.doc.layers[0].id)");
    await wait(120);
    const autoBefore = await connection.evaluate(
      "globalThis.palette.doc.layers.find((layer) => layer.id === globalThis.palette.doc.activeLayerId).canvas.toDataURL()",
    );
    await connection.evaluate("document.getElementById('btn-auto-levels').click()");
    await wait(320);
    const auto = await connection.evaluate(`(() => {
      const editor = globalThis.palette;
      const layer = editor.doc.layers.find((item) => item.id === editor.doc.activeLayerId);
      return { undo: editor.history.canUndo, image: layer.canvas.toDataURL(), range: document.getElementById('histogram-range').textContent };
    })()`);
    if (!auto.undo || auto.image === autoBefore) {
      throw new Error(`Auto levels did not change the tonal layer: ${JSON.stringify({ ...auto, image: undefined })}`);
    }
    if (!/^\d+–\d+$/.test(auto.range)) throw new Error(`Histogram range is malformed: ${auto.range}`);
    await connection.evaluate("globalThis.palette.undo()");
    await wait(220);
    const autoRestored = await connection.evaluate(
      "globalThis.palette.doc.layers.find((layer) => layer.id === globalThis.palette.doc.activeLayerId).canvas.toDataURL() === " + JSON.stringify(autoBefore),
    );
    if (!autoRestored) throw new Error("Undo did not restore Auto levels.");
    await connection.evaluate("globalThis.palette.selectLayer(globalThis.palette.doc.layers[2].id)");
    await wait(120);

    await connection.evaluate(`document.querySelector('[data-tool="brush"]').click()`);
    const before = await connection.evaluate(
      "globalThis.palette.doc.layers.find((layer) => layer.id === globalThis.palette.doc.activeLayerId).canvas.toDataURL()",
    );
    await drag(connection, await pointInDocument(connection, 420, 320), await pointInDocument(connection, 620, 380));
    const painted = await connection.evaluate(`(() => {
      const editor = globalThis.palette;
      const layer = editor.doc.layers.find((item) => item.id === editor.doc.activeLayerId);
      return { undo: editor.history.canUndo, image: layer.canvas.toDataURL(), tool: editor.tool };
    })()`);
    if (!painted.undo || painted.image === before || painted.tool !== "brush") {
      throw new Error("The brush stroke did not reach the active layer or its history.");
    }
    await connection.evaluate("document.getElementById('btn-undo').click()");
    await wait(220);

    const beforeErase = await connection.evaluate(
      "globalThis.palette.doc.layers.find((layer) => layer.id === globalThis.palette.doc.activeLayerId).canvas.toDataURL()",
    );
    await connection.evaluate(`document.querySelector('[data-tool="eraser"]').click()`);
    await drag(connection, await pointInDocument(connection, 440, 330), await pointInDocument(connection, 560, 360));
    const erased = await connection.evaluate(`(() => {
      const editor = globalThis.palette;
      const layer = editor.doc.layers.find((item) => item.id === editor.doc.activeLayerId);
      return { undo: editor.history.canUndo, image: layer.canvas.toDataURL(), tool: editor.tool };
    })()`);
    if (!erased.undo || erased.image === beforeErase || erased.tool !== "eraser") {
      throw new Error("The eraser stroke did not commit.");
    }
    await connection.evaluate("globalThis.palette.undo()");
    await wait(160);

    const beforeMove = await connection.evaluate(
      "globalThis.palette.doc.layers.find((layer) => layer.id === globalThis.palette.doc.activeLayerId).canvas.toDataURL()",
    );
    await connection.evaluate(`document.querySelector('[data-tool="move"]').click()`);
    await drag(connection, await pointInDocument(connection, 600, 420), await pointInDocument(connection, 640, 460));
    const moved = await connection.evaluate(`(() => {
      const editor = globalThis.palette;
      const layer = editor.doc.layers.find((item) => item.id === editor.doc.activeLayerId);
      return { undo: editor.history.canUndo, image: layer.canvas.toDataURL(), tool: editor.tool };
    })()`);
    if (!moved.undo || moved.image === beforeMove || moved.tool !== "move") {
      throw new Error("The move tool did not commit.");
    }
    await connection.evaluate("globalThis.palette.undo()");
    await wait(160);

    await connection.evaluate(`document.querySelector('[data-tool="crop"]').click()`);
    await drag(connection, await pointInDocument(connection, 120, 120), await pointInDocument(connection, 520, 420));
    const cropReady = await connection.evaluate(
      "Boolean(globalThis.palette.cropRect) && !document.getElementById('crop-apply').disabled",
    );
    if (!cropReady) throw new Error("The crop marquee was not ready to apply.");
    await connection.evaluate("document.getElementById('crop-apply').click()");
    await wait(250);
    let state = await editorState(connection);
    if (state.doc[0] !== 400 || state.doc[1] !== 300 || !state.undo) {
      throw new Error(`Crop did not resize the document: ${JSON.stringify(state)}`);
    }
    await connection.evaluate("document.getElementById('btn-undo').click()");
    await wait(220);
    state = await editorState(connection);
    if (state.doc[0] !== 1280 || state.doc[1] !== 800) {
      throw new Error(`Undo did not restore the document size: ${JSON.stringify(state)}`);
    }

    await connection.evaluate(`(() => {
      const select = document.getElementById('crop-aspect');
      select.value = '1';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await drag(connection, await pointInDocument(connection, 120, 120), await pointInDocument(connection, 520, 300));
    const ratioReady = await connection.evaluate(
      "Boolean(globalThis.palette.cropRect) && globalThis.palette.cropRect.w === globalThis.palette.cropRect.h",
    );
    if (!ratioReady) throw new Error("The 1:1 crop marquee was not square.");
    await connection.evaluate("document.getElementById('crop-apply').click()");
    await wait(250);
    state = await editorState(connection);
    if (state.doc[0] !== 400 || state.doc[1] !== 400) {
      throw new Error(`The 1:1 crop did not produce a square: ${JSON.stringify(state)}`);
    }
    await connection.evaluate("document.getElementById('btn-undo').click()");
    await wait(220);
    await connection.evaluate(`(() => {
      const select = document.getElementById('crop-aspect');
      select.value = 'free';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    state = await editorState(connection);
    if (state.doc[0] !== 1280 || state.doc[1] !== 800) {
      throw new Error(`Undo did not restore the square crop: ${JSON.stringify(state)}`);
    }

    await connection.evaluate(`(() => {
      const input = document.getElementById('adj-brightness');
      input.value = '25';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await wait(220);
    const adjusted = await connection.evaluate(`(() => {
      const editor = globalThis.palette;
      const layer = editor.doc.layers.find((item) => item.id === editor.doc.activeLayerId);
      return { brightness: layer.adjustments.brightness, undo: editor.history.canUndo };
    })()`);
    if (adjusted.brightness !== 25 || !adjusted.undo) {
      throw new Error(`The adjustment did not reach the active layer: ${JSON.stringify(adjusted)}`);
    }
    await connection.evaluate("globalThis.palette.undo()");
    await wait(160);

    await connection.evaluate("document.getElementById('btn-layer-add').click()");
    await wait(180);
    let counts = await connection.evaluate(
      "[globalThis.palette.doc.layers.length, document.querySelectorAll('.layer-item').length]",
    );
    if (counts[0] !== 4 || counts[1] !== 4) throw new Error(`Layer add failed: ${JSON.stringify(counts)}`);
    await connection.evaluate("globalThis.palette.undo()");
    await wait(160);

    const placed = await connection.evaluate(`(async () => {
      const editor = globalThis.palette;
      const canvas = document.createElement('canvas');
      canvas.width = 120;
      canvas.height = 80;
      const context = canvas.getContext('2d');
      context.fillStyle = '#ff8800';
      context.fillRect(0, 0, 120, 80);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const file = new File([blob], 'placed.png', { type: 'image/png' });
      const before = editor.doc.layers.length;
      await editor.addImageLayer(file);
      const layer = editor.doc.layers.find((item) => item.id === editor.doc.activeLayerId);
      const pixel = layer.canvas.getContext('2d').getImageData(640, 400, 1, 1).data;
      return {
        before,
        after: editor.doc.layers.length,
        name: layer.name,
        pixel: [pixel[0], pixel[1], pixel[2], pixel[3]],
        undo: editor.history.canUndo,
      };
    })()`);
    if (placed.after !== placed.before + 1 || placed.name !== "placed" || !placed.undo) {
      throw new Error(`Image placement failed: ${JSON.stringify(placed)}`);
    }
    if (placed.pixel.join(",") !== "255,136,0,255") {
      throw new Error(`Placed image pixels are wrong: ${JSON.stringify(placed.pixel)}`);
    }
    await connection.evaluate("globalThis.palette.undo()");
    await wait(180);
    counts = await connection.evaluate(
      "[globalThis.palette.doc.layers.length, document.querySelectorAll('.layer-item').length]",
    );
    if (counts[0] !== 3 || counts[1] !== 3) throw new Error(`Placement undo failed: ${JSON.stringify(counts)}`);

    await connection.evaluate("document.getElementById('btn-layer-add').click()");
    await wait(160);
    await connection.evaluate("globalThis.palette.setColor('#22d3ee')");
    await connection.evaluate(`document.querySelector('[data-tool="gradient"]').click()`);
    await wait(60);
    await drag(connection, await pointInDocument(connection, 220, 400), await pointInDocument(connection, 1000, 400));
    const gradient = await connection.evaluate(`(() => {
      const editor = globalThis.palette;
      const layer = editor.doc.layers.find((item) => item.id === editor.doc.activeLayerId);
      const context = layer.canvas.getContext('2d');
      const left = context.getImageData(240, 400, 1, 1).data;
      const right = context.getImageData(980, 400, 1, 1).data;
      return {
        undo: editor.history.canUndo,
        left: [left[0], left[1], left[2], left[3]],
        right: [right[0], right[1], right[2], right[3]],
      };
    })()`);
    if (!gradient.undo || gradient.left[3] < 200 || gradient.right[3] > 60) {
      throw new Error(`Gradient fill is wrong: ${JSON.stringify(gradient)}`);
    }
    await connection.evaluate("globalThis.palette.undo()");
    await wait(160);
    await connection.evaluate("globalThis.palette.undo()");
    await wait(160);

    const lockFrame = await connection.evaluate(`(() => {
      const editor = globalThis.palette;
      const layer = editor.doc.layers.find((item) => item.id === editor.doc.activeLayerId);
      return { image: layer.canvas.toDataURL(), past: editor.history.past.length };
    })()`);
    await connection.evaluate("document.getElementById('btn-layer-lock').click()");
    await wait(180);
    const locked = await connection.evaluate(`(() => {
      const editor = globalThis.palette;
      const layer = editor.doc.layers.find((item) => item.id === editor.doc.activeLayerId);
      return {
        locked: layer.locked,
        pressed: document.getElementById('btn-layer-lock').getAttribute('aria-pressed'),
        disabled: document.getElementById('adj-brightness').disabled,
        past: editor.history.past.length,
      };
    })()`);
    if (!locked.locked || locked.pressed !== "true" || !locked.disabled) {
      throw new Error(`Layer lock did not apply: ${JSON.stringify(locked)}`);
    }
    await connection.evaluate(`document.querySelector('[data-tool="brush"]').click()`);
    await drag(connection, await pointInDocument(connection, 500, 300), await pointInDocument(connection, 600, 330));
    const blocked = await connection.evaluate(`(() => {
      const editor = globalThis.palette;
      const layer = editor.doc.layers.find((item) => item.id === editor.doc.activeLayerId);
      return {
        locked: layer.locked,
        image: layer.canvas.toDataURL(),
        past: editor.history.past.length,
        action: editor.action ? editor.action.type : null,
      };
    })()`);
    if (!blocked.locked || blocked.image !== lockFrame.image || blocked.past !== locked.past || blocked.action) {
      throw new Error(`Locked layer accepted a brush stroke: ${JSON.stringify({ ...blocked, image: undefined })}`);
    }
    await connection.evaluate("document.getElementById('btn-layer-lock').click()");
    await wait(180);
    const unlocked = await connection.evaluate(`(() => {
      const layer = globalThis.palette.doc.layers.find((item) => item.id === globalThis.palette.doc.activeLayerId);
      return {
        locked: layer.locked,
        pressed: document.getElementById('btn-layer-lock').getAttribute('aria-pressed'),
        disabled: document.getElementById('adj-brightness').disabled,
      };
    })()`);
    if (unlocked.locked || unlocked.pressed !== "false" || unlocked.disabled) {
      throw new Error(`Layer unlock did not restore editing: ${JSON.stringify(unlocked)}`);
    }

    await connection.evaluate("document.getElementById('btn-layer-add').click()");
    await wait(160);
    await connection.evaluate("globalThis.palette.setColor('#ff0000'); globalThis.palette.setTool('marquee')");
    await drag(connection, await pointInDocument(connection, 400, 300), await pointInDocument(connection, 800, 600));
    const selectionState = await connection.evaluate(`(() => {
      const editor = globalThis.palette;
      return { selection: editor.selection, tool: editor.tool };
    })()`);
    if (
      !selectionState.selection ||
      selectionState.selection.rect.w !== 400 ||
      selectionState.selection.rect.h !== 300 ||
      selectionState.selection.kind !== "rect"
    ) {
      throw new Error(`Marquee selection failed: ${JSON.stringify(selectionState)}`);
    }
    await connection.evaluate("globalThis.palette.setTool('brush')");
    await drag(connection, await pointInDocument(connection, 300, 450), await pointInDocument(connection, 900, 450));
    const clipped = await connection.evaluate(`(() => {
      const editor = globalThis.palette;
      const layer = editor.doc.layers.find((item) => item.id === editor.doc.activeLayerId);
      const context = layer.canvas.getContext('2d');
      const alpha = (x) => context.getImageData(x, 450, 1, 1).data[3];
      return { outsideLeft: alpha(350), inside: alpha(600), outsideRight: alpha(850), undo: editor.history.canUndo };
    })()`);
    if (!clipped.undo || clipped.outsideLeft !== 0 || clipped.outsideRight !== 0 || clipped.inside === 0) {
      throw new Error(`Brush did not respect the selection: ${JSON.stringify(clipped)}`);
    }
    await connection.evaluate("globalThis.palette.undo()");
    await wait(160);
    await connection.evaluate("document.getElementById('btn-invert-selection').click()");
    await wait(120);
    const invertedState = await connection.evaluate(`(() => ({
      invert: globalThis.palette.selection?.invert === true,
      pressed: document.getElementById('btn-invert-selection').getAttribute('aria-pressed'),
    }))()`);
    if (!invertedState.invert || invertedState.pressed !== "true") {
      throw new Error(`Selection invert did not apply: ${JSON.stringify(invertedState)}`);
    }
    await connection.evaluate("globalThis.palette.setTool('brush')");
    await drag(connection, await pointInDocument(connection, 300, 450), await pointInDocument(connection, 900, 450));
    const invertedClip = await connection.evaluate(`(() => {
      const editor = globalThis.palette;
      const layer = editor.doc.layers.find((item) => item.id === editor.doc.activeLayerId);
      const context = layer.canvas.getContext('2d');
      const alpha = (x) => context.getImageData(x, 450, 1, 1).data[3];
      return { outsideLeft: alpha(350), inside: alpha(600), outsideRight: alpha(850), undo: editor.history.canUndo };
    })()`);
    if (!invertedClip.undo || invertedClip.outsideLeft === 0 || invertedClip.inside !== 0 || invertedClip.outsideRight === 0) {
      throw new Error(`Inverted selection did not clip brush strokes: ${JSON.stringify(invertedClip)}`);
    }
    await connection.evaluate("globalThis.palette.undo()");
    await wait(160);
    await connection.evaluate("document.getElementById('btn-invert-selection').click()");
    await wait(100);
    const restoredInvert = await connection.evaluate(`(() => ({
      invert: globalThis.palette.selection?.invert === true,
      pressed: document.getElementById('btn-invert-selection').getAttribute('aria-pressed'),
    }))()`);
    if (restoredInvert.invert || restoredInvert.pressed !== "false") {
      throw new Error(`Selection invert did not toggle off: ${JSON.stringify(restoredInvert)}`);
    }
    await connection.evaluate("globalThis.palette.setTool('gradient')");
    await drag(connection, await pointInDocument(connection, 450, 450), await pointInDocument(connection, 750, 450));
    const clippedGradient = await connection.evaluate(`(() => {
      const editor = globalThis.palette;
      const layer = editor.doc.layers.find((item) => item.id === editor.doc.activeLayerId);
      const context = layer.canvas.getContext('2d');
      const alpha = (x) => context.getImageData(x, 450, 1, 1).data[3];
      return { outsideLeft: alpha(350), inside: alpha(600), outsideRight: alpha(850), undo: editor.history.canUndo };
    })()`);
    if (!clippedGradient.undo || clippedGradient.outsideLeft !== 0 || clippedGradient.outsideRight !== 0 || clippedGradient.inside === 0) {
      throw new Error(`Gradient did not respect the selection: ${JSON.stringify(clippedGradient)}`);
    }
    await connection.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))");
    await wait(180);
    const deleted = await connection.evaluate(`(() => {
      const editor = globalThis.palette;
      const layer = editor.doc.layers.find((item) => item.id === editor.doc.activeLayerId);
      const context = layer.canvas.getContext('2d');
      const alpha = (x) => context.getImageData(x, 450, 1, 1).data[3];
      return { outsideLeft: alpha(350), inside: alpha(600), outsideRight: alpha(850), undo: editor.history.canUndo };
    })()`);
    if (!deleted.undo || deleted.outsideLeft !== 0 || deleted.outsideRight !== 0 || deleted.inside !== 0) {
      throw new Error(`Delete did not clear only the selection: ${JSON.stringify(deleted)}`);
    }
    await connection.evaluate("globalThis.palette.undo()");
    await wait(160);
    const restored = await connection.evaluate(`(() => {
      const editor = globalThis.palette;
      const layer = editor.doc.layers.find((item) => item.id === editor.doc.activeLayerId);
      return layer.canvas.getContext('2d').getImageData(600, 450, 1, 1).data[3];
    })()`);
    if (restored === 0) throw new Error("Undo did not restore deleted selected pixels.");

    await connection.evaluate("globalThis.palette.setTool('move')");
    await drag(connection, await pointInDocument(connection, 600, 450), await pointInDocument(connection, 650, 500));
    const movedSelection = await connection.evaluate(`(() => {
      const editor = globalThis.palette;
      const layer = editor.doc.layers.find((item) => item.id === editor.doc.activeLayerId);
      const context = layer.canvas.getContext('2d');
      const alpha = (x, y) => context.getImageData(x, y, 1, 1).data[3];
      return {
        selection: editor.selection,
        originalArea: alpha(420, 450),
        movedArea: alpha(650, 500),
        outside: alpha(300, 450),
        undo: editor.history.canUndo,
      };
    })()`);
    if (
      !movedSelection.undo ||
      movedSelection.selection?.rect.x !== 450 ||
      movedSelection.selection?.rect.y !== 350 ||
      movedSelection.originalArea !== 0 ||
      movedSelection.movedArea === 0 ||
      movedSelection.outside !== 0
    ) {
      throw new Error(`Selected-pixel move failed: ${JSON.stringify(movedSelection)}`);
    }
    await connection.evaluate("globalThis.palette.undo()");
    await wait(180);
    const movedRestored = await connection.evaluate(`(() => {
      const editor = globalThis.palette;
      const layer = editor.doc.layers.find((item) => item.id === editor.doc.activeLayerId);
      const context = layer.canvas.getContext('2d');
      return { originalArea: context.getImageData(600, 450, 1, 1).data[3], undo: editor.history.canUndo };
    })()`);
    if (!movedRestored.undo || movedRestored.originalArea === 0) {
      throw new Error("Undo did not restore the selected-pixel move.");
    }

    await connection.evaluate("globalThis.palette.undo()");
    await wait(160);
    await connection.evaluate("globalThis.palette.undo()");
    await wait(180);
    await connection.evaluate("document.getElementById('btn-select-all').click()");
    await wait(80);
    const selectedAll = await connection.evaluate(
      "Boolean(globalThis.palette.selection) && globalThis.palette.selection.rect.w === 1280 && globalThis.palette.selection.rect.h === 800",
    );
    await connection.evaluate("document.getElementById('btn-deselect').click()");
    await wait(80);
    const deselected = await connection.evaluate("globalThis.palette.selection === null");
    if (!selectedAll || !deselected) throw new Error("Select all / Deselect buttons failed.");
    if ((await connection.evaluate("globalThis.palette.doc.layers.length")) !== 3) {
      throw new Error("Selection cleanup did not restore the layer stack.");
    }

    await connection.evaluate("globalThis.palette.selectLayer(globalThis.palette.doc.layers[2].id)");
    await wait(80);
    const originalLayerImage = await connection.evaluate(
      "globalThis.palette.doc.layers.find((layer) => layer.id === globalThis.palette.doc.activeLayerId).canvas.toDataURL()",
    );
    const sample = await connection.evaluate(`(() => {
      const editor = globalThis.palette;
      const layer = editor.doc.layers.find((item) => item.id === editor.doc.activeLayerId);
      const data = layer.canvas.getContext('2d').getImageData(0, 0, layer.canvas.width, layer.canvas.height).data;
      for (let index = 3; index < data.length; index += 4) {
        if (data[index] > 0) {
          const pixel = (index - 3) / 4;
          return { x: pixel % layer.canvas.width, y: Math.floor(pixel / layer.canvas.width) };
        }
      }
      return null;
    })()`);
    if (!sample) throw new Error("The clipboard fixture layer has no visible pixels.");

    await connection.evaluate("globalThis.palette.copySelection()");
    const copied = await connection.evaluate(`(() => {
      const editor = globalThis.palette;
      return { width: editor.clipboard?.width, height: editor.clipboard?.height, pasteDisabled: document.getElementById('btn-paste').disabled, undo: editor.history.canUndo };
    })()`);
    if (copied.width !== 1280 || copied.height !== 800 || copied.pasteDisabled) {
      throw new Error(`Copy did not fill the clipboard: ${JSON.stringify(copied)}`);
    }
    await connection.evaluate("globalThis.palette.pasteClipboard()");
    await wait(200);
    let clipboardState = await connection.evaluate(`(() => {
      const editor = globalThis.palette;
      const layer = editor.doc.layers.find((item) => item.id === editor.doc.activeLayerId);
      return { layers: editor.doc.layers.length, name: layer?.name, image: layer?.canvas.toDataURL(), undo: editor.history.canUndo };
    })()`);
    if (clipboardState.layers !== 4 || clipboardState.name !== "Pasted" || clipboardState.image !== originalLayerImage || !clipboardState.undo) {
      throw new Error(`Paste failed: ${JSON.stringify({ ...clipboardState, image: undefined })}`);
    }
    await connection.evaluate("globalThis.palette.undo()");
    await wait(180);

    await connection.evaluate("globalThis.palette.layerViaCopy()");
    await wait(200);
    clipboardState = await connection.evaluate(`(() => {
      const editor = globalThis.palette;
      const layer = editor.doc.layers.find((item) => item.id === editor.doc.activeLayerId);
      return { layers: editor.doc.layers.length, name: layer?.name, image: layer?.canvas.toDataURL(), undo: editor.history.canUndo };
    })()`);
    if (clipboardState.layers !== 4 || clipboardState.name !== "Welcome type copy" || clipboardState.image !== originalLayerImage || !clipboardState.undo) {
      throw new Error(`Layer via copy failed: ${JSON.stringify({ ...clipboardState, image: undefined })}`);
    }
    await connection.evaluate("globalThis.palette.undo()");
    await wait(180);

    await connection.evaluate("globalThis.palette.layerViaCut()");
    await wait(200);
    clipboardState = await connection.evaluate(`(() => {
      const editor = globalThis.palette;
      const layer = editor.doc.layers.find((item) => item.id === editor.doc.activeLayerId);
      const source = editor.doc.layers[2];
      const sampleAlpha = source.canvas.getContext('2d').getImageData(${sample.x}, ${sample.y}, 1, 1).data[3];
      return { layers: editor.doc.layers.length, name: layer?.name, image: layer?.canvas.toDataURL(), sampleAlpha, undo: editor.history.canUndo };
    })()`);
    if (clipboardState.layers !== 4 || clipboardState.name !== "Welcome type cut" || clipboardState.image !== originalLayerImage || clipboardState.sampleAlpha !== 0 || !clipboardState.undo) {
      throw new Error(`Layer via cut failed: ${JSON.stringify({ ...clipboardState, image: undefined })}`);
    }
    await connection.evaluate("globalThis.palette.undo()");
    await wait(200);
    const cutRestored = await connection.evaluate(
      "globalThis.palette.doc.layers[2].canvas.toDataURL() === " + JSON.stringify(originalLayerImage),
    );
    if (!cutRestored) throw new Error("Undo did not restore the source after layer via cut.");

    await connection.evaluate("globalThis.palette.cutSelection()");
    await wait(200);
    clipboardState = await connection.evaluate(`(() => {
      const editor = globalThis.palette;
      const layer = editor.doc.layers.find((item) => item.id === editor.doc.activeLayerId);
      const sampleAlpha = layer.canvas.getContext('2d').getImageData(${sample.x}, ${sample.y}, 1, 1).data[3];
      return { layers: editor.doc.layers.length, sampleAlpha, undo: editor.history.canUndo };
    })()`);
    if (clipboardState.layers !== 3 || clipboardState.sampleAlpha !== 0 || !clipboardState.undo) {
      throw new Error(`Cut selection failed: ${JSON.stringify(clipboardState)}`);
    }
    await connection.evaluate("globalThis.palette.undo()");
    await wait(200);
    const cutLayerRestored = await connection.evaluate(
      "globalThis.palette.doc.layers.find((layer) => layer.id === globalThis.palette.doc.activeLayerId).canvas.toDataURL() === " + JSON.stringify(originalLayerImage),
    );
    if (!cutLayerRestored) throw new Error("Undo did not restore the cut source.");

    await connection.evaluate("document.getElementById('btn-flatten').click()");
    await wait(260);
    let flattenState = await connection.evaluate(`(() => {
      const editor = globalThis.palette;
      return {
        layers: editor.doc.layers.length,
        name: editor.doc.layers[0]?.name,
        undo: editor.history.canUndo,
      };
    })()`);
    if (flattenState.layers !== 1 || flattenState.name !== "Flattened" || !flattenState.undo) {
      throw new Error(`Flatten failed: ${JSON.stringify(flattenState)}`);
    }
    await connection.evaluate("globalThis.palette.undo()");
    await wait(220);
    flattenState = await connection.evaluate("globalThis.palette.doc.layers.length");
    if (flattenState !== 3) throw new Error("Undo did not restore the flattened layers.");

    const levelsBefore = await connection.evaluate(
      "globalThis.palette.doc.layers.find((layer) => layer.id === globalThis.palette.doc.activeLayerId).canvas.toDataURL()",
    );
    await connection.evaluate(`(() => {
      document.getElementById('level-black').value = '64';
      document.getElementById('level-white').value = '192';
      document.getElementById('level-gamma').value = '1.5';
      document.getElementById('btn-filter-levels').click();
    })()`);
    await wait(260);
    const levelsState = await connection.evaluate(`(() => {
      const editor = globalThis.palette;
      const layer = editor.doc.layers.find((item) => item.id === editor.doc.activeLayerId);
      return { undo: editor.history.canUndo, image: layer.canvas.toDataURL() };
    })()`);
    if (!levelsState.undo || levelsState.image === levelsBefore) {
      throw new Error("Levels did not change the active layer.");
    }
    await connection.evaluate("globalThis.palette.undo()");
    await wait(200);
    const levelsRestored = await connection.evaluate(
      "globalThis.palette.doc.layers.find((layer) => layer.id === globalThis.palette.doc.activeLayerId).canvas.toDataURL() === " + JSON.stringify(levelsBefore),
    );
    if (!levelsRestored) throw new Error("Undo did not restore the Levels edit.");

    const normalFrame = await connection.evaluate("document.getElementById('stage').toDataURL()");
    await connection.evaluate(`(() => {
      const select = document.getElementById('layer-blend');
      select.value = 'multiply';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await wait(220);
    let blendState = await connection.evaluate(`(() => {
      const editor = globalThis.palette;
      const layer = editor.doc.layers.find((item) => item.id === editor.doc.activeLayerId);
      return {
        mode: layer.blendMode,
        undo: editor.history.canUndo,
        frame: document.getElementById('stage').toDataURL(),
      };
    })()`);
    if (blendState.mode !== "multiply" || !blendState.undo || blendState.frame === normalFrame) {
      throw new Error(`Layer blend mode did not change the composite: ${JSON.stringify({ ...blendState, frame: undefined })}`);
    }
    await connection.evaluate("globalThis.palette.undo()");
    await wait(200);
    blendState = await connection.evaluate(`(() => {
      const editor = globalThis.palette;
      const layer = editor.doc.layers.find((item) => item.id === editor.doc.activeLayerId);
      return { mode: layer.blendMode, frame: document.getElementById('stage').toDataURL() };
    })()`);
    if (blendState.mode !== "normal" || blendState.frame !== normalFrame) {
      throw new Error("Undo did not restore the blend mode and composite.");
    }

    const beforeLowerBlend = await connection.evaluate("document.getElementById('stage').toDataURL()");
    await connection.evaluate(`(() => {
      const editor = globalThis.palette;
      editor.selectLayer(editor.doc.layers[1].id);
      const select = document.getElementById('layer-blend');
      select.value = 'screen';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await wait(220);
    const lowerBlended = await connection.evaluate(`(() => {
      const editor = globalThis.palette;
      const layer = editor.doc.layers[1];
      return { mode: layer.blendMode, frame: document.getElementById('stage').toDataURL() };
    })()`);
    if (lowerBlended.mode !== "screen" || lowerBlended.frame === beforeLowerBlend) {
      throw new Error("The lower layer blend mode did not change the composite.");
    }

    await connection.evaluate("globalThis.palette.selectLayer(globalThis.palette.doc.layers[2].id)");
    await wait(80);
    const beforeMerge = await connection.evaluate("document.getElementById('stage').toDataURL()");
    await connection.evaluate("document.getElementById('btn-layer-merge').click()");
    await wait(260);
    let mergeState = await connection.evaluate(`(() => {
      const editor = globalThis.palette;
      const layer = editor.doc.layers.find((item) => item.id === editor.doc.activeLayerId);
      return {
        layers: editor.doc.layers.length,
        undo: editor.history.canUndo,
        active: layer?.name ?? null,
        blend: layer?.blendMode ?? null,
        frame: document.getElementById('stage').toDataURL(),
      };
    })()`);
    if (mergeState.layers !== 2 || !mergeState.undo || mergeState.active !== "Aegean ripple") {
      throw new Error(`Merge down did not apply: ${JSON.stringify({ ...mergeState, frame: undefined })}`);
    }
    if (mergeState.blend !== "screen") {
      throw new Error(`Merge down dropped the lower blend mode: ${mergeState.blend}`);
    }
    if (mergeState.frame === beforeMerge) throw new Error("Merge down did not change the composite.");
    await connection.evaluate("globalThis.palette.undo()");
    await wait(240);
    mergeState = await connection.evaluate(`(() => ({
      layers: globalThis.palette.doc.layers.length,
      frame: document.getElementById('stage').toDataURL(),
    }))()`);
    if (mergeState.layers !== 3 || mergeState.frame !== beforeMerge) {
      throw new Error("Undo did not restore the merged layers and composite.");
    }
    await connection.evaluate("globalThis.palette.undo()");
    await wait(240);
    const afterLowerUndo = await connection.evaluate(`(() => {
      const editor = globalThis.palette;
      return {
        blend: editor.doc.layers[1].blendMode,
        frame: document.getElementById('stage').toDataURL(),
      };
    })()`);
    if (afterLowerUndo.blend !== "normal" || afterLowerUndo.frame !== beforeLowerBlend) {
      throw new Error("Undo did not restore the lower blend mode and composite.");
    }

    await connection.evaluate(`document.querySelector('[data-tool="rect"]').click()`);
    await wait(80);
    await drag(connection, await pointInDocument(connection, 240, 240), await pointInDocument(connection, 420, 340));
    state = await editorState(connection);
    if (!state.undo || state.tool !== "rect") {
      throw new Error(`The rectangle tool did not commit: ${JSON.stringify(state)}`);
    }
    await connection.evaluate("globalThis.palette.undo()");
    await wait(160);

    await connection.evaluate(`document.querySelector('[data-tool="text"]').click()`);
    const textPoint = await pointInDocument(connection, 160, 160);
    await connection.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: textPoint.x,
      y: textPoint.y,
      button: "left",
      buttons: 1,
      clickCount: 1,
    });
    await connection.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: textPoint.x,
      y: textPoint.y,
      button: "left",
      buttons: 0,
      clickCount: 1,
    });
    await wait(160);
    if (!(await connection.evaluate("!document.getElementById('text-editor').hidden"))) {
      throw new Error("The text editor did not open.");
    }
    await connection.evaluate(`(() => {
      const input = document.getElementById('text-input');
      input.value = 'Dogfood';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('text-commit').click();
    })()`);
    await wait(220);
    const texted = await connection.evaluate(
      "globalThis.palette.history.canUndo && document.getElementById('text-editor').hidden",
    );
    if (!texted) throw new Error("The text tool did not rasterise the label.");
    await connection.evaluate("globalThis.palette.undo()");
    await wait(160);

    await connection.evaluate("globalThis.palette.setTool('text')");
    const awayPoint = await pointInDocument(connection, 320, 240);
    for (const type of ["mousePressed", "mouseReleased"]) {
      await connection.send("Input.dispatchMouseEvent", {
        type,
        x: awayPoint.x,
        y: awayPoint.y,
        button: "left",
        buttons: type === "mousePressed" ? 1 : 0,
        clickCount: 1,
      });
    }
    await wait(160);
    await connection.evaluate(`(() => {
      const input = document.getElementById('text-input');
      input.value = 'Away';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      globalThis.palette.setTool('move');
    })()`);
    const awayTarget = await pointInDocument(connection, 640, 420);
    for (const type of ["mousePressed", "mouseReleased"]) {
      await connection.send("Input.dispatchMouseEvent", {
        type,
        x: awayTarget.x,
        y: awayTarget.y,
        button: "left",
        buttons: type === "mousePressed" ? 1 : 0,
        clickCount: 1,
      });
    }
    await wait(220);
    const clickAway = await connection.evaluate(`(() => ({
      draft: globalThis.palette.textDraft,
      hidden: document.getElementById('text-editor').hidden,
      label: globalThis.palette.history.undoLabel,
    }))()`);
    if (clickAway.draft !== null || !clickAway.hidden || clickAway.label !== "Add text") {
      throw new Error(`Clicking away did not commit the text draft: ${JSON.stringify(clickAway)}`);
    }
    await connection.evaluate("globalThis.palette.undo()");
    await wait(160);

    await connection.evaluate("document.getElementById('btn-filter-sharpen').click()");
    await wait(220);
    if (!(await connection.evaluate("globalThis.palette.history.canUndo"))) {
      throw new Error("The sharpen filter did not commit.");
    }
    await connection.evaluate("globalThis.palette.undo()");
    await wait(160);

    await connection.evaluate("document.getElementById('btn-resize').click()");
    await wait(120);
    await connection.evaluate(`(() => {
      document.getElementById('resize-width').value = '640';
      document.getElementById('resize-height').value = '400';
      document.getElementById('resize-form').requestSubmit();
    })()`);
    await wait(260);
    state = await editorState(connection);
    if (state.doc[0] !== 640 || state.doc[1] !== 400 || !state.undo) {
      throw new Error(`Resize did not apply: ${JSON.stringify(state)}`);
    }
    await connection.evaluate("globalThis.palette.undo()");
    await wait(220);
    state = await editorState(connection);
    if (state.doc[0] !== 1280 || state.doc[1] !== 800) {
      throw new Error(`Undo did not restore the resized document: ${JSON.stringify(state)}`);
    }

    await connection.evaluate("document.getElementById('btn-resize').click()");
    await wait(120);
    await connection.evaluate(`(() => {
      document.getElementById('resize-width').value = '5000';
      document.getElementById('resize-height').value = '5000';
      document.getElementById('resize-form').requestSubmit();
    })()`);
    await wait(900);
    const capped = await editorState(connection);
    if (capped.doc[0] * capped.doc[1] > MAX_PIXELS) {
      throw new Error(`Resize exceeded the pixel budget: ${JSON.stringify(capped.doc)}`);
    }
    await connection.evaluate("globalThis.palette.undo()");
    await wait(400);
    state = await editorState(connection);
    if (state.doc[0] !== 1280 || state.doc[1] !== 800) {
      throw new Error(`Undo did not restore the capped resize: ${JSON.stringify(state)}`);
    }

    const anchorPixel = await connection.evaluate(`(() => {
      const layer = globalThis.palette.doc.layers[0];
      const data = layer.canvas.getContext('2d').getImageData(640, 400, 1, 1).data;
      return [data[0], data[1], data[2], data[3]];
    })()`);
    await connection.evaluate("document.getElementById('btn-canvas-size').click()");
    await wait(120);
    await connection.evaluate(`(() => {
      document.getElementById('canvas-width').value = '1600';
      document.getElementById('canvas-height').value = '1000';
      document.querySelector('input[name="canvas-anchor"][value="center"]').checked = true;
      document.getElementById('canvas-form').requestSubmit();
    })()`);
    await wait(260);
    state = await editorState(connection);
    if (state.doc[0] !== 1600 || state.doc[1] !== 1000) {
      throw new Error(`Canvas size did not apply: ${JSON.stringify(state)}`);
    }
    const shiftedPixel = await connection.evaluate(`(() => {
      const layer = globalThis.palette.doc.layers[0];
      const data = layer.canvas.getContext('2d').getImageData(800, 500, 1, 1).data;
      return [data[0], data[1], data[2], data[3]];
    })()`);
    if (JSON.stringify(shiftedPixel) !== JSON.stringify(anchorPixel)) {
      throw new Error(`Canvas anchor did not place the old art correctly: ${JSON.stringify({ anchorPixel, shiftedPixel })}`);
    }
    await connection.evaluate("globalThis.palette.undo()");
    await wait(240);
    state = await editorState(connection);
    if (state.doc[0] !== 1280 || state.doc[1] !== 800) {
      throw new Error(`Undo did not restore the canvas size: ${JSON.stringify(state)}`);
    }

    await connection.evaluate("globalThis.palette.selectLayer(globalThis.palette.doc.layers[0].id)");
    const transformBefore = await connection.evaluate(`(() => {
      const layer = globalThis.palette.doc.layers[0];
      const context = layer.canvas.getContext('2d');
      return {
        corner: context.getImageData(10, 10, 1, 1).data[3],
        center: context.getImageData(640, 400, 1, 1).data[3],
      };
    })()`);
    await connection.evaluate("document.getElementById('btn-transform').click()");
    await wait(120);
    await connection.evaluate(`(() => {
      document.getElementById('transform-scale-x').value = '50';
      document.getElementById('transform-scale-y').value = '50';
      document.getElementById('transform-rotation').value = '0';
      document.getElementById('transform-form').requestSubmit();
    })()`);
    await wait(300);
    const transformed = await connection.evaluate(`(() => {
      const editor = globalThis.palette;
      const layer = editor.doc.layers[0];
      const context = layer.canvas.getContext('2d');
      return {
        doc: [editor.doc.width, editor.doc.height],
        corner: context.getImageData(10, 10, 1, 1).data[3],
        center: context.getImageData(640, 400, 1, 1).data[3],
        undo: editor.history.canUndo,
      };
    })()`);
    if (
      transformed.doc[0] !== 1280 ||
      transformed.doc[1] !== 800 ||
      transformed.corner !== 0 ||
      transformed.center === 0 ||
      !transformed.undo
    ) {
      throw new Error(`Layer transform failed: ${JSON.stringify({ transformBefore, transformed })}`);
    }
    await connection.evaluate("globalThis.palette.undo()");
    await wait(240);
    const transformRestored = await connection.evaluate(`(() => {
      const layer = globalThis.palette.doc.layers[0];
      return layer.canvas.getContext('2d').getImageData(10, 10, 1, 1).data[3];
    })()`);
    if (transformRestored === 0) throw new Error("Undo did not restore the transformed layer.");

    const scaleBefore = await connection.evaluate("globalThis.palette.view.scale");
    await connection.evaluate("document.getElementById('btn-zoom-in').click()");
    await wait(120);
    const scaleAfter = await connection.evaluate("globalThis.palette.view.scale");
    if (!(scaleAfter > scaleBefore)) throw new Error("Zoom in did not increase the view scale.");
    await connection.evaluate("document.getElementById('btn-fit').click()");
    await wait(120);

    await connection.evaluate("document.getElementById('btn-export').click()");
    await wait(120);
    const exportOpen = await connection.evaluate(
      "document.getElementById('export-dialog').open && document.getElementById('export-size').textContent.includes('1280')",
    );
    if (!exportOpen) throw new Error("The export dialog did not open with the document size.");
    await connection.evaluate("document.getElementById('export-confirm').click()");
    await wait(900);
    const exported = readdirSync(downloads).find((name) => name.endsWith(".png"));
    if (!exported || statSync(join(downloads, exported)).size <= 0) {
      const diagnostics = await connection.evaluate(`(() => ({
        openDialogs: [...document.querySelectorAll('dialog[open]')].map((dialog) => dialog.id),
        exportOpen: document.getElementById('export-dialog').open,
        exportSize: document.getElementById('export-size').textContent,
        message: document.getElementById('status-message').textContent,
        autosave: document.getElementById('status-autosave').textContent,
      }))()`);
      throw new Error(`The PNG export did not download a non-empty file: ${JSON.stringify({ diagnostics, files: readdirSync(downloads), errors: connection.errors })}`);
    }
    await connection.evaluate("document.getElementById('btn-export').click()");
    await wait(120);
    await connection.evaluate(`(() => {
      document.getElementById('export-name').value = 'Half';
      const scale = document.getElementById('export-scale');
      scale.value = '0.5';
      scale.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('export-confirm').click();
    })()`);
    await wait(900);
    const halfExport = readdirSync(downloads).find((name) => name.startsWith("Half") && name.endsWith(".png"));
    if (!halfExport) throw new Error("The scaled export did not download.");
    const halfBuffer = readFileSync(join(downloads, halfExport));
    const halfWidth = halfBuffer.readUInt32BE(16);
    const halfHeight = halfBuffer.readUInt32BE(20);
    if (halfWidth !== 640 || halfHeight !== 400) {
      throw new Error(`Scaled export is ${halfWidth} × ${halfHeight}, expected 640 × 400.`);
    }
    if (!(await connection.evaluate("globalThis.palette.documentDirty"))) {
      throw new Error("Edits did not mark the document as unsaved.");
    }
    await connection.evaluate("document.getElementById('btn-save').click()");
    await wait(900);
    if (await connection.evaluate("globalThis.palette.documentDirty")) {
      throw new Error("Saving the project did not clear the unsaved flag.");
    }
    const saved = readdirSync(downloads).find((name) => name.endsWith(".palette"));
    if (!saved) throw new Error("The project save did not download a .palette file.");
    const project = JSON.parse(readFileSync(join(downloads, saved), "utf8"));
    if (project.format !== "palette-project" || project.layers.length !== 3) {
      throw new Error("The saved project is missing its layers.");
    }

    await connection.evaluate("document.getElementById('btn-help').click()");
    await wait(80);
    if (!(await connection.evaluate("document.getElementById('help-dialog').open"))) {
      throw new Error("The shortcuts dialog did not open.");
    }
    await connection.evaluate("document.getElementById('help-close').click()");

    await connection.evaluate("globalThis.palette.setDocumentName('Autosave Check'); globalThis.palette.addNewLayer()");
    const readRecordExpression = `(async () => {
      const record = await new Promise((resolve, reject) => {
        const open = indexedDB.open('palette-autosave');
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('sessions', 'readonly');
          const request = tx.objectStore('sessions').get('latest');
          request.onsuccess = () => resolve(request.result ?? null);
          request.onerror = () => reject(request.error);
        };
        open.onerror = () => reject(open.error);
      });
      return record ? { name: record.name, layers: record.layers?.length, savedAt: record.savedAt, active: record.activeLayerId } : null;
    })()`;
    let savedRecord = null;
    for (let attempt = 0; attempt < 15; attempt += 1) {
      await wait(400);
      savedRecord = await connection.evaluate(readRecordExpression);
      if (savedRecord?.name === "Autosave Check" && savedRecord.layers === 4) break;
    }
    if (savedRecord?.name !== "Autosave Check" || savedRecord.layers !== 4) {
      throw new Error(`Autosave record did not reach the forced state: ${JSON.stringify(savedRecord)}`);
    }
    const signatureExpression = `(() => {
      const editor = globalThis.palette;
      return {
        name: editor.doc.name,
        active: editor.doc.activeLayerId,
        layers: editor.doc.layers.map((layer) => {
          const data = layer.canvas.getContext('2d').getImageData(640, 400, 1, 1).data;
          return {
            name: layer.name,
            visible: layer.visible,
            opacity: layer.opacity,
            blendMode: layer.blendMode,
            locked: layer.locked,
            pixel: [data[0], data[1], data[2], data[3]],
          };
        }),
      };
    })()`;
    const beforeReload = await connection.evaluate(signatureExpression);
    await connection.send("Page.reload", { ignoreCache: true });
    let restoreOpen = false;
    for (let attempt = 0; attempt < 15; attempt += 1) {
      await wait(400);
      restoreOpen = await connection.evaluate("document.getElementById('restore-dialog')?.open ?? false");
      if (restoreOpen) break;
    }
    if (!restoreOpen) throw new Error("The autosave restore dialog did not appear after reload.");
    const restoreRecord = await connection.evaluate(readRecordExpression);
    const restoreSummary = await connection.evaluate("document.getElementById('restore-summary').textContent");
    if (restoreRecord?.name !== "Autosave Check" || restoreRecord.layers !== 4) {
      throw new Error(
        `The autosave record changed during reload: ${JSON.stringify({ restoreRecord, restoreSummary })}`,
      );
    }
    await connection.evaluate("document.getElementById('restore-confirm').click()");
    await wait(1800);
    const afterRestore = await connection.evaluate(signatureExpression);
    if (JSON.stringify(afterRestore) !== JSON.stringify(beforeReload)) {
      const diagnostics = await connection.evaluate(`(() => ({
        status: document.getElementById('status-autosave').textContent,
        message: document.getElementById('status-message').textContent,
        dialogOpen: document.getElementById('restore-dialog').open,
        pending: Boolean(globalThis.palette?.pendingRestore),
      }))()`);
      throw new Error(
        `Autosave restore did not match the saved document: ${JSON.stringify({
          beforeReload,
          afterRestore,
          restoreRecord,
          restoreSummary,
          diagnostics,
          errors: connection.errors,
        })}`,
      );
    }
    const restoredStatus = await connection.evaluate("document.getElementById('status-autosave').textContent");
    if (!restoredStatus.includes("Saved locally")) {
      throw new Error(`Restored autosave status is wrong: ${restoredStatus}`);
    }

    if (connection.errors.length) {
      throw new Error(`The page reported an error: ${connection.errors[0]}`);
    }

    console.log(
      "[OK] Palette dogfood: layers, blend modes, merge-down blend retention, image placement, gradients, layer locking, marquee selection/invert, clipboard, layer via copy/cut, autosave reload/restore, crop ratios, flatten, canvas size, layer transform, histogram/auto levels, levels, brush, eraser, move, undo, crop, adjustments, shapes, text, filters, resize, zoom, scaled export, project save and dialogs.",
    );
    return 0;
  } catch (error) {
    console.error(`[FAIL] Palette dogfood: ${error.message}`);
    console.error("Fix: run `npm start`, open the editor, and check the browser console.");
    return 1;
  } finally {
    connection?.ws.close();
    if (process.platform === "win32" && child.pid) {
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    } else {
      child.kill("SIGTERM");
    }
    await new Promise((resolveClose) => server.close(resolveClose));
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
      rmSync(downloads, { recursive: true, force: true, maxRetries: 5 });
    } catch {
      // A lingering browser lock is harmless.
    }
  }
}

process.exitCode = await main();
