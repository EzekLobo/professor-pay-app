import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000", trace: "on-first-retry" },
  webServer: { command: "npm run dev -- --hostname 127.0.0.1", url: "http://127.0.0.1:3000", reuseExistingServer: !process.env.CI, timeout: 60_000 },
  projects: [
    { name: "chromium", testIgnore: "**/operation-logs.spec.ts", use: { ...devices["Desktop Chrome"] } },
    // This fixture adds/removes a development route. Run it after other pages
    // to avoid Fast Refresh invalidating their server-rendered HTML mid-test.
    { name: "diagnostic-ui", testMatch: "**/operation-logs.spec.ts", dependencies: ["chromium"], use: { ...devices["Desktop Chrome"] } },
  ],
});
