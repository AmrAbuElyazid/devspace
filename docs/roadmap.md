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
- The real public release path still needs configured secrets, a tagged release
  run, and an upgrade test from one shipped version to the next.
- `ghostty-electron` is public source for transparency and experimentation, but
  it is workspace-consumed only and not an npm package yet.

## Public OSS Blockers

1. Finish privileged IPC input hardening.
   - Constrain VS Code CLI process launch inputs.
   - Add size limits for synchronous note/workspace persistence payloads.
   - Improve workspace-state validation depth for nested graph consistency,
     counts, string lengths, and numeric ranges.
2. Fix highest-risk native/package issues in `ghostty-electron`.
   - Review manual Objective-C ownership and release retained/allocated objects.
   - Decide and document policy for terminal-driven clipboard and open-URL
     actions.
   - Keep the package clearly documented as experimental and workspace-only.
3. Add missing collaboration scaffolding.
   - Add a PR template.
   - Add `CODEOWNERS`.

## Release Blockers

1. Configure GitHub and Apple signing/notarization secrets.
2. Run the first real tagged release from `main`.
3. Verify the signed DMG on a clean machine after Gatekeeper checks.
4. Validate update from one shipped version to the next using the real public
   feed.
5. Confirm native Ghostty resources, shell integration assets, and bundled
   binaries load in the packaged app.

## Important Follow-Ups

- Reduce test warning/log noise so green public CI reads cleanly.
- Decide whether packaged-app Playwright smoke tests should run in regular PR CI
  or only release CI.
- Split maintainability hotspots when touching them next: `native-view-store`,
  `SettingsPage`, app shortcut actions, and pane/server lifecycle registries.
- Keep browser/editor trust and privacy docs aligned with behavior: localhost
  trust, isolated editor sessions, persistent browser cookies, and plaintext
  local browser history.

## Scope Decisions

- Do not publish `ghostty-electron` to npm until it has built artifacts, a native
  addon install strategy, and a clearer public API/support policy.
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
- contributor scaffolding is in place
- the full repo gate passes on CI

The desktop app is ready for public distribution when:

- signed and notarized artifacts are produced by CI
- GitHub Releases contains the app artifacts and update metadata
- a real update from one shipped version to the next succeeds
- release/versioning steps are repeatable from `docs/release-process.md`
