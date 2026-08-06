"use client";

import { useMemo, useState } from "react";

import type { TEquationElement } from "platejs";
import type { PlateElementProps } from "platejs/react";
import { PlateElement, useEditorRef, useReadOnly, useSelected } from "platejs/react";
import katex from "katex";

import { cn } from "../lib/cn";

/**
 * KaTeX renders to a string, so a bad expression is caught here rather than
 * thrown through React — an unclosed `\frac{` while typing must not blank the
 * note.
 */
function useRenderedTex(tex: string, displayMode: boolean) {
  return useMemo(() => {
    if (!tex.trim()) return null;
    try {
      return {
        html: katex.renderToString(tex, {
          displayMode,
          output: "htmlAndMathml",
          strict: false,
          throwOnError: false,
        }),
        error: null as string | null,
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Invalid expression", html: null };
    }
  }, [displayMode, tex]);
}

function TexEditor({
  onChange,
  value,
  displayMode,
}: {
  displayMode: boolean;
  onChange: (next: string) => void;
  value: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      spellCheck={false}
      rows={displayMode ? 3 : 1}
      placeholder={displayMode ? "\\int_0^1 x^2 \\, dx" : "e^{i\\pi}+1=0"}
      className={cn(
        "w-full resize-none rounded-md border border-border bg-elevated px-2 py-1",
        "font-mono text-ui-sm text-foreground outline-none",
        "placeholder:text-muted-foreground/60",
        "focus:border-brand-edge focus:ring-2 focus:ring-brand-soft",
      )}
    />
  );
}

function EquationBody({
  displayMode,
  element,
}: {
  displayMode: boolean;
  element: TEquationElement;
}) {
  const editor = useEditorRef();
  const readOnly = useReadOnly();
  const selected = useSelected();
  const [editing, setEditing] = useState(false);

  const tex = element.texExpression ?? "";
  const rendered = useRenderedTex(tex, displayMode);

  const setTex = (next: string) => {
    const at = editor.api.findPath(element);
    if (at) editor.tf.setNodes({ texExpression: next }, { at });
  };

  if (!readOnly && (editing || (selected && !tex.trim()))) {
    return (
      <div contentEditable={false} className={displayMode ? "my-1.5" : "inline-block align-middle"}>
        <TexEditor value={tex} onChange={setTex} displayMode={displayMode} />
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="mt-1 rounded-md px-1.5 py-0.5 text-ui-xs text-muted-foreground hover:bg-row-hover hover:text-foreground"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <span
      contentEditable={false}
      role={readOnly ? undefined : "button"}
      tabIndex={readOnly ? undefined : 0}
      onClick={readOnly ? undefined : () => setEditing(true)}
      onKeyDown={
        readOnly
          ? undefined
          : (event) => {
              if (event.key === "Enter") setEditing(true);
            }
      }
      className={cn(
        "rounded-[3px]",
        displayMode ? "my-1.5 block overflow-x-auto py-1 text-center" : "inline-block",
        !readOnly && "cursor-pointer hover:bg-row-hover",
        selected && "bg-brand-soft",
      )}
    >
      {rendered?.html ? (
        <span dangerouslySetInnerHTML={{ __html: rendered.html }} />
      ) : (
        <span className="font-mono text-ui-sm text-muted-foreground">
          {rendered?.error ? `⚠ ${tex}` : tex || "Empty equation"}
        </span>
      )}
    </span>
  );
}

export function EquationElement(props: PlateElementProps<TEquationElement>) {
  return (
    <PlateElement {...props}>
      <EquationBody element={props.element} displayMode />
      {props.children}
    </PlateElement>
  );
}

export function InlineEquationElement(props: PlateElementProps<TEquationElement>) {
  return (
    <PlateElement {...props} as="span">
      <EquationBody element={props.element} displayMode={false} />
      {props.children}
    </PlateElement>
  );
}
