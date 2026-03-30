import { test, expect } from "@playwright/test";
import { execSync } from "child_process";
import { join } from "path";

const CLI_SCRIPT = join(__dirname, "../resources/bin/devspace");

test.describe("CLI script: argument parsing", () => {
  test("--help shows usage information", () => {
    const output = execSync(`bash "${CLI_SCRIPT}" --help`, {
      encoding: "utf-8",
    });
    expect(output).toContain("Usage:");
    expect(output).toContain("devspace <command>");
    expect(output).toContain("code [<folder>]");
  });

  test("-h shows usage information", () => {
    const output = execSync(`bash "${CLI_SCRIPT}" -h`, {
      encoding: "utf-8",
    });
    expect(output).toContain("Usage:");
  });

  test("--version shows version", () => {
    const output = execSync(`bash "${CLI_SCRIPT}" --version`, {
      encoding: "utf-8",
    });
    expect(output.trim()).toMatch(/^devspace \d+\.\d+\.\d+$/);
  });

  test("no arguments shows help", () => {
    const output = execSync(`bash "${CLI_SCRIPT}"`, {
      encoding: "utf-8",
    });
    expect(output).toContain("Usage:");
  });

  test("unknown command exits with error", () => {
    try {
      execSync(`bash "${CLI_SCRIPT}" foobar 2>&1`, {
        encoding: "utf-8",
      });
      throw new Error("Should have exited with error");
    } catch (err) {
      const error = err as { stderr?: string; stdout?: string; status?: number };
      const output = (error.stderr || "") + (error.stdout || "");
      expect(output).toContain("unknown command");
    }
  });

  test("code with non-existent directory exits with error", () => {
    try {
      execSync(`bash "${CLI_SCRIPT}" code /nonexistent/path/$(date +%s) 2>&1`, {
        encoding: "utf-8",
      });
      throw new Error("Should have exited with error");
    } catch (err) {
      const error = err as { stderr?: string; stdout?: string };
      const output = (error.stderr || "") + (error.stdout || "");
      expect(output).toContain("not a directory");
    }
  });
});
