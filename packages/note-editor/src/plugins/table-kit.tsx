"use client";

import {
  TableCellHeaderPlugin,
  TableCellPlugin,
  TablePlugin,
  TableRowPlugin,
} from "@platejs/table/react";

import {
  TableElement,
  TableRowElement,
  TableCellElement,
  TableCellHeaderElement,
} from "../plate-ui/table-node";

export const TableKit = [
  TablePlugin.configure({
    render: { node: TableElement },
    options: {
      initialTableWidth: 600,
      disableMerge: false,
      minColumnWidth: 48,
    },
  }),
  TableRowPlugin.withComponent(TableRowElement),
  TableCellPlugin.withComponent(TableCellElement),
  TableCellHeaderPlugin.withComponent(TableCellHeaderElement),
];
