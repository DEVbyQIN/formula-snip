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

# Optional TeX extensions used by some snippets (\ce, \cancel, …).
# The component loader resolves [tex]/... to [mathjax]/input/tex/extensions.
if [ -d "$ROOT/node_modules/mathjax/input/tex/extensions" ]; then
  mkdir -p "$DEST/mathjax/input/tex"
  cp -R "$ROOT/node_modules/mathjax/input/tex/extensions" "$DEST/mathjax/input/tex/"
fi

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

# The mhchem TeX extension needs its matching font extension (\ce, \pu).
if [ -d "$ROOT/node_modules/@mathjax/mathjax-mhchem-font-extension" ]; then
  dst="$DEST/fonts/mathjax-mhchem-font-extension"
  mkdir -p "$dst"
  cp "$ROOT/node_modules/@mathjax/mathjax-mhchem-font-extension/svg.js" "$dst/"
  cp "$ROOT/node_modules/@mathjax/mathjax-mhchem-font-extension/package.json" "$dst/"
fi

# Keep upstream license text alongside the bundled code.
cp "$ROOT/node_modules/mathjax/LICENSE" "$DEST/mathjax/LICENSE" 2>/dev/null || true

echo "vendor ready: $DEST"
if command -v du >/dev/null 2>&1; then
  du -sh "$DEST"
fi
