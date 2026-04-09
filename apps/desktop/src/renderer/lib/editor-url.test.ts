import { describe, it, expect } from "vitest";
import { extractEditorFolderFromUrl } from "./editor-url";

describe("extractEditorFolderFromUrl", () => {
  it("extracts folder from production VS Code URL", () => {
    expect(extractEditorFolderFromUrl("http://127.0.0.1:18562?folder=/Users/me/project")).toBe(
      "/Users/me/project",
    );
  });

  it("extracts folder from a tokenized VS Code URL with a base path", () => {
    expect(
      extractEditorFolderFromUrl(
        "http://127.0.0.1:18562/devspace-vscode?tkn=stable-token&folder=/Users/me/project",
      ),
    ).toBe("/Users/me/project");
  });

  it("extracts folder from dev VS Code URL", () => {
    expect(extractEditorFolderFromUrl("http://127.0.0.1:18662?folder=/Users/me/project")).toBe(
      "/Users/me/project",
    );
  });

  it("decodes percent-encoded folder paths", () => {
    expect(
      extractEditorFolderFromUrl("http://127.0.0.1:18562?folder=%2FUsers%2Fme%2Fmy%20project"),
    ).toBe("/Users/me/my project");
  });

  it("returns null for VS Code URL without folder param", () => {
    expect(extractEditorFolderFromUrl("http://127.0.0.1:18562")).toBeNull();
  });

  it("returns null for non-localhost URLs", () => {
    expect(
      extractEditorFolderFromUrl("http://example.com:18562?folder=/Users/me/project"),
    ).toBeNull();
  });

  it("returns null for HTTPS URLs (VS Code serve-web uses HTTP)", () => {
    expect(
      extractEditorFolderFromUrl("https://127.0.0.1:18562?folder=/Users/me/project"),
    ).toBeNull();
  });

  it("returns null for invalid URLs", () => {
    expect(extractEditorFolderFromUrl("not-a-url")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractEditorFolderFromUrl("")).toBeNull();
  });
});
