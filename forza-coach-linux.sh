#!/bin/sh
# Starts Forza! Coach on Linux: ./forza-coach-linux.sh (or double-click → Run).
cd "$(dirname "$0")/coach" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Forza! Coach needs Node.js 20 or newer: https://nodejs.org/en/download (or your package manager)."
  xdg-open "https://nodejs.org/en/download" >/dev/null 2>&1 || true
  exit 1
fi
# Install (or update) the few libraries Coach needs; a no-op when nothing changed.
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  npm ci --omit=dev --no-audit --no-fund || exit 1
fi
exec node server.mjs
