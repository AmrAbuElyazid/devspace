import { beforeEach, describe, expect, test, vi } from "vitest";
import { buildShellIntegrationEnvVars, detectShellName, TerminalManager } from "./terminal-manager";
import {
  getMainProcessPerformanceSnapshot,
  resetMainProcessPerformanceCounters,
} from "./performance-monitor";

beforeEach(() => {
  resetMainProcessPerformanceCounters();
});

describe("detectShellName", () => {
  test("extracts basename from SHELL env var", () => {
    const original = process.env.SHELL;
    process.env.SHELL = "/bin/bash";
    expect(detectShellName()).toBe("bash");
    process.env.SHELL = "/usr/local/bin/fish";
    expect(detectShellName()).toBe("fish");
    process.env.SHELL = original;
  });

  test("defaults to zsh when SHELL is unset", () => {
    const original = process.env.SHELL;
    delete process.env.SHELL;
    expect(detectShellName()).toBe("zsh");
    process.env.SHELL = original;
  });
});

describe("buildShellIntegrationEnvVars", () => {
  const dirs = {
    zshDir: "/tmp/devspace-zsh",
    ghosttyResourcesDir: "/tmp/ghostty-resources",
  };

  test("zsh: sets ZDOTDIR to wrapper dir", () => {
    const result = buildShellIntegrationEnvVars("zsh", dirs, {}, {});
    expect(result.ZDOTDIR).toBe("/tmp/devspace-zsh");
    expect(result.DEVSPACE_ORIG_ZDOTDIR).toBeUndefined();
  });

  test("zsh: preserves original ZDOTDIR", () => {
    const result = buildShellIntegrationEnvVars("zsh", dirs, {}, { ZDOTDIR: "/home/user" });
    expect(result.ZDOTDIR).toBe("/tmp/devspace-zsh");
    expect(result.DEVSPACE_ORIG_ZDOTDIR).toBe("/home/user");
  });

  test("bash: sets PROMPT_COMMAND that sources ghostty.bash", () => {
    const result = buildShellIntegrationEnvVars("bash", dirs, {}, {});
    expect(result.PROMPT_COMMAND).toContain("ghostty.bash");
    expect(result.PROMPT_COMMAND).toContain("unset PROMPT_COMMAND");
    expect(result.ZDOTDIR).toBeUndefined();
  });

  test("bash: single-quotes integration path to avoid shell interpolation", () => {
    const result = buildShellIntegrationEnvVars(
      "bash",
      { ...dirs, ghosttyResourcesDir: "/tmp/gho'stty/$HOME" },
      {},
      {},
    );

    expect(result.PROMPT_COMMAND).toContain(
      "[ -f '/tmp/gho'\"'\"'stty/$HOME/shell-integration/bash/ghostty.bash' ]",
    );
    expect(result.PROMPT_COMMAND).not.toContain(
      '"/tmp/gho\'stty/$HOME/shell-integration/bash/ghostty.bash"',
    );
  });

  test("fish: prepends XDG_DATA_DIRS with fish integration path", () => {
    const result = buildShellIntegrationEnvVars("fish", dirs, {}, {});
    expect(result.XDG_DATA_DIRS).toMatch(/^\/tmp\/ghostty-resources\/shell-integration\/fish:/);
    expect(result.GHOSTTY_SHELL_INTEGRATION_XDG_DIR).toBe(
      "/tmp/ghostty-resources/shell-integration/fish",
    );
  });

  test("fish: appends to existing XDG_DATA_DIRS", () => {
    const result = buildShellIntegrationEnvVars(
      "fish",
      dirs,
      {},
      {
        XDG_DATA_DIRS: "/custom/share",
      },
    );
    expect(result.XDG_DATA_DIRS).toBe(
      "/tmp/ghostty-resources/shell-integration/fish:/custom/share",
    );
  });

  test("unknown shell: returns caller env vars unmodified", () => {
    const result = buildShellIntegrationEnvVars("elvish", dirs, { FOO: "bar" }, {});
    expect(result).toEqual({ FOO: "bar" });
  });

  test("merges caller env vars with shell integration vars", () => {
    const result = buildShellIntegrationEnvVars("bash", dirs, { MY_VAR: "hello" }, {});
    expect(result.MY_VAR).toBe("hello");
    expect(result.PROMPT_COMMAND).toBeDefined();
  });

  test("zsh: no-op when zshDir is null", () => {
    const result = buildShellIntegrationEnvVars(
      "zsh",
      { zshDir: null, ghosttyResourcesDir: "/tmp/res" },
      {},
      {},
    );
    expect(result.ZDOTDIR).toBeUndefined();
  });

  test("bash: no-op when ghosttyResourcesDir is null", () => {
    const result = buildShellIntegrationEnvVars(
      "bash",
      { zshDir: "/tmp/zsh", ghosttyResourcesDir: null },
      {},
      {},
    );
    expect(result.PROMPT_COMMAND).toBeUndefined();
  });
});

