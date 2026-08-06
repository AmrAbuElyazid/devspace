import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type NoteEditorChangeContext,
  type NoteEditorController,
  type NoteEditorValue,
  type NoteMatch,
  type NoteStats,
  type OutlineEntry,
  NoteEditor,
  extractNoteTitle,
  noteOutline,
  noteStats,
} from "@devspace/note-editor";
import "@devspace/note-editor/styles.css";
import type { NoteConfig } from "../../types/workspace";
import { useNoteStore } from "../../store/note-store";
import { useWorkspaceStore } from "../../store/workspace-store";
import { addToast } from "@/hooks/useToast";
import NoteFindBar from "./NoteFindBar";
import NoteFooter, { type SaveStatus } from "./NoteFooter";
import NoteOutline from "./NoteOutline";
import NoteSwitcher from "./NoteSwitcher";

interface NotePaneProps {
  paneId: string;
  config: NoteConfig;
  isFocused: boolean;
}

type LoadState = "loading" | "ready" | "error";

const DEFAULT_VALUE: NoteEditorValue = [{ type: "p", children: [{ text: "" }] }];
const EMPTY_STATS: NoteStats = { characters: 0, readingMinutes: 0, words: 0 };
const SAVE_DEBOUNCE_MS = 500;

/**
 * Save failures that outlive a remount, so switching tabs doesn't make a
 * problem look resolved.
 */
const pendingNoteSaveErrors = new Map<string, string>();

