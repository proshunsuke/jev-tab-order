import { expect, it } from "vitest";
import { safeUrl } from "@/src/tabs/snapshot";
it("excludes credentials, query values and fragments from model URLs", () => {
  expect(safeUrl("https://alice:password@example.com/path?token=secret#private")).toBe(
    "https://example.com/path",
  );
});
it("compares stored groups independent of object property order", async () => {
  const { fingerprint } = await import("@/src/tabs/snapshot");
  const first = {
    windowId: 1,
    tabs: [],
    groups: [{ id: 7, title: "Docs", color: "blue" as const, collapsed: false }],
  };
  const restored = {
    ...first,
    groups: [{ collapsed: false, color: "blue" as const, title: "Docs", id: 7 }],
  };
  expect(fingerprint(restored)).toBe(fingerprint(first));
});
