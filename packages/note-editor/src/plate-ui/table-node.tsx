"use client";

import type { PlateElementProps } from "platejs/react";
import { PlateElement } from "platejs/react";
import { TableProvider, useTableElement } from "@platejs/table/react";

import { cn } from "../lib/cn";

// ── Table ─────────────────────────────────────────────────────────────

function TableElementInner(props: PlateElementProps) {
  const { marginLeft, props: tableProps } = useTableElement();

  return (
    <PlateElement
      {...props}
      as="div"
      className="my-4 overflow-x-auto"
      style={{ paddingLeft: 1, marginLeft }}
    >
      <table className="w-full border-collapse border border-[var(--border)]" {...tableProps}>
        <tbody className="min-w-full">{props.children}</tbody>
      </table>
    </PlateElement>
  );
}

export function TableElement(props: PlateElementProps) {
  return (
    <TableProvider>
      <TableElementInner {...props} />
    </TableProvider>
  );
}

// ── Row ───────────────────────────────────────────────────────────────

export function TableRowElement(props: PlateElementProps) {
  return <PlateElement {...props} as="tr" />;
}

// ── Cell ──────────────────────────────────────────────────────────────

export function TableCellElement(props: PlateElementProps) {
  return (
    <PlateElement
      {...props}
      as="td"
      className={cn(
        "relative border border-[var(--border)] p-2.5 align-top text-[13px]",
        "min-w-[48px]",
        "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
      )}
    />
  );
}

// ── Header Cell ───────────────────────────────────────────────────────

export function TableCellHeaderElement(props: PlateElementProps) {
  return (
    <PlateElement
      {...props}
      as="th"
      className={cn(
        "relative border border-[var(--border)] p-2.5 align-top text-[13px] font-semibold",
        "bg-[var(--surface)]",
        "min-w-[48px]",
        "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
      )}
    />
  );
}
