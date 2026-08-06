import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
    server: {
      deps: {
        // @platejs/math imports katex's stylesheet. Externalised deps are loaded
        // by Node, which has no idea what a .css file is; inlining lets Vite
        // transform it away.
        inline: [/@platejs\/math/],
      },
    },
  },
});
