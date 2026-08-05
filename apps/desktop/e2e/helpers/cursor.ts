import { test } from "@playwright/test";
import { execFile } from "child_process";
import { statSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const SOURCE = join(__dirname, "../fixtures/drag.swift");
const BINARY = join(tmpdir(), "devspace-e2e-drag");
const SCROLL_SOURCE = join(__dirname, "../fixtures/scroll.swift");
const SCROLL_BINARY = join(tmpdir(), "devspace-e2e-scroll");

let built: Promise<void> | null = null;
let scrollBuilt: Promise<void> | null = null;
let usable: boolean | null = null;

function isStale(binary: string, source: string): boolean {
  try {
    return statSync(binary).mtimeMs < statSync(source).mtimeMs;
  } catch {
    return true;
  }
}

async function compile(binary: string, source: string): Promise<void> {
  if (!isStale(binary, source)) return;
  await execFileAsync("/usr/bin/swiftc", ["-O", "-o", binary, source]);
}

async function build(): Promise<void> {
  await compile(BINARY, SOURCE);
}

/** Scroll the wheel over `(x, y)`; negative lines scroll the content down. */
export async function scrollAt(x: number, y: number, lines: number, steps = 6): Promise<void> {
  scrollBuilt ??= compile(SCROLL_BINARY, SCROLL_SOURCE);
  await scrollBuilt;
  await execFileAsync(SCROLL_BINARY, [
    String(Math.round(x)),
    String(Math.round(y)),
    String(Math.round(lines)),
    String(steps),
  ]);
}

/**
 * Drive the real cursor from `(x0, y0)` to `(x1, y1)` with the button down.
 *
 * Resolves to where the cursor actually landed, which is how the caller can
 * tell a working driver from one the OS silently ignored.
 */
async function drag(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  steps = 20,
): Promise<{ x: number; y: number }> {
  built ??= build();
  await built;
  const { stdout } = await execFileAsync(BINARY, [
    String(Math.round(x0)),
    String(Math.round(y0)),
    String(Math.round(x1)),
    String(Math.round(y1)),
    String(steps),
  ]);
  const [x, y] = stdout.trim().split(/\s+/).map(Number);
  return { x: x ?? -1, y: y ?? -1 };
}

/**
 * Skip the calling test unless this machine will let us move the cursor.
 *
 * `CGEvent.post` needs Accessibility permission and fails silently without it,
 * so the check is empirical: move the cursor somewhere harmless and see whether
 * it went. A headless runner without the permission gets a skip rather than a
 * confusing failure in a test about pane occlusion.
 */
export async function requireCursorDriver(): Promise<typeof drag> {
  if (usable === null) {
    try {
      const landed = await drag(300, 300, 320, 300, 2);
      usable = Math.abs(landed.x - 320) <= 2 && Math.abs(landed.y - 300) <= 2;
    } catch {
      usable = false;
    }
  }
  test.skip(!usable, "needs Accessibility permission to drive a real cursor");
  return drag;
}
