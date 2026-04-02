import { execFileSync } from "child_process";

export function syncShellEnvironment(): void {
  if (process.platform !== "darwin") return;

  try {
    const shell = process.env.SHELL || "/bin/zsh";
    const output = execFileSync(
      shell,
      [
        "-ilc",
        "echo __ENV_START__ && printenv PATH && echo __ENV_SEP__ && (printenv SSH_AUTH_SOCK 2>/dev/null || true) && echo __ENV_END__",
      ],
      { encoding: "utf-8", timeout: 5000 },
    );
    const match = output.match(/__ENV_START__\n([\s\S]*?)\n__ENV_SEP__\n([\s\S]*?)\n__ENV_END__/);
    if (match) {
      if (match[1]?.trim()) process.env.PATH = match[1].trim();
      if (match[2]?.trim()) process.env.SSH_AUTH_SOCK = match[2].trim();
    }
  } catch (err) {
    console.warn("[shell-env] Shell environment sync failed:", err);
  }
}
