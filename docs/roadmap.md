# Devspace Roadmap

This is the short reference for what still blocks a confident public
open-source launch and first public desktop release. Keep it current by removing
items as they land instead of preserving history here.

## Current Status

- macOS Apple Silicon is the only supported platform target today.
- The normal repo gate is green with Node 22: `fmt:check`, `lint`, `typecheck`,
  `knip`, and `test`.
- Signed/notarized macOS packaging and tagged GitHub release automation exist.
- The first Electron IPC trust-boundary pass has landed: dev renderer URLs are
  local/dev-only, IPC senders are checked against the trusted main window, and
  native view bounds plus terminal env/cwd inputs are constrained.
- Privileged IPC input hardening now also covers VS Code CLI launch input,
  note/workspace persistence payload size, and deeper persisted workspace graph
  validation.
- `ghostty-electron` native ownership was tightened for obvious retained view
  objects, terminal open-url actions are limited to `http`/`https`, and the
  remaining clipboard side-effect policy is documented as experimental.
- Basic collaboration scaffolding exists: issue templates, PR template,
  `CODEOWNERS`, contributing guide, security policy, and code of conduct.
- GitHub and Apple signing/notarization secrets are configured, and private
  releases already exist for `0.1.0` and `0.1.1`.
- The first public-era release is expected to be `0.2.0`, with an update test
  from `0.1.1` to `0.2.0` once the repository is public.
- `ghostty-electron` is public source for transparency and experimentation, but
  it is workspace-consumed only and not an npm package yet.

## Public OSS Blockers

1. Keep `ghostty-electron` clearly documented as experimental and workspace-only
   until a standalone package path exists.
2. Keep native lifecycle/manual-ownership review active as the bridge evolves.
3. Keep collaboration scaffolding current as project ownership and review paths
   evolve.

## Release Blockers

1. Run the first public tagged release from `main`, likely `v0.2.0`.
2. Verify the signed DMG on a clean machine after Gatekeeper checks.
3. Validate update from `0.1.1` to `0.2.0` using the real public feed.
4. Confirm native Ghostty resources, shell integration assets, and bundled
   binaries load in the packaged app.

## Important Follow-Ups

- Reduce test warning/log noise so green public CI reads cleanly.
- Keep packaged-app Playwright smoke tests in release CI only unless PR feedback
  needs change.
- Split maintainability hotspots when touching them next: `native-view-store`,
  `SettingsPage`, app shortcut actions, and pane/server lifecycle registries.
- Keep browser/editor trust and privacy docs aligned with behavior: localhost
  trust, isolated editor sessions, persistent browser cookies, and plaintext
  local browser history.

## Scope Decisions

- Do not publish `ghostty-electron` to npm until it has built artifacts, a native
  addon install strategy, and a clearer public API/support policy.
- Clipboard reads/writes in `ghostty-electron` do not need a separate
  confirmation UI for Devspace's current embedded use.
- Do not publish `@devspace/note-editor` as a standalone package unless product
  goals change.
- Treat browser-pane passkey/WebAuthn limitations on macOS as upstream-constrained;
  `Open in External Browser` remains the fallback.

## Exit Criteria

The repo is ready to make public when:

- public-facing docs are accurate and no longer describe completed work as
  unfinished
- Electron IPC and renderer-origin trust boundaries are intentionally hardened
- `ghostty-electron` native/package risks above are resolved or explicitly
  documented as experimental limitations
- contributor scaffolding is in place and points at current maintainers
- the full repo gate passes on CI

The desktop app is ready for public distribution when:

- signed and notarized artifacts are produced by CI
- GitHub Releases contains the app artifacts and update metadata
- a real update from one shipped version to the next succeeds
- release/versioning steps are repeatable from `docs/release-process.md`
