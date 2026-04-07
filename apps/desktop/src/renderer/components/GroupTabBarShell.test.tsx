// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import GroupTabBar from "./GroupTabBar";
import { useSettingsStore } from "../store/settings-store";
import { useWorkspaceStore } from "../store/workspace-store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const groupTabBarShellMocks = vi.hoisted(() => ({
  isFullScreen: vi.fn(),
  onFullScreenChange: vi.fn(),
}));

let container: HTMLDivElement;
let root: Root | null;

beforeEach(() => {
  localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  groupTabBarShellMocks.isFullScreen.mockReset();
  groupTabBarShellMocks.isFullScreen.mockResolvedValue(false);
  groupTabBarShellMocks.onFullScreenChange.mockReset();
  groupTabBarShellMocks.onFullScreenChange.mockReturnValue(() => {});

  window.api = {
    window: {
      maximize: vi.fn(),
      isFullScreen: groupTabBarShellMocks.isFullScreen,
      onFullScreenChange: groupTabBarShellMocks.onFullScreenChange,
    },
  } as unknown as typeof window.api;

  useSettingsStore.setState({
    sidebarOpen: false,
    defaultPaneType: "terminal",
  });

  useWorkspaceStore.setState({
    workspaces: [
      {
        id: "workspace-1",
        name: "Workspace One",
        root: { type: "leaf", groupId: "group-1" },
        focusedGroupId: "group-1",
        zoomedGroupId: null,
        lastActiveAt: 1,
      },
    ],
    activeWorkspaceId: "workspace-1",
    panes: {
      "pane-1": { id: "pane-1", title: "Terminal One", type: "terminal", config: {} },
    },
    paneGroups: {
      "group-1": {
        id: "group-1",
        activeTabId: "tab-1",
        tabs: [{ id: "tab-1", paneId: "pane-1" }],
      },
    },
  });
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount();
      root = null;
    });
  }

  container.remove();
});

test("collapses the hidden traffic-light gutter for top-left controls in fullscreen", async () => {
  groupTabBarShellMocks.isFullScreen.mockResolvedValue(true);

  await act(async () => {
    root?.render(
      <GroupTabBar
        group={{
          id: "group-1",
          activeTabId: "tab-1",
          tabs: [{ id: "tab-1", paneId: "pane-1" }],
        }}
        groupId="group-1"
        workspaceId="workspace-1"
        isFocused={true}
        isTopLeftGroup={true}
        dndEnabled={true}
      />,
    );
  });
  await act(async () => {
    await Promise.resolve();
  });

  const trafficZone = container.querySelector(".tabbar-traffic-zone");
  expect(trafficZone?.getAttribute("data-fullscreen")).toBe("true");
});
