import type { KnipConfig } from "knip";

const config: KnipConfig = {
  project: ["src/**/*.ts"],
  ignoreDependencies: [
    "electron", // used via peer dependency and rebuild-native script metadata
    "node-addon-api", // consumed by the native addon build rather than TypeScript source
  ],
};

export default config;
