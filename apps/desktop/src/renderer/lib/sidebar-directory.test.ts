import { expect, test } from "vitest";
import { formatSidebarDirectory } from "./sidebar-directory";

const LTR = "‎";

test("collapses the home directory to a tilde", () => {
  expect(formatSidebarDirectory("/Users/amr/Development/Code/devspace")).toBe(
    `${LTR}~/Development/Code/devspace`,
  );
  expect(formatSidebarDirectory("/home/amr/src/app")).toBe(`${LTR}~/src/app`);
});

test("leaves paths outside home alone", () => {
  expect(formatSidebarDirectory("/opt/homebrew/bin")).toBe(`${LTR}/opt/homebrew/bin`);
});

test("only collapses a whole path segment", () => {
  expect(formatSidebarDirectory("/Users/amrita/code")).toBe(`${LTR}~/code`);
  // A directory that merely starts with "Users" is not the home root.
  expect(formatSidebarDirectory("/UsersOther/amr")).toBe(`${LTR}/UsersOther/amr`);
});

test("strips trailing slashes", () => {
  expect(formatSidebarDirectory("/Users/amr/code///")).toBe(`${LTR}~/code`);
});

test("prefixes an LTR mark so rtl truncation does not reorder the tilde", () => {
  // Without it the leading "~/" is bidi-neutral and jumps to the end.
  expect(formatSidebarDirectory("/Users/amr/x").startsWith(LTR)).toBe(true);
});
