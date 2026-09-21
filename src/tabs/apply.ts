import { capture, fingerprint } from "@/src/tabs/snapshot";
import { validatePlan } from "@/src/organize/plan";
import type { Block, Plan, Snapshot, Undo } from "@/src/types";
export const undoKey = (windowId: number) => `undo_${windowId}`;
export const readUndo = async (windowId: number): Promise<Undo | undefined> =>
  (await chrome.storage.session.get<Record<string, Undo | undefined>>(undoKey(windowId)))[
    undoKey(windowId)
  ];
const storeUndo = (windowId: number, undo: Undo) =>
  chrome.storage.session.set({ [undoKey(windowId)]: undo });

const moveBlocks = async (windowId: number, blocks: Block[], pinnedCount: number) => {
  let index = pinnedCount;
  for (const block of blocks) {
    if (block.groupId !== undefined)
      await chrome.tabGroups.move(block.groupId, { windowId, index });
    for (let i = 0; i < block.tabIds.length; i++)
      await chrome.tabs.move(block.tabIds[i], { windowId, index: index + i });
    index += block.tabIds.length;
  }
};

export const restoreSnapshot = async (before: Snapshot) => {
  const current = await capture(before.windowId);
  // Never silently move tabs from another window, resurrect closed tabs, or overwrite pin edits.
  if (
    current.tabs.length !== before.tabs.length ||
    before.tabs.some((tab) => !current.tabs.some((t) => t.id === tab.id && t.pinned === tab.pinned))
  )
    throw new Error("restoreConflict");
  const ungroup = before.tabs.filter((tab) => tab.groupId === -1 && !tab.pinned).map((t) => t.id);
  if (ungroup.length) await chrome.tabs.ungroup(ungroup as [number, ...number[]]);
  for (const group of before.groups) {
    const ids = before.tabs.filter((t) => t.groupId === group.id).map((t) => t.id);
    if (!ids.length) continue;
    if (!current.groups.some((g) => g.id === group.id)) throw new Error("restoreConflict");
    await chrome.tabs.group({ groupId: group.id, tabIds: ids as [number, ...number[]] });
  }
  const blocks: Block[] = [];
  for (const tab of before.tabs.filter((t) => !t.pinned)) {
    if (tab.groupId === -1) blocks.push({ key: String(tab.id), title: "", tabIds: [tab.id] });
    else if (!blocks.some((b) => b.groupId === tab.groupId))
      blocks.push({
        key: String(tab.groupId),
        title: "",
        groupId: tab.groupId,
        tabIds: before.tabs.filter((t) => t.groupId === tab.groupId).map((t) => t.id),
      });
  }
  await moveBlocks(before.windowId, blocks, before.tabs.filter((t) => t.pinned).length);
  for (const group of before.groups)
    await chrome.tabGroups.update(group.id, {
      title: group.title,
      color: group.color,
      collapsed: group.collapsed,
    });
};

export const applyPlan = async (plan: Plan) => {
  validatePlan(plan);
  const { before } = plan;
  if (fingerprint(await capture(before.windowId)) !== fingerprint(before))
    throw new Error("windowChanged");
  const previous = await readUndo(before.windowId);
  if (previous?.pending) throw new Error("pendingRecovery");
  const transaction: Undo = { before, createdGroupIds: [], pending: true };
  await storeUndo(before.windowId, transaction);
  try {
    const blocks = plan.blocks.map((block) => ({ ...block, tabIds: [...block.tabIds] }));
    for (const block of blocks) {
      if (block.create) {
        block.groupId = await chrome.tabs.group({
          tabIds: block.tabIds as [number, ...number[]],
          createProperties: { windowId: before.windowId },
        });
        transaction.createdGroupIds.push(block.groupId);
        await storeUndo(before.windowId, transaction);
        await chrome.tabGroups.update(block.groupId, { title: block.title });
      } else if (block.groupId !== undefined) {
        const added = block.tabIds.filter(
          (id) => before.tabs.find((t) => t.id === id)!.groupId === -1,
        );
        if (added.length)
          await chrome.tabs.group({
            groupId: block.groupId,
            tabIds: added as [number, ...number[]],
          });
      }
    }
    await moveBlocks(before.windowId, blocks, before.tabs.filter((t) => t.pinned).length);
    for (const group of before.groups)
      await chrome.tabGroups.update(group.id, { collapsed: group.collapsed });
    const after = await capture(before.windowId);
    const expected = [
      ...before.tabs.filter((t) => t.pinned).map((t) => t.id),
      ...blocks.flatMap((b) => b.tabIds),
    ];
    if (
      JSON.stringify(after.tabs.map((t) => t.id)) !== JSON.stringify(expected) ||
      blocks.some((block) =>
        block.tabIds.some(
          (id) => after.tabs.find((t) => t.id === id)?.groupId !== (block.groupId ?? -1),
        ),
      )
    )
      throw new Error("applyFailed");
    await storeUndo(before.windowId, { ...transaction, after, pending: false });
  } catch {
    try {
      await restoreSnapshot(before);
      await chrome.storage.session.remove(undoKey(before.windowId));
    } catch {
      throw new Error("pendingRecovery");
    }
    throw new Error("applyFailed");
  }
};

export const undoOrganization = async (windowId: number) => {
  const undo = await readUndo(windowId);
  if (!undo) throw new Error("nothingToUndo");
  if (undo.after && fingerprint(await capture(windowId)) !== fingerprint(undo.after))
    throw new Error("undoConflict");
  await restoreSnapshot(undo.before);
  await chrome.storage.session.remove(undoKey(windowId));
};
