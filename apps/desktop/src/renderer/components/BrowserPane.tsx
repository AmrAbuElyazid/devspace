import { useCallback, useState, type ReactElement } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Monitor,
  MoreHorizontal,
  RotateCw,
  Smartphone,
  X,
} from "lucide-react";

import { resolveDisplayString } from "../../shared/shortcuts";
import { useBrowserPaneController } from "./browser/useBrowserPaneController";
import type { BrowserConfig } from "@/types/workspace";
import { cn } from "@/lib/utils";

import { HintTooltip } from "@/components/ui/hint-tooltip";
import { showPaneOverlayMenu } from "@/lib/pane-overlay-menu";

import BrowserSecurityIndicator from "./browser/BrowserSecurityIndicator";
import BrowserFindBar from "./browser/BrowserFindBar";
import BrowserPermissionPrompt from "./browser/BrowserPermissionPrompt";
import BrowserPaneStatusSurface from "./browser/BrowserPaneStatusSurface";
import BrowserDeviceToolbar from "./browser/BrowserDeviceToolbar";
import BrowserViewportResizeHandles from "./browser/BrowserViewportResizeHandles";
import { BROWSER_DEVICE_TOOLBAR_HEIGHT, BROWSER_VIEWPORT_RAIL_SIZE } from "@/lib/browser-viewport";
import { MAX_BROWSER_ZOOM, MIN_BROWSER_ZOOM } from "@/lib/browser-zoom";

