import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type KeyboardEvent,
  type ReactElement,
} from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "../ui/button";
import { Tooltip } from "../ui/tooltip";

interface TerminalFindBarProps {
  paneId: string;
  focusToken: number;
  totalMatches: number;
  selectedMatch: number;
  onClose: () => void;
}

/**
 * Terminal search bar — modeled after BrowserFindBar.
 * Sends search queries to Ghostty via sendBindingAction and
 * receives match counts via the search callback pipeline.
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

  // Focus input whenever the token bumps (open / re-focus)
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusToken]);

  // Send the search query to Ghostty with debouncing.
  // Instant for empty or 3+ chars, 300ms delay for 1-2 chars (matches cmux).
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

  // Clean up debounce on unmount
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

  const handleClose = useCallback(() => {
    // Parent (TerminalPane) handles end_search and re-focus via onClose.
    onClose();
  }, [onClose]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        // Ghostty's navigate_search:next goes toward older content (visually down),
        // navigate_search:previous goes toward newer content (visually up).
        // Enter = down (next match below), Shift+Enter = up (next match above).
        if (event.shiftKey) {
          navigateNext();
        } else {
          navigatePrev();
        }
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        handleClose();
      }
    },
    [navigateNext, navigatePrev, handleClose],
  );

  // Format match display
  const matchDisplay =
    totalMatches > 0
      ? `${selectedMatch >= 0 ? selectedMatch + 1 : "-"} of ${totalMatches}`
      : value
        ? "No matches"
        : "";

  return (
    <div className="browser-find-bar">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        onKeyDown={handleKeyDown}
        className="browser-find-input"
        placeholder="Find in terminal"
      />
      <div className="browser-find-count">{matchDisplay}</div>
      <Tooltip content="Previous result" shortcut="Shift+Enter">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={navigateNext}
          className="browser-nav-btn"
          disabled={!value || totalMatches <= 0}
        >
          <ChevronUp size={14} />
        </Button>
      </Tooltip>
      <Tooltip content="Next result" shortcut="Enter">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={navigatePrev}
          className="browser-nav-btn"
          disabled={!value || totalMatches <= 0}
        >
          <ChevronDown size={14} />
        </Button>
      </Tooltip>
      <Tooltip content="Close" shortcut="Esc">
        <Button variant="ghost" size="icon-sm" onClick={handleClose} className="browser-nav-btn">
          <X size={14} />
        </Button>
      </Tooltip>
    </div>
  );
}
