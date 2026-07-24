import { beforeEach, expect, test } from "vitest";
import { useTerminalStore } from "./terminal-store";

beforeEach(() => {
  useTerminalStore.setState({
    findBarOpenByPaneId: {},
    findBarFocusTokenByPaneId: {},
    searchStateByPaneId: {},
  });
});

test("clearPaneState removes every renderer record owned by a terminal pane", () => {
  const state = useTerminalStore.getState();
  state.openFindBar("pane-1");
  state.updateSearchTotal("pane-1", 4);
  state.updateSearchSelected("pane-1", 2);

  useTerminalStore.getState().clearPaneState("pane-1");

  const next = useTerminalStore.getState();
  expect(next.findBarOpenByPaneId["pane-1"]).toBeUndefined();
  expect(next.findBarFocusTokenByPaneId["pane-1"]).toBeUndefined();
  expect(next.searchStateByPaneId["pane-1"]).toBeUndefined();
});