describe("TerminalManager profiling", () => {
  test("records terminal lifecycle timings for profiling", async () => {
    const manager = new TerminalManager();
    const terminal = {
      createSurface: vi.fn(),
      destroySurface: vi.fn(),
      showSurface: vi.fn(),
      hideSurface: vi.fn(),
      focusSurface: vi.fn(),
      setVisibleSurfaces: vi.fn(),
      setBounds: vi.fn(),
      blurSurfaces: vi.fn(),
    };

    (manager as unknown as { terminal: typeof terminal }).terminal = terminal;

    await manager.createSurface("surface-1", { cwd: "/tmp/project" });
    manager.showSurface("surface-1");
    manager.hideSurface("surface-1");
    manager.focusSurface("surface-1");
    manager.setVisibleSurfaces(["surface-1"]);
    manager.setBounds("surface-1", { x: 10, y: 20, width: 300, height: 200 });
    manager.blurSurfaces();
    manager.destroySurface("surface-1");

    const snapshot = getMainProcessPerformanceSnapshot();

    expect(snapshot.operations).toMatchObject({
      "terminal.createSurface": { count: 1 },
      "terminal.showSurface": { count: 1 },
      "terminal.hideSurface": { count: 1 },
      "terminal.focusSurface": { count: 1 },
      "terminal.setVisibleSurfaces": { count: 1 },
      "terminal.setBounds": { count: 1 },
      "terminal.blurSurfaces": { count: 1 },
      "terminal.destroySurface": { count: 1 },
    });
  });

  test("prepares a managed session before attaching the Ghostty client", async () => {
    const manager = new TerminalManager();
    const terminal = { createSurface: vi.fn() };
    const managedTmux = {
      ensureSession: vi.fn(async () => {}),
      buildAttachCommand: vi.fn(() => "managed attach command"),
      killSession: vi.fn(async () => true),
      listSessions: vi.fn(async () => [
        { sessionId: "session-1", attachedClients: 1, createdAt: 1 },
      ]),
    };

    (manager as unknown as { terminal: typeof terminal }).terminal = terminal;
    (manager as unknown as { managedTmux: typeof managedTmux }).managedTmux = managedTmux;

    await manager.createSurface("surface-1", {
      backend: "managed-tmux",
      sessionId: "session-1",
      cwd: "/tmp/project",
    });

    expect(managedTmux.ensureSession).toHaveBeenCalledWith({
      sessionId: "session-1",
      cwd: "/tmp/project",
      envVars: {},
    });
    expect(terminal.createSurface).toHaveBeenCalledWith("surface-1", {
      cwd: "/tmp/project",
      command: "managed attach command",
    });
    await expect(manager.killManagedSession("session-1")).resolves.toBe(true);
    expect(managedTmux.killSession).toHaveBeenCalledWith("session-1");
    await expect(manager.listManagedSessions()).resolves.toEqual([
      { sessionId: "session-1", attachedClients: 1, createdAt: 1 },
    ]);
  });
});
