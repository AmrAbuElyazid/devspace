# Terminal Performance Benchmarks

Benchmarked devspace's native Ghostty terminal integration against four other terminals using [vtebench](https://github.com/alacritty/vtebench) — the Alacritty team's PTY read throughput benchmark.

## Test Setup

- **Machine**: Apple Silicon Mac
- **Tool**: vtebench v0.3.1 (measures how fast a terminal reads and processes 1MB of VT data from the PTY)
- **Date**: March 2026
- **All terminals ran the same benchmark suite in parallel**

### Terminals tested

| Terminal           | Renderer                                    | PTY                 |
| ------------------ | ------------------------------------------- | ------------------- |
| **devspace**       | libghostty (Metal) via Electron N-API addon | libghostty internal |
| **cmux**           | libghostty (Metal) via native Swift         | libghostty internal |
| **Alacritty**      | Custom GPU renderer (OpenGL/Metal)          | Built-in            |
| **macOS Terminal** | Native AppKit (software)                    | Built-in            |
| **VSCode**         | xterm.js (JavaScript canvas)                | node-pty            |

### What vtebench measures

vtebench writes controlled VT escape sequence payloads to the terminal's PTY and measures how long the terminal takes to consume each 1MB chunk. This tests the full pipeline: PTY read, VT parser, cell grid updates, and renderer throughput. Lower times = faster terminal.

**Important caveat** (from vtebench's own README): this benchmark only measures PTY read throughput. It does not measure frame rate, input latency, or perceived responsiveness — factors that also matter for terminal UX.

## Results

All values in milliseconds per 1MB of VT data (lower is better).

```
                          VSCode   Terminal   Alacritty    cmux    devspace
                          ──────   ────────   ─────────   ─────   ────────
dense_cells               99.12     24.12       7.59       8.55     10.82
medium_cells             106.64     40.95       9.73      10.66     15.75
scrolling               1019.67    160.21      24.91      23.00     27.17
scrolling_bottom_region  261.74    132.57      21.06      34.73     25.53
scrolling_bottom_small   262.87    131.62      18.99      34.89     25.65
scrolling_fullscreen    1904.80    161.62      25.28      32.59     27.88
scrolling_top_region     503.85    131.17      34.72      25.36     24.47
scrolling_top_small      264.58    270.95      18.45      35.09     25.27
sync_medium_cells        109.05     88.13      17.10      12.59     15.11
unicode                   57.46     37.99      14.01       6.99      7.25
```

## Analysis

### Tier 1: Native GPU renderers (5-35ms)

Alacritty, cmux, and devspace all fall in the same performance tier. They process 1MB of terminal data in 7-28ms, meaning they can handle sustained output of **35-140 MB/s** without dropping below 60fps rendering.

- **Alacritty** is fastest on cell-heavy benchmarks (dense/medium cells) and most scrolling variants.
- **cmux** leads on unicode (6.99ms) and synchronized output (12.59ms).
- **devspace** is competitive across the board, with the fastest result on `scrolling_top_region` (24.47ms) and near-identical unicode performance to cmux (7.25ms vs 6.99ms).

### Tier 2: Native software renderer (24-271ms)

macOS Terminal is 3-10x slower than Tier 1. Its software renderer can't keep up with heavy VT output, with particularly poor results on scroll region operations (271ms on `scrolling_top_small_region`).

### Tier 3: JavaScript renderer (57-1905ms)

VSCode's xterm.js terminal is 10-75x slower than Tier 1. Full-screen scrolling takes 1.9 seconds per MB — this is why heavy output in VSCode's terminal visibly stutters. The JavaScript canvas renderer and IPC overhead through node-pty are the bottleneck.

### devspace vs cmux (same engine, different embedding)

Both use libghostty for rendering, so the difference isolates the embedding overhead (Electron vs native Swift).

```
                        cmux    devspace   delta
                        ─────   ────────   ─────
dense_cells              8.55     10.82     +27%
medium_cells            10.66     15.75     +48%
scrolling               23.00     27.17     +18%
scrolling_fullscreen    32.59     27.88     -14%
scrolling_top_region    25.36     24.47      -4%
sync_medium_cells       12.59     15.11     +20%
unicode                  6.99      7.25      +4%
```

devspace is ~20-30% slower on cell-rendering benchmarks. This overhead comes from Electron's window compositor — the Ghostty NSView shares the content view with Electron's own views, adding compositing cost per frame. On scrolling and unicode, where the bottleneck shifts to the VT parser and PTY read (identical code in both), they converge.

The 20-30% cell rendering overhead is the cost of running inside Electron — a reasonable tradeoff for React UI, split panes, browser integration, Monaco editor, and the full devspace feature set.

### devspace vs VSCode (what we replaced)

devspace previously used xterm.js (the same renderer as VSCode). The migration to native Ghostty improved PTY throughput by **10-75x** across all benchmarks:

```
                        xterm.js    Ghostty    speedup
                        ────────    ───────    ───────
dense_cells               99.12      10.82       9x
medium_cells             106.64      15.75       7x
scrolling               1019.67      27.17      38x
scrolling_fullscreen    1904.80      27.88      68x
unicode                   57.46       7.25       8x
```

## Running the benchmarks

### vtebench (PTY throughput)

Requires Rust. Run in each terminal you want to test:

```bash
cd /path/to/vtebench && cargo run --release
```

### Included scripts

Quick benchmark (10 tests, ~15 seconds):

```bash
bash scripts/terminal-bench.sh
```

Stress test (6 phases, ~2 minutes):

```bash
bash scripts/terminal-stress.sh
```

Mixed-workspace Electron stress pass (builds the app, then cycles terminal/browser/editor/t3code workspaces while checking native-view profiling counters):

```bash
bun run --cwd apps/desktop test:e2e:stress
```

Note: The shell-based benchmarks measure command execution time, not terminal rendering speed. All modern terminals process shell output faster than the shell can produce it, so these scripts show similar results across terminals. Use vtebench for meaningful renderer comparisons.
