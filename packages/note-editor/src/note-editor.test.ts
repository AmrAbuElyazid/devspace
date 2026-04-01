import { describe, expect, test } from "vitest";

import { extractNoteTitle, getBlockType } from "./index";

describe("extractNoteTitle", () => {
  test("prefers the first heading", () => {
    expect(
      extractNoteTitle([
        { type: "p", children: [{ text: "Body" }] },
        { type: "h2", children: [{ text: "Later" }] },
      ] as any),
    ).toBe("Later");
  });

  test("falls back to untitled when empty", () => {
    expect(extractNoteTitle([{ type: "p", children: [{ text: "" }] }] as any)).toBe(
      "Untitled Note",
    );
  });
});

describe("getBlockType", () => {
  test("returns paragraph type when editor.api is undefined", () => {
    const editor = { api: undefined } as any;
    expect(getBlockType(editor)).toBe("p");
  });

  test("returns paragraph type when editor.api.block is undefined", () => {
    const editor = { api: {} } as any;
    expect(getBlockType(editor)).toBe("p");
  });

  test("returns paragraph type when block() returns null", () => {
    const editor = { api: { block: () => null } } as any;
    expect(getBlockType(editor)).toBe("p");
  });

  test("returns block type from entry", () => {
    const editor = {
      api: { block: () => [{ type: "h1", children: [{ text: "" }] }, [0]] },
    } as any;
    expect(getBlockType(editor)).toBe("h1");
  });

  test("returns paragraph when node has no type", () => {
    const editor = {
      api: { block: () => [{ children: [{ text: "" }] }, [0]] },
    } as any;
    expect(getBlockType(editor)).toBe("p");
  });
});
