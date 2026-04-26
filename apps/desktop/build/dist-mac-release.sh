#!/bin/bash

set -euo pipefail

temp_api_key_path=""

cleanup() {
  if [[ -n "$temp_api_key_path" ]]; then
    rm -f "$temp_api_key_path"
  fi
}

trap cleanup EXIT

if [[ -n "${APPLE_API_KEY:-}" && ! -f "${APPLE_API_KEY}" ]]; then
  temp_api_key_path="$(mktemp)"
  printf '%s' "$APPLE_API_KEY" > "$temp_api_key_path"
  export APPLE_API_KEY="$temp_api_key_path"
fi

has_api_key_auth=false
has_keychain_profile_auth=false

if [[ -n "${APPLE_API_KEY:-}" && -n "${APPLE_API_KEY_ID:-}" && -n "${APPLE_API_ISSUER:-}" ]]; then
  has_api_key_auth=true
fi

if [[ -n "${APPLE_KEYCHAIN:-}" && -n "${APPLE_KEYCHAIN_PROFILE:-}" ]]; then
  has_keychain_profile_auth=true
fi

if [[ "$has_api_key_auth" != true && "$has_keychain_profile_auth" != true ]]; then
  printf '%s\n' \
    'Missing Apple notarization credentials.' \
    'Set one of the supported credential groups before running this release build:' \
    '  1. APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER' \
    '     APPLE_API_KEY may be either a path to AuthKey_<id>.p8 or the raw key contents.' \
    '  2. APPLE_KEYCHAIN, APPLE_KEYCHAIN_PROFILE' \
    >&2
  exit 1
fi

bun run build
bun run rebuild-native
bunx electron-builder --mac --arm64 --publish never -c.forceCodeSigning=true

app_bundle="release/mac-arm64/Devspace.app"
if [[ -d "$app_bundle" ]]; then
  xcrun stapler staple "$app_bundle"
fi

for dmg_path in release/*.dmg; do
  if [[ -f "$dmg_path" ]]; then
    xcrun stapler staple "$dmg_path"
  fi
done
