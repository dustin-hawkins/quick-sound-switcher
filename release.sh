#!/usr/bin/env bash
# Cut and publish a new release.
#
# Bumps the patch (default), minor, or major component of the most recent
# vMAJOR.MINOR.PATCH tag (or starts at v1.0.0 if none exist), tags the current
# main, builds the bundle (which embeds the new tag in its filename), validates
# it with shexli, then publishes a GitHub release with auto-generated notes
# and the bundle attached.
#
# Usage:
#   ./release.sh           # patch bump  (e.g. v1.0.0 -> v1.0.1)
#   ./release.sh minor     # minor bump  (e.g. v1.0.1 -> v1.1.0)
#   ./release.sh major     # major bump  (e.g. v1.1.0 -> v2.0.0)
#
# Requires: git, gh (authenticated), plus build.sh and test.sh deps.

set -euo pipefail

cd "$(dirname "$0")"

UUID="quick-sound-switcher@dustin-hawkins"

BUMP="${1:-patch}"
case "$BUMP" in
    major|minor|patch) ;;
    *) echo "usage: $0 [major|minor|patch]" >&2; exit 2 ;;
esac

# --- Preflight ---

for cmd in git gh; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "error: required command '$cmd' not found in PATH" >&2
        exit 1
    fi
done

if ! gh auth status >/dev/null 2>&1; then
    echo "error: gh is not authenticated; run 'gh auth login'" >&2
    exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
    echo "error: working tree has uncommitted changes; commit or stash first" >&2
    exit 1
fi

branch=$(git symbolic-ref --short HEAD 2>/dev/null || true)
if [[ "$branch" != "main" ]]; then
    echo "error: not on main (currently on '${branch}')" >&2
    exit 1
fi

git fetch --quiet origin
if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
    echo "error: local main is not in sync with origin/main" >&2
    exit 1
fi

# --- Compute next version ---

last_tag=$(git tag --list 'v[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname | head -n1 || true)
if [[ -z "$last_tag" ]]; then
    next_tag="v1.0.0"
else
    if [[ ! "$last_tag" =~ ^v([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
        echo "error: latest tag '${last_tag}' is not vMAJOR.MINOR.PATCH" >&2
        exit 1
    fi
    major=${BASH_REMATCH[1]}
    minor=${BASH_REMATCH[2]}
    patch=${BASH_REMATCH[3]}
    case "$BUMP" in
        major) major=$((major + 1)); minor=0; patch=0 ;;
        minor) minor=$((minor + 1)); patch=0 ;;
        patch) patch=$((patch + 1)) ;;
    esac
    next_tag="v${major}.${minor}.${patch}"
fi

echo "Previous tag: ${last_tag:-(none)}"
echo "Next tag:     ${next_tag}"
echo "HEAD:         $(git rev-parse --short HEAD)"
echo
read -r -p "Cut and publish ${next_tag}? [y/N] " ans
[[ "$ans" =~ ^[Yy]$ ]] || { echo "aborted"; exit 1; }

# --- Tag locally, build, validate, push tag, publish release ---

# Tag locally first so build.sh's `git describe --tags` picks up the new
# version. Roll back the local tag if anything fails before the push.
git tag -a "$next_tag" -m "Release ${next_tag}"
trap 'git tag -d "$next_tag" >/dev/null 2>&1 || true' ERR

./build.sh
./test.sh

git push origin "$next_tag"
trap - ERR

bundle="${UUID}-${next_tag}.shell-extension.zip"
if [[ ! -f "$bundle" ]]; then
    echo "error: expected bundle '${bundle}' but it doesn't exist" >&2
    exit 1
fi

# --generate-notes uses gh's release-notes generator (PRs/commits since the
# previous tag). Edit later via `gh release edit ${next_tag}` if needed.
gh release create "$next_tag" "$bundle" \
    --title "$next_tag" \
    --generate-notes

echo
url=$(gh release view "$next_tag" --json url -q .url)
echo "Released ${next_tag}: ${url}"
echo "Don't forget to upload to extensions.gnome.org if applicable:"
echo "    https://extensions.gnome.org/upload/"
