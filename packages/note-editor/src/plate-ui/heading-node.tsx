"use client";

import type { PlateElementProps } from "platejs/react";
import { PlateElement } from "platejs/react";

/**
 * Headings carry no classes of their own — size, weight and the space above
 * them come from the `.note-prose` scale in styles.css, so the whole hierarchy
 * can be read and tuned in one place. The scaffold's `text-4xl` h1 was a page
 * title dropped into a pane.
 */
type HeadingTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

function HeadingElement({ as, ...props }: PlateElementProps & { as: HeadingTag }) {
  return (
    <PlateElement as={as} {...props}>
      {props.children}
    </PlateElement>
  );
}

export function H1Element(props: PlateElementProps) {
  return <HeadingElement as="h1" {...props} />;
}

export function H2Element(props: PlateElementProps) {
  return <HeadingElement as="h2" {...props} />;
}

export function H3Element(props: PlateElementProps) {
  return <HeadingElement as="h3" {...props} />;
}

export function H4Element(props: PlateElementProps) {
  return <HeadingElement as="h4" {...props} />;
}

export function H5Element(props: PlateElementProps) {
  return <HeadingElement as="h5" {...props} />;
}

export function H6Element(props: PlateElementProps) {
  return <HeadingElement as="h6" {...props} />;
}
