import type { ReactElement } from "react";
import { ArrowLeft, ArrowRight, RotateCw, Search, X } from "lucide-react";
import { resolveDisplayString } from "../../shared/shortcuts";
import { Button } from "./ui/button";
import { Tooltip } from "./ui/tooltip";
import BrowserSecurityIndicator from "./browser/BrowserSecurityIndicator";
import BrowserFindBar from "./browser/BrowserFindBar";
import BrowserPermissionPrompt from "./browser/BrowserPermissionPrompt";
import BrowserPaneStatusSurface from "./browser/BrowserPaneStatusSurface";
import { useBrowserPaneController } from "./browser/useBrowserPaneController";
import type { BrowserConfig } from "../types/workspace";

interface BrowserPaneProps {
  paneId: string;
  workspaceId: string;
  config: BrowserConfig;
}

export default function BrowserPane({
  paneId,
  workspaceId,
  config,
}: BrowserPaneProps): ReactElement {
  const {
    activePermissionRequest,
    canGoBack,
    canGoForward,
    currentUrl,
    failure,
    findBarFocusToken,
    findState,
    handleAddressBarSubmit,
    handleCloseFindBar,
    handleDismissPermissionPrompt,
    handleKeyDown,
    handlePermissionDecision,
    handleReloadOrStop,
    inputRef,
    inputUrl,
    isFindBarOpen,
    isLoading,
    isSecure,
    isVisible,
    placeholderRef,
    securityLabel,
    setInputUrl,
  } = useBrowserPaneController({ paneId, workspaceId, config });

  return (
    <div className="browser-pane-shell">
      <div className="browser-toolbar flex items-center gap-1 shrink-0 px-1">
        <Tooltip content="Back" shortcut={resolveDisplayString("browser-back")}>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void window.api.browser.back(paneId)}
            disabled={!canGoBack}
            className="browser-nav-btn"
          >
            <ArrowLeft size={16} />
          </Button>
        </Tooltip>

        <Tooltip content="Forward" shortcut={resolveDisplayString("browser-forward")}>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void window.api.browser.forward(paneId)}
            disabled={!canGoForward}
            className="browser-nav-btn"
          >
            <ArrowRight size={16} />
          </Button>
        </Tooltip>

        <Tooltip
          content={isLoading ? "Stop" : "Reload"}
          shortcut={resolveDisplayString("browser-reload")}
        >
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleReloadOrStop}
            className="browser-nav-btn"
          >
            {isLoading ? <X size={16} /> : <RotateCw size={14} />}
          </Button>
        </Tooltip>

        <BrowserSecurityIndicator isSecure={isSecure} securityLabel={securityLabel} />

        <input
          ref={inputRef}
          type="text"
          value={inputUrl}
          onChange={(event) => setInputUrl(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => setInputUrl(currentUrl)}
          onFocus={() => inputRef.current?.select()}
          className="browser-url-input flex-1 min-w-0 rounded px-2 text-xs outline-none"
          placeholder="Enter URL or search..."
        />

        <Tooltip content="Go">
          <Button
            variant="ghost"
            size="icon-sm"
            onMouseDown={(event) => {
              event.preventDefault();
              handleAddressBarSubmit(inputRef.current?.value);
            }}
            className="browser-nav-btn"
          >
            <Search size={14} />
          </Button>
        </Tooltip>
      </div>

      {isFindBarOpen && (
        <BrowserFindBar
          paneId={paneId}
          query={findState?.query ?? ""}
          activeMatch={findState?.activeMatch ?? 0}
          totalMatches={findState?.totalMatches ?? 0}
          focusToken={findBarFocusToken}
          onClose={handleCloseFindBar}
        />
      )}

      {isLoading && <div className="browser-loading-bar" />}

      {activePermissionRequest && (
        <BrowserPermissionPrompt
          request={activePermissionRequest}
          onDecision={handlePermissionDecision}
          onDismiss={handleDismissPermissionPrompt}
        />
      )}

      <div className="browser-shell-viewport">
        {failure && (
          <BrowserPaneStatusSurface
            failure={failure}
            onPrimaryAction={() => void window.api.browser.reload(paneId)}
          />
        )}
        <div
          ref={placeholderRef}
          className="browser-native-view-slot"
          data-native-view-hidden={!isVisible ? "true" : undefined}
        />
      </div>
    </div>
  );
}
