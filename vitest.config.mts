import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

try {
  process.loadEnvFile(".env.test");
} catch {
}

export default defineConfig({
  resolve: {
    alias: { "@": resolve(import.meta.dirname, "src") },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
      TEST_DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
    },
  },
});
