import { expect, test } from "vitest";
import {
  cloneRuntimeState,
  createInitialRuntimeState,
  withDerivedSecurityState,
} from "../browser-runtime-state";

test("createInitialRuntimeState marks https urls as secure", () => {
  expect(createInitialRuntimeState("pane-1", "https://example.com")).toMatchObject({
    paneId: "pane-1",
    url: "https://example.com",
    isSecure: true,
    securityLabel: "Secure",
  });
});

test("withDerivedSecurityState clears security label for non-https urls", () => {
  expect(withDerivedSecurityState("http://127.0.0.1:3000")).toEqual({
    isSecure: false,
    securityLabel: null,
  });
});

test("cloneRuntimeState preserves nested find state without sharing the same object", () => {
  const original = createInitialRuntimeState("pane-1", "https://example.com");
  original.find = {
    query: "hello",
    activeMatch: 1,
    totalMatches: 3,
  };

  const cloned = cloneRuntimeState(original);
  expect(cloned).toEqual(original);
  expect(cloned.find).not.toBe(original.find);
});
