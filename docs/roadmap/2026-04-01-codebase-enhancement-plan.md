# Devspace Enhancement Plan — 2026-04-01

**Purpose:** Keep a single committed plan for improving Devspace over time across security, architecture, performance, testing, release workflow, and open-source readiness.

### 1. Security And Hardening

- [x] Tighten browser session CORS behavior.
      Opportunity: make the browser/editor session more intentionally scoped and avoid overly broad response rewriting.
      Refs: `apps/desktop/src/main/browser/browser-session-manager.ts:404-434`

- [x] Strengthen file path validation.
      Opportunity: make allowed-root checks robust against prefix collisions and symlink edge cases.
      Refs: `apps/desktop/src/main/validation.ts:22-30`

- [x] Add main-process URL allowlisting for browser navigation.
      Opportunity: keep browser navigation rules enforced at the privileged boundary, not just in renderer helpers.
      Refs: `apps/desktop/src/main/ipc-handlers.ts:487-520`, `apps/desktop/src/main/browser/browser-pane-manager.ts:273-286`

- [x] Review renderer hardening posture.
      Opportunity: revisit `sandbox`, `webviewTag`, preload exposure, and CSP before public distribution.
      Refs: `apps/desktop/src/main/index.ts:141-147`, `apps/desktop/src/preload/index.ts`, `apps/desktop/src/renderer/index.html`

### 2. Architecture And Maintainability

- [x] Split `ipc-handlers.ts` into domain-specific registration modules.
      Opportunity: make IPC behavior easier to navigate, test, and evolve.
      Refs: `apps/desktop/src/main/ipc-handlers.ts`

- [x] Continue reducing side effects inside workspace store actions.
      Opportunity: keep state mutation and external resource cleanup more clearly separated.
      Refs: `apps/desktop/src/renderer/store/store-helpers.ts:25-41`, `apps/desktop/src/renderer/store/slices/pane-management.ts:20-27`

- [ ] Break up oversized renderer shells over time.
      Initial targets: `Sidebar`, `BrowserPane`, `PaneGroupContainer`.
      Refs: `apps/desktop/src/renderer/components/Sidebar/Sidebar.tsx`, `apps/desktop/src/renderer/components/BrowserPane.tsx`

- [x] Remove leftover dead or duplicated paths when encountered.
      Example area: duplicate notes handler registrations.
      Refs: `apps/desktop/src/main/ipc-handlers.ts:367-427`

- [x] Extract the pure note editor renderer core into an internal workspace package.
      Opportunity: keep `apps/desktop` focused on pane lifecycle, persistence glue, and app-specific wiring.
      Refs: `packages/note-editor/`, `apps/desktop/src/renderer/components/note/NotePane.tsx`

### 3. Performance And Scale

- [ ] Keep improving native-view lifecycle efficiency.
      Opportunity: continue reducing work that scales with total mounted panes instead of visible panes.
      Refs: `apps/desktop/src/renderer/App.tsx:122-131`, `apps/desktop/src/renderer/components/PaneGroupContainer.tsx:311-324`

- [ ] Make persistence more selective over time.
      Opportunity: reduce full-state serialization pressure as the app grows.
      Refs: `apps/desktop/src/renderer/store/persistence.ts:272-309`

- [ ] Add lightweight production profiling counters.
      Track counts/rates for bounds sync, focus churn, visibility reconciliation, and mounted native panes.

- [ ] Revisit mixed-workspace scaling with many terminals, browsers, and editor panes open at once.

### 4. Testing And Quality Gates

- [x] Add CI for `bun fmt:check`, `bun run typecheck`, `bun run lint`, `bun run knip`, and `bun run test`.

- [x] Add a macOS native CI smoke lane.
      Opportunity: keep Electron build and native Ghostty rebuild coverage on the only supported platform.

- [x] Add coverage visibility for `apps/desktop`.
      Opportunity: make gaps easier to spot without slowing down the day-to-day workflow too much.
      Refs: `apps/desktop/vitest.config.ts`, `vitest.config.ts`

- [ ] Expand behavior-heavy UI and integration coverage where it pays off most.
      Likely areas: pane lifecycle, native-view behavior, browser security flows, and complex drag/drop interactions.
      Progress: added direct lifecycle tests for `useNativeView` and `TerminalPane`, plus `NoteEditor` package serialization tests.

- [x] Decide whether `ghostty-electron` needs package-level tests or should remain clearly app-coupled for now.
      Refs: `packages/ghostty-electron/README.md:209-223`, `packages/ghostty-electron/package.json`
      Progress: added package-level tests around `GhosttyTerminal` bridge loading, event forwarding, and lifecycle forwarding.

### 5. Release And Open-Source Readiness

- [x] Add root project docs: `README.md`, `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and `SECURITY.md`.

- [x] Add a simple public release/versioning workflow.
      Opportunity: make releases easier to cut and reason about when you decide to publish more widely.
      Refs: `apps/desktop/package.json`, `scripts/promote.sh`

- [ ] Decide what `ghostty-electron` is as a public artifact.
      Opportunity: either harden it as a package or document it clearly as an internal/experimental workspace dependency.

- [ ] Add changelog/release-note discipline when open-source distribution gets closer.

## Suggested Execution Order

### Phase 1: Foundations

- [x] Strengthen file path validation
- [x] Add main-process browser URL allowlisting
- [x] Revisit browser session CORS behavior
- [x] Review renderer hardening posture
- [x] Add CI

### Phase 2: Repo Maturity

- [x] Add root public docs
- [x] Split `ipc-handlers.ts`
- [x] Remove duplicated legacy paths
- [x] Add coverage visibility
- [x] Add basic release/versioning notes

### Phase 3: Long-Term Product Quality

- [ ] Continue native-view and mounted-pane scalability work
- [ ] Make persistence more selective
- [ ] Add production perf counters
- [ ] Improve mixed-workspace stress coverage
- [ ] Decide how public `ghostty-electron` should be
