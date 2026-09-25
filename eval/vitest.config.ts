import { defineConfig } from "vitest/config";

// Separate from the app's test config so `npm test` never runs the eval.
// Run with `npm run eval:optimizer`.
export default defineConfig({
  test: {
    include: ["eval/**/*.eval.ts"],
    environment: "node",
  },
});
