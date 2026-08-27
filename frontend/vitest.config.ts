import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "node:path"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    // e2e/ holds Playwright specs (a separate test runner, own config in
    // playwright.config.ts) — without this, Vitest's default include glob
    // picks up *.spec.ts anywhere and tries to run Playwright's
    // test.describe()/test() calls as Vitest tests, which fails immediately
    // since they're incompatible test APIs.
    exclude: ["**/node_modules/**", "e2e/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
})
