import { describe, expect, it, vi } from "vitest";
import { buildPlan, validatePlan } from "@/src/organize/plan";
import { DEFAULT_SETTINGS, effectiveRules, DEFAULT_RULES } from "@/src/settings/state";
import type { Choice, Judge, Plan, Snapshot } from "@/src/types";
const before: Snapshot = {
  windowId: 1,
  groups: [{ id: 7, title: "Development", color: "blue", collapsed: true }],
  tabs: [
    { id: 1, index: 0, title: "Pinned", url: "https://pinned.test/", pinned: true, groupId: -1 },
    { id: 2, index: 1, title: "Docs", url: "https://docs.test/", pinned: false, groupId: 7 },
    { id: 3, index: 2, title: "Issue", url: "https://issue.test/", pinned: false, groupId: -1 },
    { id: 4, index: 3, title: "Trip A", url: "https://trip.test/a", pinned: false, groupId: -1 },
    { id: 5, index: 4, title: "Trip B", url: "https://trip.test/b", pinned: false, groupId: -1 },
  ],
};
const judge: Judge = async (_state, questions) =>
  Object.fromEntries(
    Object.entries(questions).map(([id, q]) => {
      if (q.type === "score")
        return [
          id,
          {
            type: "score",
            score: 2,
            confidence: 1,
            legend: Object.fromEntries(q.criteria.map((level, i) => [String(i), level])),
            probabilities: { "0": 0, "1": 0, "2": 1, "3": 0, "4": 0 },
          },
        ];
      const choice =
        id === "membership_3"
          ? "group_7"
          : id.startsWith("membership_")
            ? "none"
            : id === "topic_5"
              ? "4"
              : id.startsWith("topic_")
                ? "self"
                : id.startsWith("related_")
                  ? "self"
                  : id === "create"
                    ? "yes"
                    : "keep";
      return [
        id,
        {
          type: "choice",
          choice,
          confidence: 1,
          probabilities: Object.fromEntries(
            Object.keys(q.criteria).map((k) => [k, k === choice ? 1 : 0]),
          ),
        } satisfies Choice,
      ];
    }),
  );
