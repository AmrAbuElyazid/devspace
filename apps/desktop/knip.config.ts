import type { KnipConfig } from "knip";

const config: KnipConfig = {
  entry: ["src/main/index.ts", "src/preload/index.ts", "src/renderer/main.tsx"],
  project: ["src/**/*.{ts,tsx}"],
  ignoreDependencies: [
    "@vitejs/plugin-react", // used in electron.vite.config.ts
    "@tailwindcss/postcss", // used in postcss.config.mjs
    "tailwindcss", // peer dep of @tailwindcss/postcss, used via CSS
  ],
  ignoreBinaries: [
    "node-gyp", // used in rebuild-native script, installed via ghostty-electron
  ],
  ignore: [
    "src/renderer/components/ui/**", // UI primitives are a component library with intentional public exports
    "src/renderer/components/plate-ui/**", // Plate UI scaffolded components — library-style exports
    "src/renderer/components/editor/**", // Plate editor plugins and transforms — scaffolded code
    "src/renderer/env.d.ts", // ambient type declarations for CSS modules
    "src/shared/shortcuts.ts", // shortcut registry types are consumed by multiple phases (persistence, menu, bridge, UI)
  ],
};

export default config;
