# Security Policy

## Reporting A Vulnerability

Please do not report security vulnerabilities in public issues.

If private vulnerability reporting is enabled for the repository, use that
channel. Otherwise, email `aboelyazid.amr@gmail.com` before public disclosure.

When reporting, include:

- a description of the issue
- affected area or files if known
- reproduction steps or proof of concept
- impact assessment if you have one

## Response Expectations

Security issues will be triaged as time permits. Clear reproduction steps and a
focused report make fixes much easier.

## Scope Notes

Areas that deserve extra care in this project include:

- Electron main/preload/renderer boundaries
- IPC validation and privileged APIs
- browser session behavior and permissions
- filesystem access and path validation
- native addon boundaries in `ghostty-electron`

## Local Trust Model

Devspace intentionally trusts a small set of local loopback surfaces in order to
embed VS Code web and support localhost-heavy development workflows.

- embedded VS Code runs via a local `code serve-web` process bound to
  `127.0.0.1` on a fixed Devspace-managed port
- access to that local editor server is scoped by a Devspace-managed connection
  token and a Devspace-specific server base path
- Devspace only reuses an existing listener on that fixed port when the current
  process matches the expected managed `code serve-web` command line
- editor panes use a separate persistent Electron session partition from normal
  browser panes
- Devspace applies narrow CORS header overrides only for explicitly registered
  trusted local loopback origins used by its own editor/browser flows; it does
  not widen CORS globally for arbitrary pages in the shared browser session

These behaviors are deliberate tradeoffs. Bugs in loopback-origin handling,
session partitioning, CORS overrides, or token exposure should be treated as
security-sensitive.

## Persistence Notes

Current browser persistence behavior is also relevant to security/privacy review:

- browser-pane session cookies without an expiry are promoted to persistent
  cookies so sign-ins survive restarts
- browser history is stored locally in plaintext JSON under Electron's
  `userData` directory
- editor pane URLs are excluded from browser history because they can contain
  connection tokens