interface BrowserPaneProps {
  paneId: string;
  workspaceId: string;
  config: BrowserConfig;
  isFocused: boolean;
  isActive?: boolean;
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
        "text-muted-foreground hover:text-foreground hover:bg-row-hover",
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
  isActive = true,
}: BrowserPaneProps): ReactElement {
  const {
    activeDrag,
    activePermissionRequest,
    aspectRatio,
    canGoBack,
    canGoForward,
    commitViewport,
    contentRef,
    currentUrl,
    effectiveViewport,
    failure,
    handleResizeKeyDown,
    handleResizePointerDown,
    handleOpenFindBar,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
    layout,
    panel,
    setAspectRatio,
    toggleDeviceMode,
    userZoom,
    findBarFocusToken,
    findState,
    handleCloseFindBar,
    handleDismissPermissionPrompt,
    handleFailureRetry,
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
  } = useBrowserPaneController({ paneId, workspaceId, config, isFocused, isActive });

  const [menuOpen, setMenuOpen] = useState(false);

  // The menu is drawn in a transparent view stacked above the pane, so the page
  // stays visible underneath instead of being hidden for as long as it is open.
  const handleOpenMenu = useCallback(
    async (event: React.MouseEvent<HTMLButtonElement>) => {
      setMenuOpen(true);
      const action = await showPaneOverlayMenu(
        event.currentTarget,
        [
          {
            id: "zoom-in",
            label: "Zoom in",
            shortcut: resolveDisplayString("browser-zoom-in"),
            disabled: userZoom >= MAX_BROWSER_ZOOM,
          },
          {
            id: "zoom-out",
            label: "Zoom out",
            shortcut: resolveDisplayString("browser-zoom-out"),
            disabled: userZoom <= MIN_BROWSER_ZOOM,
          },
          {
            id: "zoom-reset",
            label: "Reset zoom",
            detail: `${Math.round(userZoom * 100)}%`,
            disabled: userZoom === 1,
          },
          {
            id: "find",
            label: "Find in page",
            shortcut: resolveDisplayString("browser-find"),
            separatorBefore: true,
          },
          { id: "open-external", label: "Open in external browser" },
          {
            id: "devtools",
            label: "Toggle DevTools",
            shortcut: resolveDisplayString("browser-devtools"),
            separatorBefore: true,
          },
        ],
        { align: "end", minWidth: 240, label: "Browser menu" },
      );
      setMenuOpen(false);

      if (action === "zoom-in") handleZoomIn();
      else if (action === "zoom-out") handleZoomOut();
      else if (action === "zoom-reset") handleZoomReset();
      else if (action === "find") handleOpenFindBar();
      else if (action === "open-external") window.api.shell.openExternal(currentUrl);
      else if (action === "devtools") void window.api.browser.toggleDevTools(paneId);
    },
    [currentUrl, handleOpenFindBar, handleZoomIn, handleZoomOut, handleZoomReset, paneId, userZoom],
  );

  const inDeviceMode = effectiveViewport.kind === "device";

  // Centre the frame inside the area left over once the device toolbar strip
  // and the drag rails have taken their share. Clamped at the rail so an
  // oversized frame stays pinned rather than drifting under the chrome.
  const deviceArea = {
    width: Math.max(1, panel.width - BROWSER_VIEWPORT_RAIL_SIZE * 2),
    height: Math.max(1, panel.height - BROWSER_DEVICE_TOOLBAR_HEIGHT - BROWSER_VIEWPORT_RAIL_SIZE),
  };
  const frameLeft =
    BROWSER_VIEWPORT_RAIL_SIZE + Math.max(0, Math.round((deviceArea.width - layout.viewWidth) / 2));
  const frameTop =
    BROWSER_DEVICE_TOOLBAR_HEIGHT +
    Math.max(0, Math.round((deviceArea.height - layout.viewHeight) / 2));

  return (
    <div className="flex flex-col h-full w-full bg-background">
      {/* Toolbar.

          Shaped like a browser's rather than a control panel's: a nav cluster,
          one wide address field carrying its own lock glyph, and a single
          overflow for everything secondary. The previous row put eleven
          controls at equal weight — three of them zoom — so the address bar,
          the only thing anyone aims at, was squeezed between them.

          Every tooltip in here opens upward. Downward is the WebContentsView,
          which composites above the renderer and swallows them whole. */}
      <div className="flex items-center gap-0.5 shrink-0 h-9 px-1.5 bg-rail border-b border-border relative z-[2]">
        <HintTooltip content="Back" dense shortcut={resolveDisplayString("browser-back")}>
          <NavButton
            onClick={() => void window.api.browser.back(paneId)}
            disabled={!canGoBack}
            ariaLabel="Back"
          >
            <ArrowLeft size={15} />
          </NavButton>
        </HintTooltip>
        <HintTooltip content="Forward" dense shortcut={resolveDisplayString("browser-forward")}>
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
          dense
          shortcut={resolveDisplayString("browser-reload")}
        >
          <NavButton onClick={handleReloadOrStop} ariaLabel={isLoading ? "Stop" : "Reload"}>
            {isLoading ? <X size={15} /> : <RotateCw size={13} />}
          </NavButton>
        </HintTooltip>

        {/* Address field. The lock lives inside the field so the two read as
            one object — the identity of what you are looking at. */}
        <div
          className={cn(
            "group/url flex flex-1 min-w-0 items-center gap-1 h-7 ml-1 pl-1.5 pr-1 rounded-md",
            "bg-surface border border-border/70 transition-colors",
            "focus-within:border-brand-edge focus-within:ring-2 focus-within:ring-brand-soft",
          )}
        >
          <BrowserSecurityIndicator isSecure={isSecure} securityLabel={securityLabel} />
          <input
            ref={inputRef}
            type="text"
            value={inputUrl}
            onChange={(event) => setInputUrl(event.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => setInputUrl(currentUrl)}
            onFocus={() => inputRef.current?.select()}
            placeholder="Search or enter address"
            aria-label="Address and search bar"
            className={cn(
              "flex-1 min-w-0 bg-transparent outline-none",
              "font-mono text-ui-xs text-foreground placeholder:text-muted-foreground/60",
            )}
          />
          {/* Only worth toolbar space when it is not the default. Clicking it
              resets, which is the only thing anyone wants from a zoom readout. */}
          {userZoom !== 1 && (
            <HintTooltip
              content="Reset zoom"
              dense
              shortcut={resolveDisplayString("browser-zoom-reset")}
            >
              <button
                type="button"
                onClick={handleZoomReset}
                aria-label={`Zoom ${Math.round(userZoom * 100)} percent, click to reset`}
                className={cn(
                  "chrome-focus shrink-0 rounded px-1 py-0.5 bg-brand-soft text-brand",
                  "font-mono text-ui-micro tabular-nums transition-colors hover:bg-row-hover",
                )}
              >
                {Math.round(userZoom * 100)}%
              </button>
            </HintTooltip>
          )}
        </div>

        <HintTooltip content={inDeviceMode ? "Exit device mode" : "Device mode"} dense>
          <button
            type="button"
            onClick={toggleDeviceMode}
            aria-label="Toggle device mode"
            aria-pressed={inDeviceMode}
            className={cn(
              "chrome-focus inline-flex size-7 shrink-0 items-center justify-center rounded-md",
              "transition-colors",
              inDeviceMode
                ? "bg-brand-soft text-brand"
                : "text-muted-foreground hover:bg-row-hover hover:text-foreground",
            )}
          >
            {inDeviceMode ? <Smartphone size={14} /> : <Monitor size={14} />}
          </button>
        </HintTooltip>

        <HintTooltip content="Browser menu" dense>
          <button
            type="button"
            aria-label="Browser menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={handleOpenMenu}
            className={cn(
              "chrome-focus inline-flex size-7 shrink-0 items-center justify-center rounded-md",
              "text-muted-foreground transition-colors hover:bg-row-hover hover:text-foreground",
              menuOpen && "bg-row-hover text-foreground",
            )}
          >
            <MoreHorizontal size={15} />
          </button>
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

      {/* Native WebContentsView slot.

          The view is composited above the renderer, so nothing can be drawn on
          top of it. Device mode works with that rather than against it: the
          placeholder — which is what the native-view store measures and the
          view tracks — is shrunk to the device frame, and every piece of device
          chrome is laid out in the margin around it. */}
      <div ref={contentRef} className="relative flex-1 min-h-0 bg-elevated/40">
        {failure && (
          <BrowserPaneStatusSurface failure={failure} onPrimaryAction={handleFailureRetry} />
        )}

        {inDeviceMode && effectiveViewport.kind === "device" && (
          <BrowserDeviceToolbar
            setting={effectiveViewport}
            displaySize={{ width: layout.cssWidth, height: layout.cssHeight }}
            aspectRatio={aspectRatio}
            fitScale={layout.fitScale}
            paneWidth={panel.width}
            onChange={commitViewport}
            onAspectRatioChange={setAspectRatio}
            onExit={toggleDeviceMode}
          />
        )}

        <div
          ref={placeholderRef}
          className={cn(
            "absolute bg-background data-[hidden=true]:invisible",
            !layout.fillsPanel && "ring-1 ring-border shadow-overlay",
          )}
          style={
            layout.fillsPanel
              ? { inset: 0 }
              : {
                  left: frameLeft,
                  top: frameTop,
                  width: layout.viewWidth,
                  height: layout.viewHeight,
                }
          }
          data-hidden={!isVisible ? "true" : undefined}
        />

        {inDeviceMode && !layout.fillsPanel && (
          <>
            <BrowserViewportResizeHandles
              geometry={{
                left: frameLeft,
                top: frameTop,
                width: layout.viewWidth,
                height: layout.viewHeight,
              }}
              activeDirection={activeDrag?.direction ?? null}
              onPointerDown={handleResizePointerDown}
              onKeyDown={handleResizeKeyDown}
            />
          </>
        )}
      </div>
    </div>
  );
}
