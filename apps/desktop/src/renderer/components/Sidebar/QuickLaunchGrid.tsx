import { useCallback } from "react";

import { useWorkspaceStore, collectGroupIds } from "@/store/workspace-store";
import { useSettingsStore, type DefaultPaneType } from "@/store/settings-store";
import { paneTypeIcons } from "@/lib/pane-type-meta";
import type { PaneType } from "@/types/workspace";
import { cn } from "@/lib/utils";

const quickLaunchTypes: PaneType[] = ["terminal", "browser", "editor", "t3code", "note"];

const quickLaunchLabels: Record<PaneType, string> = {
  terminal: "Term",
  browser: "Web",
  editor: "Code",
  t3code: "T3",
  note: "Note",
};

const fullLabels: Record<PaneType, string> = {
  terminal: "Terminal",
  browser: "Browser",
  editor: "VS Code",
  t3code: "T3 Code",
  note: "Note",
};

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
      if (gid) addGroupTab(ws.id, gid, type);
      else addWorkspace(undefined, null, "main", type);
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
    <div className="no-drag grid grid-cols-5 gap-1.5" role="toolbar" aria-label="Quick launch">
      {quickLaunchTypes.map((type) => {
        const Icon = paneTypeIcons[type];
        const isDefault = defaultPaneType === type;
        return (
          <button
            key={type}
            type="button"
            onClick={() => handleClick(type)}
            onContextMenu={(e) => handleContextMenu(e, type)}
            aria-label={fullLabels[type]}
            title={`${fullLabels[type]}${isDefault ? " — default for ⌘T" : ""}`}
            className={cn(
              "group/ql relative flex flex-col items-center justify-center gap-1",
              "h-11 rounded-[8px] border",
              "text-[9px] font-semibold leading-none uppercase tracking-[0.12em]",
              "transition-[transform,background-color,color,border-color] duration-150",
              isDefault
                ? cn(
                    "text-brand bg-brand-soft border-brand-edge",
                    "shadow-[inset_0_1px_0_oklch(0.86_0.17_92_/_0.25)]",
                  )
                : cn(
                    "text-muted-foreground bg-white/[0.025] border-white/[0.06]",
                    "hover:bg-white/[0.05] hover:text-foreground hover:border-white/[0.12]",
                  ),
            )}
          >
            <Icon
              width={15}
              height={15}
              className={cn(
                "shrink-0 transition-colors",
                isDefault ? "text-brand" : "text-foreground/70 group-hover/ql:text-foreground",
              )}
            />
            <span>{quickLaunchLabels[type]}</span>
          </button>
        );
      })}
    </div>
  );
}
