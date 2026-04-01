import type { KnipConfig } from "knip";

const config: KnipConfig = {
  entry: [
    "src/main/index.ts",
    "src/preload/index.ts",
    "src/renderer/main.tsx",
    "electron.vite.config.ts",
    "postcss.config.mjs",
  ],
  project: ["src/**/*.{ts,tsx}", "e2e/**/*.ts"],
  ignoreDependencies: [
    "@tailwindcss/postcss", // used in postcss.config.mjs
    "tailwindcss", // peer dep of @tailwindcss/postcss, used via CSS
    "remark-gfm", // used internally by @platejs/markdown for GFM support
    "remark-stringify", // type dependency for @platejs/markdown plugin inference
    "node:sqlite", // Node built-in imported dynamically in browser-import-service
  ],
  ignoreBinaries: [
    "node-gyp", // used in rebuild-native script, installed via ghostty-electron
  ],
  ignore: [
    "src/renderer/components/ui/**", // UI primitives are a component library with intentional public exports
    "src/renderer/components/plate-ui/**", // Plate UI scaffolded components — library-style exports
    "src/renderer/env.d.ts", // ambient type declarations for CSS modules
    "src/shared/shortcuts.ts", // shortcut registry types are consumed by multiple phases (persistence, menu, bridge, UI)
  ],
};

export default config;
