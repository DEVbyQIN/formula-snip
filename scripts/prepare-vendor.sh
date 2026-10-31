#!/bin/bash
# Copy the minimal MathJax runtime + font data into a web asset directory.
# Usage: scripts/prepare-vendor.sh [dest-dir]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:-$ROOT/app/web/vendor}"
FONTS=(newcm modern stix2 pagella fira tex)

rm -rf "$DEST"
mkdir -p "$DEST/mathjax" "$DEST/fonts"

cp "$ROOT/node_modules/mathjax/tex-svg-nofont.js" "$DEST/mathjax/"

for f in "${FONTS[@]}"; do
  src="$ROOT/node_modules/@mathjax/mathjax-$f-font"
  dst="$DEST/fonts/mathjax-$f-font"
  if [ ! -d "$src" ]; then
    echo "missing font package: $src" >&2
    exit 1
  fi
  mkdir -p "$dst"
  cp "$src/svg.js" "$dst/"
  if [ -d "$src/svg" ]; then
    cp -R "$src/svg" "$dst/"
  fi
  cp "$src/package.json" "$dst/"
done

# Keep upstream license text alongside the bundled code.
cp "$ROOT/node_modules/mathjax/LICENSE" "$DEST/mathjax/LICENSE" 2>/dev/null || true

echo "vendor ready: $DEST"
du -sh "$DEST"
