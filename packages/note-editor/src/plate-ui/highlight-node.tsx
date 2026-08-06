"use client";

import type { PlateLeafProps } from "platejs/react";
import { PlateLeaf } from "platejs/react";

/**
 * `bg-highlight/30` in the scaffold referenced a `highlight` colour this theme
 * never defined, so highlighted text rendered with no highlight at all.
 */
export function HighlightLeaf(props: PlateLeafProps) {
  return (
    <PlateLeaf {...props} as="mark" className="rounded-[3px] bg-brand-soft px-0.5 text-inherit">
      {props.children}
    </PlateLeaf>
  );
}
