#!/bin/bash
# Terminal performance benchmark
# Run this in devspace, Alacritty, and Terminal.app to compare.
#
# Usage: bash scripts/terminal-bench.sh

set -euo pipefail

BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[32m'
CYAN='\033[36m'
YELLOW='\033[33m'
RED='\033[31m'
RESET='\033[0m'

results=()

bench() {
  local name="$1"
  shift
  printf "${CYAN}%-40s${RESET}" "$name"

  # Warm up (discard)
  "$@" > /dev/null 2>&1 || true

  # Timed run — output goes to /dev/null so we measure terminal throughput
  # For display tests, output goes to the terminal
  local start end elapsed
  start=$(python3 -c 'import time; print(time.time())')
  "$@"
  end=$(python3 -c 'import time; print(time.time())')
  elapsed=$(python3 -c "print(f'{$end - $start:.3f}')")

  printf "  ${GREEN}%8s s${RESET}\n" "$elapsed"
  results+=("$name|$elapsed")
}

bench_to_terminal() {
  local name="$1"
  shift
  printf "${CYAN}%-40s${RESET}" "$name"

  local start end elapsed
  start=$(python3 -c 'import time; print(time.time())')
  "$@"
  end=$(python3 -c 'import time; print(time.time())')
  elapsed=$(python3 -c "print(f'{$end - $start:.3f}')")

  printf "  ${GREEN}%8s s${RESET}\n" "$elapsed"
  results+=("$name|$elapsed")
}

printf "\n${BOLD}=== Terminal Performance Benchmark ===${RESET}\n"
printf "${DIM}Terminal: ${TERM_PROGRAM:-unknown}  Shell: $SHELL${RESET}\n"
printf "${DIM}Date: $(date)${RESET}\n\n"

# ─────────────────────────────────────────────────────────
# Test 1: Raw line throughput (seq piped to terminal)
# ─────────────────────────────────────────────────────────
printf "${BOLD}--- Throughput Tests ---${RESET}\n"

bench "seq 1..100000 (100K lines)" bash -c 'seq 1 100000'
bench "seq 1..500000 (500K lines)" bash -c 'seq 1 500000'
bench "seq 1..1000000 (1M lines)" bash -c 'seq 1 1000000'

# ─────────────────────────────────────────────────────────
# Test 2: Dense random data (wide lines, no newlines)
# ─────────────────────────────────────────────────────────
printf "\n${BOLD}--- Dense Output Tests ---${RESET}\n"

bench "base64 1MB random data" bash -c 'head -c 1000000 /dev/urandom | base64'
bench "base64 5MB random data" bash -c 'head -c 5000000 /dev/urandom | base64'

# ─────────────────────────────────────────────────────────
# Test 3: Color/escape sequence rendering
# ─────────────────────────────────────────────────────────
printf "\n${BOLD}--- Escape Sequence Tests ---${RESET}\n"

bench "10K colored lines" bash -c '
for i in $(seq 1 10000); do
  printf "\033[3%dm%05d The quick brown fox jumps over the lazy dog\033[0m\n" $((i % 8)) $i
done
'

bench "10K lines with cursor movement" bash -c '
for i in $(seq 1 10000); do
  printf "\033[1G\033[K%05d Processing item %d of 10000...\n" $i $i
done
'

# ─────────────────────────────────────────────────────────
# Test 4: Rapid small writes (simulates interactive use)
# ─────────────────────────────────────────────────────────
printf "\n${BOLD}--- Interactive Simulation ---${RESET}\n"

bench "50K small writes (printf loop)" bash -c '
for i in $(seq 1 50000); do
  printf "%d\n" $i
done
'

# ─────────────────────────────────────────────────────────
# Test 5: Unicode rendering
# ─────────────────────────────────────────────────────────
printf "\n${BOLD}--- Unicode Tests ---${RESET}\n"

bench "5K lines CJK + emoji" bash -c '
for i in $(seq 1 5000); do
  echo "$i: Hello 世界 🚀 こんにちは 🎉 안녕하세요 🔥"
done
'

# ─────────────────────────────────────────────────────────
# Test 6: Alternating screen buffer (simulates TUI apps)
# ─────────────────────────────────────────────────────────
printf "\n${BOLD}--- Alt Screen Buffer ---${RESET}\n"

bench "1000 alt-screen cycles" bash -c '
for i in $(seq 1 1000); do
  printf "\033[?1049h"  # enter alt screen
  printf "\033[2J"       # clear
  printf "\033[1;1HFrame %d" $i
  printf "\033[?1049l"  # leave alt screen
done
'

# ─────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────
printf "\n${BOLD}=== Summary ===${RESET}\n"
printf "${DIM}%-40s %10s${RESET}\n" "Test" "Time (s)"
printf "${DIM}%-40s %10s${RESET}\n" "────────────────────────────────────────" "──────────"
for r in "${results[@]}"; do
  IFS='|' read -r name time <<< "$r"
  printf "%-40s %10s\n" "$name" "$time"
done

total=$(python3 -c "print(f'{sum([float(r.split(\"|\")[1]) for r in [$(printf '"%s",' "${results[@]}")]]):,.3f}')")
printf "${BOLD}%-40s %10s${RESET}\n" "TOTAL" "$total"
printf "\n"
