"use client";

import type { TLinkElement } from "platejs";
import type { PlateElementProps } from "platejs/react";

import { getLinkAttributes } from "@platejs/link";
import { PlateElement } from "platejs/react";

/**
 * Colour comes from `.note-prose a`. The scaffold used `text-[var(--accent)]`,
 * which in this palette is a near-white surface tint (`oklch(0.95 0.008 95)`) —
 * links were all but invisible in light mode.
 */
export function LinkElement(props: PlateElementProps<TLinkElement>) {
  return (
    <PlateElement
      {...props}
      as="a"
      className="font-medium"
      attributes={{
        ...props.attributes,
        ...getLinkAttributes(props.editor, props.element),
        onMouseOver: (e) => {
          e.stopPropagation();
        },
      }}
    >
      {props.children}
    </PlateElement>
  );
}
