import { expect, test } from "vitest";

import { getBrowserPaneTitle } from "./useBrowserBridge";

test("prefers the page's own title", () => {
  expect(getBrowserPaneTitle("Example Domain", "https://example.com/")).toBe("Example Domain");
});

test("falls back to the host when the page has no title yet", () => {
  expect(getBrowserPaneTitle("", "https://developer.mozilla.org/en-US/")).toBe(
    "developer.mozilla.org",
  );
});

test("drops a leading www so tabs are not all the same width of noise", () => {
  expect(getBrowserPaneTitle("   ", "https://www.google.com/")).toBe("google.com");
});

test("leaves the title alone for a blank pane", () => {
  expect(getBrowserPaneTitle("", "about:blank")).toBeNull();
  expect(getBrowserPaneTitle("about:blank", "about:blank")).toBeNull();
});

test("leaves the title alone when the URL cannot be parsed", () => {
  expect(getBrowserPaneTitle("", "not a url")).toBeNull();
});

test("truncates a long title on a character boundary", () => {
  const long = "A".repeat(200);
  const result = getBrowserPaneTitle(long, "https://example.com/");

  expect(result).toHaveLength(60);
  expect(result?.endsWith("…")).toBe(true);
});

test("keeps a title that is exactly at the limit intact", () => {
  const exact = "B".repeat(60);

  expect(getBrowserPaneTitle(exact, "https://example.com/")).toBe(exact);
});
