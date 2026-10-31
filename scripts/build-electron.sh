#!/bin/bash
# Build the Electron desktop version on macOS.
#
# With no arguments this builds dist-electron/mac/FormulaSnip.app and then
# wraps it into a DMG + ZIP with hdiutil/ditto (electron-builder's DMG step
# downloads extra tooling that is flaky on some networks).
# Any arguments are passed straight to electron-builder, e.g.:
#   scripts/build-electron.sh --win nsis        # must run on Windows/CI
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -f "$ROOT/app/web/vendor/mathjax/tex-svg-nofont.js" ]; then
  "$ROOT/scripts/prepare-vendor.sh" "$ROOT/app/web/vendor"
fi

if [ "$#" -gt 0 ]; then
  exec npx electron-builder "$@"
fi

EXTRA=()
if [ -d "$ROOT/node_modules/electron/dist" ]; then
  EXTRA+=(-c.electronDist="$ROOT/node_modules/electron/dist")
fi

npx electron-builder --mac dir "${EXTRA[@]}"

VERSION="$(node -p "require('./package.json').version")"
APP="$ROOT/dist-electron/mac/FormulaSnip.app"
STAGE="$ROOT/build/electron-dmg-stage"

[ -d "$APP" ] || { echo "missing $APP" >&2; exit 1; }

rm -rf "$STAGE"
mkdir -p "$STAGE"
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"
hdiutil create -quiet -volname "FormulaSnip Electron $VERSION" -srcfolder "$STAGE" -ov -format UDZO \
  "$ROOT/dist-electron/FormulaSnip-$VERSION-electron.dmg"
rm -rf "$STAGE"

ditto -c -k --sequesterRsrc --keepParent "$APP" "$ROOT/dist-electron/FormulaSnip-$VERSION-mac.zip"

echo "DMG: $ROOT/dist-electron/FormulaSnip-$VERSION-electron.dmg"
echo "ZIP: $ROOT/dist-electron/FormulaSnip-$VERSION-mac.zip"
ls -lh "$ROOT/dist-electron/FormulaSnip-$VERSION-electron.dmg" "$ROOT/dist-electron/FormulaSnip-$VERSION-mac.zip"
