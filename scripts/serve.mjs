import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DEFAULT_PORT = 4176;
const TYPES = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
});

const PUBLIC_ENTRIES = Object.freeze(["index.html", "src", "assets"]);

export function browserCommand(platform, url) {
  if (platform === "win32") {
    return { command: "cmd", args: ["/c", "start", "", url] };
  }
  if (platform === "darwin") {
    return { command: "open", args: [url] };
  }
  return { command: "xdg-open", args: [url] };
}

export function looksLikePalette(body) {
  return typeof body === "string" && body.includes("<title>Palette");
}

export function safePath(urlPath = "/", base = root) {
  let clean;
  try {
    clean = decodeURIComponent(urlPath.split("?")[0]);
  } catch {
    return null;
  }
  if (clean.includes("\0")) return null;
  const relative =
    clean === "/" || clean === ""
      ? "index.html"
      : clean.replace(/^[/\\]+/, "").replace(/\\/g, "/");
  const candidate = normalize(join(base, relative));
  return candidate === base || candidate.startsWith(`${base}${sep}`) ? candidate : null;
}

export function isPublic(filePath, base = root) {
  const relative = normalize(filePath).slice(normalize(base).length + 1).replaceAll("\\", "/");
  return PUBLIC_ENTRIES.some(
    (entry) => relative === entry || relative.startsWith(`${entry}/`),
  );
}

async function handler(request, response) {
  const filePath = safePath(request.url ?? "/");
  if (!filePath || !isPublic(filePath)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" }).end("Forbidden");
    return;
  }
  try {
    const info = await stat(filePath);
    const target = info.isDirectory() ? join(filePath, "index.html") : filePath;
    const body = await readFile(target);
    response.writeHead(200, {
      "Content-Type": TYPES[extname(target)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
  }
}

export function startServer({ port = DEFAULT_PORT, host = "127.0.0.1" } = {}) {
  const server = createServer(handler);
  return new Promise((resolveStart, rejectStart) => {
    server.once("error", rejectStart);
    server.listen(port, host, () => {
      server.off("error", rejectStart);
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      resolveStart({ server, url: `http://${host}:${actualPort}/` });
    });
  });
}

function launchBrowser(url) {
  const { command, args } = browserCommand(process.platform, url);
  try {
    const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
    child.on("error", () => {});
    child.unref();
  } catch {
    // The address is still printed for a manual open.
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const open = process.argv.includes("--open");
  const portArg = process.argv.indexOf("--port");
  const requestedPort = portArg >= 0 ? Number(process.argv[portArg + 1]) : DEFAULT_PORT;
  const { server, url } = await startServer({ port: Number.isFinite(requestedPort) ? requestedPort : DEFAULT_PORT });
  console.log(`Palette is running at ${url}`);
  console.log("Press Ctrl+C to stop.");
  if (open) launchBrowser(url);
  const shutdown = () => server.close(() => process.exit(0));
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
