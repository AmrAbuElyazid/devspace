import { useState, useCallback } from "react";
import { Settings, Terminal, Globe, FileCode, Bot, StickyNote, CircleHelp } from "lucide-react";
import { useWorkspaceStore, collectGroupIds } from "../../store/workspace-store";
import { useSettingsStore, type DefaultPaneType } from "../../store/settings-store";
import { resolveDisplayString } from "../../../shared/shortcuts";
import type { PaneType } from "../../types/workspace";

const quickCreateOptions: { type: PaneType; icon: typeof Terminal; label: string }[] = [
  { type: "terminal", icon: Terminal, label: "Terminal" },
  { type: "browser", icon: Globe, label: "Browser" },
  { type: "editor", icon: FileCode, label: "VS Code" },
  { type: "t3code", icon: Bot, label: "T3 Code" },
  { type: "note", icon: StickyNote, label: "Note" },
];

export function SidebarFooter() {
  const defaultPaneType = useSettingsStore((s) => s.defaultPaneType);
  const addWorkspace = useWorkspaceStore((s) => s.addWorkspace);
  const addGroupTab = useWorkspaceStore((s) => s.addGroupTab);
  const toggleSettings = useSettingsStore((s) => s.toggleSettings);
  const [showHelp, setShowHelp] = useState(false);

  const handleQuickCreate = useCallback(
    (type: PaneType) => {
      // Quick create: add a tab of this type in the current workspace's focused group
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

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, type: PaneType) => {
      e.preventDefault();
      const settings = useSettingsStore.getState();
      // Toggle: if already default, unset (→ picker mode). Otherwise set as default.
      const newDefault: DefaultPaneType = defaultPaneType === type ? "picker" : type;
      settings.updateSetting("defaultPaneType", newDefault);
    },
    [defaultPaneType],
  );

  return (
    <div className="sidebar-footer">
      {/* Row 1: Quick-create buttons + help */}
      <div className="sidebar-footer-qc-row">
        <div className="sidebar-footer-qc-buttons">
          {quickCreateOptions.map(({ type, icon: Icon, label }) => (
            <button
              key={type}
              type="button"
              className={`sidebar-qc-btn no-drag ${defaultPaneType === type ? "sidebar-qc-default" : ""}`}
              title={`${label}${defaultPaneType === type ? " (default for ⌘T)" : ""}`}
              onClick={() => handleQuickCreate(type)}
              onContextMenu={(e) => handleContextMenu(e, type)}
            >
              <Icon size={12} />
            </button>
          ))}
        </div>
        <button
          type="button"
          className="sidebar-help-btn no-drag"
          title="Quick-create help"
          onMouseEnter={() => setShowHelp(true)}
          onMouseLeave={() => setShowHelp(false)}
          onClick={() => setShowHelp((v) => !v)}
        >
          <CircleHelp size={11} />
          {showHelp && (
            <div className="sidebar-help-tooltip">
              <div>
                <strong>Click</strong> — create pane now
              </div>
              <div>
                <strong>Right-click</strong> — set as ⌘T default
              </div>
              <div>
                <strong>Right-click</strong> active — unset (use picker)
              </div>
              <div className="sidebar-help-divider" />
              <div>
                <span style={{ color: "var(--accent)" }}>●</span> Highlighted = ⌘T default
              </div>
              <div>No highlight = picker dialog on ⌘T</div>
            </div>
          )}
        </button>
      </div>

      {/* Row 2: Settings */}
      <button
        type="button"
        className="sidebar-footer-settings no-drag"
        onClick={toggleSettings}
        title={`Settings (${resolveDisplayString("toggle-settings")})`}
      >
        <Settings size={13} strokeWidth={1.8} />
        <span>Settings</span>
        <kbd className="sidebar-footer-shortcut">{resolveDisplayString("toggle-settings")}</kbd>
      </button>
    </div>
  );
}
