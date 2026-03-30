import { test, expect } from "vitest";
import { resolveTabDropIntent } from "./tab-dnd-intent";

test("prefers visible compatible group-tab targets over hidden pane-drop targets", () => {
  const intent = resolveTabDropIntent({
    active: {
      workspaceId: "ws-visible",
      groupId: "group-a",
      tabId: "tab-a",
    },
    pointer: { x: 140, y: 18 },
    overTargets: [
      {
        kind: "pane-drop",
        workspaceId: "ws-hidden",
        groupId: "hidden-group",
        visible: false,
        rect: { left: 0, top: 0, width: 400, height: 240 },
      },
      {
        kind: "group-tab",
        workspaceId: "ws-visible",
        groupId: "group-b",
        tabId: "tab-b",
        visible: true,
        rect: { left: 100, top: 0, width: 80, height: 28 },
      },
    ],
  });

  expect(intent).toEqual({
    kind: "move-to-group-tab",
    workspaceId: "ws-visible",
    sourceGroupId: "group-a",
    sourceTabId: "tab-a",
    targetGroupId: "group-b",
    targetTabId: "tab-b",
  });
});

test("ignores incompatible folder targets for group-tab drags", () => {
  const intent = resolveTabDropIntent({
    active: {
      workspaceId: "ws-a",
      groupId: "group-a",
      tabId: "tab-a",
    },
    pointer: { x: 20, y: 20 },
    overTargets: [
      {
        kind: "sidebar-folder",
        folderId: "folder-1",
        visible: true,
        rect: { left: 0, top: 0, width: 160, height: 30 },
      },
    ],
  });

  expect(intent).toBe(null);
});

test("resolves pane split side by closest edge using the same pointer data for preview and drop", () => {
  const intent = resolveTabDropIntent({
    active: {
      workspaceId: "ws-a",
      groupId: "group-a",
      tabId: "tab-a",
    },
    pointer: { x: 290, y: 80 },
    overTargets: [
      {
        kind: "pane-drop",
        workspaceId: "ws-a",
        groupId: "group-b",
        visible: true,
        rect: { left: 0, top: 0, width: 300, height: 200 },
      },
    ],
  });

  expect(intent).toEqual({
    kind: "split-group",
    workspaceId: "ws-a",
    sourceGroupId: "group-a",
    sourceTabId: "tab-a",
    targetGroupId: "group-b",
    side: "right",
  });
});

test("resolves cross-workspace moves only for visible workspace targets", () => {
  const intent = resolveTabDropIntent({
    active: {
      workspaceId: "ws-a",
      groupId: "group-a",
      tabId: "tab-a",
    },
    pointer: { x: 40, y: 20 },
    overTargets: [
      {
        kind: "sidebar-workspace",
        workspaceId: "ws-hidden",
        visible: false,
        rect: { left: 0, top: 0, width: 140, height: 30 },
      },
      {
        kind: "sidebar-workspace",
        workspaceId: "ws-b",
        visible: true,
        rect: { left: 0, top: 0, width: 140, height: 30 },
      },
    ],
  });

  expect(intent).toEqual({
    kind: "move-to-workspace",
    sourceWorkspaceId: "ws-a",
    sourceGroupId: "group-a",
    sourceTabId: "tab-a",
    targetWorkspaceId: "ws-b",
  });
});
