#!/bin/bash
# Build the Electron desktop version (macOS now; Windows target configured too).
# Usage: scripts/build-electron.sh [extra electron-builder args]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -f "$ROOT/app/web/vendor/mathjax/tex-svg-nofont.js" ]; then
  "$ROOT/scripts/prepare-vendor.sh" "$ROOT/app/web/vendor"
fi

if [ "$#" -eq 0 ]; then
  set -- --mac dmg zip
fi
exec npx electron-builder "$@"
