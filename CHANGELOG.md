# Changelog

This project keeps a lightweight, human-written changelog for tagged releases.

## Unreleased

- No unreleased notes yet.

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
