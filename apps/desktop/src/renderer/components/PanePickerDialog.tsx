import { useEffect, useState, useCallback, useRef } from "react";

import { useSettingsStore, type PanePickerContext } from "@/store/settings-store";
import { useWorkspaceStore } from "@/store/workspace-store";
import { paneTypeIcons, paneTypeLabels } from "@/lib/pane-type-meta";
import { releaseNativeFocus } from "@/lib/native-pane-focus";
import type { PaneType } from "@/types/workspace";
import { cn } from "@/lib/utils";

import { Kbd } from "@/components/ui/kbd";

const options: { type: PaneType; label: string; shortcut: string }[] = [
  { type: "terminal", label: paneTypeLabels.terminal, shortcut: "T" },
  { type: "browser", label: paneTypeLabels.browser, shortcut: "B" },
  { type: "editor", label: paneTypeLabels.editor, shortcut: "E" },
  { type: "t3code", label: paneTypeLabels.t3code, shortcut: "C" },
  { type: "note", label: paneTypeLabels.note, shortcut: "N" },
];

const shortcutMap: Record<string, PaneType> = {
  t: "terminal",
  b: "browser",
  e: "editor",
  c: "t3code",
  n: "note",
};

function formatCwd(cwd: string): string {
  return cwd.replace(/^\/Users\/[^/]+/, "~");
}

export function PanePickerDialog() {
  const panePickerContext = useSettingsStore((s) => s.panePickerContext);
  const closePanePicker = useSettingsStore((s) => s.closePanePicker);
  if (!panePickerContext) return null;
  return <PanePickerDialogInner context={panePickerContext} onClose={closePanePicker} />;
}

function PanePickerDialogInner({
  context,
  onClose,
}: {
  context: PanePickerContext;
  onClose: () => void;
}) {
  const [highlighted, setHighlighted] = useState(0);
  const highlightedRef = useRef(highlighted);
  highlightedRef.current = highlighted;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const inheritedCwd = useWorkspaceStore((s) => {
    const ws = s.workspaces.find((w) => w.id === s.activeWorkspaceId);
    if (!ws?.focusedGroupId) return ws?.lastTerminalCwd;
    const g = s.paneGroups[ws.focusedGroupId];
    if (!g) return ws.lastTerminalCwd;
    const tab = g.tabs.find((t) => t.id === g.activeTabId);
    if (!tab) return ws.lastTerminalCwd;
    const p = s.panes[tab.paneId];
    return p?.type === "terminal" ? p.config.cwd || ws.lastTerminalCwd : ws.lastTerminalCwd;
  });

  const handleSelect = useCallback(
    (type: PaneType) => {
      const store = useWorkspaceStore.getState();
      switch (context.action) {
        case "new-tab":
          if (context.workspaceId && context.groupId) {
            store.addGroupTab(context.workspaceId, context.groupId, type);
          }
          break;
        case "new-workspace":
          store.addWorkspace(
            undefined,
            context.parentFolderId ?? null,
            context.container ?? "main",
            type,
          );
          break;
        case "split":
          if (context.workspaceId && context.groupId && context.splitDirection) {
            store.splitGroup(context.workspaceId, context.groupId, context.splitDirection, type);
          }
          break;
      }
      onClose();
    },
    [context, onClose],
  );

  const handleSelectRef = useRef(handleSelect);
  handleSelectRef.current = handleSelect;

  useEffect(() => {
    releaseNativeFocus();
    const handler = (e: KeyboardEvent): void => {
      const lower = e.key.toLowerCase();
      if (lower in shortcutMap) {
        e.preventDefault();
        e.stopPropagation();
        handleSelectRef.current(shortcutMap[lower]!);
        return;
      }
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setHighlighted((h) => (h + 1) % options.length);
          break;
        case "ArrowUp":
          e.preventDefault();
          setHighlighted((h) => (h - 1 + options.length) % options.length);
          break;
        case "Enter":
          e.preventDefault();
          handleSelectRef.current(options[highlightedRef.current]!.type);
          break;
        case "Escape":
          e.preventDefault();
          onCloseRef.current();
          break;
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, []);

  // Heading derived from the action context — the picker becomes self-explanatory.
  const heading =
    context.action === "new-tab"
      ? "New tab"
      : context.action === "new-workspace"
        ? "New workspace"
        : context.splitDirection === "horizontal"
          ? "Split right"
          : "Split down";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choose a pane type"
      className="no-drag fixed inset-0 z-[9999] flex items-start justify-center pt-[18vh] bg-black/40"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div
        className={cn(
          "w-[320px] max-w-[90vw] flex flex-col",
          "bg-popover text-popover-foreground border border-border rounded-xl",
          "shadow-[var(--overlay-shadow)] overflow-hidden",
        )}
      >
        {/* Heading bar */}
        <div className="flex items-center justify-between px-3.5 py-2 border-b border-hairline">
          <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-muted-foreground">
            {heading}
          </span>
          <Kbd className="h-4 min-w-4 px-1 text-[9px] font-mono">Esc</Kbd>
        </div>

        {/* Options */}
        <div className="p-1.5 flex flex-col gap-px">
          {options.map((opt, i) => {
            const Icon = paneTypeIcons[opt.type];
            const isHighlighted = i === highlighted;
            const showCwd = opt.type === "terminal" && inheritedCwd;

            return (
              <button
                key={opt.type}
                type="button"
                onMouseEnter={() => setHighlighted(i)}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelect(opt.type);
                }}
                className={cn(
                  "no-drag flex items-center gap-3 w-full px-2.5 py-2 rounded-lg text-left",
                  "transition-colors duration-100",
                  isHighlighted
                    ? "bg-brand-soft text-foreground"
                    : "text-foreground hover:bg-hover",
                )}
              >
                <Icon
                  width={15}
                  height={15}
                  className={cn(
                    "shrink-0 transition-colors",
                    isHighlighted ? "text-brand" : "text-muted-foreground",
                  )}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-medium leading-tight">{opt.label}</div>
                  {showCwd ? (
                    <div className="text-[10.5px] font-mono text-muted-foreground/70 mt-0.5 truncate">
                      {formatCwd(inheritedCwd!)}
                    </div>
                  ) : null}
                </div>
                <Kbd className="shrink-0 h-4 min-w-4 px-1 text-[9px] font-mono">{opt.shortcut}</Kbd>
              </button>
            );
          })}
        </div>

        {/* Footer hints */}
        <div className="flex items-center gap-3 px-3.5 py-1.5 border-t border-hairline text-[10px] font-mono text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Kbd className="h-3.5 min-w-3.5 px-1 text-[9px]">↑</Kbd>
            <Kbd className="h-3.5 min-w-3.5 px-1 text-[9px]">↓</Kbd>
            navigate
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd className="h-3.5 px-1 text-[9px]">↵</Kbd> choose
          </span>
        </div>
      </div>
    </div>
  );
}
