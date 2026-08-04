import { expect, test } from "vitest";

import { buildSidebarPeekSections } from "./sidebar-peek-snapshot";
import type { SidebarPeekRow } from "../../shared/sidebar-peek";
import type { SidebarNode, Workspace } from "../types/workspace";

function workspace(id: string, name: string): Workspace {
  return {
    id,
    name,
    root: { type: "leaf", groupId: `group-${id}` },
    focusedGroupId: `group-${id}`,
    zoomedGroupId: null,
    lastActiveAt: 0,
  };
}

function source(overrides: Partial<Parameters<typeof buildSidebarPeekSections>[0]> = {}) {
  return {
    pinnedSidebarNodes: [] as SidebarNode[],
    sidebarTree: [] as SidebarNode[],
    workspaces: [workspace("a", "api"), workspace("b", "web")],
    activeWorkspaceId: "a",
    metadataByWorkspaceId: {
      a: { paneCount: 3, directory: "/Users/amr/dev/api" },
      b: { paneCount: 1, directory: null },
    },
    portsByWorkspaceId: { a: [8787] },
    ...overrides,
  };
}

/** The rows of the Workspaces section, which every case below is about. */
function mainRows(
  overrides: Partial<Parameters<typeof buildSidebarPeekSections>[0]> = {},
): SidebarPeekRow[] {
  const sections = buildSidebarPeekSections(source(overrides));
  return sections.find((section) => section.label === "Workspaces")?.rows ?? [];
}

test("resolves everything the other renderer cannot look up itself", () => {
  const rows = mainRows({ sidebarTree: [{ type: "workspace", workspaceId: "a" }] });

  expect(rows).toEqual([
    {
      kind: "workspace",
      id: "a",
      name: "api",
      color: expect.stringMatching(/^var\(--/),
      directory: "/Users/amr/dev/api",
      ports: [8787],
      paneCount: 3,
      active: true,
      depth: 0,
    },
  ]);
});

test("pinned workspaces land in their own section, ahead of the rest", () => {
  const sections = buildSidebarPeekSections(
    source({
      pinnedSidebarNodes: [{ type: "workspace", workspaceId: "b" }],
      sidebarTree: [{ type: "workspace", workspaceId: "a" }],
    }),
  );

  expect(sections.map((section) => [section.label, section.rows.map((row) => row.id)])).toEqual([
    ["Pinned", ["b"]],
    ["Workspaces", ["a"]],
  ]);
});

test("nothing pinned means no Pinned heading, exactly as in the sidebar", () => {
  const sections = buildSidebarPeekSections(
    source({ sidebarTree: [{ type: "workspace", workspaceId: "a" }] }),
  );

  expect(sections.map((section) => section.label)).toEqual(["Workspaces"]);
});

test("an expanded folder contributes a heading and its children, one level deeper", () => {
  const rows = mainRows({
    sidebarTree: [
      {
        type: "folder",
        id: "f1",
        name: "Work",
        collapsed: false,
        children: [{ type: "workspace", workspaceId: "a" }],
      },
    ],
  });

  expect(rows).toEqual([
    { kind: "folder", id: "f1", name: "Work", depth: 0 },
    expect.objectContaining({ kind: "workspace", id: "a", depth: 1 }),
  ]);
});

test("a collapsed folder shows its heading and hides its contents", () => {
  const rows = mainRows({
    sidebarTree: [
      {
        type: "folder",
        id: "f1",
        name: "Work",
        collapsed: true,
        children: [{ type: "workspace", workspaceId: "a" }],
      },
    ],
  });

  expect(rows).toEqual([{ kind: "folder", id: "f1", name: "Work", depth: 0 }]);
});

test("a tree entry for a workspace that no longer exists is dropped", () => {
  const rows = mainRows({ sidebarTree: [{ type: "workspace", workspaceId: "gone" }] });

  expect(rows).toEqual([]);
});

test("a workspace with no ports reports an empty list rather than undefined", () => {
  const rows = mainRows({ sidebarTree: [{ type: "workspace", workspaceId: "b" }] });

  expect(rows[0]).toMatchObject({ ports: [], directory: null, active: false });
});
