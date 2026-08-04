/**
 * Retry policy for browser panes whose renderer process died.
 *
 * A crashed pane used to go straight to the failure card, which put a manual
 * retry in front of the user for what is usually a transient GPU or OOM kill
 * that a reload fixes outright. This budgets a few automatic reloads instead,
 * and only falls through to the card once the pane has proven it cannot stay
 * up — a pane crash-looping on every load must not reload forever.
 *
 * The budget is a *rolling* window rather than a lifetime count: a pane that
 * crashed twice this morning and once again eight hours later is not in a
 * crash loop, and should still get its automatic reload.
 */

export const BROWSER_CRASH_RECOVERY_WINDOW_MS = 30_000;
export const BROWSER_CRASH_RECOVERY_MAX_ATTEMPTS = 3;
const BROWSER_CRASH_RECOVERY_BASE_DELAY_MS = 250;

export interface BrowserCrashRecoveryState {
  readonly attempts: number;
  readonly windowStartedAt: number | null;
}

interface BrowserCrashRecoveryPlan {
  /** Backoff before the reload, so a fast crash loop does not spin the CPU. */
  readonly delayMs: number;
  readonly state: BrowserCrashRecoveryState;
}

export const INITIAL_BROWSER_CRASH_RECOVERY_STATE: BrowserCrashRecoveryState = {
  attempts: 0,
  windowStartedAt: null,
};

/**
 * Decide whether a crashed pane should be reloaded, and after how long.
 *
 * Returns `null` when the pane has exhausted its budget for the current
 * window, which is the caller's signal to surface the failure card.
 */
export function planBrowserCrashRecovery(
  state: BrowserCrashRecoveryState,
  now: number,
): BrowserCrashRecoveryPlan | null {
  const startsNewWindow =
    state.windowStartedAt === null ||
    now - state.windowStartedAt >= BROWSER_CRASH_RECOVERY_WINDOW_MS;
  const attempts = startsNewWindow ? 0 : state.attempts;

  if (attempts >= BROWSER_CRASH_RECOVERY_MAX_ATTEMPTS) {
    return null;
  }

  return {
    // 250ms, 500ms, 1s. Long enough to let a wedged GPU process be reaped,
    // short enough that a recoverable crash still feels like a flicker.
    delayMs: BROWSER_CRASH_RECOVERY_BASE_DELAY_MS * 2 ** attempts,
    state: {
      attempts: attempts + 1,
      windowStartedAt: startsNewWindow ? now : state.windowStartedAt,
    },
  };
}
