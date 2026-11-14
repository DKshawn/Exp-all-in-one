import { defineConfig, devices } from "@playwright/test";
import { randomUUID } from "node:crypto";

// Give only the loopback server started by this test run its own teacher key.
if (!process.env.E2E_BASE_URL)
  process.env.E2E_LOCAL_TEACHER_KEY ??= randomUUID();

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    actionTimeout: 15_000,
    baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        channel: process.env.E2E_CHANNEL || undefined,
      },
    },
    ...(["firefox", "webkit"] as const).map((browserName) => ({
      name: browserName,
      testMatch: [
        "**/classroom-compat.spec.ts",
        "**/shared-order-book.spec.ts",
      ],
      use: { browserName },
    })),
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // Match normal `npm run dev` startup while visiting the numeric loopback URL.
        command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
        url: "http://127.0.0.1:3100",
        reuseExistingServer: false,
        env: {
          DATABASE_URL: "",
          LOCAL_DATABASE_URL: "",
          LOCAL_ONLY: "1",
          TEACHER_ACCESS_KEY: process.env.E2E_LOCAL_TEACHER_KEY!,
          PGLITE_DATA_DIR: ".data/e2e",
        },
      },
});
