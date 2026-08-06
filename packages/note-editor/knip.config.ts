import type { KnipConfig } from "knip";

const config: KnipConfig = {
  project: ["src/**/*.{ts,tsx}"],
  ignoreDependencies: [
    "remark-stringify", // type dependency for @platejs/markdown plugin inference
  ],
  ignore: [
    "src/plate-ui/**", // Plate UI scaffolded components are internal library-style building blocks
  ],
};

export default config;
