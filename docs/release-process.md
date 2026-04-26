# Release Process

Devspace is currently released with a lightweight macOS-first workflow.

## Current Assumptions

- platform target: macOS
- architecture target: Apple Silicon
- branch model: release from `main`
- native addon: rebuild before packaging when native code changes

## Verification Before A Release Build

Run the standard repo gate from the root:

```sh
bun run fmt:check
bun run typecheck
bun run lint
bun run knip
bun run test
```

If the Ghostty native bridge or bundled native resources changed, rebuild it:

```sh
bun run rebuild-native
```

`rebuild-native` provisions the pinned `libghostty` bundle before compiling the
N-API addon. Normal release builds should not need a source build of Ghostty.

## Refreshing The Pinned Ghostty Bundle

Only do this when intentionally bumping the Ghostty dependency:

```sh
bun run --cwd packages/ghostty-electron build-libghostty
bun run --cwd packages/ghostty-electron refresh-libghostty-checksums
bun run --cwd packages/ghostty-electron bundle-libghostty
```

Then publish the bundle with the manual GitHub Actions workflow:

- `.github/workflows/publish-ghostty-bundle.yml`

That workflow rebuilds the pinned bundle on macOS, verifies the committed
checksum manifest, and uploads the release asset referenced by
`packages/ghostty-electron/libghostty-bundle.json`.

Before publishing an updated Ghostty bundle, also review:

- `packages/ghostty-electron/libghostty-bundle.json`
- `packages/ghostty-electron/THIRD_PARTY_NOTICES.md`

Make sure the pinned upstream tag, default release repository, and preserved
upstream notice paths still match the bundle contents you are redistributing.

## Build Signed macOS Release Artifacts

For a public macOS release, the app must be signed with a `Developer ID
Application` certificate and notarized by Apple.

Before running the release build:

- make the signing certificate available in Keychain or via `CSC_LINK` and
  `CSC_KEY_PASSWORD`
- provide Apple notarization credentials with one of these setups:
  - preferred: `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`
  - optional local fallback: `APPLE_KEYCHAIN`, `APPLE_KEYCHAIN_PROFILE`

For local API-key notarization:

- create an App Store Connect API key
- download `AuthKey_<key-id>.p8`
- set:
  - `APPLE_API_KEY` to either the path to that `.p8` file or the raw key text
  - `APPLE_API_KEY_ID` to the key id
  - `APPLE_API_ISSUER` to the issuer id
- if your `Developer ID Application` certificate is already installed in Keychain,
  local `bun run dist` does not need `CSC_LINK` or `CSC_KEY_PASSWORD`

Example local setup:

```sh
export APPLE_API_KEY="$HOME/.config/devspace/AuthKey_ABC123XYZ.p8"
export APPLE_API_KEY_ID="ABC123XYZ"
export APPLE_API_ISSUER="00000000-0000-0000-0000-000000000000"
```

If the certificate is not already available in Keychain, also set:

```sh
export CSC_LINK="$(base64 -i /path/to/developer-id-application.p12)"
export CSC_KEY_PASSWORD="your-p12-export-password"
```

Then run from the repo root:

```sh
bun run dist
```

This produces signed macOS arm64 release artifacts in
`apps/desktop/release/` using the Electron Builder config in
`apps/desktop/package.json`.

Current outputs include:

- `Devspace-<version>-arm64.dmg`
- `Devspace-<version>-arm64.zip`
- matching blockmaps for updater use
- `latest-mac.yml` for macOS auto-update metadata

Packaged builds also embed `app-update.yml` inside the app bundle. Right now:

- production packaging is aligned with GitHub Releases metadata
- local/private updater testing can override the feed with `DEVSPACE_UPDATE_FEED_URL`

The release command fails if notarization credentials are missing or if
Electron Builder cannot code sign the app.

After the build completes, validate the signed artifacts:

```sh
codesign --verify --deep --strict --verbose=2 "apps/desktop/release/mac-arm64/Devspace.app"
spctl --assess --type exec --verbose "apps/desktop/release/mac-arm64/Devspace.app"
xcrun stapler validate apps/desktop/release/Devspace-*.dmg
```

For local/private updater testing against a generic feed, point the packaged app
at a hosted `latest-mac.yml` with:

```sh
DEVSPACE_UPDATE_FEED_URL=https://example.com/devspace-updates bun run dist
```

Once the repo is public, packaged builds can use the embedded GitHub provider
metadata instead of the override feed.

## CI Release Workflow

The repo now includes `.github/workflows/release-desktop.yml` for tagged macOS
desktop releases.

Workflow expectations:

- trigger it from a tag like `v0.1.0`
- keep `apps/desktop/package.json` version aligned with the tag version
- add a matching `CHANGELOG.md` section before tagging

Required GitHub secrets:

- `CSC_LINK`
- `CSC_KEY_PASSWORD`
- `APPLE_API_KEY`
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`

GitHub secret values:

- `CSC_LINK`: base64-encoded `.p12` for the `Developer ID Application` certificate
- `CSC_KEY_PASSWORD`: the `.p12` export password
- `APPLE_API_KEY`: raw contents of `AuthKey_<key-id>.p8`
- `APPLE_API_KEY_ID`: App Store Connect API key id
- `APPLE_API_ISSUER`: App Store Connect issuer id

The workflow:

- runs `fmt:check`, `typecheck`, `lint`, `knip`, and `test`
- builds signed and notarized desktop artifacts on `macos-14`
- validates the signed app and stapled DMG
- smoke-tests the packaged app with Playwright
- publishes `dmg`, `zip`, blockmaps, and `latest-mac.yml` to GitHub Releases

## Promote A Local Build Into /Applications

For local day-to-day use, the repo includes a helper script:

```sh
scripts/promote.sh
```

This script:

- runs the verification gate
- builds an unpacked local app unless `--skip-build` is used
- replaces `/Applications/Devspace.app`
- updates the CLI symlink if it already exists

`scripts/promote.sh` intentionally uses `bun run --cwd apps/desktop dist:dir`
instead of the signed DMG release path so local promotion does not depend on
release notarization credentials.

## Versioning Notes

Current guidance:

- keep `main` releasable
- use tags for meaningful release points
- prefer one short release summary per tag
- avoid mixing broad cleanup with release-critical changes right before tagging

## Changelog Discipline

Before creating a release tag:

- update `CHANGELOG.md`
- add a new version section at the top for the release being cut
- keep the summary short and focused on user-visible impact and release risk
- mention rebuild or migration steps when the release depends on them

Use this release-note shape:

```md
## vX.Y.Z - YYYY-MM-DD

### Summary

- 1-3 bullets or a short paragraph describing the release.

### Highlights

- Main feature, fix, or platform change.
- Any notable internal change that affects confidence or rollback.
- Any operator note such as `bun run rebuild-native` if required.
```

After tagging a release:

- keep `## Unreleased` at the top of `CHANGELOG.md`
- seed it with any follow-up work that has already landed on `main`

## Future Improvements

- artifact publishing from CI
- clearer versioning policy for `ghostty-electron`
