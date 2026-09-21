import { test, expect } from "@/e2e/fixtures";

for (const failure of [false, true]) {
  test(`background organization without a popup: ${failure ? "failure" : "success and undo"}`, async ({
    context,
    serviceWorker: worker,
    extensionId,
  }) => {
    await context.route("https://tabs.test/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<title>${new URL(route.request().url()).pathname.slice(1)}</title>`,
      }),
    );
    for (const name of ["B", "A"]) {
      const page = await context.newPage();
      await page.goto(`https://tabs.test/${name}`);
    }
    const options = await context.newPage();
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    const windowId = await worker.evaluate(async (fail) => {
      await chrome.storage.local.set({
        settings: { apiKey: fail ? "" : "test-key", rules: "", allowNewGroups: true },
      });
      // Mock external AI only; planning, tab operations, locks, and badges run in the real worker.
      Object.defineProperty(globalThis, "LanguageModel", {
        configurable: true,
        value: {
          availability: async () => "available",
          create: async () => ({ prompt: async () => "Research", destroy: () => {} }),
        },
      });
      let pauseFirstRequest = true;
      globalThis.fetch = async (_input, init) => {
        if (pauseFirstRequest) {
          pauseFirstRequest = false;
          await new Promise<void>((resolve) => {
            (globalThis as typeof globalThis & { releaseJev: () => void }).releaseJev = resolve;
          });
        }
        const { state, questions } = JSON.parse(init!.body as string);
        const answers = Object.fromEntries(
          Object.entries(
            questions as Record<
              string,
              { type: string; criteria: Record<string, string> | string[] }
            >,
          ).map(([key, question]) => {
            const options = Object.keys(question.criteria);
            const choice = key.startsWith("rank_tab_")
              ? String(
                  state.tabs.length -
                    1 -
                    state.tabs.findIndex((tab: { id: string }) => tab.id === key.slice(9)),
                )
              : key.startsWith("rank_block_")
                ? "0"
                : key === "create"
                  ? "yes"
                  : key.startsWith("membership")
                    ? "none"
                    : key.startsWith("topic")
                      ? options.find((option) => option !== "self")!
                      : options.includes("after")
                        ? "after"
                        : "self";
            if (question.type === "score") {
              const score = Number(choice);
              return [
                key,
                {
                  type: "score",
                  score,
                  confidence: 1,
                  legend: Object.fromEntries(Object.entries(question.criteria)),
                  probabilities: Object.fromEntries(
                    Object.keys(question.criteria).map((level) => [
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
                probabilities: Object.fromEntries(
                  options.map((option) => [option, option === choice ? 1 : 0]),
                ),
              },
            ];
          }),
        );
        return new Response(JSON.stringify({ answers }), { status: 200 });
      };
      return (await chrome.tabs.query({ url: "https://tabs.test/*" }))[0].windowId;
    }, failure);
    const snapshot = () =>
      worker.evaluate(
        async (id) => ({
          tabs: (await chrome.tabs.query({ windowId: id })).map((t) => ({
            id: t.id,
            groupId: t.groupId,
          })),
          groups: await chrome.tabGroups.query({ windowId: id }),
          windows: (await chrome.windows.getAll()).map((w) => w.id),
        }),
        windowId,
      );
    const before = await snapshot();
    const run = (mode: string) =>
      options.evaluate(
        async ({ windowId, mode }) =>
          chrome.runtime.sendMessage({ type: "openOrganizer", windowId, mode }),
        { windowId, mode },
      );
    const badge = () => worker.evaluate(() => chrome.action.getBadgeText({}));
    const pending = run("run");
    if (!failure) {
      await expect
        .poll(() =>
          worker.evaluate(
            async (id) => Boolean((await chrome.storage.session.get(`lock_${id}`))[`lock_${id}`]),
            windowId,
          ),
        )
        .toBe(true);
      await expect.poll(badge).toBe("…");
      // Duplicate commands must not open a window or start a second mutation.
      await run("run");
      expect(await badge()).toBe("!");
      expect(await worker.evaluate(() => chrome.action.getTitle({}))).toContain(
        "Another operation",
      );
      await expect
        .poll(() =>
          worker.evaluate(
            () => typeof (globalThis as typeof globalThis & { releaseJev?: () => void }).releaseJev,
          ),
        )
        .toBe("function");
      await worker.evaluate(() => {
        (globalThis as typeof globalThis & { releaseJev: () => void }).releaseJev();
      });
    }
    await pending;
    const after = await snapshot();
    const operation = await worker.evaluate(
      async (id) =>
        (
          await chrome.storage.session.get<
            Record<string, { status: string; startedAt: number; finishedAt: number }>
          >(`operation_${id}`)
        )[`operation_${id}`],
      windowId,
    );
    expect(operation.status).toBe(failure ? "stopped" : "done");
    expect(operation.finishedAt).toBeGreaterThanOrEqual(operation.startedAt);
    expect(Object.keys(operation).sort()).toEqual(
      (failure
        ? ["mode", "startedAt", "finishedAt", "status", "errorMessage"]
        : ["mode", "startedAt", "finishedAt", "status"]
      ).sort(),
    );
    expect(after.windows).toEqual(before.windows);
    expect(context.pages()).toHaveLength(before.tabs.length);
    if (failure) {
      expect(after).toEqual(before);
      expect(await badge()).toBe("!");
      expect(await worker.evaluate(() => chrome.action.getTitle({}))).toContain("API key");
    } else {
      expect(await badge(), await worker.evaluate(() => chrome.action.getTitle({}))).toBe("✓");
      expect(after.groups).toHaveLength(1);
      expect(after.groups[0].title).toBe("Research");
      const grouped = after.tabs.filter((t) => t.groupId === after.groups[0].id);
      expect(grouped.map((t) => t.id)).toEqual(
        before.tabs
          .filter((t) => t.id !== before.tabs.at(-1)!.id)
          .slice(-2)
          .reverse()
          .map((t) => t.id),
      );
      await expect.poll(badge, { timeout: 5000 }).toBe("");
      expect(
        await worker.evaluate(
          async (id) => (await chrome.storage.session.get(`lock_${id}`))[`lock_${id}`],
          windowId,
        ),
      ).toBeUndefined();
      // Run again on the already-organized window, without undoing the first run.
      await run("run");
      expect(await badge(), await worker.evaluate(() => chrome.action.getTitle({}))).toBe("✓");
      const second = await snapshot();
      expect(second.windows).toEqual(before.windows);
      expect(second.groups).toEqual(after.groups);
      expect(second.tabs.filter((t) => t.groupId === after.groups[0].id).map((t) => t.id)).toEqual(
        grouped.map((t) => t.id).reverse(),
      );
      await expect.poll(badge, { timeout: 5000 }).toBe("");
      await run("undo");
      expect(await badge(), await worker.evaluate(() => chrome.action.getTitle({}))).toBe("✓");
      expect(await snapshot()).toEqual(after);
      await expect.poll(badge, { timeout: 5000 }).toBe("");
    }
  });
}
