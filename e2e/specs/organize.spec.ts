import { test, expect } from "@/e2e/fixtures";

test("preview, grouping, ordering, undo and stale-preview protection", async ({
  context,
  serviceWorker: worker,
  extensionId,
}, testInfo) => {
  await context.route("https://tabs.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<title>${new URL(route.request().url()).pathname.slice(1)}</title>`,
    }),
  );
  let requests = 0;
  await context.route("https://api.typesafe.ai/**", (route) => {
    requests++;
    const { state, questions } = route.request().postDataJSON();
    const answers = Object.fromEntries(
      Object.entries(
        questions as Record<string, { type: string; criteria: Record<string, string> | string[] }>,
      ).map(([key, q]) => {
        const options = Object.keys(q.criteria);
        const choice = key.startsWith("rank_")
          ? "0"
          : key === "create"
            ? "yes"
            : key.startsWith("membership")
              ? "none"
              : key.startsWith("topic")
                ? (state.tabs.find(
                    (tab: { id: string; groupId: number }) =>
                      tab.id in q.criteria &&
                      tab.groupId ===
                        state.tabs.find((current: { id: string }) => current.id === key.slice(6))
                          .groupId,
                  )?.id ?? "self")
                : options.includes("after")
                  ? "after"
                  : options[0];
        if (q.type === "score") {
          const score = Number(choice);
          return [
            key,
            {
              type: "score",
              score,
              confidence: 1,
              legend: Object.fromEntries(Object.entries(q.criteria)),
              probabilities: Object.fromEntries(
                Object.keys(q.criteria).map((level) => [
                  level,
                  Math.max(0, 1 - Math.abs(Number(level) - score)),
                ]),
              ),
            },
          ];
        }
        return [
          key,
          {
            type: "choice",
            choice,
            confidence: 1,
            probabilities: Object.fromEntries(options.map((o) => [o, o === choice ? 1 : 0])),
          },
        ];
      }),
    );
    return route.fulfill({ json: { answers } });
  });
  await context.addInitScript(() => {
    Object.defineProperty(window, "LanguageModel", {
      value: {
        availability: async () => "available",
        create: async () => ({ prompt: async () => "Research", destroy: () => {} }),
      },
      configurable: true,
    });
  });
  const base = `chrome-extension://${extensionId}`;
  const pages = await Promise.all(
    ["Pinned", "Docs-A", "Docs-B", "Travel-A", "Travel-B"].map(async (name) => {
      const page = await context.newPage();
      await page.goto(`https://tabs.test/${name}`);
      return page;
    }),
  );
  const windowId = await worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({ url: "https://tabs.test/*" });
    await chrome.tabs.update(tabs[0].id!, { pinned: true });
    const group = await chrome.tabs.group({ tabIds: [tabs[1].id!, tabs[2].id!] });
    await chrome.tabGroups.update(group, {
      title: "Docs",
      color: "blue" as chrome.tabGroups.Color,
    });
    return tabs[0].windowId;
  });
  const options = await context.newPage();
  await options.goto(`${base}/options.html`);
  await options.locator("#apiKey").fill("test-key");
  await options.locator('input[type="checkbox"]').check();
  await options.locator('button[type="submit"]').click();
  await expect(options.getByRole("status")).toBeVisible();
  await options.screenshot({ path: testInfo.outputPath("settings.png"), fullPage: true });
  const snapshot = () =>
    worker.evaluate(
      async (id) => ({
        tabs: (await chrome.tabs.query({ windowId: id })).map((t) => ({
          id: t.id,
          groupId: t.groupId,
          pinned: t.pinned,
        })),
        groups: (await chrome.tabGroups.query({ windowId: id })).map((g) => ({
          id: g.id,
          title: g.title,
          color: g.color,
        })),
      }),
      windowId,
    );
  const before = await snapshot();
  const popupPromise = context.waitForEvent("page");
  await options.getByRole("button", { name: "Preview current window", exact: true }).click();
  const popup = await popupPromise;
  await expect(popup.getByRole("button", { name: "Apply this layout", exact: true })).toBeVisible();
  expect(requests).toBe(1);
  expect(await snapshot()).toEqual(before);
  await popup.screenshot({ path: testInfo.outputPath("preview.png"), fullPage: true });
  await popup.getByRole("button", { name: "Apply this layout", exact: true }).click();
  await expect(
    popup.getByRole("heading", { name: "Your tabs are organized", exact: true }),
  ).toBeVisible();
  const after = await snapshot();
  expect(after.groups).toHaveLength(before.groups.length + 1);
  expect(after.tabs[0]).toEqual(before.tabs[0]);
  for (const tab of before.tabs.filter((t) => t.groupId !== -1))
    expect(after.tabs.find((t) => t.id === tab.id)?.groupId).toBe(tab.groupId);
  await popup.getByRole("button", { name: "Undo last organization", exact: true }).click();
  await expect(
    popup.getByRole("heading", { name: "Previous layout restored", exact: true }),
  ).toBeVisible();
  expect(await snapshot()).toEqual(before);
  await popup.close();
  expect(requests).toBe(1);
  const secondPromise = context.waitForEvent("page");
  await options.getByRole("button", { name: "Preview current window", exact: true }).click();
  const second = await secondPromise;
  await expect(
    second.getByRole("button", { name: "Apply this layout", exact: true }),
  ).toBeVisible();
  await pages[0].evaluate(() => {
    document.title = "Changed while previewing";
  });
  await second.getByRole("button", { name: "Apply this layout", exact: true }).click();
  await expect(second.getByRole("alert")).toBeVisible();
  expect(await snapshot()).toEqual(before);
  await second.close();
  await context.route("https://api.typesafe.ai/**", (route) =>
    route.fulfill({ status: 401, json: { error: "unauthorized" } }),
  );
  const failurePromise = context.waitForEvent("page");
  await options.getByRole("button", { name: "Preview current window", exact: true }).click();
  const failure = await failurePromise;
  await expect(failure.getByRole("alert")).toContainText("API key was rejected");
  expect(await snapshot()).toEqual(before);
});
