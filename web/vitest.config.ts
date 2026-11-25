import { defineConfig } from "vitest/config";

export default defineConfig({
  define: { __LOCAL__: false },
  test: { environment: "node", css: false, include: ["test/**/*.test.{ts,tsx}"], testTimeout: 180000 },
});
