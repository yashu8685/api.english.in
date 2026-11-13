import { defineConfig } from "vitest/config";
import { TEST_DATABASE_URL } from "./scripts/test-db.ts";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    // The API reads configuration at import time; vitest sets these before a
    // test file is loaded, so the app never falls back to the dev database.
    env: {
      NODE_ENV: "test",
      DATABASE_URL: TEST_DATABASE_URL,
      BETTER_AUTH_SECRET: "test-only-secret-please-do-not-use-in-production",
      BETTER_AUTH_URL: "http://localhost:8787",
      WEB_ORIGIN: "http://localhost:5173",
      // Keep recordings from the test run out of the dev uploads folder.
      AUDIO_STORAGE_DIR: "./.uploads-test",
      AUDIO_STORAGE_ENABLED: "true"
    },
    // Tests share one database and the integration suite creates users.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000
  }
});
