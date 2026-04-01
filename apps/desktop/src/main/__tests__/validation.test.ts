import { mkdtemp, mkdir, realpath, symlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { describe, expect, test } from "vitest";
import { getSafeBrowserUrl, getSafeExternalUrl, validateFilePath } from "../validation";

async function createValidationFixture(): Promise<{ rootDir: string; allowedRoot: string }> {
  const rootDir = await mkdtemp(path.join(tmpdir(), "devspace-validation-"));
  const allowedRoot = path.join(rootDir, "allowed");
  await mkdir(allowedRoot, { recursive: true });
  return { rootDir, allowedRoot };
}

test("getSafeExternalUrl allows the Safari Full Disk Access settings deep link", () => {
  expect(
    getSafeExternalUrl("x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"),
  ).toBe("x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles");
});

test("getSafeExternalUrl continues rejecting other non-http schemes", () => {
  expect(getSafeExternalUrl("file:///etc/passwd")).toBe(null);
  expect(getSafeExternalUrl("javascript:alert(1)")).toBe(null);
  expect(
    getSafeExternalUrl("x-apple.systempreferences:com.apple.preference.security?Privacy_Camera"),
  ).toBe(null);
});

describe("getSafeBrowserUrl", () => {
  test("allows about:blank and http(s) URLs", () => {
    expect(getSafeBrowserUrl("about:blank")).toBe("about:blank");
    expect(getSafeBrowserUrl("https://example.com")).toBe("https://example.com/");
    expect(getSafeBrowserUrl("http://127.0.0.1:3000/test")).toBe("http://127.0.0.1:3000/test");
  });

  test("rejects unsupported browser URL schemes", () => {
    expect(getSafeBrowserUrl("file:///etc/passwd")).toBe(null);
    expect(getSafeBrowserUrl("javascript:alert(1)")).toBe(null);
    expect(getSafeBrowserUrl("mailto:test@example.com")).toBe(null);
    expect(getSafeBrowserUrl("data:text/html,hello")).toBe(null);
  });
});

describe("validateFilePath", () => {
  test("allows an existing file within an allowed root", async () => {
    const { allowedRoot } = await createValidationFixture();
    const filePath = path.join(allowedRoot, "notes", "todo.md");
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, "hello", "utf8");

    await expect(validateFilePath(filePath, [allowedRoot])).resolves.toBe(await realpath(filePath));
  });

  test("allows writing a new file inside an existing allowed directory", async () => {
    const { allowedRoot } = await createValidationFixture();
    const existingDir = path.join(allowedRoot, "drafts");
    await mkdir(existingDir, { recursive: true });

    await expect(validateFilePath(path.join(existingDir, "new.md"), [allowedRoot])).resolves.toBe(
      path.join(await realpath(existingDir), "new.md"),
    );
  });

  test("rejects sibling-path prefix collisions", async () => {
    const { allowedRoot } = await createValidationFixture();
    const siblingRoot = `${allowedRoot}-evil`;
    const siblingFile = path.join(siblingRoot, "stolen.txt");
    await mkdir(siblingRoot, { recursive: true });
    await writeFile(siblingFile, "nope", "utf8");

    await expect(validateFilePath(siblingFile, [allowedRoot])).resolves.toBe(null);
  });

  test("rejects symlink escapes outside the allowed root", async () => {
    const { rootDir, allowedRoot } = await createValidationFixture();
    const outsideRoot = path.join(rootDir, "outside");
    const symlinkPath = path.join(allowedRoot, "linked");
    await mkdir(outsideRoot, { recursive: true });
    await symlink(outsideRoot, symlinkPath);

    await expect(
      validateFilePath(path.join(symlinkPath, "secret.txt"), [allowedRoot]),
    ).resolves.toBe(null);
  });

  test("rejects sensitive file paths even inside allowed roots", async () => {
    const { allowedRoot } = await createValidationFixture();
    const sensitiveDir = path.join(allowedRoot, ".ssh");
    const sensitiveFile = path.join(sensitiveDir, "config");
    await mkdir(sensitiveDir, { recursive: true });
    await writeFile(sensitiveFile, "Host *", "utf8");

    await expect(validateFilePath(sensitiveFile, [allowedRoot])).resolves.toBe(null);
  });
});
