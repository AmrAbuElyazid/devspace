#!/bin/bash
# Terminal STRESS TEST — push terminals to their limits
# Run in devspace, Alacritty, Terminal.app, cmux to find breaking points.
#
# Usage: bash scripts/terminal-stress.sh
#
# WARNING: Some of these tests produce massive output and may cause
# slow terminals to hang or become unresponsive. That's the point.

set -euo pipefail

BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[32m'
CYAN='\033[36m'
YELLOW='\033[33m'
RED='\033[31m'
MAGENTA='\033[35m'
RESET='\033[0m'

results=()

bench() {
  local name="$1"
  shift
  printf "${CYAN}%-50s${RESET}" "$name"

  local start end elapsed
  start=$(python3 -c 'import time; print(time.time())')
  "$@"
  end=$(python3 -c 'import time; print(time.time())')
  elapsed=$(python3 -c "print(f'{$end - $start:.3f}')")

  printf "  ${GREEN}%10s s${RESET}\n" "$elapsed"
  results+=("$name|$elapsed")
}

printf "\n${BOLD}${RED}=== TERMINAL STRESS TEST ===${RESET}\n"
printf "${DIM}Terminal: ${TERM_PROGRAM:-unknown}  Shell: $SHELL${RESET}\n"
printf "${DIM}Date: $(date)${RESET}\n"
printf "${YELLOW}This will push your terminal to its limits.${RESET}\n\n"

# ═════════════════════════════════════════════════════════
# PHASE 1: RAW THROUGHPUT — how fast can you eat bytes?
# ═════════════════════════════════════════════════════════
printf "${BOLD}${MAGENTA}══ PHASE 1: RAW THROUGHPUT ══${RESET}\n"

bench "seq 10M lines" bash -c 'seq 1 10000000'

bench "base64 20MB random data" bash -c 'head -c 20000000 /dev/urandom | base64'

bench "base64 50MB random data" bash -c 'head -c 50000000 /dev/urandom | base64'

# Generate a single massive line (no newlines) — tests line buffer limits
bench "Single 1MB line (no newline)" bash -c 'head -c 1000000 /dev/urandom | base64 -w0; echo'

bench "10K x 1KB lines (wide lines)" bash -c '
line=$(head -c 750 /dev/urandom | base64 -w0 | head -c 1000)
for i in $(seq 1 10000); do echo "$line"; done
'

# ═════════════════════════════════════════════════════════
# PHASE 2: ESCAPE SEQUENCE STORM — parser + renderer stress
# ═════════════════════════════════════════════════════════
printf "\n${BOLD}${MAGENTA}══ PHASE 2: ESCAPE SEQUENCE STORM ══${RESET}\n"

bench "100K colored lines (8 colors)" bash -c '
for i in $(seq 1 100000); do
  printf "\033[3%d;1m%05d The quick brown fox jumps\033[0m\n" $((i % 8)) $i
done
'

bench "50K lines 256-color palette" bash -c '
for i in $(seq 1 50000); do
  printf "\033[38;5;%dm%05d colored with 256-palette\033[0m\n" $((i % 256)) $i
done
'

bench "50K lines 24-bit truecolor" bash -c '
for i in $(seq 1 50000); do
  r=$((i % 256)); g=$(( (i*3) % 256)); b=$(( (i*7) % 256))
  printf "\033[38;2;%d;%d;%dm%05d truecolor rgb(%d,%d,%d)\033[0m\n" $r $g $b $i $r $g $b
done
'

bench "20K lines mixed attributes" bash -c '
for i in $(seq 1 20000); do
  printf "\033[1m%d\033[0m \033[3m%d\033[0m \033[4m%d\033[0m \033[7m%d\033[0m \033[9m%d\033[0m \033[38;5;%dm%d\033[0m\n" $i $i $i $i $i $((i%256)) $i
done
'

# ═════════════════════════════════════════════════════════
# PHASE 3: CURSOR GYMNASTICS — rapid repositioning
# ═════════════════════════════════════════════════════════
printf "\n${BOLD}${MAGENTA}══ PHASE 3: CURSOR GYMNASTICS ══${RESET}\n"

bench "50K cursor moves + overwrites" bash -c '
for i in $(seq 1 50000); do
  printf "\033[%d;%dH%05d" $((i % 50 + 1)) $((i % 80 + 1)) $i
done
printf "\033[52;1H\n"
'

bench "10K full-screen clears + redraws" bash -c '
for i in $(seq 1 10000); do
  printf "\033[2J\033[1;1H"
  printf "Frame %d - line 1\n" $i
  printf "Frame %d - line 2\n" $i
  printf "Frame %d - line 3\n" $i
done
'

bench "20K scroll region operations" bash -c '
printf "\033[1;24r"
for i in $(seq 1 20000); do
  printf "\033[24;1HScroll line %d\n" $i
done
printf "\033[r"
'

bench "100K carriage-return overwrites" bash -c '
for i in $(seq 1 100000); do
  printf "\r\033[KProgress: %d/100000 [%d%%]" $i $((i*100/100000))
done
printf "\n"
'

# ═════════════════════════════════════════════════════════
# PHASE 4: UNICODE TORTURE — complex glyph rendering
# ═════════════════════════════════════════════════════════
printf "\n${BOLD}${MAGENTA}══ PHASE 4: UNICODE TORTURE ══${RESET}\n"

bench "50K lines CJK + emoji" bash -c '
for i in $(seq 1 50000); do
  echo "$i: 世界 🚀 こんにちは 🎉 안녕하세요 🔥 العربية"
done
'

bench "20K lines mixed-width (ASCII+CJK+emoji)" bash -c '
for i in $(seq 1 20000); do
  printf "%05d hello世界こんにちは🎮🎯🎪🎭🎨 end\n" $i
done
'

bench "10K lines emoji sequences (ZWJ)" bash -c '
for i in $(seq 1 10000); do
  echo "$i: 👨‍👩‍👧‍👦 👩‍💻 🏳️‍🌈 🧑‍🔬 👨‍👨‍👧 🏴‍☠️ 🧑‍🤝‍🧑 👩‍❤️‍👨"
done
'

# ═════════════════════════════════════════════════════════
# PHASE 5: ALT-SCREEN THRASH — TUI app simulation
# ═════════════════════════════════════════════════════════
printf "\n${BOLD}${MAGENTA}══ PHASE 5: ALT-SCREEN THRASH ══${RESET}\n"

bench "10K alt-screen cycles" bash -c '
for i in $(seq 1 10000); do
  printf "\033[?1049h\033[2J\033[1;1HFrame %d" $i
  printf "\033[?1049l"
done
'

bench "5K alt-screen with full repaint" bash -c '
for i in $(seq 1 5000); do
  printf "\033[?1049h\033[2J"
  for row in $(seq 1 24); do
    printf "\033[%d;1H" $row
    printf "\033[38;5;%dm" $(( (i + row) % 256 ))
    printf "%05d %-70s" $i "Row $row of frame $i with colored text filling the line"
    printf "\033[0m"
  done
  printf "\033[?1049l"
done
'

# ═════════════════════════════════════════════════════════
# PHASE 6: SUSTAINED PRESSURE — long-running high output
# ═════════════════════════════════════════════════════════
printf "\n${BOLD}${MAGENTA}══ PHASE 6: SUSTAINED PRESSURE ══${RESET}\n"

bench "yes(1) for 5 seconds" bash -c 'timeout 5 yes "The quick brown fox jumps over the lazy dog" || true'

bench "Continuous random for 5 seconds" bash -c 'timeout 5 bash -c "while true; do head -c 4096 /dev/urandom | base64; done" || true'

bench "Rapid printf for 5 seconds" bash -c '
end=$((SECONDS+5))
i=0
while [ $SECONDS -lt $end ]; do
  printf "%d output line with some padding text here\n" $((i++))
done
printf "${DIM}  (%d lines)${RESET}" $i
'

# ═════════════════════════════════════════════════════════
# Summary
# ═════════════════════════════════════════════════════════
printf "\n\n${BOLD}${RED}=== STRESS TEST RESULTS ===${RESET}\n"
printf "${DIM}%-50s %12s${RESET}\n" "Test" "Time (s)"
printf "${DIM}%-50s %12s${RESET}\n" "──────────────────────────────────────────────────" "────────────"

phase=""
for r in "${results[@]}"; do
  IFS='|' read -r name time <<< "$r"

  # Detect phase boundaries
  case "$name" in
    "seq 10M"*) [ "$phase" != "1" ] && { printf "${MAGENTA}  Phase 1: Raw Throughput${RESET}\n"; phase="1"; } ;;
    "100K colored"*) [ "$phase" != "2" ] && { printf "${MAGENTA}  Phase 2: Escape Sequences${RESET}\n"; phase="2"; } ;;
    "50K cursor"*) [ "$phase" != "3" ] && { printf "${MAGENTA}  Phase 3: Cursor Gymnastics${RESET}\n"; phase="3"; } ;;
    "50K lines CJK"*) [ "$phase" != "4" ] && { printf "${MAGENTA}  Phase 4: Unicode Torture${RESET}\n"; phase="4"; } ;;
    "10K alt-screen"*) [ "$phase" != "5" ] && { printf "${MAGENTA}  Phase 5: Alt-Screen Thrash${RESET}\n"; phase="5"; } ;;
    "yes(1)"*) [ "$phase" != "6" ] && { printf "${MAGENTA}  Phase 6: Sustained Pressure${RESET}\n"; phase="6"; } ;;
  esac

  printf "  %-48s %12s\n" "$name" "$time"
done

total=$(python3 -c "
times = [float(r.split('|')[1]) for r in '''$(printf '%s\n' "${results[@]}")'''.strip().split('\n')]
print(f'{sum(times):,.3f}')
")
printf "\n${BOLD}%-50s %12s${RESET}\n" "TOTAL" "$total"
printf "\n"
