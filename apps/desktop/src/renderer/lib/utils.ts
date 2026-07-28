import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge only knows Tailwind's built-in scales. Our UI type scale
 * (`text-ui-sm`, `text-ui-lg`, …) is a custom `--text-*` theme extension, and
 * an unrecognised `text-*` falls into the *colour* group — so `cn("text-ui-sm",
 * "text-muted-foreground")` looked like two colours and dropped one of them.
 * That is how the tooltip ended up rendering its label in the same colour as
 * its background. Registering the scale puts each class back in its own group.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["ui", "ui-micro", "ui-xs", "ui-sm", "ui-lg", "ui-xl"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
