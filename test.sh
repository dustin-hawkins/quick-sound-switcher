#!/usr/bin/env bash
# Validate the extension bundle with shexli.
#
# Builds the bundle (if missing or stale) and runs shexli static analysis
# against it. Exits non-zero on any finding so CI / pre-push hooks can fail.
#
# Requires: shexli (pipx install shexli), plus build.sh's deps.

set -euo pipefail

cd "$(dirname "$0")"

UUID="quick-sound-switcher@dustin-hawkins"
BUNDLE="${UUID}.shell-extension.zip"

if ! command -v shexli >/dev/null 2>&1; then
    echo "error: shexli not found in PATH (install with 'pipx install shexli')" >&2
    exit 2
fi

# Always rebuild — keeps the test reproducible.
./build.sh >/dev/null

echo "Running shexli on ${BUNDLE}..."
echo

# Capture both human and machine output. JSON drives the exit code; text is
# what the developer reads.
json="$(shexli --format json "$BUNDLE")"
shexli "$BUNDLE"
echo

status=$(printf '%s' "$json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["summary"]["status"])')
findings=$(printf '%s' "$json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["summary"]["finding_count"])')

if [[ "$status" == "clean" ]]; then
    echo "OK: bundle passed shexli validation"
    exit 0
fi

echo "FAIL: shexli reported ${findings} finding(s) (status: ${status})" >&2
exit 1
