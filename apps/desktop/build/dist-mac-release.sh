#!/bin/bash

set -euo pipefail

has_api_key_auth=false
has_apple_id_auth=false
has_keychain_profile_auth=false

if [[ -n "${APPLE_API_KEY:-}" && -n "${APPLE_API_KEY_ID:-}" && -n "${APPLE_API_ISSUER:-}" ]]; then
  has_api_key_auth=true
fi

if [[ -n "${APPLE_ID:-}" && -n "${APPLE_APP_SPECIFIC_PASSWORD:-}" && -n "${APPLE_TEAM_ID:-}" ]]; then
  has_apple_id_auth=true
fi

if [[ -n "${APPLE_KEYCHAIN:-}" && -n "${APPLE_KEYCHAIN_PROFILE:-}" ]]; then
  has_keychain_profile_auth=true
fi

if [[ "$has_api_key_auth" != true && "$has_apple_id_auth" != true && "$has_keychain_profile_auth" != true ]]; then
  printf '%s\n' \
    'Missing Apple notarization credentials.' \
    'Set one of the supported credential groups before running this release build:' \
    '  1. APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER' \
    '  2. APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID' \
    '  3. APPLE_KEYCHAIN, APPLE_KEYCHAIN_PROFILE' \
    >&2
  exit 1
fi

bun run build
bun run rebuild-native
bunx electron-builder --mac --arm64 --publish never -c.forceCodeSigning=true
