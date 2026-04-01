# Contributing

Thanks for your interest in contributing to Devspace.

## Before You Start

The project is moving quickly. Before investing in a large change:

- open an issue or discussion for major features or refactors
- check the roadmap in `docs/roadmap/`
- prefer small, focused changes over broad rewrites

## Development Setup

From the repo root:

```sh
bun install
```

Run the app:

```sh
bun run dev
```

If the native Ghostty bridge changes:

```sh
bun run rebuild-native --filter=@devspace/desktop
```

## Required Checks

Before submitting changes, make sure all of these pass from the repo root:

```sh
bun run fmt:check
bun run typecheck
bun run lint
bun run knip
bun run test
```

## Testing

- Use `bun run test`, not `bun test`
- Tests are primarily in `apps/desktop/`
- Prefer adding targeted tests for behavior changes when the code path is testable

## Style

- Use Bun and Bun workspaces, not npm
- Keep changes as small as possible
- Prefer direct, maintainable code over abstraction for its own sake
- Preserve existing architecture and UI patterns unless the change is intentionally structural

## Pull Requests

When opening a PR:

- explain the problem and the reason for the change
- note any important tradeoffs
- include verification details
- keep unrelated cleanup out of the same PR when possible

## Communication

If behavior is ambiguous, ask before adding compatibility layers or speculative abstractions.
