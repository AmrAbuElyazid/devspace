/**
 * Vitest global setup — provides minimal browser API stubs so renderer
 * code (e.g. workspace-store) doesn't log warnings during unit tests.
 */

// Stub localStorage — the workspace store reads/writes persisted state here.
// Without this, every test that imports the store logs:
//   "localStorage is not defined"
if (typeof globalThis.localStorage === "undefined") {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    get length() {
      return store.size;
    },
    key: (index: number) => [...store.keys()][index] ?? null,
  };
}

const originalEmitWarning = process.emitWarning.bind(process);
process.emitWarning = ((warning: string | Error, ...args: unknown[]) => {
  const message = typeof warning === "string" ? warning : warning.message;
  if (message.includes("SQLite is an experimental feature")) {
    return;
  }
  return originalEmitWarning(warning as string, ...(args as [string?, string?, string?]));
}) as typeof process.emitWarning;
