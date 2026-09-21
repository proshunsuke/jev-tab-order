import { useEffect, useRef, useState } from "react";
import { i18n } from "#i18n";
import { errorText, type TextKey } from "@/src/i18n";
import { getSettings } from "@/src/settings/state";
import { capture, isEligible } from "@/src/tabs/snapshot";
import { createJudge } from "@/src/ai/jev";
import { nameGroup } from "@/src/ai/naming";
import { buildPlan } from "@/src/organize/plan";
import { applyPlan, readUndo, undoOrganization } from "@/src/tabs/apply";
import type { Plan } from "@/src/types";
const params = new URLSearchParams(location.search);
const target = params.has("windowId") ? Number(params.get("windowId")) : NaN;
const initialMode = params.get("mode") ?? "preview";
export default () => {
  const [status, setStatus] = useState<TextKey>("loading");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [plan, setPlan] = useState<Plan>();
  const [canUndo, setCanUndo] = useState(false);
  const initialized = useRef(false);
  const controller = useRef<AbortController | undefined>(undefined);
  const working = useRef(false);
  const mutateGuard = useRef(false);
  const perform = async (action: () => Promise<void>) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    let locked = false;
    try {
      if (!Number.isInteger(target) || target < 0) throw new Error("windowMissing");
      const result = await chrome.runtime.sendMessage({ type: "lock", windowId: target });
      if (!result?.ok) throw new Error("busy");
      locked = true;
      await action();
    } catch (e) {
      setStatus("stopped");
      setError(errorText(e));
    } finally {
      mutateGuard.current = false;
      setMutating(false);
      if (locked)
        await chrome.runtime.sendMessage({ type: "unlock", windowId: target }).catch(() => {});
      if (Number.isInteger(target)) setCanUndo(!!(await readUndo(target).catch(() => undefined)));
      working.current = false;
      setBusy(false);
    }
  };
  const apply = async (next: Plan) => {
    if (JSON.stringify(await getSettings()) !== JSON.stringify(next.settings))
      throw new Error("settingsChanged");
    mutateGuard.current = true;
    setMutating(true);
    setStatus("applying");
    await applyPlan(next);
    setStatus("done");
  };
  const organize = async (preview: boolean) => {
    setPlan(undefined);
    setStatus("loading");
    controller.current = new AbortController();
    const signal = controller.current.signal;
    const settings = await getSettings();
    const judge = createJudge(settings.apiKey, signal);
    const before = await capture(target);
    if ((await readUndo(target))?.pending) throw new Error("pendingRecovery");
    if (!before.tabs.some(isEligible)) {
      setStatus("noTabs");
      return;
    }
    const next = await buildPlan(
      before,
      settings,
      judge,
      (titles) => nameGroup(titles, signal),
      (key) => setStatus(key as TextKey),
    );
    if (signal.aborted) throw new Error("cancelled");
    setPlan(next);
    if (preview) setStatus("previewReady");
    else await apply(next);
  };
  const undo = async () => {
    mutateGuard.current = true;
    setMutating(true);
    setStatus("restoring");
    await undoOrganization(target);
    setPlan(undefined);
    setStatus("restored");
  };
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void perform(() => (initialMode === "undo" ? undo() : organize(initialMode !== "run")));
  });
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (mutateGuard.current) {
        event.preventDefault();
        event.returnValue = "";
      } else {
        controller.current?.abort();
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, []);
  const tabs = new Map(plan?.before.tabs.map((tab) => [tab.id, tab]) ?? []);
  return (
    <main className="max-w-2xl mx-auto p-6 space-y-5">
      <header className="flex justify-between items-start gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest muted">JEV TAB ORDER</p>
          <h1 className="mt-3 text-2xl">{i18n.t("organize")}</h1>
        </div>
        <button onClick={() => void chrome.runtime.openOptionsPage()}>{i18n.t("settings")}</button>
      </header>
      <section className="card space-y-3" aria-live="polite">
        <div className="flex items-center gap-3">
          {busy && <span className="pulse rounded-full bg-emerald-700 w-2.5 h-2.5" />}
          <h2>{i18n.t(status)}</h2>
        </div>
        <p className="text-xs muted">
          {i18n.t("targetWindow")} {Number.isInteger(target) ? target : "—"}
        </p>
        {busy && <p className="text-xs muted">{i18n.t("keepOpen")}</p>}
        {!busy && status === "previewReady" && (
          <p className="text-xs muted">{i18n.t("previewOnly")}</p>
        )}
      </section>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {plan?.warnings.map((w) => (
        <p className="notice text-sm" key={w}>
          {i18n.t(w as TextKey)}
        </p>
      ))}
      <div className="flex flex-wrap gap-2">
        {busy && !mutating && (
          <button onClick={() => controller.current?.abort()}>{i18n.t("cancel")}</button>
        )}
        {!busy && (
          <>
            <button className="primary" onClick={() => void perform(() => organize(false))}>
              {i18n.t("retry")}
            </button>
            {plan && status === "previewReady" && !error && (
              <button onClick={() => void perform(() => apply(plan))}>{i18n.t("apply")}</button>
            )}
            <button disabled={!canUndo} onClick={() => void perform(undo)}>
              {i18n.t("undo")}
            </button>
            <button onClick={() => window.close()}>{i18n.t("close")}</button>
          </>
        )}
      </div>
      {plan && (
        <div className="space-y-3">
          {plan.before.tabs.some((tab) => tab.pinned) && (
            <p className="text-xs muted">
              {i18n.t("pinned")} · {plan.before.tabs.filter((tab) => tab.pinned).length}
            </p>
          )}
          {plan.blocks.map((block) => (
            <section className="card !p-4" key={block.key}>
              <div className="flex gap-2 justify-between">
                <h2 className="!text-sm">{block.title || i18n.t("ungrouped")}</h2>
                {block.create && <span className="text-xs muted">{i18n.t("newGroup")}</span>}
              </div>
              <ol className="mt-2 space-y-2">
                {block.tabIds.map((id) => (
                  <li key={id} className="text-sm truncate" title={tabs.get(id)?.title}>
                    <span className="muted mr-2">↳</span>
                    {tabs.get(id)?.title || tabs.get(id)?.url}
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </main>
  );
};
