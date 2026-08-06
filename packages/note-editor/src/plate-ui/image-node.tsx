"use client";

import { useState } from "react";

import type { TImageElement } from "platejs";
import type { PlateElementProps } from "platejs/react";
import { PlateElement, useSelected } from "platejs/react";

import { cn } from "../lib/cn";

/**
 * Images serialize to plain `![alt](url)`, so the node holds nothing the
 * markdown can't carry. A broken src is shown as a labelled placeholder rather
 * than a browser's default broken-image glyph — notes outlive the assets they
 * reference, and "this used to be an image" is more useful than a torn icon.
 */
export function ImageElement(props: PlateElementProps<TImageElement>) {
  const selected = useSelected();
  const [failed, setFailed] = useState(false);
  const url = props.element.url;
  const alt = (props.element.name as string | undefined) ?? "";

  return (
    <PlateElement {...props}>
      <div contentEditable={false} className="my-1.5">
        {failed || !url ? (
          <div className="flex items-center gap-2 rounded-md border border-dashed border-border px-2.5 py-2 text-ui-sm text-muted-foreground">
            Missing image{alt ? `: ${alt}` : ""}
          </div>
        ) : (
          <img
            src={url}
            alt={alt}
            draggable={false}
            onError={() => setFailed(true)}
            className={cn(
              "max-w-full rounded-md border border-border",
              selected && "ring-2 ring-brand-edge",
            )}
          />
        )}
      </div>
      {props.children}
    </PlateElement>
  );
}
