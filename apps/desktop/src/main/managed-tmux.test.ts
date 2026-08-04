import { chmod, mkdtemp, readFile, rm, writeFile } from "fs/promises";
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

/** The `set-titles-string` value out of a generated tmux.conf. */
function readTitleFormat(config: string): string {
  const match = config.match(/^set -g set-titles-string "(.+)"$/m);
  if (!match?.[1]) throw new Error("generated tmux.conf sets no title format");
  return match[1];
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

test("pane titles are derived rather than left on tmux's hostname default", async () => {
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

  await manager.ensureSession({ sessionId: "pane_1" });

  const titleFormat = readTitleFormat(await readFile(manager.configPath, "utf8"));
  // `#{pane_title}` is seeded from gethostname() and nothing inside tmux ever
  // updates it, so every tab would be named after the machine.
  expect(titleFormat).not.toBe("#{pane_title}");
  expect(titleFormat).toContain("pane_current_path");
  expect(titleFormat).toContain("pane_current_command");

  // Nothing to heal on a cold start: the config supplies the options as the
  // server boots, and pushing them again would be a wasted round trip.
  expect(runCommand.mock.calls.some(([, args]) => args.includes("set-option"))).toBe(false);
});

test("a surviving server started by an older release has its options refreshed", async () => {
  const userDataPath = await makeTempDirectory();
  await import("fs/promises").then(({ mkdir }) => mkdir(join(userDataPath, "tmux")));
  await writeFile(join(userDataPath, "tmux", "managed.sock"), "test socket sentinel");

  const runCommand = vi.fn<TmuxCommandRunner>(async (_binary, args) => {
    if (args[0] === "-V") return { exitCode: 0, stdout: "tmux 3.4\n", stderr: "" };
    if (args.includes("display-message")) return { exitCode: 0, stdout: "3.4\n", stderr: "" };
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

  await manager.ensureSession({ sessionId: "pane_1" });

  // tmux reads `-f` only when it starts the server, so a session that outlived
  // an app update keeps the previous release's title format until it is set on
  // the live server. The pushed value has to stay in lockstep with the config.
  const setTitlesString = runCommand.mock.calls.find(([, args]) =>
    args.includes("set-titles-string"),
  );
  expect(setTitlesString?.[1].slice(-4)).toEqual([
    "set-option",
    "-g",
    "set-titles-string",
    readTitleFormat(await readFile(manager.configPath, "utf8")),
  ]);
  expect(
    runCommand.mock.calls.some(([, args]) => args.at(-2) === "set-titles" && args.at(-1) === "on"),
  ).toBe(true);
});

test("a server that rejects the option refresh is still attachable", async () => {
  const userDataPath = await makeTempDirectory();
  await import("fs/promises").then(({ mkdir }) => mkdir(join(userDataPath, "tmux")));
  await writeFile(join(userDataPath, "tmux", "managed.sock"), "test socket sentinel");

  const runCommand = vi.fn<TmuxCommandRunner>(async (_binary, args) => {
    if (args[0] === "-V") return { exitCode: 0, stdout: "tmux 3.4\n", stderr: "" };
    if (args.includes("display-message")) return { exitCode: 0, stdout: "3.4\n", stderr: "" };
    if (args.includes("set-option")) {
      return { exitCode: 1, stdout: "", stderr: "unknown option\n" };
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

  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    // A cosmetic refresh must never cost the user a running dev server.
    await expect(manager.ensureSession({ sessionId: "pane_1" })).resolves.toBeUndefined();
  } finally {
    warn.mockRestore();
  }
  expect(runCommand.mock.calls.some(([, args]) => args.includes("new-session"))).toBe(true);
});

test("session directories are read from tmux in a single call", async () => {
  const userDataPath = await makeTempDirectory();
  const runCommand = vi.fn<TmuxCommandRunner>(async (_binary, args) => {
    if (args[0] === "-V") return { exitCode: 0, stdout: "tmux 3.4\n", stderr: "" };
    if (args.includes("list-sessions")) {
      return {
        exitCode: 0,
        // A directory may end in a space, and tmux neither quotes nor escapes
        // it — trimming the value would corrupt the path.
        stdout: [
          "devspace-pane_1\t/Users/amr/project",
          "devspace-pane_2\t/tmp/trailing ",
          "unrelated\t/etc",
          "devspace-bad id\t/tmp/nope",
          "",
        ].join("\n"),
        stderr: "",
      };
    }
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

  await expect(manager.listSessionPaths()).resolves.toEqual(
    new Map([
      ["pane_1", "/Users/amr/project"],
      ["pane_2", "/tmp/trailing "],
    ]),
  );
  // One spawn regardless of how many terminals are open.
  expect(runCommand.mock.calls.filter(([, args]) => args.includes("list-sessions"))).toHaveLength(
    1,
  );
});

test("no running server reports no directories rather than failing", async () => {
  const userDataPath = await makeTempDirectory();
  const runCommand = vi.fn<TmuxCommandRunner>(async (_binary, args) => {
    if (args[0] === "-V") return { exitCode: 0, stdout: "tmux 3.4\n", stderr: "" };
    return { exitCode: 1, stdout: "", stderr: "no server running\n" };
  });
  const manager = new ManagedTmuxManager({
    userDataPath,
    resourcesPath: "/unused",
    isPackaged: false,
    env: { PATH: "/usr/bin" },
    binaryPath: "/opt/devspace/bin/tmux",
    runCommand,
  });

  await expect(manager.listSessionPaths()).resolves.toEqual(new Map());
});

test("command quoting preserves single quotes without enabling shell interpolation", () => {
  expect(quoteCommandArgument("a'b;$HOME")).toBe("'a'\"'\"'b;$HOME'");
});

test("pane processes come back with the shell pid and foreground command", async () => {
  const userDataPath = await makeTempDirectory();
  const runCommand = vi.fn<TmuxCommandRunner>(async (_binary, args) => {
    if (args[0] === "-V") return { exitCode: 0, stdout: "tmux 3.4\n", stderr: "" };
    if (args.includes("list-panes")) {
      return {
        exitCode: 0,
        stdout: [
          "devspace-pane_1\t4321\tnode",
          // A session split inside tmux reports one row per pane.
          "devspace-pane_1\t4400\tzsh",
          "unrelated\t9000\tvim",
          "devspace-bad id\t9100\tzsh",
          "devspace-pane_2\tnotapid\tzsh",
          "",
        ].join("\n"),
        stderr: "",
      };
    }
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

  await expect(manager.listPaneProcesses()).resolves.toEqual([
    { sessionId: "pane_1", pid: 4321, command: "node" },
    { sessionId: "pane_1", pid: 4400, command: "zsh" },
  ]);
});

test("no running server reports no pane processes rather than failing", async () => {
  const userDataPath = await makeTempDirectory();
  const runCommand = vi.fn<TmuxCommandRunner>(async (_binary, args) => {
    if (args[0] === "-V") return { exitCode: 0, stdout: "tmux 3.4\n", stderr: "" };
    return { exitCode: 1, stdout: "", stderr: "no server running\n" };
  });
  const manager = new ManagedTmuxManager({
    userDataPath,
    resourcesPath: "/unused",
    isPackaged: false,
    env: { PATH: "/usr/bin" },
    binaryPath: "/opt/devspace/bin/tmux",
    runCommand,
  });

  await expect(manager.listPaneProcesses()).resolves.toEqual([]);
});
