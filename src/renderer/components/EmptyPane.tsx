import { type ElementType } from "react";
import { Terminal, FileCode, Globe, Bot, X } from "lucide-react";
import { useWorkspaceStore, collectGroupIds } from "../store/workspace-store";
import type { PaneType, PaneConfig } from "../types/workspace";

interface EmptyPaneProps {
  paneId: string;
  workspaceId: string;
  groupId: string;
}

const options: { type: PaneType; label: string; icon: ElementType; defaultConfig: PaneConfig }[] = [
  { type: "terminal", label: "Terminal", icon: Terminal, defaultConfig: { cwd: undefined } },
  { type: "editor", label: "VS Code", icon: FileCode, defaultConfig: {} },
  { type: "t3code", label: "T3 Code", icon: Bot, defaultConfig: {} },
  { type: "browser", label: "Browser", icon: Globe, defaultConfig: { url: "https://google.com" } },
];

export default function EmptyPane({ paneId, workspaceId, groupId }: EmptyPaneProps) {
  const changePaneType = useWorkspaceStore((s) => s.changePaneType);
  const removeGroupTab = useWorkspaceStore((s) => s.removeGroupTab);
  const closeGroup = useWorkspaceStore((s) => s.closeGroup);
  const group = useWorkspaceStore((s) => s.paneGroups[groupId]);
  const wsRoot = useWorkspaceStore((s) => s.workspaces.find((w) => w.id === workspaceId)?.root);
  const focusedCwd = useWorkspaceStore((s) => {
    const ws = s.workspaces.find((w) => w.id === workspaceId);
    if (!ws?.focusedGroupId) return undefined;
    const g = s.paneGroups[ws.focusedGroupId];
    if (!g) return undefined;
    const tab = g.tabs.find((t) => t.id === g.activeTabId);
    if (!tab) return undefined;
    const p = s.panes[tab.paneId];
    return p?.type === "terminal" ? p.config.cwd : undefined;
  });

  const handleClose = () => {
    const tab = group?.tabs.find((t) => t.paneId === paneId);
    if (!tab) return;
    const hasMultipleGroups = wsRoot ? collectGroupIds(wsRoot).length > 1 : false;
    if (group && group.tabs.length === 1 && hasMultipleGroups) {
      closeGroup(workspaceId, groupId);
    } else {
      removeGroupTab(workspaceId, groupId, tab.id);
    }
  };

  return (
    <div className="empty-pane">
      <button onClick={handleClose} className="empty-pane-close" title="Close pane">
        <X size={14} />
      </button>
      <div className="empty-pane-picker">
        {options.map(({ type, label, icon: Icon, defaultConfig }) => (
          <button
            key={type}
            type="button"
            onClick={() => {
              const config =
                type === "terminal" && focusedCwd
                  ? { ...defaultConfig, cwd: focusedCwd }
                  : defaultConfig;
              changePaneType(paneId, type, config);
            }}
            className={`empty-pane-option empty-pane-option-${type}`}
          >
            <Icon size={14} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
