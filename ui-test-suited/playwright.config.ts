import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: "http://localhost:8080",
    extraHTTPHeaders: {
      "Content-Type": "application/json",
    },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "ui-tests",
      testMatch: "**/*.spec.ts",
    },
  ],
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report" }],
  ],
});

