#!/usr/bin/env bash
# Build a deployable bundle for https://extensions.gnome.org
#
# Output: quick-sound-switcher@dustin-hawkins-<version>.shell-extension.zip
# where <version> is `git describe --tags --always --dirty`, so a clean tagged
# build produces e.g. ...-v1.0.1.shell-extension.zip.
#
# Requires: gnome-extensions, glib-compile-schemas, msgfmt (gettext), git

set -euo pipefail

cd "$(dirname "$0")"

UUID="quick-sound-switcher@dustin-hawkins"

for cmd in gnome-extensions glib-compile-schemas msgfmt git; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "error: required command '$cmd' not found in PATH" >&2
        exit 1
    fi
done

VERSION="$(git describe --tags --always --dirty 2>/dev/null || echo dev)"
BUNDLE="${UUID}-${VERSION}.shell-extension.zip"
RAW_BUNDLE="${UUID}.shell-extension.zip"

# Strip stale build artifacts so the bundle is clean.
find utils -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
rm -f "$BUNDLE" "$RAW_BUNDLE"

# Compile GSettings schemas.
glib-compile-schemas schemas/

# Pack. --podir=po makes gnome-extensions compile po/<lang>.po into
# locale/<lang>/LC_MESSAGES/<gettext-domain>.mo inside the bundle (using the
# domain from metadata.json), so only .mo files ship — never raw .po sources.
gnome-extensions pack \
    --force \
    --extra-source=deviceChooserBase.js \
    --extra-source=outputDeviceChooser.js \
    --extra-source=inputDeviceChooser.js \
    --extra-source=appMixer.js \
    --extra-source=portSettings.js \
    --extra-source=signalManager.js \
    --extra-source=utils/ \
    --extra-source=icons/ \
    --podir=po \
    --out-dir=.

# gnome-extensions pack always names the file after the UUID; rename to embed
# the version. Skip if pack already produced the versioned name.
if [[ -f "$RAW_BUNDLE" && "$RAW_BUNDLE" != "$BUNDLE" ]]; then
    mv "$RAW_BUNDLE" "$BUNDLE"
fi

echo
echo "Built ${BUNDLE}"
echo "Upload at: https://extensions.gnome.org/upload/"