it("keeps an existing group from absorbing adjacency choices for ungrouped tabs", async () => {
  const source: Snapshot = {
    ...before,
    tabs: [
      { ...before.tabs[1], url: "https://trip.test/grouped", index: 0 },
      { ...before.tabs[3], index: 1 },
      { ...before.tabs[3], id: 6, url: "https://other.test/", index: 2 },
      { ...before.tabs[4], index: 3 },
    ],
  };
  const result = await buildPlan(
    source,
    DEFAULT_SETTINGS,
    async (state, questions) => {
      const answers = await judge(state, questions);
      for (const [key, question] of Object.entries(questions)) {
        if (!key.startsWith("topic_") || question.type !== "choice") continue;
        const target = source.tabs.find((tab) => tab.id === Number(key.slice(6)))!;
        // Simulate Jev selecting the earliest matching domain from the offered candidates.
        const match = source.tabs.find(
          (tab) =>
            String(tab.id) in question.criteria &&
            new URL(tab.url).hostname === new URL(target.url).hostname,
        );
        const choice = match ? String(match.id) : "self";
        answers[key] = {
          type: "choice",
          choice,
          confidence: 1,
          probabilities: Object.fromEntries(
            Object.keys(question.criteria).map((id) => [id, id === choice ? 1 : 0]),
          ),
        };
      }
      return answers;
    },
    async () => "Unused",
    () => {},
  );
  expect(result.blocks.map((block) => block.tabIds)).toEqual([[2], [4, 5], [6]]);
});
describe("organization constraints", () => {
  it("labels choices and targets without repeating private URL components", async () => {
    const source: Snapshot = {
      ...before,
      groups: [{ ...before.groups[0], title: 'GitHub "work"' }],
      tabs: before.tabs.map((tab) => ({
        ...tab,
        url:
          tab.id === 4
            ? "https://PRIVATE_USER:PRIVATE_PASSWORD@github.com/repo?PRIVATE_QUERY#PRIVATE_FRAGMENT"
            : tab.id === 5
              ? "https://proshunsuke.github.io/"
              : tab.url,
      })),
    };
    const inspect = vi.fn<Judge>(async (state, questions) => {
      expect(questions.membership_5).toMatchObject({
        instructions: expect.stringContaining("Domain: proshunsuke.github.io"),
        criteria: { none: "Keep ungrouped", group_7: 'Group name: "GitHub \\"work\\""' },
      });
      expect(questions.topic_5).toMatchObject({
        instructions: expect.stringContaining("Domain: proshunsuke.github.io"),
        criteria: {
          self: "No matching candidate",
          "3": "Domain: issue.test",
          "4": "Domain: github.com",
        },
      });
      expect(questions.related_topic_5).toMatchObject({
        criteria: {
          self: "Keep separate",
          group_7: 'Group name: "GitHub \\"work\\""',
          topic_3: "Domain: issue.test",
          topic_4: "Domain: github.com",
        },
      });
      expect(questions.rank_tab_4.instructions).toContain("Domain: github.com");
      expect(questions.rank_block_group_7.instructions).toContain(
        'Group name: "GitHub \\"work\\""',
      );
      expect(JSON.stringify({ state, questions })).not.toContain("PRIVATE_");
      return judge(state, questions);
    });
    const result = await buildPlan(
      source,
      DEFAULT_SETTINGS,
      inspect,
      async () => "Unused",
      () => {},
    );
    expect(inspect).toHaveBeenCalledTimes(1);
    expect(result.blocks.map((block) => block.tabIds)).toEqual([
      [2, 3],
      [4, 5],
    ]);
  });

  it("keeps memberships, adds an ungrouped tab, creates only related ungrouped tabs", async () => {
    const result = await buildPlan(
      before,
      { ...DEFAULT_SETTINGS, allowNewGroups: true },
      judge,
      async () => "Travel",
      () => {},
    );
    expect(result.blocks).toEqual([
      { key: "group_7", groupId: 7, title: "Development", tabIds: [2, 3] },
      { key: "topic_4", title: "Travel", tabIds: [4, 5], create: true },
    ]);
    expect(result.before).toEqual(before);
  });
  it("enforces creation disabled despite a yes from Jev", async () => {
    const result = await buildPlan(
      before,
      DEFAULT_SETTINGS,
      judge,
      async () => {
        throw new Error("must not call");
      },
      () => {},
    );
    expect(result.blocks[1]).toEqual({ key: "topic_4", title: "", tabIds: [4, 5], create: false });
  });
  it("leaves new clusters ungrouped when local naming fails", async () => {
    const result = await buildPlan(
      before,
      { ...DEFAULT_SETTINGS, allowNewGroups: true },
      judge,
      async () => {
        throw new Error("unavailable");
      },
      () => {},
    );
    expect(result.warnings).toEqual(["namingSkipped"]);
    expect(result.blocks[1].create).toBe(false);
  });
  it("replaces default rules completely", () => {
    expect(effectiveRules({ ...DEFAULT_SETTINGS, rules: "  URLs ascending  " })).toBe(
      "URLs ascending",
    );
    expect(effectiveRules({ ...DEFAULT_SETTINGS, rules: "   " })).toBe(DEFAULT_RULES);
  });
  it("rejects moving an existing group member outside its group", () => {
    const plan: Plan = {
      before,
      settings: DEFAULT_SETTINGS,
      warnings: [],
      blocks: [{ key: "all", title: "", tabIds: [2, 3, 4, 5] }],
    };
    expect(() => validatePlan(plan)).toThrow("invalidPlan");
  });
  it("rejects duplicates or omitted tabs", () => {
    const plan: Plan = {
      before,
      settings: DEFAULT_SETTINGS,
      warnings: [],
      blocks: [{ key: "group", groupId: 7, title: "", tabIds: [2, 3, 4, 4] }],
    };
    expect(() => validatePlan(plan)).toThrow("invalidPlan");
  });
});

it("places related groups adjacent without changing their memberships", async () => {
  const source: Snapshot = {
    windowId: 1,
    groups: [7, 8, 9].map((id) => ({ id, title: String(id), color: "blue", collapsed: false })),
    tabs: [7, 8, 9].map((id, index) => ({
      id,
      groupId: id,
      index,
      pinned: false,
      title: String(id),
      url: `https://example.test/${id}`,
    })),
  };
  const match: Judge = async (state, questions) => {
    const answers = await judge(state, questions);
    if (questions.related_group_9)
      answers.related_group_9 = {
        type: "choice",
        choice: "group_7",
        confidence: 1,
        probabilities: { self: 0, group_7: 1, group_8: 0 },
      };
    return answers;
  };
  const result = await buildPlan(
    source,
    DEFAULT_SETTINGS,
    match,
    async () => "Unused",
    () => {},
  );
  expect(result.blocks.map((block) => ({ group: block.groupId, tabs: block.tabIds }))).toEqual([
    { group: 7, tabs: [7] },
    { group: 9, tabs: [9] },
    { group: 8, tabs: [8] },
  ]);
});

