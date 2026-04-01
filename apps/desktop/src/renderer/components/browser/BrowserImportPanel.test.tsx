import { expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import BrowserImportPanel from "./BrowserImportPanel";

test("BrowserImportPanel renders browser import actions", () => {
  const html = renderToStaticMarkup(<BrowserImportPanel />);

  expect(html).toContain("Import Browsing Data");
  expect(html).toContain("Chrome");
  expect(html).toContain("Arc");
  expect(html).toContain("Safari");
  expect(html).toContain("Zen");
  expect(html).toContain("Cookies + Session");
  expect(html).toContain("History");
  expect(html).toContain("Everything");
});

test("BrowserImportPanel renders clear browsing data section", () => {
  const html = renderToStaticMarkup(<BrowserImportPanel />);

  expect(html).toContain("Clear Browsing Data");
  expect(html).toContain("Clear Cookies");
  expect(html).toContain("Clear History");
  expect(html).toContain("Clear Cache");
  expect(html).toContain("Clear Everything");
});
