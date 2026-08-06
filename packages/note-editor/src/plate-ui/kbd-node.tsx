"use client";

import type { PlateLeafProps } from "platejs/react";
import { PlateLeaf } from "platejs/react";

/**
 * The scaffold drew this with a five-layer shadow of hard-coded `rgb(193,200,205)`
 * values and a dark-mode duplicate, neither of which tracked the theme.
 */
export function KbdLeaf(props: PlateLeafProps) {
  return (
    <PlateLeaf
      {...props}
      as="kbd"
      className="rounded-[4px] border border-border border-b-2 bg-elevated px-[0.4em] py-[0.05em] text-[0.85em] text-foreground"
    >
      {props.children}
    </PlateLeaf>
  );
}
