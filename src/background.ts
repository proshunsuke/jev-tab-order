import { i18n } from "#i18n";
import { errorText, type TextKey } from "@/src/i18n";
import { getSettings } from "@/src/settings/state";
import { capture, isEligible } from "@/src/tabs/snapshot";
import { createJudge } from "@/src/ai/jev";
import { nameGroup } from "@/src/ai/naming";
import { buildPlan } from "@/src/organize/plan";
import { applyPlan, readUndo, undoOrganization } from "@/src/tabs/apply";

type Mode = "run" | "preview" | "undo";
const workerOwner = crypto.randomUUID();
let badgeVersion = 0;
const opening = new Map<number, Promise<void>>();
let lockQueue = Promise.resolve();
const openPreview = async (windowId: number) => {
  const existing = opening.get(windowId);
  if (existing) return existing;
  const task = (async () => {
    const base = chrome.runtime.getURL("organize.html");
    const pages = await chrome.tabs.query({ url: `${base}*` });
    const page = pages.find(
      (p) => new URL(p.url!).searchParams.get("windowId") === String(windowId),
    );
    if (page?.id !== undefined) {
      await chrome.windows.update(page.windowId, { focused: true });
      await chrome.tabs.update(page.id, { active: true });
      return;
    }
    await chrome.windows.create({
      url: `${base}?windowId=${windowId}&mode=preview`,
      type: "popup",
      width: 540,
      height: 720,
    });
  })();
  opening.set(windowId, task);
  try {
    await task;
  } finally {
    opening.delete(windowId);
  }
};
const feedback = async (text: string, title: string, transient = false) => {
  const version = ++badgeVersion;
  await chrome.action.setTitle({ title });
  await chrome.action.setBadgeText({ text });
  if (transient) {
    // Three seconds is below the worker's idle timeout; startup also clears stale feedback.
    setTimeout(() => {
      if (version === badgeVersion) void feedback("", i18n.t("organize"));
    }, 3000);
  }
};
const showFailure = (error: unknown) => feedback("!", errorText(error));
const changeLock = (windowId: number, owner: string, release = false) => {
  const task = lockQueue.then(async () => {
    const key = `lock_${windowId}`;
    const prior = (await chrome.storage.session.get(key))[key] as string | undefined;
    if (release) {
      if (prior === owner) await chrome.storage.session.remove(key);
      return true;
    }
    if (
      prior &&
      (prior === workerOwner || (await chrome.runtime.getContexts({ documentIds: [prior] })).length)
    )
      return false;
    await chrome.storage.session.set({ [key]: owner });
    return true;
  });
  lockQueue = task.then(
    () => {},
    () => {},
  );
  return task;
};
const run = async (windowId: number, mode: "run" | "undo") => {
  if (!(await changeLock(windowId, workerOwner))) {
    await showFailure(new Error("busy"));
    return;
  }
  // Only keep the worker alive while this explicit operation is in flight.
  const keepAlive = setInterval(() => {
    void chrome.runtime.getPlatformInfo();
  }, 20000);
  const startedAt = Date.now();
  let status: TextKey = mode === "undo" ? "restoring" : "loading";
  let errorMessage: string | undefined;
  let progressWrites = Promise.resolve();
  const report = (key: TextKey) => {
    status = key;
    progressWrites = progressWrites.then(async () => {
      await chrome.storage.session.set({
        [`operation_${windowId}`]: { mode, startedAt, status: key },
      });
      await chrome.action.setTitle({ title: i18n.t(key) });
    });
    return progressWrites;
  };
  try {
    await feedback("…", i18n.t(status));
    await report(status);
    if (mode === "undo") {
      await undoOrganization(windowId);
      status = "restored";
      await feedback("✓", i18n.t("restored"), true);
      return;
    }
    const settings = await getSettings();
    const signal = AbortSignal.timeout(240000);
    const judge = createJudge(settings.apiKey, signal);
    const before = await capture(windowId);
    if ((await readUndo(windowId))?.pending) throw new Error("pendingRecovery");
    if (!before.tabs.some(isEligible)) {
      status = "noTabs";
      await feedback("✓", i18n.t("noTabs"), true);
      return;
    }
    const plan = await buildPlan(
      before,
      settings,
      judge,
      (titles) => nameGroup(titles, signal),
      (key) => {
        void report(key as TextKey).catch(() => {});
      },
    );
    signal.throwIfAborted();
    if (JSON.stringify(await getSettings()) !== JSON.stringify(settings))
      throw new Error("settingsChanged");
    await report("applying");
    await applyPlan(plan);
    status = plan.warnings.length ? "namingSkipped" : "done";
    if (plan.warnings.length) await feedback("!", i18n.t("namingSkipped"));
    else await feedback("✓", i18n.t("done"), true);
  } catch (error) {
    status = "stopped";
    errorMessage = errorText(error);
    await progressWrites.catch(() => {});
    await showFailure(error);
  } finally {
    clearInterval(keepAlive);
    try {
      await progressWrites.catch(() => {});
      await chrome.storage.session.set({
        [`operation_${windowId}`]: {
          mode,
          startedAt,
          finishedAt: Date.now(),
          status,
          errorMessage,
        },
      });
    } finally {
      await changeLock(windowId, workerOwner, true);
    }
  }
};
const openOrganizer = (windowId: number, mode: Mode) =>
  mode === "preview" ? openPreview(windowId) : run(windowId, mode);
export const setupBackground = () => {
  void feedback("", i18n.t("organize"));
  // Keys and session snapshots are available only to trusted extension pages.
  void chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }).catch(showFailure);
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: "organize",
        title: i18n.t("organize"),
        contexts: ["action", "page"],
      });
      chrome.contextMenus.create({ id: "undo", title: i18n.t("undo"), contexts: ["action"] });
      chrome.contextMenus.create({
        id: "settings",
        title: i18n.t("settings"),
        contexts: ["action"],
      });
    });
  });
  chrome.action.onClicked.addListener((tab) => {
    void openOrganizer(tab.windowId, "run").catch(showFailure);
  });
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "settings") {
      void chrome.runtime.openOptionsPage().catch(showFailure);
      return;
    }
    if (tab && (info.menuItemId === "organize" || info.menuItemId === "undo"))
      void openOrganizer(tab.windowId, info.menuItemId === "undo" ? "undo" : "run").catch(
        showFailure,
      );
  });
  chrome.commands.onCommand.addListener((command) => {
    if (command !== "organize" && command !== "undo") return;
    void chrome.windows
      .getLastFocused({ windowTypes: ["normal"] })
      .then((window) => {
        if (window.id !== undefined)
          return openOrganizer(window.id, command === "undo" ? "undo" : "run");
      })
      .catch(showFailure);
  });
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL("")))
      return;
    if (
      message?.type === "openOrganizer" &&
      Number.isInteger(message.windowId) &&
      ["run", "preview", "undo"].includes(message.mode)
    ) {
      void openOrganizer(message.windowId, message.mode).then(
        () => reply({ ok: true }),
        () => reply({ ok: false }),
      );
      return true;
    }
    if (
      !["lock", "unlock"].includes(message?.type) ||
      !Number.isInteger(message.windowId) ||
      !sender.documentId ||
      !sender.url.startsWith(chrome.runtime.getURL("organize.html"))
    )
      return;
    void changeLock(message.windowId, sender.documentId, message.type === "unlock").then(
      (ok) => reply({ ok }),
      () => reply({ ok: false }),
    );
    return true;
  });
};
