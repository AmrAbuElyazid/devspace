# Release Process

Devspace is currently released with a lightweight macOS-first workflow.

## Current Assumptions

- platform target: macOS
- architecture target: Apple Silicon
- branch model: release from `main`
- native addon: rebuild before packaging when native code changes

## Verification Before A Release Build

Run the standard repo gate from the root:

```sh
bun run fmt:check
bun run typecheck
bun run lint
bun run knip
bun run test
```

If the Ghostty native bridge or bundled native resources changed, rebuild it:

```sh
bun run rebuild-native
```

## Build A macOS Release Directory

From the repo root:

```sh
bun run dist
```

This produces the Electron Builder output configured by `apps/desktop/package.json`.

## Promote A Build Into /Applications

For local day-to-day use, the repo includes a helper script:

```sh
scripts/promote.sh
```

This script:

- runs the verification gate
- builds the app unless `--skip-build` is used
- replaces `/Applications/Devspace.app`
- updates the CLI symlink if it already exists

## Versioning Notes

Current guidance:

- keep `main` releasable
- use tags for meaningful release points
- prefer one short release summary per tag
- avoid mixing broad cleanup with release-critical changes right before tagging

## Future Improvements

- signed/notarized release flow
- changelog discipline per release
- artifact publishing from CI
- clearer versioning policy for `ghostty-electron`
