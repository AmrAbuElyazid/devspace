import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, expect, test } from "vitest";
import { loadNativeAddon } from "./native";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function writeAddonModule(source: string): string {
  const dir = mkdtempSync(join(tmpdir(), "ghostty-addon-"));
  tempDirs.push(dir);

  const addonPath = join(dir, "ghostty_bridge.cjs");
  writeFileSync(addonPath, source, "utf8");
  return addonPath;
}

test("loadNativeAddon accepts a bridge with the required methods", () => {
  const addonPath = writeAddonModule(`
    module.exports = {
      init() {},
      shutdown() {},
      createSurface() {},
      destroySurface() {},
      showSurface() {},
      hideSurface() {},
      focusSurface() {},
      resizeSurface() {},
      setVisibleSurfaces() {},
      blurSurfaces() {},
      sendBindingAction() { return true; },
      setReservedShortcuts() {},
      setCallback() {},
    };
  `);

  const addon = loadNativeAddon(addonPath);

  expect(addon.sendBindingAction("surface-1", "end_search")).toBe(true);
});

test("loadNativeAddon throws when required bridge methods are missing", () => {
  const addonPath = writeAddonModule(`
    module.exports = {
      init() {},
      createSurface() {},
    };
  `);

  expect(() => loadNativeAddon(addonPath)).toThrow(/Invalid Ghostty native addon/);
  expect(() => loadNativeAddon(addonPath)).toThrow(/shutdown/);
});
