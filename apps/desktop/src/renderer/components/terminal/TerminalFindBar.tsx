import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type KeyboardEvent,
  type ReactElement,
} from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { HintTooltip } from "@/components/ui/hint-tooltip";

interface TerminalFindBarProps {
  paneId: string;
  focusToken: number;
  totalMatches: number;
  selectedMatch: number;
  onClose: () => void;
}

function FindBarButton({
  children,
  onClick,
  disabled,
  ariaLabel,
}: {
  children: ReactElement;
  onClick: () => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center justify-center size-6 rounded-md shrink-0",
        "text-muted-foreground hover:text-foreground hover:bg-hover",
        "disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground",
        "transition-colors",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Terminal search bar — modeled after BrowserFindBar.
 * Sends search queries to Ghostty via sendBindingAction; receives match counts
 * via the search callback pipeline.
 */
export default function TerminalFindBar({
  paneId,
  focusToken,
  totalMatches,
  selectedMatch,
  onClose,
}: TerminalFindBarProps): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusToken]);

  const sendSearch = useCallback(
    (needle: string) => {
      void window.api.terminal.sendBindingAction(paneId, `search:${needle}`);
    },
    [paneId],
  );

  const handleChange = useCallback(
    (nextValue: string) => {
      setValue(nextValue);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (nextValue.length === 0 || nextValue.length >= 3) {
        sendSearch(nextValue);
      } else {
        debounceRef.current = setTimeout(() => sendSearch(nextValue), 300);
      }
    },
    [sendSearch],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const navigateNext = useCallback(() => {
    void window.api.terminal.sendBindingAction(paneId, "navigate_search:next");
  }, [paneId]);
  const navigatePrev = useCallback(() => {
    void window.api.terminal.sendBindingAction(paneId, "navigate_search:previous");
  }, [paneId]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        if (event.shiftKey) navigateNext();
        else navigatePrev();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    },
    [navigateNext, navigatePrev, onClose],
  );

  const matchDisplay =
    totalMatches > 0
      ? `${selectedMatch >= 0 ? selectedMatch + 1 : "-"} / ${totalMatches}`
      : value
        ? "no matches"
        : "";

  return (
    <div className="flex items-center gap-1.5 shrink-0 h-9 px-2 bg-rail border-b border-hairline relative z-[2]">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Find in terminal"
        className={cn(
          "flex-1 min-w-0 h-6 px-2 rounded-md",
          "bg-surface border border-border/70",
          "text-[11px] text-foreground placeholder:text-muted-foreground/60",
          "outline-none focus:border-brand-edge focus:ring-2 focus:ring-brand-soft",
          "transition-colors",
        )}
      />
      <div className="min-w-[68px] text-right text-[10.5px] font-mono text-muted-foreground tabular-nums">
        {matchDisplay}
      </div>
      <HintTooltip content="Previous match" shortcut="Shift+Enter">
        <FindBarButton
          onClick={navigateNext}
          disabled={!value || totalMatches <= 0}
          ariaLabel="Previous match"
        >
          <ChevronUp size={13} />
        </FindBarButton>
      </HintTooltip>
      <HintTooltip content="Next match" shortcut="Enter">
        <FindBarButton
          onClick={navigatePrev}
          disabled={!value || totalMatches <= 0}
          ariaLabel="Next match"
        >
          <ChevronDown size={13} />
        </FindBarButton>
      </HintTooltip>
      <HintTooltip content="Close" shortcut="Esc">
        <FindBarButton onClick={onClose} ariaLabel="Close find bar">
          <X size={13} />
        </FindBarButton>
      </HintTooltip>
    </div>
  );
}
