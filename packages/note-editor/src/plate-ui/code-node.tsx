"use client";

import type { PlateLeafProps } from "platejs/react";
import { PlateLeaf } from "platejs/react";

export function CodeLeaf(props: PlateLeafProps) {
  return (
    <PlateLeaf
      {...props}
      as="code"
      className="rounded-[4px] border border-border bg-elevated px-[0.35em] py-[0.1em] whitespace-pre-wrap text-foreground"
    >
      {props.children}
    </PlateLeaf>
  );
}
