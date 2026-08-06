"use client";

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";

import type { Path, TElement } from "platejs";

import { useDndNode, useDropLine } from "@platejs/dnd";
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
import { serializeNoteMarkdown } from "../markdown/serialize";
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

  const isHeading = index !== null && headingLevel(element) !== null;
  const isFolded = index !== null && folded.includes(index);

  return (
    <div
      ref={nodeRef}
      className={cn(
        "group/block relative min-w-0 rounded-sm transition-opacity duration-100",
        // The wrapper reaches back over the gutter strip rather than leaving it
        // outside its box. Hover is what reveals the gutter, and an element
        // outside the hovered box cannot trigger it — the strip used to be dead
        // space, so the handle appeared and vanished seemingly at random.
        // `GUTTER_WIDTH` must stay within the editor's own left padding.
        "-ml-11 pl-11",
        isCollapsed && "hidden",
      )}
      data-block-dragging={isDragging || undefined}
      style={{ opacity: isDragging ? 0.4 : undefined }}
    >
      {showGutter && (
        <div
          className={cn(
            "absolute top-0 left-0 z-10 flex min-h-[1lh] w-11 items-center justify-end gap-0.5 pr-1.5",
            "opacity-0 transition-opacity duration-100",
            "group-hover/block:opacity-100 group-focus-within/block:opacity-100",
            // A folded heading keeps its gutter up: the chevron is the only
            // signal that content is hidden below it. The open menu keeps it up
            // so the dropdown does not close the moment the pointer moves away.
            (menuOpen || isFolded) && "opacity-100",
          )}
          contentEditable={false}
          data-plate-prevent-deselect
        >
          {isHeading ? (
            <FoldButton index={index} folded={isFolded} />
          ) : (
            <InsertBlockButton element={element} />
          )}
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
  "flex size-6 shrink-0 items-center justify-center rounded-md",
  "border border-transparent bg-transparent text-muted-foreground/60",
  "transition-[background-color,border-color,color] duration-100",
  "hover:border-border hover:bg-surface hover:text-foreground",
  "focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-[-1px]",
  // The icon must never be the event target. A press that lands on the glyph
  // rather than the button starts a drag from the SVG, which the browser is
  // free to treat as an image drag instead of this element's — the difference
  // between hitting a grip dot and the gap beside it.
  "[&_svg]:pointer-events-none",
);

/**
 * No tooltip, deliberately.
 *
 * These controls sit in a 44px strip that only appears on hover, and a tooltip
 * over them is noise on top of noise. It is also a hazard on the drag handle:
 * Radix's tooltip trigger closes on `pointerdown`, and that state update
 * re-renders the button in the window between mousedown and dragstart, which is
 * where react-dnd is attaching its drag source. The `aria-label` still names
 * each control for assistive tech.
 */
function GutterButton({
  children,
  label,
  ...props
}: React.ComponentPropsWithRef<"button"> & { label: string }) {
  return (
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
      const markdown = serializeNoteMarkdown(editor, { value: [element] });
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

  const insertBelow = useCallback(() => {
    const path = getPath();
    if (!path) return;
    const at = PathApi.next(path);
    editor.tf.insertNodes({ children: [{ text: "" }], type: KEYS.p }, { at, select: true });
    editor.tf.focus();
  }, [editor, getPath]);

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange} modal={false}>
      {/* The handle has to do two jobs, and Radix's trigger opens on
          `pointerdown` and calls `preventDefault()` while doing so — which
          cancels the native drag before it starts. So the trigger is a separate,
          inert element that exists only to give the menu something to position
          against, and the handle opens the menu from `click` instead. */}
      <span className="relative">
        <DropdownMenuTrigger asChild>
          <span aria-hidden className="pointer-events-none absolute inset-0 block" />
        </DropdownMenuTrigger>

        <button
          ref={composedRef}
          type="button"
          aria-label="Drag to move, click to open block menu"
          aria-haspopup="menu"
          aria-expanded={open}
          contentEditable={false}
          data-plate-prevent-deselect
          tabIndex={-1}
          onClick={() => onOpenChange(!open)}
          className={cn(gutterButtonClass, "cursor-grab active:cursor-grabbing")}
        >
          <GripVertical size={14} />
        </button>
      </span>

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

        <DropdownMenuItem onSelect={insertBelow}>
          <PlusIcon />
          Insert below
        </DropdownMenuItem>

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
