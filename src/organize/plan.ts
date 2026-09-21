import { isConfident } from "@/src/ai/jev";
import { effectiveRules } from "@/src/settings/state";
import { describe, isEligible } from "@/src/tabs/snapshot";
import { orderByRank, rankOf } from "@/src/organize/order";
import type { Block, Judge, Plan, Question, Settings, Snapshot, Tab } from "@/src/types";

export const buildPlan = async (
  before: Snapshot,
  settings: Settings,
  judge: Judge,
  name: (titles: string[]) => Promise<string>,
  report: (key: string) => void,
): Promise<Plan> => {
  const tabs = before.tabs.filter((tab) => !tab.pinned);
  if (tabs.length > 200) throw new Error("tooManyTabs");
  const rules = effectiveRules(settings);
  const warnings: string[] = [];
  const byId = new Map(tabs.map((tab) => [tab.id, tab]));
  const groups: Block[] = before.groups
    .map((group) => ({
      key: `group_${group.id}`,
      groupId: group.id,
      title: group.title,
      tabIds: tabs.filter((tab) => tab.groupId === group.id).map((tab) => tab.id),
    }))
    .filter((group) => group.tabIds.length);
  const available = tabs.filter((tab) => tab.groupId === -1);
  const candidates = tabs.filter(isEligible);
  const originals: Block[] = [
    ...groups,
    ...available.map((tab) => ({ key: `topic_${tab.id}`, title: "", tabIds: [tab.id] })),
  ].sort((a, b) => byId.get(a.tabIds[0])!.index - byId.get(b.tabIds[0])!.index);
  const tabLabels = new Map(candidates.map((tab) => [tab.id, domainLabel(tab)]));
  const blockLabels = new Map(
    originals.map((block) => [
      block.key,
      block.groupId !== undefined
        ? `Group name: ${JSON.stringify(block.title)}`
        : tabLabels.get(block.tabIds[0])!,
    ]),
  );
  const state = {
    rules,
    tabs: candidates.map((tab) => ({ ...describe(tab), groupId: tab.groupId })),
    groups: groups.map((group) => ({
      key: group.key,
      title: group.title,
      tabIds: group.tabIds.map(String),
    })),
    blocks: originals.map((block) => ({
      key: block.key,
      title: block.title,
      tabIds: block.tabIds.map(String),
    })),
  };
  const questions: Record<string, Question> = {};
  const ranks = [
    "Earliest priority under the rules",
    "Early priority under the rules",
    "Middle priority or no distinguished order under the rules",
    "Late priority under the rules",
    "Latest priority under the rules",
  ];
  if (candidates.length) {
    if (settings.allowNewGroups)
      questions.create = {
        type: "choice",
        instructions: "According to state.rules, should new groups be created for ungrouped tabs?",
        criteria: { yes: "Rules permit new groups", no: "Do not create groups" },
      };
    for (const [index, tab] of candidates.entries()) {
      if (tab.groupId === -1 && groups.length)
        questions[`membership_${tab.id}`] = {
          type: "choice",
          instructions: `According to state.rules, select an existing group for ungrouped tab ${tab.id} (${tabLabels.get(tab.id)}), or none.`,
          criteria: {
            none: "Keep ungrouped",
            ...Object.fromEntries(groups.map((group) => [group.key, blockLabels.get(group.key)!])),
          },
        };
      const preceding = candidates.slice(0, index).filter((other) => other.groupId === tab.groupId);
      if (preceding.length)
        questions[`topic_${tab.id}`] = {
          type: "choice",
          instructions: `According to state.rules, select the earliest candidate tab to place adjacent to tab ${tab.id} (${tabLabels.get(tab.id)}), or self.`,
          criteria: {
            self: "No matching candidate",
            ...Object.fromEntries(
              preceding.map((other) => [String(other.id), tabLabels.get(other.id)!]),
            ),
          },
        };
      questions[`rank_tab_${tab.id}`] = {
        type: "score",
        instructions: `Rate the position of tab ${tab.id} (${tabLabels.get(tab.id)}) within its group according to state.rules; earlier is lower. Use the middle level if no order is specified.`,
        criteria: ranks,
      };
    }
    for (const [index, block] of originals.entries()) {
      if (!block.tabIds.some((id) => isEligible(byId.get(id)!))) continue;
      questions[`rank_block_${block.key}`] = {
        type: "score",
        instructions: `Rate the position of block ${block.key} (${blockLabels.get(block.key)}) among state.blocks according to state.rules; earlier is lower. Use the middle level if no order is specified.`,
        criteria: ranks,
      };
      const preceding = originals
        .slice(0, index)
        .filter((other) => other.tabIds.some((id) => isEligible(byId.get(id)!)));
      if (preceding.length)
        questions[`related_${block.key}`] = {
          type: "choice",
          instructions: `According to state.rules, select the earliest candidate block to place adjacent to block ${block.key} (${blockLabels.get(block.key)}), or self.`,
          criteria: {
            self: "Keep separate",
            ...Object.fromEntries(
              preceding.map((other) => [other.key, blockLabels.get(other.key)!]),
            ),
          },
        };
    }
  }
  report("classifying");
  // All semantic questions are prepared before the only Jev call.
  const answers = Object.keys(questions).length ? await judge(state, questions) : {};
  const remaining: Tab[] = [];
  for (const tab of available) {
    const answer = answers[`membership_${tab.id}`];
    const group =
      answer && isConfident(answer) && groups.find((group) => group.key === answer.choice);
    if (group) group.tabIds.push(tab.id);
    else remaining.push(tab);
  }
  report("sorting");
  const containers = [...groups.map((group) => group.tabIds.map((id) => byId.get(id)!)), remaining];
  const clusters = containers.map((container) => {
    const roots = new Map<number, number>();
    const buckets = new Map<number, Tab[]>();
    // Membership decisions may put an earlier ungrouped tab into a later group.
    for (const tab of [...container].sort((a, b) => a.index - b.index)) {
      const answer = answers[`topic_${tab.id}`];
      const parent = answer && isConfident(answer) ? Number(answer.choice) : tab.id;
      // Ignore associations across final containers; never move an existing member.
      const root = roots.get(parent) ?? tab.id;
      roots.set(tab.id, root);
      buckets.set(root, [...(buckets.get(root) ?? []), tab]);
    }
    const ranked = [...buckets.values()].map((cluster) =>
      orderByRank(cluster, (tab) => rankOf(answers[`rank_tab_${tab.id}`])),
    );
    return orderByRank(ranked, (cluster) =>
      minimumRank(cluster.map((tab) => rankOf(answers[`rank_tab_${tab.id}`]))),
    );
  });
  groups.forEach((group, index) => {
    group.tabIds = clusters[index].flatMap((cluster) => cluster.map((tab) => tab.id));
  });
  const allowCreate =
    settings.allowNewGroups &&
    answers.create &&
    isConfident(answers.create) &&
    answers.create.choice === "yes";
  const ungrouped: Block[] = [];
  for (const cluster of clusters[groups.length]) {
    const tabIds = cluster.map((tab) => tab.id);
    let title = "";
    if (allowCreate && tabIds.length >= 2 && cluster.every(isEligible)) {
      report("naming");
      try {
        title = await name(cluster.map((tab) => tab.title));
      } catch {
        if (!warnings.includes("namingSkipped")) warnings.push("namingSkipped");
      }
    }
    const first = [...cluster].sort((a, b) => a.index - b.index)[0];
    ungrouped.push({ key: `topic_${first.id}`, title, tabIds, create: !!title });
  }
  report("sortingGroups");
  const blocks = [...groups, ...ungrouped].sort(
    (a, b) =>
      Math.min(...a.tabIds.map((id) => byId.get(id)!.index)) -
      Math.min(...b.tabIds.map((id) => byId.get(id)!.index)),
  );
  const aliases = new Map<string, string>();
  for (const block of blocks) {
    aliases.set(block.key, block.key);
    for (const id of block.tabIds) aliases.set(`topic_${id}`, block.key);
  }
  const roots = new Map<string, string>();
  const buckets = new Map<string, Block[]>();
  for (const block of blocks) {
    const answer = answers[`related_${block.key}`];
    const parent = answer && isConfident(answer) ? aliases.get(answer.choice) : undefined;
    const root = parent ? (roots.get(parent) ?? block.key) : block.key;
    roots.set(block.key, root);
    buckets.set(root, [...(buckets.get(root) ?? []), block]);
  }
  const blockRank = (block: Block) =>
    block.groupId !== undefined
      ? rankOf(answers[`rank_block_${block.key}`])
      : minimumRank(block.tabIds.map((id) => rankOf(answers[`rank_block_topic_${id}`])));
  const orderedBuckets = [...buckets.values()].map((bucket) => orderByRank(bucket, blockRank));
  const blocksInOrder = orderByRank(orderedBuckets, (bucket) =>
    minimumRank(bucket.map(blockRank)),
  ).flat();
  const plan = { before, blocks: blocksInOrder, warnings, settings };
  validatePlan(plan);
  return plan;
};