it.each([
  ["no", 1, 1, false],
  ["yes", 0.29, 1, false],
  ["yes", 1, 0.49, false],
  ["yes", 0.3, 0.5, true],
] as const)(
  "gates creation on Jev %s, confidence %s, probability %s",
  async (choice, confidence, probability, creates) => {
    let names = 0;
    const result = await buildPlan(
      before,
      { ...DEFAULT_SETTINGS, allowNewGroups: true },
      async (state, questions) => {
        const answers = await judge(state, questions);
        if (questions.create)
          answers.create = {
            type: "choice",
            choice,
            confidence,
            probabilities: {
              yes: choice === "yes" ? probability : 1 - probability,
              no: choice === "no" ? probability : 1 - probability,
            },
          };
        return answers;
      },
      async () => {
        names++;
        return "Travel";
      },
      () => {},
    );
    expect(result.blocks).toEqual([
      { key: "group_7", groupId: 7, title: "Development", tabIds: [2, 3] },
      { key: "topic_4", title: creates ? "Travel" : "", tabIds: [4, 5], create: creates },
    ]);
    expect(names).toBe(creates ? 1 : 0);
  },
);

it.each(["none", "uncertainMembership", "uncertainTopic", "self"])(
  "preserves separate tabs for %s decisions",
  async (mode) => {
    const result = await buildPlan(
      before,
      DEFAULT_SETTINGS,
      async (state, questions) => {
        const answers = await judge(state, questions);
        if (questions.membership_3 && (mode === "none" || mode === "uncertainMembership")) {
          answers.membership_3 = {
            type: "choice",
            choice: mode === "none" ? "none" : "group_7",
            confidence: mode === "none" ? 1 : 0.1,
            probabilities: { none: mode === "none" ? 1 : 0, group_7: mode === "none" ? 0 : 1 },
          };
        }
        if (questions.topic_5 && (mode === "self" || mode === "uncertainTopic")) {
          answers.topic_5 = {
            type: "choice",
            choice: mode === "self" ? "self" : "4",
            confidence: mode === "self" ? 1 : 0.1,
            probabilities: { self: mode === "self" ? 1 : 0, "4": mode === "self" ? 0 : 1 },
          };
        }
        return answers;
      },
      async () => {
        throw Error("unexpected naming");
      },
      () => {},
    );
    expect(result.blocks.map((b) => b.tabIds)).toEqual(
      mode === "none" || mode === "uncertainMembership" ? [[2], [3], [4, 5]] : [[2, 3], [4], [5]],
    );
  },
);

it("keeps pinned and non-web metadata out of judge requests and never groups non-web tabs", async () => {
  const source = structuredClone(before);
  source.tabs.push({
    id: 6,
    index: 5,
    pinned: false,
    groupId: -1,
    title: "PRIVATE_INTERNAL",
    url: "chrome://settings/private",
  });
  const states: unknown[] = [];
  const result = await buildPlan(
    source,
    DEFAULT_SETTINGS,
    async (state, questions) => {
      states.push({ state, questions });
      expect(questions).not.toHaveProperty("membership_1");
      expect(questions).not.toHaveProperty("membership_6");
      expect(questions).not.toHaveProperty("topic_6");
      return judge(state, questions);
    },
    async () => "Unused",
    () => {},
  );
  expect(result.blocks.map((b) => b.tabIds)).toEqual([[2, 3], [4, 5], [6]]);
  expect(JSON.stringify(states)).not.toMatch(/pinned\.test|PRIVATE_INTERNAL|settings\/private/);
});

it("passes only custom rules through every planning stage", async () => {
  const rules = "Only reverse alphabetical order; never create groups";
  const result = await buildPlan(
    before,
    { ...DEFAULT_SETTINGS, rules },
    async (state, questions) => {
      expect(state).toHaveProperty("rules", rules);
      return judge(state, questions);
    },
    async () => "Unused",
    () => {},
  );
  expect(result.settings.rules).toBe(rules);
});

