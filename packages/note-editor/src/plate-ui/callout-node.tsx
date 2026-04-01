import * as React from "react";

import { PlateElement } from "platejs/react";

import { cn } from "../lib/cn";

export function CalloutElement({
  attributes,
  children,
  className,
  ...props
}: React.ComponentProps<typeof PlateElement>) {
  return (
    <PlateElement
      className={cn("my-1 flex rounded-sm bg-muted p-4 pl-3", className)}
      style={{
        backgroundColor: props.element.backgroundColor as string | undefined,
      }}
      attributes={{
        ...attributes,
        "data-plate-open-context-menu": true,
      }}
      {...props}
    >
      <div className="flex w-full gap-2 rounded-md">
        <span
          className="size-6 select-none p-1 text-[18px]"
          contentEditable={false}
          style={{
            fontFamily:
              '"Apple Color Emoji", "Segoe UI Emoji", NotoColorEmoji, "Noto Color Emoji", "Segoe UI Symbol", "Android Emoji", EmojiSymbols',
          }}
        >
          {(props.element.icon as string) || "\u{1F4A1}"}
        </span>
        <div className="w-full">{children}</div>
      </div>
    </PlateElement>
  );
}
