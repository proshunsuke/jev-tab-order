import { useEffect, useState } from "react";
import { i18n } from "#i18n";
import { errorText } from "@/src/i18n";
import { getSettings, saveSettings, DEFAULT_SETTINGS } from "@/src/settings/state";
import { createJudge } from "@/src/ai/jev";
import { namingAvailability, prepareNaming } from "@/src/ai/naming";
export default () => {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [model, setModel] = useState("unavailable");
  const [progress, setProgress] = useState<number>();
  useEffect(() => {
    void getSettings()
      .then((value) => {
        setSettings(value);
        setLoaded(true);
      })
      .catch((e) => setError(errorText(e)));
    void namingAvailability().then(setModel);
  }, []);
  const perform = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="settings-page max-w-2xl mx-auto px-4 py-6 space-y-4">
      <header>
        <h1>Jev Tab Order · {i18n.t("settings")}</h1>
      </header>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void perform(async () => {
            await saveSettings(settings);
            setMessage(i18n.t("saved"));
          });
        }}
      >
        <fieldset disabled={!loaded || busy} className="space-y-4">
          <section className="space-y-2">
            <label htmlFor="apiKey">{i18n.t("apiKey")}</label>
            <div className="flex flex-wrap sm:flex-nowrap items-start gap-2">
              <input
                className="min-w-0 flex-1 basis-48"
                id="apiKey"
                type="password"
                autoComplete="off"
                spellCheck={false}
                maxLength={1000}
                value={settings.apiKey}
                onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
              />
              <button
                type="button"
                disabled={!settings.apiKey.trim()}
                onClick={() =>
                  void perform(async () => {
                    await createJudge(settings.apiKey.trim(), new AbortController().signal)(
                      { connectionTest: true },
                      {
                        connection: {
                          type: "choice",
                          instructions: "Choose connected.",
                          criteria: { connected: "API connection established", other: "Other" },
                        },
                      },
                    );
                    setMessage(i18n.t("connected"));
                  })
                }
              >
                {i18n.t("connect")}
              </button>
            </div>
          </section>
          <section className="space-y-2">
            <label htmlFor="rules">{i18n.t("rules")}</label>
            <textarea
              id="rules"
              rows={4}
              aria-describedby="rules-hint"
              maxLength={2000}
              placeholder={i18n.t("rulesPlaceholder")}
              value={settings.rules}
              onChange={(e) => setSettings({ ...settings, rules: e.target.value })}
            />
            <div className="flex justify-between gap-3 text-xs muted">
              <span id="rules-hint">{i18n.t("rulesHint")}</span>
              <span>{settings.rules.length}/2000</span>
            </div>
            <details>
              <summary>{i18n.t("showDefault")}</summary>
              <p className="text-sm muted mt-2 whitespace-pre-line">
                {i18n.t("defaultDescription")}
              </p>
            </details>
          </section>
          <section className="space-y-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.allowNewGroups}
                onChange={(e) => setSettings({ ...settings, allowNewGroups: e.target.checked })}
              />
              {i18n.t("allowNew")}
            </label>
            {settings.allowNewGroups && (
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs muted">
                  {i18n.t(
                    model === "available"
                      ? "modelReady"
                      : model === "unavailable"
                        ? "modelUnavailable"
                        : "modelDownload",
                  )}
                </p>
                {model !== "unavailable" && model !== "available" && (
                  <button
                    type="button"
                    onClick={() =>
                      void perform(async () => {
                        await prepareNaming(setProgress);
                        setModel(await namingAvailability());
                        setProgress(undefined);
                      })
                    }
                  >
                    {i18n.t("prepareModel")}
                  </button>
                )}
              </div>
            )}
          </section>
          <div className="flex flex-wrap gap-3">
            <button className="primary" type="submit">
              {i18n.t("save")}
            </button>
            <button
              type="button"
              onClick={() =>
                void perform(async () => {
                  const window = await chrome.windows.getCurrent();
                  if (window.id === undefined) throw new Error("windowMissing");
                  const result = await chrome.runtime.sendMessage({
                    type: "openOrganizer",
                    windowId: window.id,
                    mode: "preview",
                  });
                  if (!result?.ok) throw new Error("unknownError");
                })
              }
            >
              {i18n.t("preview")}
            </button>
          </div>
        </fieldset>
      </form>
      <p className="text-xs muted">{i18n.t("previewHint")}</p>
      {busy && (
        <p role="status" className="text-sm">
          {progress !== undefined
            ? `${i18n.t("preparing")} ${Math.round(progress * 100)}%`
            : i18n.t("loading")}
        </p>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <footer className="flex flex-wrap items-start gap-x-4 gap-y-2 text-xs">
        <button
          className="settings-link"
          onClick={() => void chrome.tabs.create({ url: "chrome://extensions/shortcuts" })}
        >
          {i18n.t("shortcuts")}
        </button>
        <details>
          <summary>{i18n.t("privacyLink")}</summary>
          <p className="muted mt-2">{i18n.t("privacyBody")}</p>
        </details>
      </footer>
    </main>
  );
};
