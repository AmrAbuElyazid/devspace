"use client";

import type { PlateElementProps } from "platejs/react";
import { PlateElement, useFocused, useReadOnly, useSelected } from "platejs/react";

import { cn } from "../lib/cn";

export function HrElement(props: PlateElementProps) {
  const readOnly = useReadOnly();
  const selected = useSelected();
  const focused = useFocused();

  return (
    <PlateElement {...props}>
      <div className="py-2.5" contentEditable={false}>
        <hr
          className={cn(
            "rounded-full",
            selected && focused && "bg-brand",
            !readOnly && "cursor-pointer",
          )}
        />
      </div>
      {props.children}
    </PlateElement>
  );
}
