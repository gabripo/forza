#!/bin/bash
# Double-click to start Forza! Coach on macOS (first time: right-click → Open).
cd "$(dirname "$0")/coach" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Forza! Coach needs Node.js (free). Opening https://nodejs.org …"
  open "https://nodejs.org/en/download"
  read -r -p "Install the LTS version, then double-click this file again. Press Enter to close. "
  exit 1
fi
# Install (or update) the few libraries Coach needs; a no-op when nothing changed.
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  npm ci --omit=dev --no-audit --no-fund || { read -r -p "Installation failed. Press Enter to close. "; exit 1; }
fi
node server.mjs
