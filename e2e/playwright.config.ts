import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: "http://localhost:3001",
    extraHTTPHeaders: {
      "Content-Type": "application/json",
    },
  },
  webServer: [],
  projects: [
    {
      name: "api",
      testMatch: "**/deploy-test.spec.ts",
    },
  ],
});
