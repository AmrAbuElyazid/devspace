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

interface BrowserFindBarProps {
  paneId: string;
  query: string;
  activeMatch: number;
  totalMatches: number;
  focusToken: number;
  onClose: () => void;
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

  useEffect(() => {
    setValue(query);
  }, [query]);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
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
    <div className="browser-find-bar">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        onKeyDown={handleKeyDown}
        className="browser-find-input"
        placeholder="Find in page"
      />
      <div className="browser-find-count">
        {totalMatches > 0 ? `${activeMatch} of ${totalMatches}` : "No matches"}
      </div>
      <Tooltip content="Previous result" shortcut="Shift+Enter">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => runFind(value, false, true)}
          className="browser-nav-btn"
          disabled={!value}
        >
          <ChevronUp size={14} />
        </Button>
      </Tooltip>
      <Tooltip content="Next result" shortcut="Enter">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => runFind(value, true, true)}
          className="browser-nav-btn"
          disabled={!value}
        >
          <ChevronDown size={14} />
        </Button>
      </Tooltip>
      <Tooltip content="Close" shortcut="Esc">
        <Button variant="ghost" size="icon-sm" onClick={onClose} className="browser-nav-btn">
          <X size={14} />
        </Button>
      </Tooltip>
    </div>
  );
}
