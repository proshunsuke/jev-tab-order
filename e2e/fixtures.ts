import fs from "node:fs";
import path from "node:path";
import { type BrowserContext, test as base, chromium, type Worker } from "@playwright/test";

export type TestFixtures = {
  context: BrowserContext;
  extensionId: string;
  serviceWorker: Worker;
};

export const test = base.extend<TestFixtures>({
  context: async ({ channel, headless }, use, testInfo) => {
    const userDataDir = fs.mkdtempSync(testInfo.outputPath("chrome-user-data-"));
    const source = path.join(process.cwd(), "dist", "chrome-mv3");
    const extension = path.join(userDataDir, "test-extension");
    const localesDir = path.join(source, "_locales");
    let context: BrowserContext | undefined;
    try {
      // macOS ignores --lang for extensions. Keep English in the test copy only.
      fs.cpSync(source, extension, {
        recursive: true,
        filter: (file) => path.dirname(file) !== localesDir || path.basename(file) === "en",
      });
      context = await chromium.launchPersistentContext(userDataDir, {
        channel,
        headless,
        args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
      });
      await use(context);
    } finally {
      try {
        await context?.close();
      } finally {
        fs.rmSync(userDataDir, { recursive: true, force: true });
      }
    }
  },
  serviceWorker: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    await use(worker);
  },
  extensionId: async ({ serviceWorker }, use) => {
    await use(new URL(serviceWorker.url()).host);
  },
});

export const expect = test.expect;
