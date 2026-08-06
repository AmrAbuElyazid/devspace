import * as React from "react";
import { CheckIcon } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";

import { cn } from "../lib/cn";

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer size-3.5 shrink-0 rounded-[4px] border border-input transition-colors outline-none",
        "hover:border-brand-edge",
        "focus-visible:ring-2 focus-visible:ring-brand-soft",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=checked]:border-brand data-[state=checked]:bg-brand data-[state=checked]:text-primary-foreground",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
