import { test, expect } from "vitest";
import { cn } from "./utils";

/**
 * `text-ui-*` is a custom font-size scale. tailwind-merge only knows the
 * built-in one, and anything it doesn't recognise as a size lands in the
 * *colour* group — which silently ate one of the two classes below and left
 * the app's tooltips drawing their label in their own background colour.
 */
test("keeps a UI font size and a text colour as separate utilities", () => {
  expect(cn("bg-foreground text-xs text-background", "text-ui-xs")).toBe(
    "bg-foreground text-background text-ui-xs",
  );
  expect(cn("text-ui-lg font-medium text-foreground")).toBe(
    "text-ui-lg font-medium text-foreground",
  );
});

test("still lets one font size override another in either direction", () => {
  expect(cn("text-ui-sm", "text-ui-lg")).toBe("text-ui-lg");
  expect(cn("text-xs", "text-ui-lg")).toBe("text-ui-lg");
  expect(cn("text-ui-lg", "text-xs")).toBe("text-xs");
});

test("still lets one text colour override another", () => {
  expect(cn("text-muted-foreground", "text-brand")).toBe("text-brand");
});
