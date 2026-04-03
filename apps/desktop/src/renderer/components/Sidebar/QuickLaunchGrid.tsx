import { useCallback } from "react";
import { useWorkspaceStore, collectGroupIds } from "../../store/workspace-store";
import { useSettingsStore, type DefaultPaneType } from "../../store/settings-store";
import { paneTypeIcons, paneTypeLabels } from "../../lib/pane-type-meta";
import type { PaneType } from "../../types/workspace";

const quickLaunchTypes: PaneType[] = ["terminal", "browser", "editor", "t3code", "note"];

export function QuickLaunchGrid() {
  const defaultPaneType = useSettingsStore((s) => s.defaultPaneType);
  const addWorkspace = useWorkspaceStore((s) => s.addWorkspace);
  const addGroupTab = useWorkspaceStore((s) => s.addGroupTab);

  const handleClick = useCallback(
    (type: PaneType) => {
      const wsState = useWorkspaceStore.getState();
      const ws = wsState.workspaces.find((w) => w.id === wsState.activeWorkspaceId);
      if (!ws) return;
      const gid = ws.focusedGroupId ?? collectGroupIds(ws.root)[0];
      if (gid) {
        addGroupTab(ws.id, gid, type);
      } else {
        addWorkspace(undefined, null, "main", type);
      }
    },
    [addGroupTab, addWorkspace],
  );

  const handleContextMenu = useCallback((e: React.MouseEvent, type: PaneType) => {
    e.preventDefault();
    const settings = useSettingsStore.getState();
    const newDefault: DefaultPaneType = settings.defaultPaneType === type ? "picker" : type;
    settings.updateSetting("defaultPaneType", newDefault);
  }, []);

  return (
    <div className="ql-grid" role="toolbar" aria-label="Quick launch">
      {quickLaunchTypes.map((type) => {
        const Icon = paneTypeIcons[type];
        const label = paneTypeLabels[type];
        const isDefault = defaultPaneType === type;
        return (
          <button
            key={type}
            type="button"
            className={`ql-item no-drag${isDefault ? " ql-item-default" : ""}`}
            aria-label={label}
            title={`${label}${isDefault ? " (default for \u2318T)" : ""}`}
            onClick={() => handleClick(type)}
            onContextMenu={(e) => handleContextMenu(e, type)}
          >
            <Icon size={17} />
            {isDefault && <span className="ql-default-dot" />}
          </button>
        );
      })}
    </div>
  );
}
