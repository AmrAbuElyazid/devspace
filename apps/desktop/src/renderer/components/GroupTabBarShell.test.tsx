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

// ── Tab context menu ──────────────────────────────────────────────────────────

const THREE_TABS = [
  { id: "tab-1", paneId: "pane-1" },
  { id: "tab-2", paneId: "pane-2" },
  { id: "tab-3", paneId: "pane-3" },
];

function renderThreeTabBar(): Promise<void> {
  useWorkspaceStore.setState({
    panes: {
      "pane-1": { id: "pane-1", title: "One", type: "terminal", config: {} },
      "pane-2": { id: "pane-2", title: "Two", type: "terminal", config: {} },
      "pane-3": { id: "pane-3", title: "Three", type: "terminal", config: {} },
    },
    paneGroups: { "group-1": { id: "group-1", activeTabId: "tab-2", tabs: THREE_TABS } },
  });

  return act(async () => {
    root?.render(
      <GroupTabBar
        group={{ id: "group-1", activeTabId: "tab-2", tabs: THREE_TABS }}
        groupId="group-1"
        workspaceId="workspace-1"
        isFocused={true}
        isTopLeftGroup={false}
        dndEnabled={true}
      />,
    );
  });
}

/** Right-click the middle tab and return the items handed to the main process. */
async function openTabMenu(
  show: ReturnType<typeof vi.fn>,
  tabId = "tab-2",
): Promise<Array<{ id: string; label: string }>> {
  const tab = container.querySelector(`[data-sortable-id="gtab-${tabId}"]`);
  expect(tab).toBeTruthy();
  await act(async () => {
    tab?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
  });
  return (show.mock.calls.at(-1)?.[0] ?? []) as Array<{ id: string; label: string }>;
}

test("the tab menu offers the bulk-close entries only when they would do something", async () => {
  const show = vi.fn(async () => null);
  installMockWindowApi({ contextMenu: { show: show as never } });

  await renderThreeTabBar();
  expect((await openTabMenu(show)).map((item) => item.id)).toEqual([
    "rename",
    "duplicate",
    "close",
    "close-others",
    "close-right",
    "close-all",
  ]);

  // The rightmost tab has nothing to its right.
  expect((await openTabMenu(show, "tab-3")).map((item) => item.id)).toEqual([
    "rename",
    "duplicate",
    "close",
    "close-others",
    "close-all",
  ]);
});

test("a lone tab gets no bulk-close entries at all", async () => {
  const show = vi.fn(async () => null);
  installMockWindowApi({ contextMenu: { show: show as never } });

  await act(async () => {
    root?.render(
      <GroupTabBar
        group={{ id: "group-1", activeTabId: "tab-1", tabs: [{ id: "tab-1", paneId: "pane-1" }] }}
        groupId="group-1"
        workspaceId="workspace-1"
        isFocused={true}
        isTopLeftGroup={false}
        dndEnabled={true}
      />,
    );
  });

  expect((await openTabMenu(show, "tab-1")).map((item) => item.id)).toEqual([
    "rename",
    "duplicate",
    "close",
  ]);
});

test("each close entry passes the right tabs to the store", async () => {
  const removeGroupTabs = vi.fn();
  const duplicateGroupTab = vi.fn();
  useWorkspaceStore.setState({ removeGroupTabs, duplicateGroupTab });

  for (const [choice, expected] of [
    ["close", ["tab-2"]],
    ["close-others", ["tab-1", "tab-3"]],
    ["close-right", ["tab-3"]],
    ["close-all", ["tab-1", "tab-2", "tab-3"]],
  ] as const) {
    const show = vi.fn(async () => choice);
    installMockWindowApi({ contextMenu: { show: show as never } });
    useWorkspaceStore.setState({ removeGroupTabs, duplicateGroupTab });
    removeGroupTabs.mockClear();

    await renderThreeTabBar();
    await openTabMenu(show);

    expect(removeGroupTabs).toHaveBeenCalledWith("workspace-1", "group-1", expected);
  }

  const show = vi.fn(async () => "duplicate");
  installMockWindowApi({ contextMenu: { show: show as never } });
  useWorkspaceStore.setState({ removeGroupTabs, duplicateGroupTab });
  await renderThreeTabBar();
  await openTabMenu(show);
  expect(duplicateGroupTab).toHaveBeenCalledWith("workspace-1", "group-1", "tab-2");
});

test("choosing rename activates the tab and flags it for inline editing", async () => {
  const setActiveGroupTab = vi.fn();
  const show = vi.fn(async () => "rename");
  installMockWindowApi({ contextMenu: { show: show as never } });
  useWorkspaceStore.setState({ setActiveGroupTab, pendingEditId: null, pendingEditType: null });

  await renderThreeTabBar();
  await openTabMenu(show, "tab-3");

  expect(setActiveGroupTab).toHaveBeenCalledWith("workspace-1", "group-1", "tab-3");
  expect(useWorkspaceStore.getState().pendingEditId).toBe("tab-3");
  expect(useWorkspaceStore.getState().pendingEditType).toBe("tab");
});
