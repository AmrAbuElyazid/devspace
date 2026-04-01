# Security Policy

## Reporting A Vulnerability

Please do not report security vulnerabilities in public issues.

If private vulnerability reporting is enabled for the repository, use that
channel. Otherwise, contact the maintainer directly before public disclosure.

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
