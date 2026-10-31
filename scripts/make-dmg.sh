#!/bin/bash
# Package the built .app into a drag-and-drop DMG plus a ZIP fallback.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
APP="$DIST/FormulaSnip.app"
VERSION="1.0.0"
STAGE="$ROOT/build/dmg-stage"

[ -d "$APP" ] || { echo "missing $APP — run scripts/build-app.sh first" >&2; exit 1; }

rm -rf "$STAGE"
mkdir -p "$STAGE"
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"

rm -f "$DIST/FormulaSnip-$VERSION.dmg" "$DIST/FormulaSnip-$VERSION.zip"
hdiutil create -quiet -volname "FormulaSnip $VERSION" -srcfolder "$STAGE" -ov -format UDZO "$DIST/FormulaSnip-$VERSION.dmg"
ditto -c -k --sequesterRsrc --keepParent "$APP" "$DIST/FormulaSnip-$VERSION.zip"
rm -rf "$STAGE"

echo "DMG: $DIST/FormulaSnip-$VERSION.dmg"
echo "ZIP: $DIST/FormulaSnip-$VERSION.zip"
ls -lh "$DIST/FormulaSnip-$VERSION.dmg" "$DIST/FormulaSnip-$VERSION.zip"
