# Devspace Roadmap

**Purpose:** Keep one current planning document for the work that is still
strategically unfinished across product posture, release maturity, auto-update,
and open-source readiness.

This file replaces the older split between `docs/roadmap/roadmap.md` and
`docs/release-and-oss-readiness.md`.

## Current State

Devspace has a much stronger engineering baseline than earlier drafts of this
roadmap assumed:

- split IPC modules, typed preload surface, and narrower privileged bridges are in place
- workspace persistence now lives behind main/preload with SQLite
- workspace persistence now uses incremental SQLite writes, real migrations, and cached statements instead of full rewrites on every save
- native pane lifecycle, focus ownership, and active-tab mounting were tightened
- browser-session handling is more deliberate and better covered than before
- embedded VS Code now uses fixed-port listener ownership checks, isolated dev/build data, isolated editor Chromium sessions, and a default-off background server lifecycle
- unit/integration coverage is broad, and Playwright Electron coverage exists locally
- Devspace now has a working local macOS `Developer ID Application` signing and notarization flow that produces a signed DMG from `bun run dist`

The main remaining work is concentrated in:

- release and desktop distribution maturity
- auto-update architecture and rollout
- OSS/package readiness
- trust/privacy documentation clarity
- a few remaining maintainability and CI gaps

One important product constraint remains upstream-constrained rather than
app-local: passkeys/WebAuthn inside browser panes on macOS still appear limited
by Electron's embedded-browser support, and Devspace treats `Open in External
Browser` as the practical fallback for those flows.

## Important Findings

- The repo does not have to be public to ship a production app outside the Mac App Store.
- Public end-user auto-updates should not depend on the current private GitHub source repo.
- The paused updater spike in `./.worktrees/electron-updater` contains useful runtime and UI work, but its packaging and publishing assumptions are not production-ready as-is.
- `ghostty-electron` is documented like a future public OSS package, but it is not yet publish-ready.
- The old roadmap is partially stale in a few areas because issue templates, a macOS native CI job, and signed/notarized local release builds now already exist.

## Roadmap Audit

| Legacy roadmap item | Status | Notes |
| --- | --- | --- |
| Document and validate the hardened embedded VS Code flow | Partially done, still active | The hardened flow is implemented in code and covered by tests. Remaining work is final validation guidance and clearer docs. |
| Document localhost/editor trust posture | Partially done, still active | `README.md` and `SECURITY.md` already cover much of this. Remaining work is consolidation and better user-facing wording. |
| Document browser privacy persistence | Partially done, still active | Current docs and code already describe persistent cookies, plaintext history storage, and editor URL exclusions. A dedicated privacy/storage section would make this easier to audit. |
| Clarify package and desktop distribution posture | Still active, high priority | One of the most important remaining items for both release readiness and OSS readiness. |
| Add third-party notice/license attribution for bundled Ghostty assets | Partially done, still active | `packages/ghostty-electron/THIRD_PARTY_NOTICES.md` exists, but bundled asset provenance and redistribution comfort still need a final pass. |
| Break up remaining maintainability hotspots | Still active | `apps/desktop/src/main/index.ts` and a few preload/renderer seams still carry integration risk. |
| Reduce preload contract drift risk | Still active, more important now | Auto-update work will expand the bridge, so this risk grows if not managed deliberately. |
| Reduce test-environment coupling and warning noise | Still active | The suite is broad and green, but warning noise and a few environment-sensitive paths remain. |
| Add a macOS native smoke lane to CI | Partially stale, still active | A macOS native CI job already exists. The unfinished part is packaged-app and Playwright Electron smoke coverage in CI. |
| Continue performance hardening | Still active, lower than release/OSS work | Useful product maturity work, but not a first blocker for public release or OSS launch. |
| Improve `ghostty-electron` package maturity | Still active, high priority if the package will be public | Publishable artifacts, packaging strategy, and stronger native-addon confidence are still open. |
| Add lightweight OSS collaboration scaffolding | Partially stale | Issue templates already exist. Remaining gaps are a PR template and `CODEOWNERS`. |

## High Priority Next

These items should remain at the top of the execution queue because they
directly affect production quality, release confidence, or OSS readiness.

1. Clarify the package and desktop distribution posture.
2. Finalize bundled Ghostty attribution and provenance review.
3. Extend the existing macOS CI lane with packaged-app smoke coverage.
4. Reduce preload contract drift risk before adding updater APIs.
5. Decide whether `ghostty-electron` is actually becoming a public package now or remains monorepo-internal for the near term.

## Production And Auto-Update Plan

### Distribution Model

- Keep the source repository private if desired.
- Publish release artifacts to a public binary host.
- Prefer `electron-updater` with a `generic` provider over GitHub provider for end-user updates.
- Treat GitHub Releases as optional human-facing downloads, not as the primary update backend, unless a separate public release repository is introduced.

### Why The Generic Provider Is Preferred

- It avoids runtime GitHub authentication on user machines.
- It decouples binary distribution from source repository visibility.
- It works cleanly with a future `downloads.devspace.app` style endpoint.
- It avoids making the private source repo part of the user update path.

### Packaging Changes Needed

- Keep the current signing, hardened runtime, entitlements, and notarization flow from `apps/desktop/package.json` and `apps/desktop/build/dist-mac-release.sh`.
- Add macOS `zip` output alongside `dmg` so Electron Builder generates the metadata required for macOS auto-updates.
- Publish `*.dmg`, `*.zip`, `*.blockmap`, and `latest-mac.yml`.
- Add missing desktop metadata such as `description`, `author`, `repository`, `homepage`, `bugs`, and app icon configuration.

### Updater Runtime Changes Needed

- Port the useful client/runtime work from `./.worktrees/electron-updater` onto current `main`.
- Reuse the updater state machine, polling, manual check, download progress, and install prompt behaviors.
- Reconnect update state through `main`, `preload`, `shared`, and renderer surfaces on top of the current codebase rather than cherry-picking the spike wholesale.
- Integrate the update UI into the current Settings layout and app menu.

### Release Automation Changes Needed

- Add a dedicated desktop release workflow under `.github/workflows/`.
- Import signing credentials in CI.
- Provide Apple notarization credentials in CI.
- Build signed and notarized macOS artifacts on macOS runners.
- Upload update metadata and release artifacts to the chosen public host.
- Validate the produced artifacts with `codesign`, `spctl`, and `stapler`.

### Versioning Policy

- Treat `apps/desktop/package.json` version as the source of truth.
- Keep release tags aligned with the packaged version, for example `v0.2.0`.
- Update `CHANGELOG.md` in the same release change.
- Prefer CI verification of version alignment over silent version mutation during release jobs.

### Validation Requirements For A Real Release

- fresh install of the signed and notarized DMG on a clean machine
- manual launch validation after Gatekeeper checks
- update from one shipped version to the next using the real update feed
- rollback plan for a broken release
- verification that native Ghostty resources, shell integration assets, and bundled binaries all load correctly in the packaged app

## Open-Source Readiness Plan

### Must-Fix Before Making The Repo Public

- Fix stale ownership/provenance links that still point to `anomalyco/devspace` in `packages/ghostty-electron/package.json` and `packages/ghostty-electron/libghostty-bundle.json`.
- Decide the intended public story for `ghostty-electron`.
- Confirm that bundled Ghostty assets and preserved upstream notices are documented to a standard you are comfortable redistributing publicly.
- Add missing public-facing desktop package metadata and icon configuration.

### Strongly Recommended Before Making The Repo Public

- Add a PR template.
- Add `CODEOWNERS`.
- Tighten release and distribution docs so outside contributors can understand what is intentionally unfinished.
- Add a short maintainer/release checklist.
- Reduce known warning noise in tests so outside contributors do not interpret green runs as flaky.

### `ghostty-electron` Decision Point

Choose one of these paths explicitly:

1. Internal-for-now path.
2. Public-package-now path.

If the internal-for-now path is chosen:

- keep the package in the monorepo
- keep `private` or treat it as intentionally not published
- document that the package is experimental and not yet distributed independently

If the public-package-now path is chosen:

- add a real build/publish pipeline
- stop exporting raw TypeScript only
- define the native-addon packaging/install strategy
- confirm repository metadata, provenance, and licensing details are consistent

### Documentation Work That Helps OSS Readiness

- Consolidate localhost/editor trust documentation into one clear section that links from `README.md`, `SECURITY.md`, and release docs.
- Add a clearer privacy/storage section describing browser history storage, persistent cookie behavior, and editor URL exclusions.
- Clarify what is product policy versus what is still experimental.
- Explain the release model for external users: signed app, notarized app, update source, and platform support scope.

## Recommended Execution Order

### Phase 1: Documentation And Provenance Cleanup

- Fix stale repository references.
- Rewrite stale roadmap items so they reflect current reality.
- Tighten `docs/release-process.md` to describe the current signed/notarized flow and the next release-hosting steps.
- Add a maintainer-facing release checklist.
- Review and finalize Ghostty bundled asset notices and provenance wording.

### Phase 2: Production Packaging Maturity

- Add desktop metadata and icon configuration.
- Add `zip` output and update metadata generation.
- Define the public binary host and update feed URL structure.
- Decide the release versioning workflow.

### Phase 3: Auto-Update Implementation

- Port updater runtime code from the spike onto current `main`.
- Add update IPC, preload, shared types, menu integration, and Settings UI.
- Test the updater in packaged builds only.
- Validate end-to-end upgrade flow from one shipped version to the next.

### Phase 4: CI And Release Automation

- Add desktop release workflow.
- Add macOS packaged-app smoke coverage.
- Publish artifacts and update metadata automatically.
- Verify signed and notarized artifacts in CI.

### Phase 5: OSS Launch Polish

- Add PR template and `CODEOWNERS`.
- Resolve package posture for `ghostty-electron`.
- Reduce warning noise in the test suite.
- Do a final pass on `README.md`, `SECURITY.md`, `CONTRIBUTING.md`, and release docs from the perspective of an outside contributor.

## Exit Criteria

The repo should be considered production-ready for public desktop distribution
when all of the following are true:

- signed and notarized desktop artifacts are built reproducibly
- update metadata and artifacts are published to a public feed
- a real update from one shipped version to the next succeeds
- CI covers both verification gates and at least one macOS packaged-app smoke path
- release/versioning policy is documented and repeatable

The repo should be considered comfortably open-source ready when all of the
following are true:

- repository and package provenance links are correct
- bundled third-party notices and redistribution posture are reviewed
- contributor scaffolding is in place
- `README.md` and `SECURITY.md` clearly describe platform scope, trust model, and current limitations
- package maturity is explicit, especially for `ghostty-electron`

## Scope Notes

- Publishing `@devspace/note-editor` as a standalone package is not on the active roadmap unless product goals change.
- Treat localhost/editor trust as an explicit tradeoff until the trust model is documented clearly.
- Treat desktop distribution as still in-progress until update hosting, CI release automation, and production auto-update are finished.

## Immediate Next Steps

1. Fix stale `anomalyco/devspace` references and other provenance mismatches.
2. Tighten this roadmap so any remaining stale wording is removed as work lands.
3. Decide the public binary host and update feed model.
4. Add `zip` output and update metadata to the desktop release build.
5. Port the updater runtime from the paused spike onto current `main`.
6. Build the macOS release workflow and smoke-test the full update path.
