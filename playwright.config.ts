import { defineConfig, devices } from "@playwright/test";

const localShard = process.env.E2E_SHARD_INDEX;
const outputDir = localShard ? `test-results/sharded/shard-${localShard}` : "test-results";

export default defineConfig({
  outputDir,
  testDir: "./e2e/specs",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: localShard
    ? [["list"], ["blob", { outputDir: `${outputDir}/blob` }]]
    : [
        process.env.CI ? ["junit", { outputFile: "test-results/junit.xml" }] : ["list"],

        ["html", { open: "never", outputFolder: "playwright-report" }],
      ],
  timeout: 60000,
  use: {
    trace: "on-first-retry",
    video: "retain-on-failure",

    screenshot: "only-on-failure",
    actionTimeout: 10000,
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],

        channel: localShard ? "chromium" : undefined,
        headless: !!localShard,
      },
    },
  ],

  webServer: undefined,
});
