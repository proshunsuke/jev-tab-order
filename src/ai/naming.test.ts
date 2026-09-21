import { afterEach, expect, it, vi } from "vitest";
import { nameGroup, namingAvailability } from "@/src/ai/naming";

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
