import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Next.js provides `server-only` for runtime import guards; Vitest needs a stub.
      "server-only": path.resolve(__dirname, "./src/__tests__/utils/server-only.ts"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/vitest.setup.ts"],
    include: ["src/__tests__/**/*.test.{ts,tsx}"],
    restoreMocks: true,
    clearMocks: true,
    mockReset: true,
  },
})

