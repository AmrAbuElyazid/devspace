import { expect, test } from "vitest";

import {
  BROWSER_CRASH_RECOVERY_MAX_ATTEMPTS,
  BROWSER_CRASH_RECOVERY_WINDOW_MS,
  INITIAL_BROWSER_CRASH_RECOVERY_STATE,
  planBrowserCrashRecovery,
  type BrowserCrashRecoveryState,
} from "./browser-crash-recovery";

test("first crash is retried immediately after the base delay", () => {
  const plan = planBrowserCrashRecovery(INITIAL_BROWSER_CRASH_RECOVERY_STATE, 1_000);

  expect(plan).not.toBeNull();
  expect(plan?.delayMs).toBe(250);
  expect(plan?.state).toEqual({ attempts: 1, windowStartedAt: 1_000 });
});

test("backoff doubles across attempts within one window", () => {
  let state: BrowserCrashRecoveryState = INITIAL_BROWSER_CRASH_RECOVERY_STATE;
  const delays: number[] = [];

  for (let attempt = 0; attempt < BROWSER_CRASH_RECOVERY_MAX_ATTEMPTS; attempt += 1) {
    const plan = planBrowserCrashRecovery(state, 1_000 + attempt);
    expect(plan).not.toBeNull();
    delays.push(plan!.delayMs);
    state = plan!.state;
  }

  expect(delays).toEqual([250, 500, 1_000]);
});

test("the window start is pinned to the first crash, not refreshed by later ones", () => {
  const first = planBrowserCrashRecovery(INITIAL_BROWSER_CRASH_RECOVERY_STATE, 1_000);
  const second = planBrowserCrashRecovery(first!.state, 5_000);

  expect(second?.state.windowStartedAt).toBe(1_000);
});

test("a pane that exhausts its budget stops being retried", () => {
  let state: BrowserCrashRecoveryState = INITIAL_BROWSER_CRASH_RECOVERY_STATE;

  for (let attempt = 0; attempt < BROWSER_CRASH_RECOVERY_MAX_ATTEMPTS; attempt += 1) {
    state = planBrowserCrashRecovery(state, 1_000)!.state;
  }

  expect(planBrowserCrashRecovery(state, 1_000)).toBeNull();
});

test("the budget refills once the rolling window elapses", () => {
  let state: BrowserCrashRecoveryState = INITIAL_BROWSER_CRASH_RECOVERY_STATE;

  for (let attempt = 0; attempt < BROWSER_CRASH_RECOVERY_MAX_ATTEMPTS; attempt += 1) {
    state = planBrowserCrashRecovery(state, 1_000)!.state;
  }
  expect(planBrowserCrashRecovery(state, 1_000)).toBeNull();

  // A crash long after the loop ended is a new incident, not a continuation.
  const later = planBrowserCrashRecovery(state, 1_000 + BROWSER_CRASH_RECOVERY_WINDOW_MS);

  expect(later).not.toBeNull();
  expect(later?.delayMs).toBe(250);
  expect(later?.state).toEqual({
    attempts: 1,
    windowStartedAt: 1_000 + BROWSER_CRASH_RECOVERY_WINDOW_MS,
  });
});

test("a crash exactly at the window boundary opens a new window", () => {
  const state: BrowserCrashRecoveryState = { attempts: 2, windowStartedAt: 0 };

  const plan = planBrowserCrashRecovery(state, BROWSER_CRASH_RECOVERY_WINDOW_MS);

  expect(plan?.state).toEqual({ attempts: 1, windowStartedAt: BROWSER_CRASH_RECOVERY_WINDOW_MS });
});
