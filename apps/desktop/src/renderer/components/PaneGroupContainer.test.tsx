// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DragContext } from "../hooks/useDndOrchestrator";
import { useNativeViewStore } from "../store/native-view-store";
import { useWorkspaceStore } from "../store/workspace-store";
import PaneGroupContainer from "./PaneGroupContainer";

const paneGroupContainerMocks = vi.hoisted(() => ({
  isOver: true,
  setNodeRef: vi.fn(),
}));

vi.mock("@dnd-kit/core", () => ({
  useDroppable: () => ({
    isOver: paneGroupContainerMocks.isOver,
    setNodeRef: paneGroupContainerMocks.setNodeRef,
  }),
}));

vi.mock("./GroupTabBar", () => ({
  default: () => <div data-testid="group-tab-bar" />,
}));

vi.mock("./TerminalPane", () => ({
  default: ({ paneId }: { paneId: string }) => <div data-testid={`terminal-${paneId}`} />,
}));

vi.mock("./EditorPane", () => ({
  default: ({ paneId }: { paneId: string }) => <div data-testid={`editor-${paneId}`} />,
}));

vi.mock("./BrowserPane", () => ({
  default: ({ paneId }: { paneId: string }) => <div data-testid={`browser-${paneId}`} />,
}));

vi.mock("./T3CodePane", () => ({
  default: ({ paneId }: { paneId: string }) => <div data-testid={`t3code-${paneId}`} />,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const activeTabDragValue = {
  activeDrag: {
    type: "group-tab" as const,
    workspaceId: "workspace-1",
    groupId: "group-2",
    tabId: "tab-2",
  },
  dropIntent: {
    kind: "split-group" as const,
    workspaceId: "workspace-1",
    sourceGroupId: "group-2",
    sourceTabId: "tab-2",
    targetGroupId: "group-1",
    side: "left" as const,
  },
};

const activeTabDragWithoutDropValue = {
  activeDrag: {
    type: "group-tab" as const,
    workspaceId: "workspace-1",
    groupId: "group-2",
    tabId: "tab-2",
  },
  dropIntent: null,
};

const emptyDragContextValue = {
  activeDrag: null,
  dropIntent: null,
};

let container: HTMLDivElement;
let root: Root | null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  paneGroupContainerMocks.isOver = true;
  paneGroupContainerMocks.setNodeRef.mockReset();

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
      "pane-1": {
        id: "pane-1",
        title: "Terminal One",
        type: "terminal",
        config: {},
      },
    },
    paneGroups: {
      "group-1": {
        id: "group-1",
        activeTabId: "tab-1",
        tabs: [{ id: "tab-1", paneId: "pane-1" }],
      },
    },
  });

  useNativeViewStore.setState({ dragHidesViews: false });
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

test("renders a drag placeholder and split preview when native views are hidden during a tab drag", async () => {
  useNativeViewStore.setState({ dragHidesViews: true });

  await act(async () => {
    root?.render(
      <DragContext.Provider value={activeTabDragValue}>
        <PaneGroupContainer
          groupId="group-1"
          workspaceId="workspace-1"
          sidebarOpen={false}
          dndEnabled={true}
        />
      </DragContext.Provider>,
    );
  });

  expect(container.innerHTML).toContain("pane-drag-placeholder");
  expect(container.textContent).toContain("Terminal One");
  expect(container.innerHTML).toContain("pane-drop-zone-half left");
});

test("keeps the placeholder hidden when native views remain visible", async () => {
  await act(async () => {
    root?.render(
      <DragContext.Provider value={activeTabDragWithoutDropValue}>
        <PaneGroupContainer
          groupId="group-1"
          workspaceId="workspace-1"
          sidebarOpen={false}
          dndEnabled={true}
        />
      </DragContext.Provider>,
    );
  });

  expect(container.innerHTML).not.toContain("pane-drag-placeholder");
  expect(container.innerHTML).toContain('data-testid="terminal-pane-1"');
});

test("mounts only the active tab layer for the focused group", async () => {
  useWorkspaceStore.setState({
    panes: {
      "pane-1": {
        id: "pane-1",
        title: "Terminal One",
        type: "terminal",
        config: {},
      },
      "pane-2": {
        id: "pane-2",
        title: "Browser Two",
        type: "browser",
        config: { url: "https://example.com" },
      },
    },
    paneGroups: {
      "group-1": {
        id: "group-1",
        activeTabId: "tab-1",
        tabs: [
          { id: "tab-1", paneId: "pane-1" },
          { id: "tab-2", paneId: "pane-2" },
        ],
      },
    },
  });

  await act(async () => {
    root?.render(
      <DragContext.Provider value={emptyDragContextValue}>
        <PaneGroupContainer
          groupId="group-1"
          workspaceId="workspace-1"
          sidebarOpen={false}
          dndEnabled={true}
        />
      </DragContext.Provider>,
    );
  });

  expect(container.innerHTML).toContain('data-testid="terminal-pane-1"');
  expect(container.innerHTML).not.toContain('data-testid="browser-pane-2"');

  await act(async () => {
    useWorkspaceStore.setState({
      paneGroups: {
        "group-1": {
          id: "group-1",
          activeTabId: "tab-2",
          tabs: [
            { id: "tab-1", paneId: "pane-1" },
            { id: "tab-2", paneId: "pane-2" },
          ],
        },
      },
    });
  });

  await act(async () => {
    root?.render(
      <DragContext.Provider value={emptyDragContextValue}>
        <PaneGroupContainer
          groupId="group-1"
          workspaceId="workspace-1"
          sidebarOpen={false}
          dndEnabled={true}
        />
      </DragContext.Provider>,
    );
  });

  expect(container.innerHTML).not.toContain('data-testid="terminal-pane-1"');
  expect(container.innerHTML).toContain('data-testid="browser-pane-2"');
});
