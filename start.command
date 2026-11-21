#!/usr/bin/env bash
# One-click launcher for Palette (macOS).
# Double-click this file in Finder to start the server and open the browser.
set -eu

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Palette needs Node.js 20 or newer, but 'node' was not found on PATH."
  echo "Install Node.js from https://nodejs.org/ and run this file again."
  echo
  echo "Press Return to close this window."
  read -r _ || true
  exit 1
fi

node scripts/serve.mjs --open
