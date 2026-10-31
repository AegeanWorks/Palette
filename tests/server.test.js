import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { isPublic, looksLikePalette, safePath, startServer } from "../scripts/serve.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

test("path resolution stays inside the project", () => {
  assert.ok(safePath("/", root).endsWith("index.html"));
  assert.ok(safePath("/src/ui/editor.js", root).endsWith("editor.js"));
  assert.equal(safePath("/../outside.txt", root), null);
  assert.equal(safePath("/%E0%A4%A", root), null);
  assert.equal(safePath("/bad%00name", root), null);
});

test("only the runtime tree is public", () => {
  assert.equal(isPublic(safePath("/index.html", root), root), true);
  assert.equal(isPublic(safePath("/src/ui/main.js", root), root), true);
  assert.equal(isPublic(safePath("/assets/favicon.svg", root), root), true);
  assert.equal(isPublic(safePath("/package.json", root), root), false);
  assert.equal(isPublic(safePath("/tests/ui.test.js", root), root), false);
});

test("the page marker detects Palette without matching other projects", () => {
  assert.equal(looksLikePalette("<title>Palette — a browser image editor</title>"), true);
  assert.equal(looksLikePalette("<title>Weft</title>"), false);
  assert.equal(looksLikePalette(null), false);
});

test("the server answers with the shell, module MIME and containment", async (t) => {
  const { server, url } = await startServer({ port: 0 });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const home = await fetch(url);
  assert.equal(home.status, 200);
  assert.match(home.headers.get("content-type"), /text\/html/);
  assert.match(await home.text(), /<title>Palette/);

  const module = await fetch(`${url}src/ui/main.js`);
  assert.equal(module.status, 200);
  assert.match(module.headers.get("content-type"), /text\/javascript/);
  assert.match(await module.text(), /PaletteEditor/);

  assert.equal((await fetch(`${url}package.json`)).status, 403);
  assert.equal((await fetch(`${url}assets/missing.png`)).status, 404);
});
