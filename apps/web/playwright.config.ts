import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    colorScheme: "dark",
    contextOptions: { reducedMotion: "reduce" },
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      testMatch: /dashboard\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:4173",
      },
    },
    {
      name: "mobile-chromium",
      testMatch: /dashboard\.spec\.ts/,
      use: {
        ...devices["Pixel 5"],
        baseURL: "http://127.0.0.1:4173",
      },
    },
    {
      name: "desktop-journey",
      testMatch: /journey\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:4174",
      },
    },
    {
      name: "mobile-journey",
      testMatch: /journey\.spec\.ts/,
      use: {
        ...devices["Pixel 5"],
        baseURL: "http://127.0.0.1:4174",
      },
    },
  ],
  webServer: [
    {
      command: "pnpm exec vite --host 127.0.0.1 --port 4173",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command:
        "VITE_E2E_MOCK=1 VITE_POOL_ADDRESS=0x1111111111111111111111111111111111111111 pnpm exec vite --host 127.0.0.1 --port 4174",
      url: "http://127.0.0.1:4174",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
