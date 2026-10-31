#!/bin/bash
# Build the standalone FormulaSnip.app (macOS, no external runtime needed).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/dist/FormulaSnip.app"
WEB_SRC="$ROOT/app/web"

if [ ! -f "$WEB_SRC/vendor/mathjax/tex-svg-nofont.js" ]; then
  echo "vendor missing — running scripts/prepare-vendor.sh" >&2
  "$ROOT/scripts/prepare-vendor.sh" "$WEB_SRC/vendor"
fi

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

# Runtime assets (HTML/CSS/JS + MathJax + fonts)
rsync -a --delete "$WEB_SRC/" "$APP/Contents/Resources/web/"

# Native shell
swiftc -O "$ROOT/app/main.swift" \
  -o "$APP/Contents/MacOS/FormulaSnip" \
  -framework Cocoa -framework WebKit

# Info.plist
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>FormulaSnip</string>
  <key>CFBundleDisplayName</key><string>FormulaSnip</string>
  <key>CFBundleIdentifier</key><string>com.qin.formulasnip</string>
  <key>CFBundleExecutable</key><string>FormulaSnip</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleVersion</key><string>1.0.0</string>
  <key>CFBundleShortVersionString</key><string>1.0.0</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.productivity</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSPrincipalClass</key><string>NSApplication</string>
  <key>NSSupportsAutomaticGraphicsSwitching</key><true/>
  <key>NSHumanReadableCopyright</key><string>© 2026 QIN-SMART</string>
</dict>
</plist>
PLIST

if [ -f "$ROOT/assets/AppIcon.icns" ]; then
  cp "$ROOT/assets/AppIcon.icns" "$APP/Contents/Resources/AppIcon.icns"
fi

# Third-party notices + license inside the shipped bundle
cp "$ROOT/THIRD_PARTY_NOTICES.md" "$APP/Contents/Resources/THIRD_PARTY_NOTICES.md" 2>/dev/null || true
cp "$ROOT/LICENSE" "$APP/Contents/Resources/LICENSE" 2>/dev/null || true

codesign --force --deep --sign - "$APP" >/dev/null 2>&1 || true

echo "built: $APP"
du -sh "$APP"
