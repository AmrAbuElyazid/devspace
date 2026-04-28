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
    <div
      className={cn(
        "no-drag flex gap-1 p-1 rounded-[10px]",
        "bg-black/25 border border-white/[0.05]",
        "shadow-[inset_0_1px_0_rgb(255_255_255_/_0.025)]",
        // Compact: center icons inside the pill at their intrinsic
        // width. Expanded: tiles distribute evenly across the pill.
        "justify-center @min-[300px]/sidebar:justify-stretch @min-[300px]/sidebar:gap-0.5",
      )}
      role="toolbar"
      aria-label="Quick launch"
    >
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
              "rounded-[7px] transition-colors duration-150",
              "text-[9px] font-semibold leading-none uppercase tracking-[0.12em]",
              // Compact: 32×32 square icon button at intrinsic width.
              "size-8 shrink-0",
              // Expanded: tile grows to share the pill width and adds
              // height for the label below the icon.
              "@min-[300px]/sidebar:size-auto @min-[300px]/sidebar:flex-1 @min-[300px]/sidebar:h-11",
              isDefault
                ? "text-brand bg-brand-soft shadow-[inset_0_1px_0_oklch(0.86_0.17_92_/_0.18)]"
                : "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground",
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
            <span className="hidden @min-[300px]/sidebar:block">{quickLaunchLabels[type]}</span>
          </button>
        );
      })}
    </div>
  );
}
