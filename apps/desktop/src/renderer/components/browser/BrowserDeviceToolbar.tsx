import { useCallback, useState, type ReactElement } from "react";
import { ChevronDown, Link, Link2Off, RotateCcw, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { HintTooltip } from "@/components/ui/hint-tooltip";
import { showPaneOverlayMenu, type OverlayMenuItem } from "@/lib/pane-overlay-menu";
import {
  BROWSER_DEVICE_TOOLBAR_HEIGHT,
  BROWSER_VIEWPORT_MAX_DIMENSION,
  BROWSER_VIEWPORT_MIN_DIMENSION,
  BROWSER_VIEWPORT_PRESETS,
  clampBrowserViewportSize,
  resizeBrowserViewport,
  type BrowserViewportPreset,
  type BrowserViewportSetting,
} from "@/lib/browser-viewport";

const RESPONSIVE_VALUE = "responsive";

/** base-ui resolves the trigger's display text through this map; without it
    the trigger renders the raw preset id instead of its label. */
const SELECT_ITEMS: Record<string, string> = {
  [RESPONSIVE_VALUE]: "Responsive",
  ...Object.fromEntries(BROWSER_VIEWPORT_PRESETS.map((preset) => [preset.id, preset.label])),
};

const PRESET_GROUPS: readonly { label: string; presets: BrowserViewportPreset[] }[] = [
  { label: "Phone", presets: BROWSER_VIEWPORT_PRESETS.filter((p) => p.group === "Phone") },
  { label: "Tablet", presets: BROWSER_VIEWPORT_PRESETS.filter((p) => p.group === "Tablet") },
  { label: "Desktop", presets: BROWSER_VIEWPORT_PRESETS.filter((p) => p.group === "Desktop") },
];

interface Props {
  /** Committed device size. Freeform while dragging, preset when chosen. */
  setting: Extract<BrowserViewportSetting, { kind: "device" }>;
  /** Live size during a drag, so the fields track the frame. */
  displaySize: { width: number; height: number };
  aspectRatio: number | null;
  /** Below 1 when the frame is too big for the pane and had to be scaled. */
  fitScale: number;
  /** Pane width, used to drop labels on narrow panes rather than overflow. */
  paneWidth: number;
  onChange: (next: BrowserViewportSetting) => void;
  onAspectRatioChange: (aspectRatio: number | null) => void;
  onExit: () => void;
}

function isValidDimension(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= BROWSER_VIEWPORT_MIN_DIMENSION &&
    value <= BROWSER_VIEWPORT_MAX_DIMENSION
  );
}

