import type { Snapshot, Tab } from "@/src/types";
export const capture = async (windowId: number): Promise<Snapshot> => {
  const [tabs, groups] = await Promise.all([
    chrome.tabs.query({ windowId }),
    chrome.tabGroups.query({ windowId }),
  ]);
  return {
    windowId,
    tabs: tabs
      .filter((tab): tab is chrome.tabs.Tab & { id: number } => tab.id !== undefined)
      .map((tab) => ({
        id: tab.id,
        index: tab.index,
        title: tab.title ?? "",
        url: tab.pendingUrl || tab.url || "",
        groupId: tab.groupId,
        pinned: tab.pinned,
      })),
    groups: groups.map(({ id, title, color, collapsed }) => ({
      id,
      title: title ?? "",
      color,
      collapsed,
    })),
  };
};
export const isEligible = (tab: Tab) => !tab.pinned && /^https?:\/\//.test(tab.url);
export const fingerprint = (snapshot: Snapshot) =>
  JSON.stringify({
    tabs: snapshot.tabs.map((t) => [t.id, t.url, t.title, t.groupId, t.pinned]),
    groups: [...snapshot.groups]
      .sort((a, b) => a.id - b.id)
      .map((g) => [g.id, g.title, g.color, g.collapsed]),
  });
export const safeUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`.slice(0, 160);
  } catch {
    return "";
  }
};
export const describe = (tab: Tab) => ({
  id: String(tab.id),
  title: isEligible(tab) ? tab.title.slice(0, 120) : "Browser page",
  url: isEligible(tab) ? safeUrl(tab.url) : "",
});
