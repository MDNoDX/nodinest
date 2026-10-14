#!/bin/zsh
# Builds NodiNest.app (universal: Apple Silicon + Intel) and NodiNest-<ver>.dmg into dist/.
#   ./mac/build.sh            → dist/NodiNest.app, dist/NodiNest-1.0.dmg
# The app is ad-hoc signed (no paid Apple Developer ID), so the first launch
# needs right-click → Open (or System Settings → Privacy & Security → Open Anyway).
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=${VERSION:-1.0}
BUILD=${BUILD:-$(date +%Y%m%d%H%M)}
OUT=dist
APP="$OUT/NodiNest.app"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

rm -rf "$APP" && mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

for arch in arm64 x86_64; do
  swiftc -O -swift-version 5 -target "$arch-apple-macos13.0" \
    -framework AppKit -framework WebKit -framework AuthenticationServices \
    mac/Sources/main.swift -o "$TMP/NodiNest-$arch"
done
lipo -create "$TMP/NodiNest-arm64" "$TMP/NodiNest-x86_64" -output "$APP/Contents/MacOS/NodiNest"

sed -e "s/__VERSION__/$VERSION/" -e "s/__BUILD__/$BUILD/" mac/Info.plist > "$APP/Contents/Info.plist"
printf 'APPL????' > "$APP/Contents/PkgInfo"

ICONSET="$TMP/AppIcon.iconset" && mkdir "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z $s $s mac/icon-1024.png --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  sips -z $((s*2)) $((s*2)) mac/icon-1024.png --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"

codesign --force --deep --sign - --options runtime "$APP"
codesign --verify --deep --strict "$APP"

DMG="$OUT/NodiNest-$VERSION.dmg"
STAGE="$TMP/dmg" && mkdir "$STAGE"
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"
rm -f "$DMG"
hdiutil create -volname "NodiNest" -srcfolder "$STAGE" -fs HFS+ -format UDZO -imagekey zlib-level=9 "$DMG" >/dev/null
echo "✓ $APP"
echo "✓ $DMG ($(du -h "$DMG" | cut -f1))"
