import { test, expect } from "@/e2e/fixtures";

const scenarios = [
  {
    name: "invalid local names skip new groups but still sort",
    choice: "rank",
    confidence: 1,
    create: "yes",
    allow: true,
    namingFailure: true,
    expected: ["Pinned", "A1", "A2", "Add", "Solo", "B1", "B2", "C1", "C2", "D1", "D2"],
  },
  ...["settings", "undo", "lock"].map((guard) => ({
    name: "rejects conflicting " + guard,
    choice: "rank",
    confidence: 1,
    create: "yes",
    allow: true,
    expected: ["Pinned", "A1", "A2", "Add", "Solo", "B1", "B2", "C1", "C2", "D1", "D2"],
    guard,
  })),
  ...["recover", "pending"].map((failure) => ({
    name: "restores after movement failure: " + failure,
    choice: "rank",
    confidence: 1,
    create: "yes",
    allow: true,
    expected: [] as string[],
    failure,
  })),
  {
    name: "ascending with existing-group assignment and two new groups",
    choice: "rank",
    confidence: 1,
    create: "yes",
    allow: true,
    expected: ["Pinned", "A1", "A2", "Add", "Solo", "B1", "B2", "C1", "C2", "D1", "D2"],
  },
  {
    name: "descending with existing and new groups",
    choice: "reverse",
    confidence: 1,
    create: "yes",
    allow: true,
    expected: ["Pinned", "D2", "D1", "C2", "C1", "B2", "B1", "Solo", "Add", "A2", "A1"],
  },
  {
    name: "ties keep original order inside and between blocks",
    choice: "tie",
    confidence: 1,
    create: "no",
    allow: true,
    expected: ["Pinned", "B2", "B1", "Solo", "A2", "A1", "Add", "C2", "C1", "D2", "D1"],
  },
  {
    name: "low-confidence comparisons keep original order",
    choice: "reverse",
    confidence: 0.49,
    create: "no",
    allow: true,
    expected: ["Pinned", "B2", "B1", "Solo", "A2", "A1", "Add", "C2", "C1", "D2", "D1"],
  },
  {
    name: "settings prohibit creation despite Jev yes",
    choice: "rank",
    confidence: 1,
    create: "yes",
    allow: false,
    expected: ["Pinned", "A1", "A2", "Add", "Solo", "B1", "B2", "C1", "C2", "D1", "D2"],
  },
];
const initial = ["Pinned", "B2", "B1", "Solo", "A2", "A1", "Add", "C2", "C1", "D2", "D1"];
const ranks: Record<string, number> = {
  A1: 1,
  A2: 2,
  Add: 3,
  Solo: 4,
  B1: 5,
  B2: 6,
  C1: 7,
  C2: 8,
  D1: 9,
  D2: 10,
};
const rank = (value: unknown): number => {
  if (Array.isArray(value)) return Math.min(...value.map(rank));
  if (value && typeof value === "object") {
    const item = value as { title?: string; tabs?: unknown[] };
    if (item.tabs) return rank(item.tabs);
    if (item.title && item.title in ranks) return ranks[item.title];
  }
  throw new Error(`Unrecognized comparison label: ${JSON.stringify(value)}`);
};

