import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { nameGroup, namingAvailability, prepareNaming } from "@/src/ai/naming";

beforeEach(() => {
  vi.stubGlobal("chrome", { i18n: { getUILanguage: () => "en" } });
});

afterEach(() => vi.unstubAllGlobals());
it.each(["", "   ", '"   "', "「 」", "x".repeat(61), "two\nlines", "<html>"])(
  "rejects invalid names and destroys the session: %j",
  async (name) => {
    const destroy = vi.fn();
    vi.stubGlobal("LanguageModel", {
      availability: async () => "available",
      create: async () => ({ prompt: async () => name, destroy }),
    });
    await expect(nameGroup(["Title"], new AbortController().signal)).rejects.toThrow(
      "namingFailed",
    );
    expect(destroy).toHaveBeenCalledOnce();
  },
);
it("trims quotes from a valid name and releases the model", async () => {
  const destroy = vi.fn();
  vi.stubGlobal("LanguageModel", {
    availability: async () => "available",
    create: async () => ({ prompt: async () => "  「Research」  ", destroy }),
  });
  expect(await nameGroup(["Title"], new AbortController().signal)).toBe("Research");
  expect(destroy).toHaveBeenCalledOnce();
});
it.each(["unavailable", "downloadable", "downloading"])(
  "does not create a session when %s",
  async (state) => {
    const create = vi.fn();
    vi.stubGlobal("LanguageModel", { availability: async () => state, create });
    await expect(nameGroup(["Title"], new AbortController().signal)).rejects.toThrow(
      "namingUnavailable",
    );
    expect(create).not.toHaveBeenCalled();
  },
);
it("handles availability failure and releases sessions on prompt failure", async () => {
  vi.stubGlobal("LanguageModel", {
    availability: async () => {
      throw Error("unavailable");
    },
  });
  expect(await namingAvailability()).toBe("unavailable");
  const destroy = vi.fn();
  vi.stubGlobal("LanguageModel", {
    availability: async () => "available",
    create: async () => ({
      prompt: async () => {
        throw Error("cancelled");
      },
      destroy,
    }),
  });
  await expect(nameGroup(["Title"], new AbortController().signal)).rejects.toThrow("cancelled");
  expect(destroy).toHaveBeenCalledOnce();
});

it.each([
  ["ja", "ja"],
  ["ja-JP", "ja"],
  ["en-US", "en"],
  ["en-GB", "en"],
  ["de", "de"],
  ["es-MX", "es"],
  ["fr-CA", "fr"],
  ["ko", "en"],
  ["pt-BR", "en"],
  ["ru", "en"],
  ["zh-CN", "en"],
  ["zh-TW", "en"],
])(
  "uses UI language %s as output language %s throughout model setup",
  async (uiLanguage, language) => {
    vi.stubGlobal("chrome", { i18n: { getUILanguage: () => uiLanguage } });
    const availability = vi.fn().mockResolvedValue("available");
    const prompt = vi.fn().mockResolvedValue("Research");
    const destroy = vi.fn();
    const create = vi.fn().mockResolvedValue({ prompt, destroy });
    vi.stubGlobal("LanguageModel", { availability, create });
    await prepareNaming(vi.fn());
    await nameGroup(["A title"], new AbortController().signal);
    const expectedOutputs = [{ type: "text", languages: [language] }];
    expect(availability.mock.calls).toEqual([[{ expectedOutputs }]]);
    expect(create.mock.calls.map(([options]) => options.expectedOutputs)).toEqual([
      expectedOutputs,
      expectedOutputs,
    ]);
    expect(prompt.mock.calls[0][0]).toContain(
      "in the language specified by this code: " + language + ".",
    );
    expect(destroy).toHaveBeenCalledTimes(2);
  },
);