it("handles an empty window and rejects more than 200 movable tabs", async () => {
  const empty = { windowId: 1, tabs: [], groups: [] };
  expect(
    await buildPlan(
      empty,
      DEFAULT_SETTINGS,
      judge,
      async () => "Unused",
      () => {},
    ),
  ).toEqual({ before: empty, settings: DEFAULT_SETTINGS, blocks: [], warnings: [] });
  const tabs = Array.from({ length: 201 }, (_, i) => ({ ...before.tabs[2], id: i, index: i }));
  await expect(
    buildPlan(
      { ...empty, tabs },
      DEFAULT_SETTINGS,
      judge,
      async () => "Unused",
      () => {},
    ),
  ).rejects.toThrow("tooManyTabs");
});

it.each([
  ["empty block", [{ key: "empty", title: "", tabIds: [] }]],
  ["missing tab", [{ key: "group", title: "Development", groupId: 7, tabIds: [2, 3, 4] }]],
  ["unknown group", [{ key: "group", title: "Development", groupId: 99, tabIds: [2, 3, 4, 5] }]],
  [
    "pinned tab included",
    [{ key: "group", title: "Development", groupId: 7, tabIds: [1, 2, 3, 4, 5] }],
  ],
  [
    "duplicate group",
    [
      { key: "a", title: "", groupId: 7, tabIds: [2] },
      { key: "b", title: "", groupId: 7, tabIds: [3, 4, 5] },
    ],
  ],
  [
    "existing group recreated",
    [{ key: "a", title: "", groupId: 7, create: true, tabIds: [2, 3, 4, 5] }],
  ],
] as const)("rejects invalid plans: %s", (_name, blocks) => {
  const plan = {
    before,
    settings: DEFAULT_SETTINGS,
    warnings: [],
    blocks: structuredClone(blocks),
  } as unknown as Plan;
  expect(() => validatePlan(plan)).toThrow("invalidPlan");
});

it.each([
  ["blank name", " ", [3, 4, 5]],
  ["long name", "x".repeat(61), [3, 4, 5]],
  ["single member", "Travel", [3]],
] as const)("rejects new group with %s", (_name, title, ids) => {
  const plan: Plan = {
    before,
    settings: { ...DEFAULT_SETTINGS, allowNewGroups: true },
    warnings: [],
    blocks: [
      { key: "existing", groupId: 7, title: "Development", tabIds: [2] },
      { key: "new", create: true, title, tabIds: [...ids] },
      ...[3, 4, 5]
        .filter((id) => !(ids as readonly number[]).includes(id))
        .map((id) => ({ key: String(id), title: "", tabIds: [id] })),
    ],
  };
  expect(() => validatePlan(plan)).toThrow("invalidPlan");
});

it.each(["chain", "self", "uncertain"])(
  "handles related-group %s decisions without merging memberships",
  async (mode) => {
    const source: Snapshot = {
      windowId: 1,
      groups: [7, 8, 9, 10].map((id) => ({
        id,
        title: String(id),
        color: "blue",
        collapsed: true,
      })),
      tabs: [7, 8, 9, 10].map((id, index) => ({
        id,
        index,
        groupId: id,
        pinned: false,
        title: String(id),
        url: `https://example.test/${id}`,
      })),
    };
    const result = await buildPlan(
      source,
      DEFAULT_SETTINGS,
      async (state, questions) => {
        const answers = await judge(state, questions);
        for (const [key, parent] of [
          ["related_group_9", "group_7"],
          ["related_group_10", "group_9"],
        ]) {
          if (questions[key]) {
            const choice = mode === "self" ? "self" : parent;
            answers[key] = {
              type: "choice",
              choice,
              confidence: mode === "uncertain" ? 0.29 : 1,
              probabilities: Object.fromEntries(
                Object.keys(questions[key].criteria).map((key) => [key, key === choice ? 1 : 0]),
              ),
            };
          }
        }
        return answers;
      },
      async () => "Unused",
      () => {},
    );
    expect(result.blocks).toEqual(
      (mode === "chain" ? [7, 9, 10, 8] : [7, 8, 9, 10]).map((id) => ({
        key: `group_${id}`,
        groupId: id,
        title: String(id),
        tabIds: [id],
      })),
    );
  },
);

