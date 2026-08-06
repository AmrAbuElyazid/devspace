"use client";

import { useCallback } from "react";

import type { TCalloutElement } from "platejs";
import type { PlateElementProps } from "platejs/react";
import { PlateElement, useEditorRef, useReadOnly } from "platejs/react";

import { cn } from "../lib/cn";
import {
  CALLOUT_ICON_BY_VARIANT,
  CALLOUT_LABEL_BY_VARIANT,
  CALLOUT_VARIANTS,
  calloutIconOf,
  calloutVariantOf,
  type CalloutVariant,
} from "../markdown/callout-rule";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";

/**
 * Callouts are stored as GFM alert blockquotes (`> [!WARNING]`), which have five
 * kinds and no icon slot — so the affordance is a kind picker, not a free emoji
 * field. Anything richer would be dropped silently on the next save.
 */
const VARIANT_CLASS: Record<CalloutVariant, string> = {
  error: "border-destructive/35 bg-destructive/8",
  info: "border-info/35 bg-info/8",
  note: "border-border bg-surface",
  tip: "border-success/35 bg-success/8",
  warning: "border-warning/35 bg-warning/8",
};

const EMOJI_FONT =
  '"Apple Color Emoji", "Segoe UI Emoji", NotoColorEmoji, "Noto Color Emoji", "Segoe UI Symbol"';

export function CalloutElement({
  attributes,
  children,
  className,
  ...props
}: PlateElementProps<TCalloutElement>) {
  const editor = useEditorRef();
  const readOnly = useReadOnly();
  const variant = calloutVariantOf(props.element);

  const setVariant = useCallback(
    (next: CalloutVariant) => {
      const at = editor.api.findPath(props.element);
      if (!at) return;
      editor.tf.setNodes({ icon: CALLOUT_ICON_BY_VARIANT[next], variant: next }, { at });
    },
    [editor, props.element],
  );

  return (
    <PlateElement
      className={cn(
        "my-1.5 flex gap-2 rounded-md border px-2.5 py-2",
        VARIANT_CLASS[variant],
        className,
      )}
      attributes={{ ...attributes, "data-plate-open-context-menu": true }}
      {...props}
    >
      <div contentEditable={false} className="shrink-0 select-none">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild disabled={readOnly}>
            <button
              type="button"
              aria-label={`Callout kind: ${CALLOUT_LABEL_BY_VARIANT[variant]}`}
              className="flex size-5 items-center justify-center rounded text-[13px] leading-none transition-colors hover:bg-row-hover"
              style={{ fontFamily: EMOJI_FONT }}
              contentEditable={false}
            >
              {calloutIconOf(props.element)}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[150px]">
            {CALLOUT_VARIANTS.map((candidate) => (
              <DropdownMenuItem
                key={candidate}
                onSelect={() => setVariant(candidate)}
                data-current={candidate === variant || undefined}
                className="data-current:bg-row-active"
              >
                <span style={{ fontFamily: EMOJI_FONT }}>{CALLOUT_ICON_BY_VARIANT[candidate]}</span>
                {CALLOUT_LABEL_BY_VARIANT[candidate]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="min-w-0 flex-1">{children}</div>
    </PlateElement>
  );
}
