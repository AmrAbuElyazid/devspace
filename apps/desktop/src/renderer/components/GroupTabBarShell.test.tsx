// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import GroupTabBar from "./GroupTabBar";
import { useSettingsStore } from "../store/settings-store";
import { installMockWindowApi } from "../test-utils/mock-window-api";
import { useWorkspaceStore } from "../store/workspace-store";
import { useWindowChromeStore } from "../store/window-chrome-store";
import { TRAFFIC_LIGHT_GUTTER } from "../../shared/chrome";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null;

beforeEach(() => {
  localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  useWindowChromeStore.setState({ isFullScreen: false, trafficLightGutter: TRAFFIC_LIGHT_GUTTER });

  installMockWindowApi({
    window: {
      maximize: vi.fn(),
    },
  });

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

  // The traffic-light gutter is the first drag-region inside the top-left
  // group's tab bar; windowed, it holds the buttons' width open.
  const gutter = () => container.querySelector<HTMLElement>(".drag-region");
  expect(gutter()?.style.width).toBe(`${TRAFFIC_LIGHT_GUTTER}px`);

  await act(async () => {
    useWindowChromeStore.setState({ isFullScreen: true });
  });

  // macOS hides the buttons in fullscreen, so the reserved space collapses
  // instead of leaving a hole to the left of the first tab.
  expect(gutter()?.style.width).toBe("0px");
});
