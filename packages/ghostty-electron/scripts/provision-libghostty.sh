#!/bin/bash
set -euo pipefail

ALLOW_SOURCE_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --allow-source-build)
      ALLOW_SOURCE_BUILD=1
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
MANIFEST_FILE="$PROJECT_DIR/libghostty-bundle.json"
DEPS_PARENT_DIR="$PROJECT_DIR/deps"
DEPS_DIR="$DEPS_PARENT_DIR/libghostty"

bundle_repository() {
  if [ -n "${DEVSPACE_LIBGHOSTTY_REPOSITORY:-}" ]; then
    printf '%s\n' "$DEVSPACE_LIBGHOSTTY_REPOSITORY"
    return
  fi

  local origin_url parsed_repository
  origin_url="$(git -C "$PROJECT_DIR" remote get-url origin 2>/dev/null || true)"

  if [ -n "$origin_url" ]; then
    parsed_repository="$(node -e 'const input=process.argv[1]; let match=input.match(/^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/); if (!match) match=input.match(/^https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/); if (match) process.stdout.write(match[1]);' "$origin_url")"
    if [ -n "$parsed_repository" ] && [ "$parsed_repository" != "$origin_url" ]; then
      printf '%s\n' "$parsed_repository"
      return
    fi
  fi

  node -p 'const manifest=require(process.argv[1]); manifest.repository' "$MANIFEST_FILE"
}

asset_url() {
  local repository

  if [ -n "${DEVSPACE_LIBGHOSTTY_BUNDLE_URL:-}" ]; then
    printf '%s\n' "$DEVSPACE_LIBGHOSTTY_BUNDLE_URL"
    return
  fi

  repository="$(bundle_repository)"
  node -p 'const manifest=require(process.argv[1]); const repository=process.argv[2]; `https://github.com/${repository}/releases/download/${manifest.releaseTag}/${manifest.assetName}`' "$MANIFEST_FILE" "$repository"
}

verify_bundle() {
  bash "$SCRIPT_DIR/verify-libghostty.sh"
}

download_bundle() {
  local tmp_dir bundle_url asset_name archive_path release_tag repository

  bundle_url="$(asset_url)"
  asset_name="$(node -p "const manifest=require(process.argv[1]); manifest.assetName" "$MANIFEST_FILE")"
  release_tag="$(node -p "const manifest=require(process.argv[1]); manifest.releaseTag" "$MANIFEST_FILE")"
  repository="$(bundle_repository)"
  tmp_dir="$(mktemp -d)"
  archive_path="$tmp_dir/$asset_name"

  cleanup() {
    rm -rf "$tmp_dir"
  }
  trap cleanup RETURN

  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    echo "Downloading libghostty bundle from GitHub release $repository@$release_tag"
    gh release download "$release_tag" --repo "$repository" --pattern "$asset_name" --dir "$tmp_dir" --clobber
  else
    echo "Downloading libghostty bundle from $bundle_url"
    curl --fail --location --silent --show-error "$bundle_url" --output "$archive_path"
  fi

  rm -rf "$DEPS_DIR"
  mkdir -p "$DEPS_PARENT_DIR"
  tar -C "$DEPS_PARENT_DIR" -xzf "$archive_path"
}

if verify_bundle >/dev/null 2>&1; then
  echo "Verified existing libghostty dependency bundle"
  exit 0
fi

if download_bundle && verify_bundle; then
  echo "Provisioned libghostty from pinned release bundle"
  exit 0
fi

if [ "$ALLOW_SOURCE_BUILD" -eq 1 ] || [ "${DEVSPACE_LIBGHOSTTY_ALLOW_SOURCE_BUILD:-0}" = "1" ]; then
  echo "Falling back to source build for libghostty"
  bash "$SCRIPT_DIR/build-libghostty.sh"
  verify_bundle
  exit 0
fi

echo "Unable to provision libghostty. Either publish the pinned bundle release or rerun with DEVSPACE_LIBGHOSTTY_ALLOW_SOURCE_BUILD=1." >&2
exit 1
