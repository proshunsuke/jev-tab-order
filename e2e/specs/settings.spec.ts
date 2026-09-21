import { test, expect } from "@/e2e/fixtures";

test("compact settings fit one screen and preserve editing and disclosures", async ({
  context,
  extensionId,
  serviceWorker,
}, testInfo) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1000, height: 650 });
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(page.getByRole("heading", { name: "Jev Tab Order · Settings" })).toBeVisible();
  const rules = page.getByLabel("Sorting rules", { exact: true });
  await expect(rules).toBeEnabled();
  await expect(rules).toHaveAttribute("placeholder", "Enter sorting rules here");
  const defaultRules = page.locator("details").filter({ hasText: "View default rules" });
  await expect(defaultRules).not.toHaveAttribute("open", "");
  await page.getByLabel("Allow new groups", { exact: true }).check();
  await expect(page.getByText(/Chrome AI is/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath("settings.png"), fullPage: true });
  await page.getByText("View default rules", { exact: true }).click();
  await expect(defaultRules).toHaveAttribute("open", "");
  await expect(defaultRules.getByText(/The URL domains are the same/)).toBeVisible();
  await page.getByText("View default rules", { exact: true }).click();
  await page.getByLabel("Allow new groups", { exact: true }).uncheck();
  await expect(page.getByText(/Chrome AI is/)).toHaveCount(0);
  await page.getByLabel("Jev API key", { exact: true }).fill("test-key");
  await rules.fill("Keep matching domains adjacent.");
  await page.getByRole("button", { name: "Save settings", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Settings saved");
  expect(
    await serviceWorker.evaluate(async () => (await chrome.storage.local.get("settings")).settings),
  ).toEqual({
    apiKey: "test-key",
    rules: "Keep matching domains adjacent.",
    allowNewGroups: false,
  });
  await page.setViewportSize({ width: 360, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
