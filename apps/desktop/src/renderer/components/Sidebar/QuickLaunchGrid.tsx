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
        "no-drag grid grid-cols-5 gap-px p-px rounded-lg",
        "bg-surface/40 border border-border/50",
      )}
      role="toolbar"
      aria-label="Quick launch"
    >
      {quickLaunchTypes.map((type, i) => {
        const Icon = paneTypeIcons[type];
        const isDefault = defaultPaneType === type;
        const isFirst = i === 0;
        const isLast = i === quickLaunchTypes.length - 1;
        return (
          <button
            key={type}
            type="button"
            onClick={() => handleClick(type)}
            onContextMenu={(e) => handleContextMenu(e, type)}
            aria-label={fullLabels[type]}
            title={`${fullLabels[type]}${isDefault ? " — default for ⌘T" : ""}`}
            className={cn(
              "group/ql relative flex flex-col items-center justify-center gap-[3px]",
              "h-11 text-[9.5px] font-medium leading-none uppercase tracking-wider",
              "transition-colors",
              // tile rounding follows the outer pill
              isFirst && "rounded-l-[7px]",
              isLast && "rounded-r-[7px]",
              isDefault
                ? "bg-brand-soft text-foreground"
                : "text-muted-foreground/85 hover:bg-hover hover:text-foreground",
            )}
          >
            <Icon
              width={15}
              height={15}
              className={cn(
                "shrink-0 transition-colors",
                isDefault ? "text-brand" : "text-foreground/65 group-hover/ql:text-foreground",
              )}
            />
            <span>{quickLaunchLabels[type]}</span>
            {isDefault ? (
              <span
                aria-hidden
                className="absolute top-1 right-1 size-[3px] rounded-full bg-brand shadow-[0_0_4px_var(--brand)]"
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