export default function BrowserDeviceToolbar({
  setting,
  displaySize,
  aspectRatio,
  fitScale,
  paneWidth,
  onChange,
  onAspectRatioChange,
  onExit,
}: Props): ReactElement {
  // Local draft while typing, so a half-typed "3" in a width field does not
  // immediately resize the frame to the 240px minimum.
  const [draft, setDraft] = useState<{ width: string; height: string } | null>(null);
  const presented = draft ?? {
    width: String(displaySize.width),
    height: String(displaySize.height),
  };
  const draftWidth = Number(presented.width);
  const draftHeight = Number(presented.height);
  const draftValid = isValidDimension(draftWidth) && isValidDimension(draftHeight);

  const selectedValue = setting.presetId ?? RESPONSIVE_VALUE;
  const showLabels = paneWidth >= 560;
  const wideFields = paneWidth >= 400;

  const commitDraft = (): void => {
    if (!draftValid || (draftWidth === setting.width && draftHeight === setting.height)) {
      setDraft(null);
      return;
    }

    onChange({
      kind: "device",
      ...clampBrowserViewportSize({ width: draftWidth, height: draftHeight }),
    });
    setDraft(null);
  };

  const updateDraftDimension = (axis: "width" | "height", value: string): void => {
    setDraft((current) => {
      const next = {
        width: axis === "width" ? value : (current?.width ?? String(displaySize.width)),
        height: axis === "height" ? value : (current?.height ?? String(displaySize.height)),
      };

      const numeric = Number(value);
      if (aspectRatio === null || !isValidDimension(numeric)) {
        return next;
      }

      // With the ratio locked, typing into one field drives the other.
      const resized = resizeBrowserViewport(
        { width: displaySize.width, height: displaySize.height },
        axis === "width"
          ? { x: numeric - displaySize.width, y: 0 }
          : { x: 0, y: numeric - displaySize.height },
        axis === "width" ? "east" : "south",
        aspectRatio,
      );
      return { width: String(resized.width), height: String(resized.height) };
    });
  };

  const selectPreset = useCallback(
    (value: string | null): void => {
      if (!value) return;

      if (value === RESPONSIVE_VALUE) {
        // Drop the preset id but keep the size — switching to Responsive should
        // free the frame, not jump it somewhere else.
        onChange({ kind: "device", width: setting.width, height: setting.height });
        return;
      }

      const preset = BROWSER_VIEWPORT_PRESETS.find((candidate) => candidate.id === value);
      if (!preset) return;

      setDraft(null);
      onChange({ kind: "device", width: preset.width, height: preset.height, presetId: preset.id });
      if (aspectRatio !== null) {
        onAspectRatioChange(preset.width / preset.height);
      }
    },
    [aspectRatio, onAspectRatioChange, onChange, setting.height, setting.width],
  );

  const [presetMenuOpen, setPresetMenuOpen] = useState(false);

  const openPresetMenu = useCallback(
    async (event: React.MouseEvent<HTMLButtonElement>) => {
      setPresetMenuOpen(true);
      const items: OverlayMenuItem[] = [
        { id: RESPONSIVE_VALUE, label: "Responsive", checked: selectedValue === RESPONSIVE_VALUE },
      ];
      for (const group of PRESET_GROUPS) {
        group.presets.forEach((preset, index) => {
          items.push({
            id: preset.id,
            label: preset.label,
            detail: `${preset.width}×${preset.height}`,
            checked: selectedValue === preset.id,
            ...(index === 0 ? { groupLabel: group.label, separatorBefore: true } : {}),
          });
        });
      }

      const chosen = await showPaneOverlayMenu(event.currentTarget, items, {
        minWidth: 240,
        label: "Device preset",
      });
      setPresetMenuOpen(false);
      if (chosen) selectPreset(chosen);
    },
    [selectPreset, selectedValue],
  );

  const rotate = (): void => {
    setDraft(null);
    onChange({
      kind: "device",
      width: setting.height,
      height: setting.width,
      ...(setting.presetId ? { presetId: setting.presetId } : {}),
    });
    if (aspectRatio !== null) {
      onAspectRatioChange(1 / aspectRatio);
    }
  };

  const dimensionFieldClass = cn(
    "h-6 rounded-md border border-border/70 bg-surface px-1 text-center",
    "font-mono text-ui-xs tabular-nums text-foreground outline-none",
    "focus:border-brand-edge focus:ring-2 focus:ring-brand-soft",
    "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none",
    "[&::-webkit-outer-spin-button]:appearance-none",
    wideFields ? "w-14" : "w-11",
    !draftValid && "border-destructive/60",
  );

  return (
    <div
      role="toolbar"
      aria-label="Device viewport"
      className={cn(
        "absolute inset-x-0 top-0 z-20 flex items-center gap-1 px-1.5",
        "border-b border-border bg-rail/95",
      )}
      style={{ height: BROWSER_DEVICE_TOOLBAR_HEIGHT }}
      // Committing on blur means clicking straight onto the canvas applies the
      // typed size instead of silently discarding it.
      onBlur={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          event.currentTarget.contains(event.relatedTarget)
        ) {
          return;
        }
        commitDraft();
      }}
    >
      {showLabels && (
        <span className="shrink-0 text-ui-micro font-medium text-muted-foreground">Device</span>
      )}

      <button
        type="button"
        aria-label="Device preset"
        aria-haspopup="menu"
        aria-expanded={presetMenuOpen}
        onClick={openPresetMenu}
        className={cn(
          "chrome-focus flex h-6 shrink-0 items-center justify-between gap-1 rounded-md px-1.5",
          "border border-border/70 bg-surface text-ui-xs text-foreground transition-colors",
          "hover:bg-row-hover",
          wideFields ? "w-40" : "w-28",
        )}
      >
        <span className="truncate">{SELECT_ITEMS[selectedValue] ?? "Responsive"}</span>
        <ChevronDown size={12} className="shrink-0 text-muted-foreground" />
      </button>

      <div
        role="group"
        aria-label="Viewport dimensions"
        className="flex min-w-0 shrink-0 items-center gap-1"
        // A form with two inputs and no submit button never gets implicit
        // submission, so Enter has to be handled explicitly or typing a size
        // and pressing Enter would silently do nothing.
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commitDraft();
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setDraft(null);
          }
        }}
      >
        <input
          type="number"
          inputMode="numeric"
          aria-label="Viewport width"
          aria-invalid={!draftValid}
          min={BROWSER_VIEWPORT_MIN_DIMENSION}
          max={BROWSER_VIEWPORT_MAX_DIMENSION}
          value={presented.width}
          onChange={(event) => updateDraftDimension("width", event.target.value)}
          className={dimensionFieldClass}
        />
        <span aria-hidden className="text-ui-micro text-muted-foreground">
          ×
        </span>
        <input
          type="number"
          inputMode="numeric"
          aria-label="Viewport height"
          aria-invalid={!draftValid}
          min={BROWSER_VIEWPORT_MIN_DIMENSION}
          max={BROWSER_VIEWPORT_MAX_DIMENSION}
          value={presented.height}
          onChange={(event) => updateDraftDimension("height", event.target.value)}
          className={dimensionFieldClass}
        />
      </div>

      {fitScale < 1 && (
        // The frame on screen is smaller than the size in the fields. Say so,
        // or the dimensions read as a lie. This lives in the toolbar rather
        // than over the frame because the native browser view composites above
        // the renderer and would hide anything drawn inside the frame rect.
        <HintTooltip
          dense
          content={`Scaled to fit the pane. The page still lays out at ${displaySize.width}px wide.`}
        >
          <span className="shrink-0 rounded-md bg-elevated px-1.5 py-0.5 font-mono text-ui-micro tabular-nums text-muted-foreground">
            {Math.round(fitScale * 100)}%
          </span>
        </HintTooltip>
      )}

      <HintTooltip
        dense
        content={aspectRatio === null ? "Lock aspect ratio" : "Unlock aspect ratio"}
      >
        <button
          type="button"
          aria-label={aspectRatio === null ? "Lock aspect ratio" : "Unlock aspect ratio"}
          aria-pressed={aspectRatio !== null}
          // Pointer-down default would blur the dimension fields and commit a
          // draft the user is still editing.
          onPointerDown={(event) => event.preventDefault()}
          onClick={() =>
            onAspectRatioChange(
              aspectRatio === null ? displaySize.width / displaySize.height : null,
            )
          }
          className={cn(
            "chrome-focus inline-flex size-6 shrink-0 items-center justify-center rounded-md",
            "text-muted-foreground transition-colors hover:bg-row-hover hover:text-foreground",
            aspectRatio !== null && "bg-brand-soft text-brand",
          )}
        >
          {aspectRatio === null ? <Link2Off size={13} /> : <Link size={13} />}
        </button>
      </HintTooltip>

      <HintTooltip content="Rotate" dense>
        <button
          type="button"
          aria-label="Rotate viewport"
          onPointerDown={(event) => event.preventDefault()}
          onClick={rotate}
          className={cn(
            "chrome-focus inline-flex size-6 shrink-0 items-center justify-center rounded-md",
            "text-muted-foreground transition-colors hover:bg-row-hover hover:text-foreground",
          )}
        >
          <RotateCcw size={13} />
        </button>
      </HintTooltip>

      <HintTooltip content="Exit device mode" dense>
        <button
          type="button"
          aria-label="Exit device mode"
          onPointerDown={(event) => event.preventDefault()}
          onClick={onExit}
          className={cn(
            "chrome-focus ml-auto inline-flex size-6 shrink-0 items-center justify-center rounded-md",
            "text-muted-foreground transition-colors hover:bg-row-hover hover:text-foreground",
          )}
        >
          <X size={13} />
        </button>
      </HintTooltip>
    </div>
  );
}
