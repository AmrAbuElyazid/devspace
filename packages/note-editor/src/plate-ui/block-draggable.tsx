"use client";

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";

import type { Path, TElement } from "platejs";

import { useDndNode, useDropLine } from "@platejs/dnd";
import { MarkdownPlugin } from "@platejs/markdown";
import { useComposedRef } from "@udecode/cn";
import {
  ChevronRightIcon,
  CopyIcon,
  GripVertical,
  PlusIcon,
  Trash2Icon,
  TypeIcon,
} from "lucide-react";
import { KEYS, PathApi } from "platejs";
import { type PlateEditor, useEditorRef, usePluginOption } from "platejs/react";

import { cn } from "../lib/cn";
import { hiddenBlockIndices } from "../heading-fold";
import { headingLevel } from "../note-outline";
import { HeadingFoldPlugin } from "../plugins/heading-fold-kit";
import { setBlockType } from "../transforms";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";
import { turnIntoItems } from "./turn-into-items";

/**
 * Blocks that must not grow a gutter: either they are not independently
 * movable (table parts, code lines, columns) or the gutter would land on top of
 * an open combobox.
 */
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
export function BlockDraggable({ editor, element }: { editor: PlateEditor; element: TElement }) {
  // Inline nodes must not be wrapped: the wrapper is a `div`, so wrapping a
  // link put a line break either side of it mid-sentence.
  if (editor.api.isInline(element) || DRAG_EXCLUDED_KEYS.has(element.type as string)) {
    return null;
  }

  return function DraggableWrapper({ children }: { children: ReactNode }) {
    return <DraggableBlock element={element}>{children}</DraggableBlock>;
  };
}

function DraggableBlock({ children, element }: { children: ReactNode; element: TElement }) {
  const editor = useEditorRef();
  const nodeRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const { isDragging, dragRef } = useDndNode({
    element,
    nodeRef,
    preview: { disable: true },
  });

  const path = editor.api.findPath(element);
  // Only top level blocks get a gutter. A paragraph nested in a table cell or a
  // callout has no room for one — it would render on top of the container's own
  // padding — and dragging it out of its parent is not a meaningful move.
  const isTopLevel = path?.length === 1;
  const index = isTopLevel ? path[0]! : null;
  const hasOpenCombobox = containsInlineElementType(element, KEYS.slashInput);
  const showGutter = isTopLevel && !hasOpenCombobox;

  const folded = usePluginOption(HeadingFoldPlugin, "folded");
  const hidden = useMemo(
    () => hiddenBlockIndices(editor.children, new Set(folded)),
    [editor.children, folded],
  );
  // Hidden rather than unrendered: Slate needs the node in the DOM to keep its
  // paths and selection consistent.
  const isCollapsed = index !== null && hidden.has(index);

  return (
    <div
      ref={nodeRef}
      className={cn(
        "group/block relative min-w-0 rounded-sm transition-opacity duration-100",
        isCollapsed && "hidden",
      )}
      data-block-dragging={isDragging || undefined}
      style={{ opacity: isDragging ? 0.4 : undefined }}
    >
      {showGutter && (
        <div
          className={cn(
            "absolute top-0 right-full z-10 flex h-[1lh] items-center gap-px pr-1",
            // The gutter has to stay clickable while the menu is open, or the
            // dropdown closes the instant the pointer leaves the block.
            "pointer-events-none opacity-0 transition-opacity duration-100",
            "group-hover/block:pointer-events-auto group-hover/block:opacity-100",
            "group-focus-within/block:pointer-events-auto group-focus-within/block:opacity-100",
            // A folded heading keeps its gutter up: the chevron is the only
            // signal that content is hidden below it.
            (menuOpen || (index !== null && folded.includes(index))) &&
              "pointer-events-auto opacity-100",
          )}
          contentEditable={false}
          data-plate-prevent-deselect
        >
          {index !== null && headingLevel(element) !== null && (
            <FoldButton index={index} folded={folded.includes(index)} />
          )}
          <InsertBlockButton element={element} />
          <BlockMenu
            element={element}
            dragRef={dragRef as unknown as React.Ref<HTMLButtonElement>}
            open={menuOpen}
            onOpenChange={setMenuOpen}
          />
        </div>
      )}

      {children}

      <DropLineIndicator />
    </div>
  );
}

const gutterButtonClass = cn(
  "flex size-5 shrink-0 items-center justify-center rounded-md",
  "border border-transparent bg-transparent text-muted-foreground/60",
  "transition-[background-color,border-color,color] duration-100",
  "hover:border-border hover:bg-surface hover:text-foreground",
  "focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-[-1px]",
);

function GutterButton({
  children,
  label,
  shortcut,
  ...props
}: React.ComponentPropsWithRef<"button"> & { label: string; shortcut?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          contentEditable={false}
          tabIndex={-1}
          {...props}
          className={cn(gutterButtonClass, props.className)}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">
        {label}
        {shortcut ? <span className="ml-1.5 text-muted-foreground">{shortcut}</span> : null}
      </TooltipContent>
    </Tooltip>
  );
}