it.each([50, 100, 200])(
  "plans %s tabs with one HTTP request including memberships and grouping",
  async (count) => {
    const { createJudge } = await import("@/src/ai/jev");
    const source: Snapshot = {
      windowId: 1,
      groups: [{ id: 7, title: "Docs", color: "blue", collapsed: false }],
      tabs: Array.from({ length: count }, (_, index) => ({
        id: index + 10,
        index,
        groupId: index < 2 ? 7 : -1,
        pinned: false,
        title: `Tab ${index}`,
        url: `https://example.test/${index}`,
      })),
    };
    const fetch = vi.fn(async (_url, init: RequestInit) => {
      const { questions } = JSON.parse(String(init.body));
      return Response.json({
        answers: Object.fromEntries(
          Object.entries(
            questions as Record<
              string,
              { type: string; criteria: Record<string, string> | string[] }
            >,
          ).map(([id, q]) => {
            if (q.type === "score")
              return [
                id,
                {
                  type: "score",
                  score: 0,
                  confidence: 1,
                  legend: Object.fromEntries(Object.entries(q.criteria)),
                  probabilities: { "0": 1, "1": 0, "2": 0, "3": 0, "4": 0 },
                },
              ];
            const choice =
              id === "create"
                ? "yes"
                : id.startsWith("membership_")
                  ? "none"
                  : id.startsWith("rank_")
                    ? "0"
                    : "self";
            return [
              id,
              {
                type: "choice",
                choice,
                confidence: 1,
                probabilities: Object.fromEntries(
                  Object.keys(q.criteria).map((key) => [key, key === choice ? 1 : 0]),
                ),
              },
            ];
          }),
        ),
      });
    });
    vi.stubGlobal("fetch", fetch);
    try {
      const result = await buildPlan(
        source,
        { ...DEFAULT_SETTINGS, allowNewGroups: true },
        createJudge("test-key", new AbortController().signal),
        async () => "Group",
        () => {},
      );
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(result.blocks.flatMap((block) => block.tabIds)).toEqual(
        source.tabs.map((tab) => tab.id),
      );
      expect(result.blocks[0].groupId).toBe(7);
      const payload = JSON.parse(String(fetch.mock.calls[0][1].body));
      expect(payload.state.tabs).toHaveLength(count);
      expect(payload.state.groups[0].tabIds).toEqual(["10", "11"]);
      expect(payload.state.blocks[0].tabIds).toEqual(["10", "11"]);
      expect(JSON.stringify(payload.state).match(/"title":"Tab 0"/g)).toHaveLength(1);
      for (const [key, question] of Object.entries(
        payload.questions as Record<string, { type: string; criteria: unknown[] }>,
      )) {
        if (key.startsWith("rank_")) {
          expect(question.type).toBe("score");
          expect(question.criteria).toHaveLength(5);
        }
      }
      expect(payload.questions).toHaveProperty("rank_tab_10");
      expect(payload.questions).toHaveProperty("rank_block_group_7");
      expect(payload.questions).toHaveProperty("membership_12");
      expect(payload.questions).toHaveProperty("topic_13");
      expect(Object.keys(payload.questions).length).toBeLessThan(count * 5 + 1);
    } finally {
      vi.unstubAllGlobals();
    }
  },
);

it("makes no request for a window with no eligible tabs", async () => {
  const noJudge = vi.fn<Judge>();
  await buildPlan(
    { windowId: 1, groups: [], tabs: [before.tabs[0]] },
    DEFAULT_SETTINGS,
    noJudge,
    async () => "Unused",
    () => {},
  );
  expect(noJudge).not.toHaveBeenCalled();
});

it("ignores topic associations that cross the final group boundary", async () => {
  const result = await buildPlan(
    before,
    DEFAULT_SETTINGS,
    async (state, questions) => {
      const answers = await judge(state, questions);
      answers.topic_4 = {
        type: "choice",
        choice: "2",
        confidence: 1,
        probabilities: { "2": 1, self: 0 },
      };
      return answers;
    },
    async () => "Unused",
    () => {},
  );
  expect(result.blocks.map((block) => block.tabIds)).toEqual([
    [2, 3],
    [4, 5],
  ]);
});

it("accepts moderate-confidence memberships and adjacency from Jev", async () => {
  const result = await buildPlan(
    before,
    DEFAULT_SETTINGS,
    async (state, questions) => {
      const answers = await judge(state, questions);
      answers.membership_3 = {
        type: "choice",
        choice: "group_7",
        confidence: 0.3,
        probabilities: { group_7: 0.65, none: 0.35 },
      };
      answers.topic_5 = {
        type: "choice",
        choice: "4",
        confidence: 0.3,
        probabilities: { "4": 0.65, self: 0.35 },
      };
      return answers;
    },
    async () => "Unused",
    () => {},
  );
  expect(result.blocks.map((block) => block.tabIds)).toEqual([
    [2, 3],
    [4, 5],
  ]);
});
