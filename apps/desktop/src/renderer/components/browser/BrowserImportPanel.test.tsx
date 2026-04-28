import { expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import BrowserImportPanel from "./BrowserImportPanel";

test("BrowserImportPanel renders browser import actions", () => {
  const html = renderToStaticMarkup(<BrowserImportPanel />);

  expect(html).toContain("Import browsing data");
  // The default selected source is shown in the Select trigger.
  expect(html).toContain("chrome");
  expect(html).toContain("Cookies + Session");
  expect(html).toContain("History");
  expect(html).toContain("Everything");
});

test("BrowserImportPanel renders clear browsing data section", () => {
  const html = renderToStaticMarkup(<BrowserImportPanel />);

  expect(html).toContain("Clear browsing data");
  expect(html).toContain("Clear cookies");
  expect(html).toContain("Clear history");
  expect(html).toContain("Clear cache");
  expect(html).toContain("Clear everything");
});
