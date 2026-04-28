import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type KeyboardEvent,
  type ReactElement,
} from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";

import { releaseNativeFocus } from "@/lib/native-pane-focus";
import { cn } from "@/lib/utils";

import { HintTooltip } from "@/components/ui/hint-tooltip";

interface BrowserFindBarProps {
  paneId: string;
  query: string;
  activeMatch: number;
  totalMatches: number;
  focusToken: number;
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

export default function BrowserFindBar({
  paneId,
  query,
  activeMatch,
  totalMatches,
  focusToken,
  onClose,
}: BrowserFindBarProps): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(query);

  useEffect(() => setValue(query), [query]);

  useEffect(() => {
    releaseNativeFocus();
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [focusToken]);

  const runFind = useCallback(
    (nextQuery: string, forward = true, findNext = false) => {
      if (!nextQuery) {
        void window.api.browser.stopFindInPage(paneId);
        return;
      }
      void window.api.browser.findInPage(paneId, nextQuery, { forward, findNext });
    },
    [paneId],
  );

  const handleChange = useCallback(
    (nextValue: string) => {
      setValue(nextValue);
      runFind(nextValue);
    },
    [runFind],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        runFind(value, !event.shiftKey, true);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    },
    [onClose, runFind, value],
  );

  return (
    <div className="flex items-center gap-1.5 shrink-0 h-9 px-2 bg-rail border-b border-hairline relative z-[2]">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Find in page"
        className={cn(
          "flex-1 min-w-0 h-6 px-2 rounded-md",
          "bg-surface border border-border/70",
          "text-[11px] text-foreground placeholder:text-muted-foreground/60",
          "outline-none",
          "focus:border-brand-edge focus:ring-2 focus:ring-brand-soft",
          "transition-colors",
        )}
      />
      <div className="min-w-[68px] text-right text-[10.5px] font-mono text-muted-foreground tabular-nums">
        {totalMatches > 0 ? `${activeMatch} / ${totalMatches}` : "no matches"}
      </div>
      <HintTooltip content="Previous match" shortcut="Shift+Enter">
        <FindBarButton
          onClick={() => runFind(value, false, true)}
          disabled={!value}
          ariaLabel="Previous match"
        >
          <ChevronUp size={13} />
        </FindBarButton>
      </HintTooltip>
      <HintTooltip content="Next match" shortcut="Enter">
        <FindBarButton
          onClick={() => runFind(value, true, true)}
          disabled={!value}
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