function extractTitleFromMarkdown(markdown: string): string | null {
  for (const line of markdown.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const plain = trimmed
      .replace(/^#{1,6}\s+/, "")
      .replace(/^[-*+]\s+/, "")
      .replace(/^\d+[.)]\s+/, "")
      .replace(/^\[[ xX]\]\s+/, "")
      .replace(/[*_`~]/g, "")
      .trim();

    if (plain) return plain.slice(0, 40);
  }

  return null;
}

export default function NotePane({ paneId, config, isFocused }: NotePaneProps) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [initialValue, setInitialValue] = useState<NoteEditorValue | string>(DEFAULT_VALUE);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [stats, setStats] = useState<NoteStats>(EMPTY_STATS);
  const [outline, setOutline] = useState<OutlineEntry[]>([]);
  const [foldedIndices, setFoldedIndices] = useState<number[]>([]);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<NoteMatch[]>([]);
  const [matchIndex, setMatchIndex] = useState(-1);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const controllerRef = useRef<NoteEditorController | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const saveScope = useRef(0);
  const latestSaveRequest = useRef(0);
  /**
   * The last markdown we managed to produce.
   *
   * Never cleared on a serialization failure. The previous implementation set
   * this to null the moment `serialize()` threw, and since nothing ever set it
   * back, the pane stopped writing to disk for the rest of its life — every
   * subsequent keystroke was lost silently.
   */
  const latestMarkdown = useRef<string | null>(null);
  const lastTitle = useRef<string>("Note");

  const updatePaneTitle = useWorkspaceStore((s) => s.updatePaneTitle);
  const findBarOpen = useNoteStore((s) => s.findBarOpenByPaneId[paneId] ?? false);
  const findFocusToken = useNoteStore((s) => s.findBarFocusTokenByPaneId[paneId] ?? 0);
  const outlineOpen = useNoteStore((s) => s.outlineOpenByPaneId[paneId] ?? false);
  const closeFindBar = useNoteStore((s) => s.closeFindBar);
  const toggleOutline = useNoteStore((s) => s.toggleOutline);
  const clearPaneState = useNoteStore((s) => s.clearPaneState);
  const updatePaneConfig = useWorkspaceStore((s) => s.updatePaneConfig);

  const applySaveResult = useCallback(
    (result: void | { error: string }, options?: { allowStateUpdate?: boolean }) => {
      const allowStateUpdate = options?.allowStateUpdate ?? true;

      if (result && typeof result === "object" && "error" in result) {
        console.error("[NotePane] Save failed:", result.error);
        pendingNoteSaveErrors.set(config.noteId, result.error);
        if (allowStateUpdate) {
          setSaveError(result.error);
          setSaveStatus("failed");
        }
        return;
      }

      pendingNoteSaveErrors.delete(config.noteId);
      if (allowStateUpdate) {
        setSaveError(null);
        setSaveStatus("saved");
      }
    },
    [config.noteId],
  );

  const saveNow = useCallback(async () => {
    const md = latestMarkdown.current;
    if (md === null) return;

    const scope = saveScope.current;
    const requestId = latestSaveRequest.current + 1;
    latestSaveRequest.current = requestId;
    setSaveStatus("saving");

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

        if (scope !== saveScope.current || requestId !== latestSaveRequest.current) return;

        applySaveResult(result);
      });

    await saveChain.current;
  }, [config.noteId, applySaveResult]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void saveNow();
      saveTimer.current = null;
    }, SAVE_DEBOUNCE_MS);
  }, [saveNow]);

  // Load on mount and whenever the pane is pointed at a different note.
  useEffect(() => {
    let cancelled = false;
    saveScope.current += 1;
    latestSaveRequest.current = 0;
    latestMarkdown.current = null;
    lastTitle.current = "Note";
    setInitialValue(DEFAULT_VALUE);
    setSaveError(pendingNoteSaveErrors.get(config.noteId) ?? null);
    setSaveStatus(pendingNoteSaveErrors.has(config.noteId) ? "failed" : "saved");
    setLoadState("loading");
    setFoldedIndices([]);

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
          // Markdown, deserialized by the editor's own MarkdownPlugin so the
          // parse rules match what we write back out.
          setInitialValue(raw);
        }
        setLoadState("ready");
      } catch {
        if (!cancelled) setLoadState("error");
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [config.noteId, paneId, updatePaneTitle]);

  // Flush on unmount, and on the app being hidden or closed.
  useEffect(() => {
    const flushSave = (options?: { allowStateUpdate?: boolean }) => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }

      const md = latestMarkdown.current;
      if (md === null) return;

      applySaveResult(window.api.notes.saveSync(config.noteId, md), options);
    };

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") flushSave({ allowStateUpdate: true });
    };
    const handleBeforeUnload = () => flushSave({ allowStateUpdate: false });

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      flushSave({ allowStateUpdate: false });
    };
  }, [config.noteId, applySaveResult]);

  useEffect(() => () => clearPaneState(paneId), [clearPaneState, paneId]);

  const handleChange = useCallback(
    ({ value, editor, markdown, serializationError }: NoteEditorChangeContext) => {
      if (!editor) return;

      const title = extractNoteTitle(value);
      if (title !== lastTitle.current) {
        lastTitle.current = title;
        updatePaneTitle(paneId, title);
      }

      setStats(noteStats(value));
      setOutline(noteOutline(value));

      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }

      if (serializationError || markdown === null) {
        // Report it, but keep the last good markdown: a transient failure must
        // not turn into permanent data loss for the rest of the session.
        setSaveError(serializationError ?? "Failed to serialize note content");
        setSaveStatus("failed");
        return;
      }

      latestMarkdown.current = markdown;
      setSaveError(null);
      setSaveStatus("unsaved");
      scheduleSave();
    },
    [paneId, updatePaneTitle, scheduleSave],
  );

  // ── Find ────────────────────────────────────────────────────────────

  const refreshMatches = useCallback((nextQuery: string) => {
    const found = controllerRef.current?.matches(nextQuery) ?? [];
    setMatches(found);
    setMatchIndex(found.length > 0 ? 0 : -1);
    if (found[0]) controllerRef.current?.selectMatch(found[0]);
  }, []);

  const handleQueryChange = useCallback(
    (nextQuery: string) => {
      setQuery(nextQuery);
      refreshMatches(nextQuery);
    },
    [refreshMatches],
  );

  const handleNavigate = useCallback(
    (direction: 1 | -1) => {
      if (matches.length === 0) return;
      const next = (matchIndex + direction + matches.length) % matches.length;
      setMatchIndex(next);
      const target = matches[next];
      if (target) controllerRef.current?.selectMatch(target);
    },
    [matchIndex, matches],
  );

  const handleReplaceCurrent = useCallback(
    (replacement: string) => {
      const target = matches[matchIndex];
      if (!target) return;
      controllerRef.current?.replaceMatch(target, replacement);
      // Offsets after the replacement have all moved.
      refreshMatches(query);
    },
    [matchIndex, matches, query, refreshMatches],
  );

  const handleReplaceAll = useCallback(
    (replacement: string) => {
      const count = controllerRef.current?.replaceAll(query, replacement) ?? 0;
      refreshMatches(query);
      if (count > 0) {
        addToast(`Replaced ${count} ${count === 1 ? "match" : "matches"}.`, "success");
      }
    },
    [query, refreshMatches],
  );

  const handleCloseFind = useCallback(() => {
    closeFindBar(paneId);
    setQuery("");
    setMatches([]);
    setMatchIndex(-1);
    controllerRef.current?.focus();
  }, [closeFindBar, paneId]);

  // ── Assets and file actions ─────────────────────────────────────────

  const uploadImage = useCallback(async (file: File): Promise<string> => {
    const extension = (file.name.split(".").pop() || file.type.split("/")[1] || "png")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    const result = await window.api.notes.saveAsset(await file.arrayBuffer(), extension);

    if ("error" in result) throw new Error(result.error);
    return result.url;
  }, []);

  const runFileAction = useCallback(
    async (action: () => Promise<void | { error: string } | Record<string, unknown>>) => {
      const result = await action();
      if (result && "error" in result) addToast(String(result.error), "error");
    },
    [],
  );

  const handleReveal = useCallback(() => {
    void runFileAction(() => window.api.notes.reveal(config.noteId));
  }, [config.noteId, runFileAction]);

  const handleOpenExternal = useCallback(() => {
    void runFileAction(() => window.api.notes.openExternal(config.noteId));
  }, [config.noteId, runFileAction]);

  const handleExport = useCallback(() => {
    void runFileAction(() => window.api.notes.exportTo(config.noteId, lastTitle.current));
  }, [config.noteId, runFileAction]);

  // ── Outline ─────────────────────────────────────────────────────────

  const handleSwitchNote = useCallback(
    (noteId: string) => {
      if (noteId === config.noteId) return;
      // Flush first: the load effect resets the pane the moment the id changes,
      // and a debounced edit would otherwise be dropped on the way out.
      if (latestMarkdown.current !== null) {
        window.api.notes.saveSync(config.noteId, latestMarkdown.current);
      }
      updatePaneConfig(paneId, { noteId });
    },
    [config.noteId, paneId, updatePaneConfig],
  );

  const handleOutlineSelect = useCallback((entry: OutlineEntry) => {
    controllerRef.current?.scrollToBlock(entry.path);
  }, []);

  const handleOutlineFold = useCallback((entry: OutlineEntry) => {
    controllerRef.current?.toggleFold(entry.path);
  }, []);

  const editorSearch = useMemo(() => (findBarOpen ? query : ""), [findBarOpen, query]);

  if (loadState === "loading") {
    return (
      <div className="note-pane flex h-full w-full items-center justify-center bg-background">
        <span className="font-mono text-ui-xs text-muted-foreground">loading note…</span>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="note-pane flex h-full w-full items-center justify-center bg-background">
        <span className="text-ui-sm text-destructive">Failed to load note</span>
      </div>
    );
  }

  return (
    <div className="note-pane flex h-full w-full flex-col bg-background">
      {findBarOpen && (
        <NoteFindBar
          focusToken={findFocusToken}
          matchCount={matches.length}
          onClose={handleCloseFind}
          onNavigate={handleNavigate}
          onQueryChange={handleQueryChange}
          onReplaceAll={handleReplaceAll}
          onReplaceCurrent={handleReplaceCurrent}
          query={query}
          selectedMatch={matchIndex}
        />
      )}

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <NoteEditor
            autoFocus={isFocused}
            controllerRef={controllerRef}
            foldedIndices={foldedIndices}
            initialValue={initialValue}
            onChange={handleChange}
            onFoldedIndicesChange={setFoldedIndices}
            search={editorSearch}
            uploadImage={uploadImage}
          />
        </div>

        {outlineOpen && (
          <NoteOutline
            entries={outline}
            foldedIndices={foldedIndices}
            onSelect={handleOutlineSelect}
            onToggleFold={handleOutlineFold}
          />
        )}
      </div>

      <NoteFooter
        onExport={handleExport}
        onOpenExternal={handleOpenExternal}
        onReveal={handleReveal}
        onSwitchNote={() => setSwitcherOpen(true)}
        onToggleOutline={() => toggleOutline(paneId)}
        outlineOpen={outlineOpen}
        saveError={saveError}
        saveStatus={saveStatus}
        stats={stats}
      />

      {/* Mounted only while open: the shared CommandDialog renders its
          screen-reader title outside the popup, so keeping it around would put
          "Open note / Search for a command to run" in the pane's accessible
          text at all times. */}
      {switcherOpen && (
        <NoteSwitcher
          currentNoteId={config.noteId}
          onOpenChange={setSwitcherOpen}
          onSelect={handleSwitchNote}
          open
        />
      )}
    </div>
  );
}
