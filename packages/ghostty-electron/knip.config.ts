import type { KnipConfig } from "knip";

const config: KnipConfig = {
  project: ["src/**/*.ts"],
  ignoreDependencies: [
    "electron", // used via peer dependency and rebuild-native script metadata
    "node-gyp", // invoked by scripts/rebuild-native.sh
    "node-addon-api", // consumed by the native addon build rather than TypeScript source
  ],
};

export default config;
