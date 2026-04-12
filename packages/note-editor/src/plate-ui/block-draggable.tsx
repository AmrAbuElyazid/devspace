"use client";

import { type ReactNode, useRef } from "react";

import type { TElement, TText } from "platejs";

import { useDndNode, useDropLine } from "@platejs/dnd";
import { GripVertical } from "lucide-react";
import { KEYS } from "platejs";

import { cn } from "../lib/cn";

const DRAG_EXCLUDED_KEYS = new Set<string>([
  KEYS.codeLine,
  KEYS.column,
  KEYS.slashInput,
  KEYS.td,
  KEYS.th,
  KEYS.tr,
]);

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
  const { isDragging, dragRef } = useDndNode({
    element,
    nodeRef,
    preview: { disable: true },
  });
  const showHandle =
    !isEmptyParagraph(element) && !containsInlineElementType(element, KEYS.slashInput);

  return (
    <div
      ref={nodeRef}
      className="group/block relative min-w-0 rounded-sm transition-opacity duration-100"
      style={{ opacity: isDragging ? 0.5 : undefined }}
    >
      {showHandle && (
        <button
          ref={dragRef as unknown as React.Ref<HTMLButtonElement>}
          type="button"
          className={cn(
            "absolute top-1.5 -left-7 z-10 flex h-5 w-5 cursor-grab items-center justify-center rounded-md",
            "pointer-events-none border border-transparent bg-transparent text-[var(--foreground-faint)] opacity-0 shadow-none",
            "transition-[background-color,border-color,color,opacity,box-shadow] duration-120",
            "group-hover/block:pointer-events-auto group-hover/block:opacity-100",
            "group-focus-within/block:pointer-events-auto group-focus-within/block:opacity-100",
            "hover:border-[var(--border)] hover:bg-[var(--surface)] hover:text-[var(--foreground-muted)] hover:shadow-sm",
            "active:cursor-grabbing active:bg-[var(--surface-hover)]",
          )}
          aria-label="Drag block"
          contentEditable={false}
          data-plate-prevent-deselect
          tabIndex={-1}
        >
          <GripVertical size={14} />
        </button>
      )}

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

function isEmptyParagraph(element: TElement): boolean {
  if (element.type !== KEYS.p || !Array.isArray(element.children)) {
    return false;
  }

  return element.children.every((child) => isBlankTextNode(child));
}

function isBlankTextNode(node: unknown): boolean {
  if (typeof node !== "object" || node === null || !("text" in node)) {
    return false;
  }

  return typeof (node as TText).text === "string" && (node as TText).text.trim().length === 0;
}

function containsInlineElementType(element: TElement, type: string): boolean {
  if (!Array.isArray(element.children)) {
    return false;
  }

  return element.children.some((child) => {
    return typeof child === "object" && child !== null && "type" in child && child.type === type;
  });
}
