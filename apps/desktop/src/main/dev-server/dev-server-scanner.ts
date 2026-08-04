import type { TmuxPaneProcess } from "../managed-tmux";
import type { DevServerPorts } from "../../shared/dev-server";
import {
  attributePorts,
  collectSubtrees,
  parseLsofListeners,
  parseProcessTable,
} from "./port-scan";

export interface DevServerScannerDeps {
  listPaneProcesses: () => Promise<TmuxPaneProcess[]>;
  /** `ps -axo pid=,ppid=` output. */
  readProcessTable: () => Promise<string>;
  /** `lsof … -Fpn` output for the given pids. */
  readListeners: (pids: number[]) => Promise<string>;
  /** Called only when the answer differs from the last one delivered. */
  emit: (ports: DevServerPorts[]) => void;
}

/**
 * When to sweep after tmux reports that a pane's foreground command changed.
 *
 * A dev server does not bind its port the instant its command starts, but it
 * also does not take a minute. Three attempts, front-loaded then decaying,
 * cover the range from a Bun server that is listening before the shell has
 * finished echoing to a Next.js build that takes a few seconds to warm.
 */
export const PORT_SCAN_BURST_MS = [0, 1_200, 4_000] as const;

/**
 * How many quiet poll ticks pass before a sweep happens anyway.
 *
 * The command signature catches every start and stop, so this exists purely
 * for the case it cannot see: a server already running under a command that
 * binds a *second* port later, or one that gives up its port without exiting.
 * At the terminal manager's 5s tick this is half a minute.
 */
export const PORT_SCAN_IDLE_TICKS = 6;

/** `pane_current_command` values that mean "sitting at a prompt". */
const SHELL_COMMANDS = new Set(["zsh", "bash", "fish", "sh", "dash", "ksh", "nu", "tcsh", "csh"]);

function signatureOf(panes: TmuxPaneProcess[]): string {
  return panes
    .map((pane) => `${pane.sessionId}:${pane.pid}:${pane.command}`)
    .toSorted()
    .join("|");
}

function serialize(ports: DevServerPorts[]): string {
  return ports
    .map((entry) => `${entry.sessionId}=${entry.ports.join(",")}`)
    .toSorted()
    .join("|");
}

/**
 * Watches managed tmux panes for listening TCP ports.
 *
 * Driven by `poll()`, which the terminal manager already calls on a timer for
 * directory tracking. Polling is only the *trigger*: the expensive part — a
 * process table plus an `lsof` — runs when tmux says a pane's foreground
 * command changed, which is exactly the moment a dev server can have started
 * or stopped. Sitting at a prompt costs nothing beyond the tmux call that was
 * happening anyway.
 */
export class DevServerScanner {
  private lastSignature: string | null = null;
  private lastEmitted = "";
  private idleTicks = 0;
  private sweepInFlight = false;
  private sweepAgain = false;
  private readonly burstTimers = new Set<NodeJS.Timeout>();

  constructor(private readonly deps: DevServerScannerDeps) {}

  /**
   * One tick of the poll loop. Cheap unless something moved.
   *
   * Best effort throughout: a failed sweep leaves the previous ports on screen
   * rather than blanking them, because a transient `lsof` failure is far more
   * likely than every dev server stopping at once.
   */
  async poll(): Promise<void> {
    let panes: TmuxPaneProcess[];
    try {
      panes = await this.deps.listPaneProcesses();
    } catch {
      return;
    }

    const signature = signatureOf(panes);
    const changed = signature !== this.lastSignature;
    this.lastSignature = signature;

    if (changed) {
      this.idleTicks = 0;
      this.scheduleBurst();
      return;
    }

    // Nothing to attribute ports to, so nothing to look for.
    if (panes.length === 0) return;

    this.idleTicks += 1;
    if (this.idleTicks < PORT_SCAN_IDLE_TICKS) return;
    this.idleTicks = 0;
    await this.sweep();
  }

  /** Drops every pending sweep. The scanner stays usable afterwards. */
  stop(): void {
    for (const timer of this.burstTimers) clearTimeout(timer);
    this.burstTimers.clear();
  }

  /** Forgets what was last reported, so the next sweep emits unconditionally. */
  reset(): void {
    this.stop();
    this.lastSignature = null;
    this.lastEmitted = "";
    this.idleTicks = 0;
  }

  private scheduleBurst(): void {
    this.stop();
    for (const delay of PORT_SCAN_BURST_MS) {
      if (delay === 0) {
        void this.sweep();
        continue;
      }
      const timer = setTimeout(() => {
        this.burstTimers.delete(timer);
        void this.sweep();
      }, delay);
      // Background upkeep should never be the reason the process stays alive.
      timer.unref?.();
      this.burstTimers.add(timer);
    }
  }

  private async sweep(): Promise<void> {
    // Overlapping sweeps would race to emit, and the loser could publish the
    // older answer. Collapse them and run one more round at the end instead.
    if (this.sweepInFlight) {
      this.sweepAgain = true;
      return;
    }
    this.sweepInFlight = true;
    try {
      await this.sweepOnce();
    } catch {
      // Left to the next tick; the previous ports stay on screen.
    } finally {
      this.sweepInFlight = false;
      if (this.sweepAgain) {
        this.sweepAgain = false;
        void this.sweep();
      }
    }
  }

  private async sweepOnce(): Promise<void> {
    const panes = await this.deps.listPaneProcesses();

    const rootsBySession = new Map<string, number[]>();
    for (const pane of panes) {
      const roots = rootsBySession.get(pane.sessionId);
      if (roots) roots.push(pane.pid);
      else rootsBySession.set(pane.sessionId, [pane.pid]);
    }

    if (rootsBySession.size === 0) {
      this.publish([]);
      return;
    }

    // Every session where the only thing running is the shell itself can be
    // skipped: a prompt has no children, so it can hold no listener. Panes
    // still count towards their session, so a split with one busy pane and one
    // idle pane is scanned whole.
    const busySessions = new Set(
      panes.filter((pane) => !SHELL_COMMANDS.has(pane.command)).map((pane) => pane.sessionId),
    );
    for (const sessionId of rootsBySession.keys()) {
      if (!busySessions.has(sessionId)) rootsBySession.delete(sessionId);
    }
    if (rootsBySession.size === 0) {
      this.publish([]);
      return;
    }

    const { all, byKey } = collectSubtrees(
      parseProcessTable(await this.deps.readProcessTable()),
      rootsBySession,
    );
    if (all.size === 0) {
      this.publish([]);
      return;
    }

    const listeners = parseLsofListeners(await this.deps.readListeners([...all]));
    this.publish(attributePorts(byKey, listeners).filter((entry) => entry.ports.length > 0));
  }

  private publish(ports: DevServerPorts[]): void {
    const serialized = serialize(ports);
    if (serialized === this.lastEmitted) return;
    this.lastEmitted = serialized;
    this.deps.emit(ports);
  }
}