function useBlockPath(element: TElement): () => Path | undefined {
  const editor = useEditorRef();
  return useCallback(() => editor.api.findPath(element), [editor, element]);
}

function FoldButton({ folded, index }: { folded: boolean; index: number }) {
  const editor = useEditorRef();
  const current = usePluginOption(HeadingFoldPlugin, "folded");

  const toggle = useCallback(() => {
    const next = folded ? current.filter((entry) => entry !== index) : [...current, index];
    editor.setOption(HeadingFoldPlugin, "folded", next);
  }, [current, editor, folded, index]);

  return (
    <GutterButton
      label={folded ? "Expand section" : "Collapse section"}
      onClick={toggle}
      // A folded heading keeps its chevron visible; otherwise the only way back
      // is to guess where the hidden content starts.
      className={cn(folded && "text-foreground opacity-100")}
    >
      <ChevronRightIcon
        size={14}
        className={cn("transition-transform duration-100", !folded && "rotate-90")}
      />
    </GutterButton>
  );
}

function InsertBlockButton({ element }: { element: TElement }) {
  const editor = useEditorRef();
  const getPath = useBlockPath(element);

  const insertBelow = useCallback(() => {
    const path = getPath();
    if (!path) return;

    const at = PathApi.next(path);
    editor.tf.insertNodes({ children: [{ text: "" }], type: KEYS.p }, { at, select: true });
    editor.tf.focus();
  }, [editor, getPath]);

  return (
    <GutterButton label="Insert block below" onClick={insertBelow}>
      <PlusIcon size={14} />
    </GutterButton>
  );
}

function BlockMenu({
  dragRef,
  element,
  onOpenChange,
  open,
}: {
  dragRef: React.Ref<HTMLButtonElement>;
  element: TElement;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const editor = useEditorRef();
  const getPath = useBlockPath(element);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const composedRef = useComposedRef<HTMLButtonElement>(triggerRef, dragRef);

  const currentType = typeof element.type === "string" ? element.type : KEYS.p;

  const selectBlock = useCallback(() => {
    const path = getPath();
    if (path) editor.tf.select(path);
  }, [editor, getPath]);

  const duplicate = useCallback(() => {
    const path = getPath();
    if (!path) return;
    editor.tf.insertNodes(structuredClone(element), { at: PathApi.next(path), select: true });
  }, [editor, element, getPath]);

  const copyAsMarkdown = useCallback(() => {
    try {
      const markdown = editor.getApi(MarkdownPlugin).markdown.serialize({ value: [element] });
      void navigator.clipboard?.writeText(markdown);
    } catch (error) {
      console.error("[note-editor] Failed to copy block as markdown:", error);
    }
  }, [editor, element]);

  const remove = useCallback(() => {
    const path = getPath();
    if (!path) return;
    editor.tf.removeNodes({ at: path });
    editor.tf.focus();
  }, [editor, getPath]);

  const turnInto = useCallback(
    (type: string) => {
      selectBlock();
      setBlockType(editor, type);
      editor.tf.focus();
    },
    [editor, selectBlock],
  );

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange} modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              ref={composedRef}
              type="button"
              aria-label="Drag to move, click to open block menu"
              contentEditable={false}
              data-plate-prevent-deselect
              tabIndex={-1}
              className={cn(gutterButtonClass, "cursor-grab active:cursor-grabbing")}
            >
              <GripVertical size={14} />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">
          Drag to move
          <span className="ml-1.5 text-muted-foreground">click for menu</span>
        </TooltipContent>
      </Tooltip>

      <DropdownMenuContent
        align="start"
        side="bottom"
        className="ignore-click-outside/toolbar min-w-[180px]"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          editor.tf.focus();
        }}
      >
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <TypeIcon />
            Turn into
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-[180px]">
            {turnIntoItems.map((item) => (
              <DropdownMenuItem
                key={item.value}
                onSelect={() => turnInto(item.value)}
                data-current={item.value === currentType || undefined}
                className="data-current:bg-row-active"
              >
                {item.icon}
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuItem onSelect={duplicate}>
          <CopyIcon />
          Duplicate
        </DropdownMenuItem>

        <DropdownMenuItem onSelect={copyAsMarkdown}>
          <CopyIcon />
          Copy as markdown
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem variant="destructive" onSelect={remove}>
          <Trash2Icon />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DropLineIndicator() {
  const { dropLine } = useDropLine();

  if (!dropLine) return null;

  return (
    <div
      className={cn(
        "pointer-events-none absolute right-0 left-0 z-10 h-0.5 rounded-full bg-brand",
        dropLine === "top" && "-top-px",
        dropLine === "bottom" && "-bottom-px",
      )}
    />
  );
}

function containsInlineElementType(element: TElement, type: string): boolean {
  if (!Array.isArray(element.children)) {
    return false;
  }

  return element.children.some((child) => {
    return typeof child === "object" && child !== null && "type" in child && child.type === type;
  });
}
