#!/usr/bin/env bash

set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"

cd "$repo_root"

printf 'Running pre-push checks...\n'
bun run fmt
bun run lint
bun run knip
bun run typecheck
bun run test
