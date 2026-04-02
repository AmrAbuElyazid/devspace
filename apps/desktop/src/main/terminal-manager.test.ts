import { describe, expect, test } from "vitest";
import { buildShellIntegrationEnvVars, detectShellName } from "./terminal-manager";

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
