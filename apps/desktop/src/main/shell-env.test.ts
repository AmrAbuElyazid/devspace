import { beforeEach, expect, test, vi } from "vitest";

const { execFileSync } = vi.hoisted(() => ({
  execFileSync: vi.fn(),
}));

vi.mock("child_process", () => ({
  execFileSync,
}));

import { syncShellEnvironment } from "./shell-env";

const originalPlatform = process.platform;

beforeEach(() => {
  execFileSync.mockReset();
  process.env.PATH = "/usr/bin";
  delete process.env.SSH_AUTH_SOCK;
  delete process.env.SHELL;
  Object.defineProperty(process, "platform", {
    value: originalPlatform,
    configurable: true,
  });
});

test("syncShellEnvironment shells out without string interpolation", () => {
  Object.defineProperty(process, "platform", {
    value: "darwin",
    configurable: true,
  });
  process.env.SHELL = "/bin/zsh; touch /tmp/pwned";
  execFileSync.mockReturnValue(
    "__ENV_START__\n/opt/homebrew/bin\n__ENV_SEP__\n/private/tmp/agent.sock\n__ENV_END__",
  );

  syncShellEnvironment();

  expect(execFileSync).toHaveBeenCalledWith(
    "/bin/zsh; touch /tmp/pwned",
    [
      "-ilc",
      "echo __ENV_START__ && printenv PATH && echo __ENV_SEP__ && (printenv SSH_AUTH_SOCK 2>/dev/null || true) && echo __ENV_END__",
    ],
    { encoding: "utf-8", timeout: 5000 },
  );
  expect(process.env.PATH).toBe("/opt/homebrew/bin");
  expect(process.env.SSH_AUTH_SOCK).toBe("/private/tmp/agent.sock");
});

test("syncShellEnvironment is a no-op outside darwin", () => {
  Object.defineProperty(process, "platform", {
    value: "linux",
    configurable: true,
  });

  syncShellEnvironment();

  expect(execFileSync).not.toHaveBeenCalled();
});
