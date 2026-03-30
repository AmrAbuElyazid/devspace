import { test, expect } from "vitest";
import { buildSearchUrl, getAddressBarSubmitValue, normalizeBrowserInput } from "../browser-url";

test("adds https for domain-like input", () => {
  expect(normalizeBrowserInput("example.com")).toBe("https://example.com");
});

test("adds http for localhost host:port input", () => {
  expect(normalizeBrowserInput("localhost:3000")).toBe("http://localhost:3000");
});

test("adds http for bare localhost input", () => {
  expect(normalizeBrowserInput("localhost")).toBe("http://localhost");
});

test("maps plain text to Google search", () => {
  expect(normalizeBrowserInput("hello world")).toBe(
    "https://www.google.com/search?q=hello%20world",
  );
});

test("maps dotted plain text with spaces to Google search", () => {
  expect(normalizeBrowserInput("what is node.js")).toBe(
    "https://www.google.com/search?q=what%20is%20node.js",
  );
});

test("trims whitespace-heavy input before normalization", () => {
  expect(normalizeBrowserInput("   example.com   ")).toBe("https://example.com");
});

test("keeps explicit schemes unchanged", () => {
  expect(normalizeBrowserInput("https://example.com/a")).toBe("https://example.com/a");
  expect(normalizeBrowserInput("about:blank")).toBe("about:blank");
  expect(normalizeBrowserInput("mailto:test@example.com")).toBe("mailto:test@example.com");
});

test("buildSearchUrl always creates a web search for url-like text", () => {
  expect(buildSearchUrl("example.com/docs")).toBe(
    "https://www.google.com/search?q=example.com%2Fdocs",
  );
  expect(buildSearchUrl("https://devspace.example")).toBe(
    "https://www.google.com/search?q=https%3A%2F%2Fdevspace.example",
  );
});

test("getAddressBarSubmitValue prefers the live input value over stale state", () => {
  expect(getAddressBarSubmitValue("typed.dev", "https://current.example")).toBe("typed.dev");
  expect(getAddressBarSubmitValue(undefined, "https://current.example")).toBe(
    "https://current.example",
  );
});
