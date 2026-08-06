"use client";

import { useCallback } from "react";

import type { PlateElementProps } from "platejs/react";
import { PlateElement, useEditorRef, useReadOnly } from "platejs/react";
import { TableProvider, useTableElement } from "@platejs/table/react";
import {
  deleteColumn,
  deleteRow,
  deleteTable,
  insertTableColumn,
  insertTableRow,
} from "@platejs/table";
import { Columns3Icon, PlusIcon, Rows3Icon, Trash2Icon, TrashIcon } from "lucide-react";

import { cn } from "../lib/cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";

/**
 * Borders, padding and the header tint come from `.note-prose table` so the
 * table matches the rest of the prose scale. What lives here is the structural
 * editing the scaffold had no affordance for at all: without these controls the
 * only way to change a table's shape was to retype it.
 */
function TableElementInner(props: PlateElementProps) {
  const { marginLeft, props: tableProps } = useTableElement();

  return (
    <PlateElement
      {...props}
      as="div"
      className="group/table relative my-2 overflow-x-auto"
      style={{ marginLeft, paddingLeft: 1 }}
    >
      <table {...tableProps}>
        <tbody>{props.children}</tbody>
      </table>
      <TableControls />
    </PlateElement>
  );
}

function TableControls() {
  const editor = useEditorRef();
  const readOnly = useReadOnly();

  const run = useCallback(
    (action: () => void) => () => {
      action();
      editor.tf.focus();
    },
    [editor],
  );

  if (readOnly) return null;

  return (
    <div
      className={cn(
        "absolute top-0 right-0 z-10 flex select-none gap-0.5 p-0.5",
        "opacity-0 transition-opacity duration-100",
        "group-hover/table:opacity-100 group-focus-within/table:opacity-100",
      )}
      contentEditable={false}
    >
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Table options"
            className="flex size-5 items-center justify-center rounded-md border border-border bg-surface text-muted-foreground transition-colors hover:bg-row-hover hover:text-foreground"
          >
            <PlusIcon size={13} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[190px]">
          <DropdownMenuItem onSelect={run(() => insertTableRow(editor))}>
            <Rows3Icon />
            Insert row below
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={run(() => insertTableColumn(editor))}>
            <Columns3Icon />
            Insert column right
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem onSelect={run(() => deleteRow(editor))}>
            <Trash2Icon />
            Delete row
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={run(() => deleteColumn(editor))}>
            <Trash2Icon />
            Delete column
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem variant="destructive" onSelect={run(() => deleteTable(editor))}>
            <TrashIcon />
            Delete table
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function TableElement(props: PlateElementProps) {
  return (
    <TableProvider>
      <TableElementInner {...props} />
    </TableProvider>
  );
}

export function TableRowElement(props: PlateElementProps) {
  return <PlateElement {...props} as="tr" />;
}

export function TableCellElement(props: PlateElementProps) {
  return <PlateElement {...props} as="td" className="min-w-[48px]" />;
}

export function TableCellHeaderElement(props: PlateElementProps) {
  return <PlateElement {...props} as="th" className="min-w-[48px]" />;
}
