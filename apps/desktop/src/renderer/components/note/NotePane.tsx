import { useState, useEffect, useCallback, useRef } from "react";
import {
  type NoteEditorChangeContext,
  type NoteEditorValue,
  NoteEditor,
  extractNoteTitle,
} from "@devspace/note-editor";
import "@devspace/note-editor/styles.css";
import type { NoteConfig } from "../../types/workspace";
import { useWorkspaceStore } from "../../store/workspace-store";

interface NotePaneProps {
  paneId: string;
  config: NoteConfig;
  isFocused: boolean;
}

type LoadState = "loading" | "ready" | "error";

const DEFAULT_VALUE: NoteEditorValue = [
  {
    type: "p",
    children: [{ text: "" }],
  },
];

const pendingNoteSaveErrors = new Map<string, string>();

function extractTitleFromMarkdown(markdown: string): string | null {
  const lines = markdown.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const plain = trimmed
      .replace(/^#{1,6}\s+/, "")
      .replace(/^[-*+]\s+/, "")
      .replace(/^\d+[.)]\s+/, "")
      .replace(/^\[[ xX]\]\s+/, "")
      .replace(/[*_`~]/g, "")
      .trim();

    if (plain) {
      return plain.slice(0, 40);
    }
  }

  return null;
}

export default function NotePane({ paneId, config, isFocused }: NotePaneProps) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [initialValue, setInitialValue] = useState<NoteEditorValue | string>(DEFAULT_VALUE);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const saveScope = useRef(0);
  const latestSaveRequest = useRef(0);
  const latestMarkdown = useRef<string | null>(null);
  const lastTitle = useRef<string>("Note");
  const updatePaneTitle = useWorkspaceStore((s) => s.updatePaneTitle);

  const handleSaveResult = useCallback(
    (result: void | { error: string }, options?: { allowStateUpdate?: boolean }) => {
      const allowStateUpdate = options?.allowStateUpdate ?? true;

      if (result && typeof result === "object" && "error" in result) {
        console.error("[NotePane] Save failed:", result.error);
        pendingNoteSaveErrors.set(config.noteId, result.error);

        if (allowStateUpdate) {
          setSaveError(result.error);
        }
        return;
      }

      pendingNoteSaveErrors.delete(config.noteId);
      if (allowStateUpdate) {
        setSaveError(null);
      }
    },
    [config.noteId],
  );

  /** Persist note to disk as markdown. */
  const saveNow = useCallback(async () => {
    const md = latestMarkdown.current;
    if (md === null) return;

    const scope = saveScope.current;
    const requestId = latestSaveRequest.current + 1;
    latestSaveRequest.current = requestId;

    saveChain.current = saveChain.current
      .catch(() => {})
      .then(async () => {
        let result: void | { error: string };
        try {
          result = await window.api.notes.save(config.noteId, md);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          result = { error: `Failed to save note: ${message}` };
        }

        if (scope !== saveScope.current || requestId !== latestSaveRequest.current) {
          return;
        }

        handleSaveResult(result);
      });

    await saveChain.current;
  }, [config.noteId, handleSaveResult]);

  /** Schedule a debounced save (500ms). */
  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void saveNow();
      saveTimer.current = null;
    }, 500);
  }, [saveNow]);

  // Load note on mount
  useEffect(() => {
    let cancelled = false;
    saveScope.current += 1;
    latestSaveRequest.current = 0;
    latestMarkdown.current = null;
    lastTitle.current = "Note";
    setInitialValue(DEFAULT_VALUE);
    setSaveError(pendingNoteSaveErrors.get(config.noteId) ?? null);
    setLoadState("loading");

    async function load() {
      try {
        const raw = await window.api.notes.read(config.noteId);
        if (cancelled) return;
        if (raw && raw.trim().length > 0) {
          const title = extractTitleFromMarkdown(raw);
          if (title) {
            lastTitle.current = title;
            updatePaneTitle(paneId, title);
          }
          // raw is markdown — we'll deserialize it in the NoteEditor via the
          // MarkdownPlugin's value initializer
          setInitialValue(raw);
        }
        setLoadState("ready");
      } catch {
        if (!cancelled) setLoadState("error");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [config.noteId, paneId, updatePaneTitle]);

  // Flush pending save on unmount + save on visibility change (app closing/hiding)
  useEffect(() => {
    const flushSave = (options?: { allowStateUpdate?: boolean }) => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }

      const md = latestMarkdown.current;
      if (md === null) {
        return;
      }

      const result = window.api.notes.saveSync(config.noteId, md);
      handleSaveResult(result, options);
    };

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        flushSave({ allowStateUpdate: true });
      }
    };

    const handleBeforeUnload = () => {
      flushSave({ allowStateUpdate: false });
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      flushSave({ allowStateUpdate: false });
    };
  }, [config.noteId, handleSaveResult]);

  const handleChange = useCallback(
    ({ value, editor, markdown, serializationError }: NoteEditorChangeContext) => {
      if (!editor) return;

      // Update tab title only when it actually changes
      const title = extractNoteTitle(value);
      if (title !== lastTitle.current) {
        lastTitle.current = title;
        updatePaneTitle(paneId, title);
      }

      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }

      if (serializationError || markdown === null) {
        latestMarkdown.current = null;
        setSaveError(serializationError ?? "Failed to serialize note content");
        return;
      }

      latestMarkdown.current = markdown;
      setSaveError(null);
      scheduleSave();
    },
    [paneId, updatePaneTitle, scheduleSave],
  );

  if (loadState === "loading") {
    return (
      <div className="note-pane h-full w-full flex items-center justify-center bg-background">
        <span className="text-[11.5px] font-mono text-muted-foreground">loading note…</span>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="note-pane h-full w-full flex items-center justify-center bg-background">
        <span className="text-[12px] text-destructive">Failed to load note</span>
      </div>
    );
  }

  return (
    <div className="note-pane h-full w-full flex flex-col bg-background">
      {saveError && (
        <div className="shrink-0 px-4 py-1.5 bg-destructive/10 text-destructive text-[11.5px] border-b border-destructive/20">
          Save failed: {saveError}
        </div>
      )}
      <NoteEditor autoFocus={isFocused} initialValue={initialValue} onChange={handleChange} />
    </div>
  );
}