const domainLabel = (tab: Tab) => {
  try {
    return `Domain: ${new URL(tab.url).hostname}`;
  } catch {
    return "Domain unavailable";
  }
};

const minimumRank = (values: (number | undefined)[]) => {
  const known = values.filter((value): value is number => value !== undefined);
  return known.length ? Math.min(...known) : undefined;
};

export const validatePlan = (plan: Plan) => {
  const expected = plan.before.tabs.filter((t) => !t.pinned);
  const actual = plan.blocks.flatMap((b) => b.tabIds);
  if (
    actual.length !== expected.length ||
    new Set(actual).size !== actual.length ||
    expected.some((t) => !actual.includes(t.id))
  )
    throw new Error("invalidPlan");
  const groups = new Set<number>();
  for (const block of plan.blocks) {
    if (!block.tabIds.length) throw new Error("invalidPlan");
    if (block.groupId !== undefined) {
      if (
        groups.has(block.groupId) ||
        !plan.before.groups.some((g) => g.id === block.groupId) ||
        block.create
      )
        throw new Error("invalidPlan");
      groups.add(block.groupId);
    }
    if (
      block.create &&
      (!plan.settings.allowNewGroups ||
        !block.title.trim() ||
        block.title.length > 60 ||
        block.tabIds.length < 2)
    )
      throw new Error("invalidPlan");
    for (const id of block.tabIds) {
      const tab = expected.find((t) => t.id === id)!;
      if (tab.groupId !== -1 && block.groupId !== tab.groupId) throw new Error("invalidPlan");
      if (tab.groupId === -1 && (block.groupId !== undefined || block.create) && !isEligible(tab))
        throw new Error("invalidPlan");
    }
  }
};
