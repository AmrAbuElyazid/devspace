import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from "react";
import { ChevronDown, ChevronUp, Replace, ReplaceAll, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { HintTooltip } from "@/components/ui/hint-tooltip";

interface NoteFindBarProps {
  focusToken: number;
  matchCount: number;
  onClose: () => void;
  onNavigate: (direction: 1 | -1) => void;
  onQueryChange: (query: string) => void;
  onReplaceAll: (replacement: string) => void;
  onReplaceCurrent: (replacement: string) => void;
  query: string;
  selectedMatch: number;
}

const inputClass = cn(
  "h-6 min-w-0 flex-1 rounded-md px-2",
  "border border-border/70 bg-surface",
  "text-ui-xs text-foreground placeholder:text-muted-foreground/60",
  "outline-none transition-colors focus:border-brand-edge focus:ring-2 focus:ring-brand-soft",
);

function FindBarButton({
  ariaLabel,
  children,
  disabled,
  onClick,
}: {
  ariaLabel: string;
  children: ReactElement;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-md",
        "text-muted-foreground transition-colors hover:bg-row-hover hover:text-foreground",
        "disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Find and replace inside a note.
 *
 * Same shell as `TerminalFindBar` and `BrowserFindBar` so ⌘F feels identical in
 * every pane type; the replace row is the one thing notes add, and it stays
 * collapsed until asked for so the common case is still one line.
 */
export default function NoteFindBar({
  focusToken,
  matchCount,
  onClose,
  onNavigate,
  onQueryChange,
  onReplaceAll,
  onReplaceCurrent,
  query,
  selectedMatch,
}: NoteFindBarProps): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const [replacement, setReplacement] = useState("");
  const [showReplace, setShowReplace] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusToken]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        onNavigate(event.shiftKey ? -1 : 1);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    },
    [onClose, onNavigate],
  );

  const matchDisplay =
    matchCount > 0
      ? `${selectedMatch >= 0 ? selectedMatch + 1 : "-"} / ${matchCount}`
      : query
        ? "no matches"
        : "";

  return (
    <div className="relative z-[2] shrink-0 border-b border-border bg-rail px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setShowReplace((open) => !open)}
          aria-label={showReplace ? "Hide replace" : "Show replace"}
          aria-expanded={showReplace}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-row-hover hover:text-foreground"
        >
          <ChevronDown
            size={13}
            className={cn("transition-transform", !showReplace && "-rotate-90")}
          />
        </button>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Find in note"
          className={inputClass}
        />

        <div className="min-w-[68px] text-right font-mono text-ui-micro text-muted-foreground tabular-nums">
          {matchDisplay}
        </div>

        <HintTooltip dense content="Previous match" shortcut="Shift+Enter">
          <FindBarButton
            onClick={() => onNavigate(-1)}
            disabled={matchCount === 0}
            ariaLabel="Previous match"
          >
            <ChevronUp size={13} />
          </FindBarButton>
        </HintTooltip>
        <HintTooltip dense content="Next match" shortcut="Enter">
          <FindBarButton
            onClick={() => onNavigate(1)}
            disabled={matchCount === 0}
            ariaLabel="Next match"
          >
            <ChevronDown size={13} />
          </FindBarButton>
        </HintTooltip>
        <HintTooltip dense content="Close" shortcut="Esc">
          <FindBarButton onClick={onClose} ariaLabel="Close find bar">
            <X size={13} />
          </FindBarButton>
        </HintTooltip>
      </div>

      {showReplace && (
        <div className="mt-1.5 flex items-center gap-1.5 pl-[30px]">
          <input
            type="text"
            value={replacement}
            onChange={(event) => setReplacement(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              }
            }}
            placeholder="Replace with"
            className={inputClass}
          />
          <div className="min-w-[68px]" />
          <HintTooltip dense content="Replace this match">
            <FindBarButton
              onClick={() => onReplaceCurrent(replacement)}
              disabled={matchCount === 0 || selectedMatch < 0}
              ariaLabel="Replace match"
            >
              <Replace size={13} />
            </FindBarButton>
          </HintTooltip>
          <HintTooltip dense content={`Replace all ${matchCount} matches`}>
            <FindBarButton
              onClick={() => onReplaceAll(replacement)}
              disabled={matchCount === 0}
              ariaLabel="Replace all matches"
            >
              <ReplaceAll size={13} />
            </FindBarButton>
          </HintTooltip>
          <div className="size-6" />
        </div>
      )}
    </div>
  );
}
