"use client";

import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import { DndPlugin } from "@platejs/dnd";

import { BlockDraggable } from "../plate-ui/block-draggable";

export const DndKit = [
  DndPlugin.configure({
    options: {
      // Off deliberately. The scroller renders an invisible `position: fixed`
      // strip 100px tall across the top and bottom of the *window* at
      // z-index 10000 for the duration of a drag, and any drop inside it is
      // swallowed. Devspace draws panes inside that window, so the strip landed
      // over the tab bar and the first two blocks of every note — dropping onto
      // them did nothing, every time. It is also the wrong geometry for a pane:
      // it scrolls relative to the viewport, not the pane's own scroll box.
      enableScroller: false,
    },
    render: {
      aboveNodes: BlockDraggable as any,
      aboveSlate: ({ children }) => <DndProvider backend={HTML5Backend}>{children}</DndProvider>,
    },
  }),
];