for (const scenario of scenarios) {
  test(scenario.name, async ({ context, serviceWorker: worker, extensionId }) => {
    await context.route("https://tabs.test/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<title>${new URL(route.request().url()).pathname.slice(1)}</title>`,
      }),
    );
    await context.addInitScript((namingFailure) => {
      Object.defineProperty(window, "LanguageModel", {
        configurable: true,
        value: {
          availability: async () => "available",
          create: async () => ({
            prompt: async (input: string) =>
              namingFailure ? '"   "' : input.includes('"C1"') ? "C" : "D",
            destroy: () => {},
          }),
        },
      });
    }, "namingFailure" in scenario);
    await context.route("https://api.typesafe.ai/**", (route) => {
      const { state, questions } = route.request().postDataJSON();
      const answers = Object.fromEntries(
        Object.entries(
          questions as Record<
            string,
            { type: string; instructions: string; criteria: Record<string, string> | string[] }
          >,
        ).map(([key, q]) => {
          let choice = "self";
          let confidence = 1;
          if (key === "create") choice = scenario.create;
          if (key.startsWith("membership_")) {
            const tab = state.tabs.find((t: { id: string }) => t.id === key.slice(11));
            choice =
              tab.title === "Add"
                ? state.groups.find((g: { title: string }) => g.title === "A").key
                : "none";
          }
          if (key.startsWith("topic_")) {
            const current = state.tabs.find((t: { id: string }) => t.id === key.slice(6));
            const related = state.tabs.find(
              (t: { id: string; title: string }) =>
                t.id in q.criteria && t.title[0] === current.title[0],
            );
            choice = related?.id ?? "self";
          }
          if (key.startsWith("rank_")) {
            const item = key.startsWith("rank_tab_")
              ? state.tabs.find((tab: { id: string }) => tab.id === key.slice(9))
              : state.blocks.find((block: { key: string }) => block.key === key.slice(11));
            choice =
              scenario.choice === "tie"
                ? "keep"
                : String(
                    scenario.choice === "reverse"
                      ? 10 -
                          rank(
                            "tabIds" in item
                              ? item.tabIds.map((id: string) =>
                                  state.tabs.find((tab: { id: string }) => tab.id === id),
                                )
                              : item,
                          )
                      : rank(
                          "tabIds" in item
                            ? item.tabIds.map((id: string) =>
                                state.tabs.find((tab: { id: string }) => tab.id === id),
                              )
                            : item,
                        ) - 1,
                  );
            confidence = scenario.confidence;
          }
          if (q.type === "score") {
            const score = choice === "keep" ? 2 : (Number(choice) * 4) / 9;
            return [
              key,
              {
                type: "score",
                score,
                confidence: confidence,
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
              confidence,
              probabilities: Object.fromEntries(
                Object.keys(q.criteria).map((option) => [option, option === choice ? 1 : 0]),
              ),
            },
          ];
        }),
      );
      return route.fulfill({ json: { answers } });
    });
    for (const name of initial) {
      const page = await context.newPage();
      await page.goto(`https://tabs.test/${name}`);
    }
    const setup = await worker.evaluate(
      async ({ names, allow }) => {
        await chrome.storage.local.set({
          settings: {
            apiKey: "test-key",
            rules: "Arrange by the specified order and grouping",
            allowNewGroups: allow,
          },
        });
        const source = await chrome.tabs.query({ url: "https://tabs.test/*" });
        const ids = names.map(
          (name) => source.find((t) => t.url === `https://tabs.test/${name}`)!.id!,
        );
        const window = await chrome.windows.create({ tabId: ids[0] });
        await chrome.tabs.move(ids.slice(1), { windowId: window!.id!, index: -1 });
        const windowId = window!.id!;
        const tabs = await chrome.tabs.query({ windowId });
        await chrome.tabs.update(tabs[0].id!, { pinned: true });
        const b = await chrome.tabs.group({ tabIds: [tabs[1].id!, tabs[2].id!] });
        const a = await chrome.tabs.group({ tabIds: [tabs[4].id!, tabs[5].id!] });
        await chrome.tabGroups.update(a, { title: "A", color: "blue", collapsed: true });
        await chrome.tabGroups.update(b, { title: "B", color: "red", collapsed: false });
        return { windowId, a, b };
      },
      { names: initial, allow: scenario.allow },
    );
    const snapshot = () =>
      worker.evaluate(async (windowId) => {
        const groups = await chrome.tabGroups.query({ windowId });
        return {
          tabs: (await chrome.tabs.query({ windowId })).map((t) => ({
            title: t.title,
            group: groups.find((g) => g.id === t.groupId)?.title ?? "",
            pinned: t.pinned,
          })),
          groups: groups
            .map(({ id, title, color, collapsed }) => ({ id, title, color, collapsed }))
            .sort((a, b) => a.id - b.id),
        };
      }, setup.windowId);
    await expect.poll(async () => (await snapshot()).tabs.map((t) => t.title)).toEqual(initial);
    const before = await snapshot();
    const popupPromise = context.waitForEvent("page");
    await worker.evaluate(
      async ({ extensionId, windowId }) => {
        await chrome.windows.create({
          url: `chrome-extension://${extensionId}/organize.html?windowId=${windowId}&mode=preview`,
          type: "popup",
        });
      },
      { extensionId, windowId: setup.windowId },
    );
    const popup = await popupPromise;
    await expect(
      popup.getByRole("button", { name: "Apply this layout", exact: true }),
    ).toBeVisible();
    expect(await snapshot()).toEqual(before);
    if ("guard" in scenario && scenario.guard === "settings") {
      await worker.evaluate(async () => {
        const { settings } = await chrome.storage.local.get<{ settings: { rules: string } }>(
          "settings",
        );
        await chrome.storage.local.set({ settings: { ...settings, rules: "Changed rules" } });
      });
      await popup.getByRole("button", { name: "Apply this layout", exact: true }).click();
      await expect(popup.getByRole("alert")).toBeVisible();
      expect(await snapshot()).toEqual(before);
      return;
    }
    if ("guard" in scenario && scenario.guard === "lock") {
      const acquired = await popup.evaluate(
        async (windowId) => chrome.runtime.sendMessage({ type: "lock", windowId }),
        setup.windowId,
      );
      expect(acquired).toEqual({ ok: true });
      const other = await context.newPage();
      await other.goto(
        `chrome-extension://${extensionId}/organize.html?windowId=${setup.windowId}&mode=preview`,
      );
      await expect(other.getByRole("alert")).toBeVisible();
      const denied = await other.evaluate(
        async (windowId) => chrome.runtime.sendMessage({ type: "lock", windowId }),
        setup.windowId,
      );
      expect(denied.ok).toBe(false);
      await popup.evaluate(
        async (windowId) => chrome.runtime.sendMessage({ type: "unlock", windowId }),
        setup.windowId,
      );
      await other.close();
    }
    if ("failure" in scenario) {
      await popup.evaluate((mode) => {
        const move = chrome.tabs.move.bind(chrome.tabs);
        let calls = 0;
        chrome.tabs.move = ((...args: Parameters<typeof move>) => {
          if (mode === "pending" || calls++ === 0)
            return Promise.reject(new Error("Injected move failure"));
          return move(...args);
        }) as typeof chrome.tabs.move;
      }, scenario.failure);
    }
    await popup.getByRole("button", { name: "Apply this layout", exact: true }).click();
    if ("failure" in scenario) {
      await expect(popup.getByRole("alert")).toBeVisible();
      if (scenario.failure === "recover") {
        expect(await snapshot()).toEqual(before);
        expect(
          await worker.evaluate(
            async (id) => (await chrome.storage.session.get(`undo_${id}`))[`undo_${id}`],
            setup.windowId,
          ),
        ).toBeUndefined();
      } else {
        expect(
          await worker.evaluate(
            async (id) =>
              (
                await chrome.storage.session.get<Record<string, { pending: boolean }>>(`undo_${id}`)
              )[`undo_${id}`]?.pending,
            setup.windowId,
          ),
        ).toBe(true);
        await popup.close();
        const recoveryPagePromise = context.waitForEvent("page");
        await worker.evaluate(
          async ({ extensionId, windowId }) => {
            await chrome.windows.create({
              url: `chrome-extension://${extensionId}/organize.html?windowId=${windowId}&mode=undo`,
              type: "popup",
            });
          },
          { extensionId, windowId: setup.windowId },
        );
        const recoveryPage = await recoveryPagePromise;
        await expect(
          recoveryPage.getByRole("heading", { name: "Previous layout restored", exact: true }),
        ).toBeVisible();
        expect(await snapshot()).toEqual(before);
      }
      return;
    }

    await expect(
      popup.getByRole("heading", { name: "Your tabs are organized", exact: true }),
    ).toBeVisible();
    const after = await snapshot();
    const creates = scenario.allow && scenario.create === "yes" && !("namingFailure" in scenario);
    expect(after.tabs).toEqual(
      scenario.expected.map((title) => ({
        title,
        pinned: title === "Pinned",
        group: title.startsWith("A")
          ? "A"
          : title.startsWith("B")
            ? "B"
            : creates && /^[CD]/.test(title)
              ? title[0]
              : "",
      })),
    );
    expect(after.groups.filter((g) => g.id === setup.a || g.id === setup.b)).toEqual(before.groups);
    expect(after.groups.map((g) => g.title).sort()).toEqual(
      creates ? ["A", "B", "C", "D"] : ["A", "B"],
    );
    if ("guard" in scenario && scenario.guard === "undo") {
      await worker.evaluate(async (groupId) => {
        await chrome.tabGroups.update(groupId, { title: "User edit" });
      }, setup.a);
      const edited = await snapshot();
      await popup.getByRole("button", { name: "Undo last organization", exact: true }).click();
      await expect(popup.getByRole("alert")).toBeVisible();
      expect(await snapshot()).toEqual(edited);
      return;
    }
    await popup.getByRole("button", { name: "Undo last organization", exact: true }).click();
    await expect(
      popup.getByRole("heading", { name: "Previous layout restored", exact: true }),
    ).toBeVisible();
    expect(await snapshot()).toEqual(before);
  });
}
