import { chmod, mkdtemp, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { afterEach, expect, test, vi } from "vitest";
import {
  buildExternalTmuxAttachCommand,
  ManagedTmuxManager,
  quoteCommandArgument,
  resolveManagedTmuxBinary,
  type TmuxCommandRunner,
} from "./managed-tmux";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((path) => rm(path, { recursive: true })));
});

async function makeTempDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "devspace-tmux-test-"));
  tempDirectories.push(directory);
  return directory;
}

test("packaged binary resolution never falls through to the user's tmux", async () => {
  const directory = await makeTempDirectory();
  const pathDirectory = join(directory, "path-bin");
  await import("fs/promises").then(({ mkdir, writeFile }) =>
    mkdir(pathDirectory).then(() => writeFile(join(pathDirectory, "tmux"), "#!/bin/sh\n")),
  );
  await chmod(join(pathDirectory, "tmux"), 0o755);

  expect(
    resolveManagedTmuxBinary({
      resourcesPath: join(directory, "resources"),
      isPackaged: true,
      env: { PATH: pathDirectory },
    }),
  ).toBeNull();
});

test("development binary resolution supports an explicit tmux path", async () => {
  const directory = await makeTempDirectory();
  const binaryPath = join(directory, "tmux-custom");
  await import("fs/promises").then(({ writeFile }) => writeFile(binaryPath, "#!/bin/sh\n"));
  await chmod(binaryPath, 0o755);

  expect(
    resolveManagedTmuxBinary({
      resourcesPath: join(directory, "resources"),
      isPackaged: false,
      env: { DEVSPACE_TMUX_PATH: binaryPath },
    }),
  ).toBe(binaryPath);
});

test("managed sessions use only the private socket and clear inherited tmux state", async () => {
  const userDataPath = await makeTempDirectory();
  let sessionExists = false;
  const runCommand = vi.fn<TmuxCommandRunner>(async (_binary, args, env) => {
    expect(env.TMUX).toBeUndefined();
    expect(env.TMUX_PANE).toBeUndefined();
    if (args[0] === "-V") return { exitCode: 0, stdout: "tmux 3.4\n", stderr: "" };
    expect(args.slice(0, 4)).toEqual([
      "-S",
      join(userDataPath, "tmux", "managed.sock"),
      "-f",
      join(userDataPath, "tmux", "tmux.conf"),
    ]);
    if (args.includes("has-session")) {
      return { exitCode: sessionExists ? 0 : 1, stdout: "", stderr: "" };
    }
    if (args.includes("new-session")) {
      sessionExists = true;
      return { exitCode: 0, stdout: "", stderr: "" };
    }
    if (args.includes("list-sessions")) {
      return {
        exitCode: 0,
        stdout: "devspace-pane_1\t0\t1700000000\nunrelated\t1\t1700000001\n",
        stderr: "",
      };
    }
    return { exitCode: 0, stdout: "", stderr: "" };
  });
  const manager = new ManagedTmuxManager({
    userDataPath,
    resourcesPath: "/unused",
    isPackaged: false,
    env: { TMUX: "/tmp/user,1,0", TMUX_PANE: "%1", PATH: "/usr/bin" },
    binaryPath: "/opt/devspace/bin/tmux",
    runCommand,
  });

  await manager.ensureSession({
    sessionId: "pane_1",
    cwd: "/tmp/project",
    envVars: { ZDOTDIR: "/tmp/devspace-zsh" },
  });
  await manager.ensureSession({ sessionId: "pane_1", cwd: "/ignored" });

  const createCall = runCommand.mock.calls.find(([, args]) => args.includes("new-session"));
  expect(createCall?.[1]).toContain("devspace-pane_1");
  expect(createCall?.[1]).toContain("/tmp/project");
  expect(createCall?.[1]).toContain("ZDOTDIR=/tmp/devspace-zsh");
  expect(runCommand.mock.calls.filter(([, args]) => args.includes("new-session"))).toHaveLength(1);

  const command = manager.buildAttachCommand("pane_1");
  expect(command).toContain(quoteCommandArgument(manager.socketPath));
  expect(command).toContain("'-u' 'TMUX' '-u' 'TMUX_PANE'");
  expect(command).toContain("'TERM=xterm-256color'");
  expect(command).toContain("'devspace-pane_1'");

  await expect(manager.listSessions()).resolves.toEqual([
    { sessionId: "pane_1", attachedClients: 0, createdAt: 1_700_000_000 },
  ]);
});

