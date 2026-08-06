"use client";

import { type PlateElementProps, PlateElement } from "platejs/react";

/**
 * The rule and inset live in `.note-prose`. The scaffold also italicised the
 * whole quote, which at 13px turns a multi-line quote into the least legible
 * block on the page.
 */
export function BlockquoteElement(props: PlateElementProps) {
  return <PlateElement as="blockquote" {...props} />;
}
