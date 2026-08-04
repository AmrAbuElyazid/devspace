import type { CSSProperties, KeyboardEvent, PointerEvent, ReactElement } from "react";

import { cn } from "@/lib/utils";
import {
  BROWSER_VIEWPORT_RAIL_SIZE,
  type BrowserViewportResizeDirection,
} from "@/lib/browser-viewport";

interface HandleGeometry {
  /** Rect of the device frame within the pane content area. */
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Props {
  geometry: HandleGeometry;
  activeDirection: BrowserViewportResizeDirection | null;
  onPointerDown: (
    direction: BrowserViewportResizeDirection,
    event: PointerEvent<HTMLButtonElement>,
  ) => void;
  onKeyDown: (
    direction: BrowserViewportResizeDirection,
    event: KeyboardEvent<HTMLButtonElement>,
  ) => void;
}

type HandleKind = "vertical" | "horizontal" | "corner";

function ResizeHandle({
  direction,
  label,
  kind,
  cursorClassName,
  style,
  active,
  mirrored = false,
  onPointerDown,
  onKeyDown,
}: {
  direction: BrowserViewportResizeDirection;
  label: string;
  kind: HandleKind;
  cursorClassName: string;
  style: CSSProperties;
  active: boolean;
  mirrored?: boolean;
  onPointerDown: Props["onPointerDown"];
  onKeyDown: Props["onKeyDown"];
}): ReactElement {
  return (
    <button
      type="button"
      // Buttons rather than bare divs: the grips are reachable by Tab and
      // resizable with the arrow keys, which a pointer-only rail never is.
      aria-label={`${label}. Use arrow keys to resize.`}
      className={cn(
        "group absolute z-20 border-0 bg-transparent p-0 outline-none touch-none",
        "chrome-focus",
        kind === "corner" && "z-30",
        cursorClassName,
      )}
      style={style}
      onPointerDown={(event) => onPointerDown(direction, event)}
      onKeyDown={(event) => onKeyDown(direction, event)}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2",
          "items-center justify-center text-muted-foreground/55 transition-colors duration-150",
          "group-hover:text-foreground/85 group-focus-visible:text-foreground",
          active && "text-brand",
        )}
      >
        {kind === "vertical" ? (
          <span className="flex gap-px">
            <span className="h-6 w-px rounded-full bg-current" />
            <span className="h-6 w-px rounded-full bg-current" />
          </span>
        ) : kind === "horizontal" ? (
          <span className="flex flex-col gap-px">
            <span className="h-px w-6 rounded-full bg-current" />
            <span className="h-px w-6 rounded-full bg-current" />
          </span>
        ) : (
          <span className={cn("relative block size-3", mirrored && "-scale-x-100")}>
            <span className="absolute bottom-[3px] left-0 h-px w-3 -rotate-45 rounded-full bg-current" />
            <span className="absolute bottom-0 left-[5px] h-px w-2 -rotate-45 rounded-full bg-current" />
          </span>
        )}
      </span>
    </button>
  );
}

export default function BrowserViewportResizeHandles({
  geometry,
  activeDirection,
  onPointerDown,
  onKeyDown,
}: Props): ReactElement {
  const { left, top, width, height } = geometry;
  const right = left + width;
  const bottom = top + height;
  const rail = BROWSER_VIEWPORT_RAIL_SIZE;

  return (
    <>
      <ResizeHandle
        direction="west"
        label="Resize viewport from the left edge"
        kind="vertical"
        cursorClassName="cursor-ew-resize"
        style={{ left: left - rail, top, width: rail, height }}
        active={activeDirection === "west"}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
      />
      <ResizeHandle
        direction="east"
        label="Resize viewport from the right edge"
        kind="vertical"
        cursorClassName="cursor-ew-resize"
        style={{ left: right, top, width: rail, height }}
        active={activeDirection === "east"}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
      />
      <ResizeHandle
        direction="south"
        label="Resize viewport from the bottom edge"
        kind="horizontal"
        cursorClassName="cursor-ns-resize"
        style={{ left, top: bottom, width, height: rail }}
        active={activeDirection === "south"}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
      />
      <ResizeHandle
        direction="southwest"
        label="Resize viewport from the bottom-left corner"
        kind="corner"
        cursorClassName="cursor-nesw-resize"
        style={{ left: left - rail, top: bottom, width: rail, height: rail }}
        active={activeDirection === "southwest"}
        mirrored
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
      />
      <ResizeHandle
        direction="southeast"
        label="Resize viewport from the bottom-right corner"
        kind="corner"
        cursorClassName="cursor-nwse-resize"
        style={{ left: right, top: bottom, width: rail, height: rail }}
        active={activeDirection === "southeast"}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
      />
    </>
  );
}
