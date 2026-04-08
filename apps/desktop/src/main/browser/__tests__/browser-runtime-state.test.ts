import { expect, test } from "vitest";
import {
  applyRuntimeStateFindResult,
  applyRuntimeStatePatch,
  clearRuntimeStateFind,
  cloneRuntimeState,
  createInitialRuntimeState,
  markRuntimeStateNavigating,
  setRuntimeStateFindQuery,
  setRuntimeStateZoom,
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

test("runtime state helpers update loading, zoom, and find state", () => {
  const state = createInitialRuntimeState("pane-1", "https://example.com");

  state.failure = {
    kind: "navigation",
    detail: "timed out",
    url: "https://example.com",
  };

  markRuntimeStateNavigating(state);
  setRuntimeStateZoom(state, 1.25);
  setRuntimeStateFindQuery(state, "hello");
  applyRuntimeStateFindResult(state, { query: "hello", activeMatch: 2, totalMatches: 5 });

  expect(state.isLoading).toBe(true);
  expect(state.failure).toBeNull();
  expect(state.currentZoom).toBe(1.25);
  expect(state.find).toEqual({ query: "hello", activeMatch: 2, totalMatches: 5 });

  clearRuntimeStateFind(state);
  expect(state.find).toBeNull();
});

test("applyRuntimeStatePatch derives security state unless the patch overrides it", () => {
  const state = createInitialRuntimeState("pane-1", "https://example.com");

  applyRuntimeStatePatch(state, { url: "http://127.0.0.1:3000" });
  expect(state.isSecure).toBe(false);
  expect(state.securityLabel).toBeNull();

  applyRuntimeStatePatch(state, {
    url: "http://127.0.0.1:3000",
    isSecure: true,
    securityLabel: "Trusted loopback",
  });
  expect(state.isSecure).toBe(true);
  expect(state.securityLabel).toBe("Trusted loopback");
});
