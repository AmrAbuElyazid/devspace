import type { ReactElement } from "react";
import { ArrowLeft, ArrowRight, ExternalLink, RotateCw, Search, X } from "lucide-react";

import { resolveDisplayString } from "../../shared/shortcuts";
import { useBrowserPaneController } from "./browser/useBrowserPaneController";
import type { BrowserConfig } from "@/types/workspace";
import { cn } from "@/lib/utils";

import { HintTooltip } from "@/components/ui/hint-tooltip";

import BrowserSecurityIndicator from "./browser/BrowserSecurityIndicator";
import BrowserFindBar from "./browser/BrowserFindBar";
import BrowserPermissionPrompt from "./browser/BrowserPermissionPrompt";
import BrowserPaneStatusSurface from "./browser/BrowserPaneStatusSurface";

interface BrowserPaneProps {
  paneId: string;
  workspaceId: string;
  config: BrowserConfig;
  isFocused: boolean;
}

/** Tiny helper for the browser toolbar's icon buttons — tightly tuned for
 *  the 36px toolbar height and the dense default density. */
function NavButton({
  children,
  onClick,
  onMouseDown,
  disabled,
  ariaLabel,
}: {
  children: ReactElement;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseDown?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  ariaLabel?: string;
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseDown={onMouseDown}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center justify-center size-7 rounded-md shrink-0",
        "text-muted-foreground hover:text-foreground hover:bg-hover",
        "disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground",
        "transition-colors",
      )}
    >
      {children}
    </button>
  );
}

export default function BrowserPane({
  paneId,
  workspaceId,
  config,
  isFocused,
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
  } = useBrowserPaneController({ paneId, workspaceId, config, isFocused });

  return (
    <div className="flex flex-col h-full w-full bg-background">
      {/* Toolbar */}
      <div className="flex items-center gap-1 shrink-0 h-9 px-1.5 bg-rail border-b border-hairline relative z-[2]">
        <HintTooltip content="Back" shortcut={resolveDisplayString("browser-back")}>
          <NavButton
            onClick={() => void window.api.browser.back(paneId)}
            disabled={!canGoBack}
            ariaLabel="Back"
          >
            <ArrowLeft size={15} />
          </NavButton>
        </HintTooltip>
        <HintTooltip content="Forward" shortcut={resolveDisplayString("browser-forward")}>
          <NavButton
            onClick={() => void window.api.browser.forward(paneId)}
            disabled={!canGoForward}
            ariaLabel="Forward"
          >
            <ArrowRight size={15} />
          </NavButton>
        </HintTooltip>
        <HintTooltip
          content={isLoading ? "Stop" : "Reload"}
          shortcut={resolveDisplayString("browser-reload")}
        >
          <NavButton onClick={handleReloadOrStop} ariaLabel={isLoading ? "Stop" : "Reload"}>
            {isLoading ? <X size={15} /> : <RotateCw size={13} />}
          </NavButton>
        </HintTooltip>

        <BrowserSecurityIndicator isSecure={isSecure} securityLabel={securityLabel} />

        <input
          ref={inputRef}
          type="text"
          value={inputUrl}
          onChange={(event) => setInputUrl(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => setInputUrl(currentUrl)}
          onFocus={() => inputRef.current?.select()}
          placeholder="Enter URL or search..."
          className={cn(
            "flex-1 min-w-0 h-7 px-2.5 rounded-md",
            "bg-surface border border-border/70",
            "font-mono text-[11.5px] text-foreground placeholder:text-muted-foreground/60",
            "outline-none",
            "focus:border-brand-edge focus:ring-2 focus:ring-brand-soft",
            "transition-colors",
          )}
        />

        <HintTooltip content="Go">
          <NavButton
            onMouseDown={(event) => {
              event.preventDefault();
              handleAddressBarSubmit(inputRef.current?.value);
            }}
            ariaLabel="Go"
          >
            <Search size={13} />
          </NavButton>
        </HintTooltip>

        <HintTooltip content="Open in external browser">
          <NavButton
            onClick={() => window.api.shell.openExternal(currentUrl)}
            ariaLabel="Open in external browser"
          >
            <ExternalLink size={13} />
          </NavButton>
        </HintTooltip>
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

      {/* Loading bar — animates a brand-colored sliver across the top */}
      {isLoading && (
        <div className="relative h-0.5 shrink-0 bg-transparent overflow-hidden">
          <div
            aria-hidden
            className="absolute inset-y-0 -left-1/3 w-1/3 bg-brand"
            style={{ animation: "browser-loading 1.2s linear infinite" }}
          />
        </div>
      )}

      {activePermissionRequest && (
        <BrowserPermissionPrompt
          request={activePermissionRequest}
          onDecision={handlePermissionDecision}
          onDismiss={handleDismissPermissionPrompt}
        />
      )}

      {/* Native WebContentsView slot */}
      <div className="relative flex-1 min-h-0">
        {failure && (
          <BrowserPaneStatusSurface
            failure={failure}
            onPrimaryAction={() => void window.api.browser.reload(paneId)}
          />
        )}
        <div
          ref={placeholderRef}
          className="absolute inset-0 bg-background data-[hidden=true]:invisible"
          data-hidden={!isVisible ? "true" : undefined}
        />
      </div>
    </div>
  );
}
