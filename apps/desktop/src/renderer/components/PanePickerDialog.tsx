import { useEffect, useState, useCallback, useRef } from "react";

import { useSettingsStore, type PanePickerContext } from "../store/settings-store";
import { useWorkspaceStore } from "../store/workspace-store";
import { paneTypeIcons, paneTypeLabels } from "../lib/pane-type-meta";
import type { PaneType } from "../types/workspace";

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

  // Use refs so the window-level keydown handler always sees current values
  // without needing to re-register the listener on every state change.
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

  // Stable ref for handleSelect so the window listener doesn't re-register.
  const handleSelectRef = useRef(handleSelect);
  handleSelectRef.current = handleSelect;

  // Use a window-level keydown listener instead of relying on div focus.
  // Native Ghostty terminal surfaces capture keyboard events at the OS level,
  // so React onKeyDown on a <div> is unreliable. Window-level listeners fire
  // once the native views have resigned first responder (handled by openPanePicker).
  useEffect(() => {
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

  return (
    <div
      className="no-drag"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0, 0, 0, 0.4)",
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div
        style={{
          width: 280,
          backgroundColor: "var(--popover)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "6px 0",
          boxShadow: "var(--overlay-shadow)",
        }}
      >
        {options.map((opt, i) => {
          const Icon = paneTypeIcons[opt.type];
          const isHighlighted = i === highlighted;

          return (
            <button
              key={opt.type}
              type="button"
              className="no-drag"
              onMouseEnter={() => setHighlighted(i)}
              onClick={(e) => {
                e.stopPropagation();
                handleSelect(opt.type);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                width: "calc(100% - 8px)",
                margin: "0 4px",
                padding: "8px 12px",
                gap: 10,
                border: "none",
                borderRadius: 8,
                background: isHighlighted ? "var(--accent-muted)" : "transparent",
                color: "var(--foreground)",
                cursor: "pointer",
                fontSize: 13,
                fontFamily: "inherit",
                textAlign: "left",
                transition: "background 0.12s cubic-bezier(0.32, 0.72, 0, 1)",
                outline: "none",
              }}
            >
              <Icon
                size={14}
                style={{
                  flexShrink: 0,
                  color: isHighlighted ? "var(--accent)" : "var(--foreground-muted)",
                  transition: "color 0.12s ease",
                }}
              />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div>{opt.label}</div>
                {opt.type === "terminal" && inheritedCwd && (
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--foreground-faint)",
                      marginTop: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatCwd(inheritedCwd)}
                  </div>
                )}
              </div>

              <span
                style={{
                  fontSize: 11,
                  color: "var(--foreground-faint)",
                  flexShrink: 0,
                  fontFamily: "ui-monospace, 'SF Mono', monospace",
                }}
              >
                {opt.shortcut}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