test("a burst of session restores runs the readiness check once", async () => {
  const userDataPath = await makeTempDirectory();
  const runCommand = vi.fn<TmuxCommandRunner>(async (_binary, args) => {
    if (args[0] === "-V") return { exitCode: 0, stdout: "tmux 3.4\n", stderr: "" };
    if (args.includes("has-session")) return { exitCode: 1, stdout: "", stderr: "" };
    return { exitCode: 0, stdout: "", stderr: "" };
  });
  const manager = new ManagedTmuxManager({
    userDataPath,
    resourcesPath: "/unused",
    isPackaged: false,
    env: { PATH: "/usr/bin" },
    binaryPath: "/opt/devspace/bin/tmux",
    runCommand,
  });

  // Restoring a workspace fires one of these per managed pane in the same tick.
  // pendingSessions only dedups by session id, so every one of them lands in
  // ensureReady before the first has finished setting versionChecked.
  await Promise.all(
    ["pane_1", "pane_2", "pane_3", "pane_4"].map((sessionId) =>
      manager.ensureSession({ sessionId }),
    ),
  );

  expect(runCommand.mock.calls.filter(([, args]) => args[0] === "-V")).toHaveLength(1);
  expect(runCommand.mock.calls.filter(([, args]) => args.includes("new-session"))).toHaveLength(4);
});

test("a failed readiness check is retried rather than cached", async () => {
  const userDataPath = await makeTempDirectory();
  let versionAttempts = 0;
  const runCommand = vi.fn<TmuxCommandRunner>(async (_binary, args) => {
    if (args[0] === "-V") {
      versionAttempts += 1;
      // Unsupported the first time, fine afterwards — sharing the in-flight
      // check must not turn a transient failure into a permanent one.
      return versionAttempts === 1
        ? { exitCode: 0, stdout: "tmux 2.8\n", stderr: "" }
        : { exitCode: 0, stdout: "tmux 3.4\n", stderr: "" };
    }
    if (args.includes("has-session")) return { exitCode: 1, stdout: "", stderr: "" };
    return { exitCode: 0, stdout: "", stderr: "" };
  });
  const manager = new ManagedTmuxManager({
    userDataPath,
    resourcesPath: "/unused",
    isPackaged: false,
    env: { PATH: "/usr/bin" },
    binaryPath: "/opt/devspace/bin/tmux",
    runCommand,
  });

  await expect(manager.ensureSession({ sessionId: "pane_1" })).rejects.toThrow(/requires tmux/);
  await expect(manager.ensureSession({ sessionId: "pane_1" })).resolves.toBeUndefined();
  expect(versionAttempts).toBe(2);
});

test("external attach commands do not target the managed socket", () => {
  const command = buildExternalTmuxAttachCommand({
    binaryPath: "/opt/homebrew/bin/tmux",
    sessionName: "user work",
    socketPath: "/tmp/tmux-user/default",
  });

  expect(command).toContain("'/tmp/tmux-user/default'");
  expect(command).toContain("'user work'");
  expect(command).toContain("'TERM=xterm-256color'");
  expect(command).not.toContain("managed.sock");
});

test("refuses a mismatched surviving private server without restarting or killing it", async () => {
  const userDataPath = await makeTempDirectory();
  const socketPath = join(userDataPath, "tmux", "managed.sock");
  await import("fs/promises").then(({ mkdir }) => mkdir(join(userDataPath, "tmux")));
  await writeFile(socketPath, "test socket sentinel");

  const runCommand = vi.fn<TmuxCommandRunner>(async (_binary, args) => {
    if (args[0] === "-V") return { exitCode: 0, stdout: "tmux 3.4\n", stderr: "" };
    if (args.includes("display-message")) {
      return { exitCode: 0, stdout: "3.3\n", stderr: "" };
    }
    return { exitCode: 0, stdout: "", stderr: "" };
  });
  const manager = new ManagedTmuxManager({
    userDataPath,
    resourcesPath: "/unused",
    isPackaged: true,
    binaryPath: "/opt/devspace/bin/tmux",
    runCommand,
  });

  await expect(manager.ensureSession({ sessionId: "pane_1" })).rejects.toThrow(
    /sessions were left untouched/,
  );
  await expect(manager.killSession("pane_1")).rejects.toThrow(/sessions were left untouched/);
  expect(runCommand.mock.calls.some(([, args]) => args.includes("new-session"))).toBe(false);
  expect(runCommand.mock.calls.some(([, args]) => args.includes("kill-session"))).toBe(false);
  expect(runCommand.mock.calls.some(([, args]) => args.includes("kill-server"))).toBe(false);
});

test("command quoting preserves single quotes without enabling shell interpolation", () => {
  expect(quoteCommandArgument("a'b;$HOME")).toBe("'a'\"'\"'b;$HOME'");
});
