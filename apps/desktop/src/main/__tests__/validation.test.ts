import { test, expect } from "vitest";
import { getSafeExternalUrl } from "../validation";

test("getSafeExternalUrl allows the Safari Full Disk Access settings deep link", () => {
  expect(
    getSafeExternalUrl("x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"),
  ).toBe("x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles");
});

test("getSafeExternalUrl continues rejecting other non-http schemes", () => {
  expect(getSafeExternalUrl("file:///etc/passwd")).toBe(null);
  expect(getSafeExternalUrl("javascript:alert(1)")).toBe(null);
  expect(
    getSafeExternalUrl("x-apple.systempreferences:com.apple.preference.security?Privacy_Camera"),
  ).toBe(null);
});
