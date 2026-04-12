"use client";

import { type ReactNode, useRef } from "react";

import type { TElement } from "platejs";

import { useDndNode, useDropLine } from "@platejs/dnd";
import { GripVertical } from "lucide-react";
import { KEYS } from "platejs";

import { cn } from "../lib/cn";

const DRAG_EXCLUDED_KEYS = new Set<string>([KEYS.codeLine, KEYS.column, KEYS.td, KEYS.th, KEYS.tr]);

/**
 * aboveNodes render wrapper for DndPlugin.
 *
 * Plate's render pipeline calls this as a HOC factory:
 *   const hoc = aboveNodes(nodeProps)   // returns a wrapper function or null
 *   component = hoc({ children, ...nodeProps })  // wraps the node
 */
export function BlockDraggable({ element }: { element: TElement }) {
  if (DRAG_EXCLUDED_KEYS.has(element.type as string)) {
    return null;
  }

  return function DraggableWrapper({ children }: { children: ReactNode }) {
    return <DraggableBlock element={element}>{children}</DraggableBlock>;
  };
}

function DraggableBlock({ children, element }: { children: ReactNode; element: TElement }) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const { isDragging, dragRef } = useDndNode({ element, nodeRef });

  return (
    <div
      ref={nodeRef}
      className="group/block relative"
      style={{ opacity: isDragging ? 0.5 : undefined }}
    >
      {/* Drag handle — appears on hover */}
      <div
        ref={dragRef as unknown as React.Ref<HTMLDivElement>}
        className={cn(
          "absolute top-0 -left-7 flex h-[1.5em] w-5 cursor-grab items-center justify-center",
          "opacity-0 transition-opacity duration-100",
          "group-hover/block:opacity-100",
          "active:cursor-grabbing",
        )}
        contentEditable={false}
        data-plate-prevent-deselect
      >
        <GripVertical
          size={14}
          className="text-[var(--foreground-faint)] hover:text-[var(--foreground-muted)]"
        />
      </div>

      {children}

      <DropLineIndicator />
    </div>
  );
}

function DropLineIndicator() {
  const { dropLine } = useDropLine();

  if (!dropLine) return null;

  return (
    <div
      className={cn(
        "absolute left-0 right-0 h-0.5 rounded-full",
        "bg-[var(--accent)]",
        dropLine === "top" && "top-0",
        dropLine === "bottom" && "bottom-0",
      )}
    />
  );
}
