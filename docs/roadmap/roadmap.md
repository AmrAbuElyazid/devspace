# Devspace Roadmap

**Purpose:** Keep a short, current roadmap for the work that is still strategically unfinished.

This file is intentionally curated. Finished migrations, test backfills, and cleanup work should leave this document once they are no longer active priorities.

## Current State

Devspace has a much stronger engineering baseline than earlier drafts of this roadmap assumed:

- split IPC modules, typed preload surface, and narrower privileged bridges are in place
- workspace persistence now lives behind main/preload with SQLite
- workspace persistence now uses incremental SQLite writes, real migrations, and cached statements instead of full rewrites on every save; hot settings persistence and pane ownership lookups were also tightened
- native pane lifecycle, focus ownership, and active-tab mounting were tightened
- browser-session handling is more deliberate and better covered than before
- embedded VS Code now uses fixed-port listener ownership checks, isolated dev/build data, isolated editor Chromium sessions, and a default-off background server lifecycle
- recent maintainability work materially reduced change risk in `browser-import-service.ts`, `useAppShortcuts.ts`, and much of main-process startup wiring in `index.ts`
- unit/integration coverage is broad, and Playwright Electron coverage exists locally

The main remaining work is no longer broad repo cleanup. It is concentrated in localhost/browser capability gaps, privacy/storage clarity, package and release maturity, and a handful of scaling/maintainability hotspots.

One notable browser capability gap remains upstream-constrained rather than app-local: passkeys/WebAuthn inside browser panes on macOS currently appear limited by Electron's embedded-browser support, and Devspace now treats `Open in External Browser` as the practical fallback for those flows.

Tactical bugs and smaller polish requests should live in `docs/issues.md`. This roadmap should stay focused on broader, still-strategic work.

## Security And Product Posture

- [ ] Finish documenting and validating the hardened embedded VS Code web server flow across both dev and built app paths. The fixed-port server now uses a Devspace-managed connection token, a Devspace-specific base path, listener ownership checks, isolated editor partitions, and separate dev `userData`/`sessionData` instead of `--without-connection-token` plus port-based process killing. Refs: `apps/desktop/src/main/vscode-server.ts`, `apps/desktop/src/main/browser/browser-session-manager.ts`, `apps/desktop/src/main/ipc/terminal-editor.ts`, `apps/desktop/src/main/index.ts`
- [ ] Document the actual localhost/editor trust posture in user-facing docs. This includes trusted loopback CORS rewrites, the embedded VS Code auth/session model, isolated editor partitions, and the tradeoffs of keeping a background editor server alive. Refs: `apps/desktop/src/main/browser/browser-session-manager.ts`, `apps/desktop/src/main/vscode-server.ts`, `apps/desktop/src/renderer/components/SettingsPage.tsx`, `README.md`, `SECURITY.md`
- [ ] Document browser privacy persistence clearly. Session cookies are extended to persistent cookies and browser history is stored locally in plaintext JSON with URLs/titles. Refs: `apps/desktop/src/main/browser/browser-session-manager.ts`, `apps/desktop/src/main/browser/browser-history-service.ts`, `README.md`
- [ ] Clarify the current package and desktop distribution posture in repo docs. `ghostty-electron` is intended as a public OSS package, but it still exports raw TypeScript and documents missing publish flow; Devspace desktop releases are still unsigned/not notarized/macOS-arm64 directory builds. Refs: `packages/ghostty-electron/package.json`, `packages/ghostty-electron/README.md`, `apps/desktop/package.json`, `docs/release-process.md`
- [ ] Add third-party notice/license attribution for bundled Ghostty assets if redistribution requires it, and make that provenance easy to audit from the repo. Refs: `packages/ghostty-electron/deps/libghostty/`, `packages/ghostty-electron/README.md`

## Important Next

- [ ] Keep breaking up maintainability hotspots in core files that still carry too much change risk. `apps/desktop/src/main/browser/browser-import-service.ts`, `apps/desktop/src/renderer/hooks/useAppShortcuts.ts`, `apps/desktop/src/renderer/store/slices/workspace-crud.ts`, and more of the renderer transfer/create/split helpers are in much better shape now; the remaining larger cleanup seam is mostly the window/bootstrap wiring still left in `apps/desktop/src/main/index.ts`, with renderer-side risk now more distributed across smaller helpers instead of one dominant hotspot
- [ ] Reduce preload contract drift risk as the bridge grows. The current preload surface is much safer than before, but it is still broad and manually mirrored across preload/shared/main registration points. Refs: `apps/desktop/src/preload/index.ts`, `apps/desktop/src/shared/types.ts`, `apps/desktop/src/main/ipc-handlers.ts`
- [ ] Add a macOS native smoke lane to CI for Electron/Playwright coverage so browser/editor/native-pane regressions are exercised automatically, not only locally. Refs: `.github/workflows/ci.yml`, `apps/desktop/e2e/playwright.config.ts`, `apps/desktop/package.json`
- [ ] Continue the remaining performance hardening pass from `docs/audits/performance.md`. Incremental workspace persistence, hot settings write reduction, pane ownership indexing, drag invalidation reduction, duplicate terminal title/CWD suppression, native wakeup coalescing, diff-based terminal visibility for both terminal and browser panes, and cached sidebar metadata are in place; the remaining work is mostly any native view churn that still shows up in profiling after these cuts. Refs: `docs/audits/performance.md`, `packages/ghostty-electron/native/ghostty_bridge.mm`, `packages/ghostty-electron/src/terminal-manager.ts`, `apps/desktop/src/main/browser/browser-pane-manager.ts`, `apps/desktop/src/renderer/store/native-view-store.ts`, `apps/desktop/src/renderer/store/workspace-sidebar-metadata.ts`, `apps/desktop/src/renderer/hooks/useDndOrchestrator.ts`

## Opportunistic

- [ ] Continue improving package maturity where it affects external consumers. For `ghostty-electron`, that means publishable build artifacts and stronger confidence around native-addon behavior beyond unit mocks where practical. Refs: `packages/ghostty-electron/package.json`, `packages/ghostty-electron/src/terminal-manager.ts`, `packages/ghostty-electron/native/ghostty_bridge.mm`
- [ ] Add lightweight OSS collaboration scaffolding if contributor traffic increases: issue templates, PR template, and `CODEOWNERS`. Refs: `.github/`, `CONTRIBUTING.md`

## Scope Notes

- Publishing `@devspace/note-editor` as a standalone package is not on the active roadmap unless product goals change.
- Treat localhost/editor trust as an explicit tradeoff until the trust model is documented clearly.
- Treat desktop distribution as a work-in-progress until signing/notarization and clearer release posture land.
