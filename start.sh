#!/usr/bin/env sh
# One-click launcher for Palette (Linux / macOS terminal).
# Starts the local server and opens the default browser.
set -eu

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Palette needs Node.js 20 or newer, but 'node' was not found on PATH."
  echo "Install Node.js from https://nodejs.org/ and run this file again."
  exit 1
fi

exec node scripts/serve.mjs --open
