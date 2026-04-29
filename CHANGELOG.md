# Changelog

This project keeps a lightweight, human-written changelog for tagged releases.

## Unreleased

- No unreleased notes yet.

## v0.1.4 - 2026-04-29

### Summary

- Recover the public-feed test release after the `v0.1.2` packaged smoke run exposed a missing app-shell readiness marker.

### Highlights

- Restored the `.app-shell` renderer marker used by packaged Playwright smoke tests.
- Keeps the release small so it can be used as the first successful public-feed update-test build.

## v0.1.3 - 2026-04-29

### Summary

- Provide the second small public-feed update test release for validating update discovery and install from `v0.1.2`.

### Highlights

- No user-facing changes beyond the version bump; this release exists to validate the public updater feed path.

## v0.1.2 - 2026-04-29

### Summary

- Prepare a small public-feed update test release after hardening the repo for public source access.

### Highlights

- Hardened Electron IPC trust boundaries, privileged IPC input validation, and `ghostty-electron` native bridge safety.
- Cleaned public-readiness docs, roadmap, contributor scaffolding, and intentional test log noise.

## v0.1.1 - 2026-04-26

### Summary

- Improve the desktop update experience after the first release by adding clearer updater UI states, changelog-driven release publishing, and a safe manual-download fallback for private GitHub releases.

### Highlights

- Added a sidebar update button above Settings, plus shared renderer update state wiring and mock update states for testing updater UI flows in development.
- Fixed release publishing reruns to reuse the existing GitHub release and publish notes directly from `CHANGELOG.md`.
- Replaced the raw private GitHub updater auth error with a user-facing manual-download message and fixed long update messages to wrap cleanly in Settings.

## v0.1.0 - 2026-04-26

### Summary

- Ship the first public-ready macOS desktop release path with signed and notarized artifacts, GitHub Releases publishing, and packaged auto-update wiring.

### Highlights

- Added the packaged desktop updater flow, GitHub provider metadata, and updater UI wiring through main, preload, renderer, and menu.
- Added a tagged macOS release workflow that verifies the repo, builds signed/notarized artifacts, smoke-tests the packaged app, and publishes release assets.
- Finalized release packaging basics including DMG and ZIP outputs, release metadata, and the desktop app icon.

## Format

For each release, add a new section at the top using this shape:

```md
## vX.Y.Z - YYYY-MM-DD

### Summary

- One short paragraph or 1-3 bullets covering the why.

### Highlights

- User-visible change or fix.
- Important internal change if it affects release risk.
- Follow-up note for migrations, rebuilds, or caveats when needed.
```

Older releases were not backfilled.
