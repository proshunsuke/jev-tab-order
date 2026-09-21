import { expect, it, vi } from "vitest";
import { errorText } from "@/src/i18n";

vi.mock("#i18n", () => ({ i18n: { t: (key: string) => key } }));

it("shows the HTTP status without exposing server details", () => {
  expect(
    errorText(new Error("apiError", { cause: { httpStatus: 422, body: "private data" } })),
  ).toBe("apiError (HTTP 422)");
});

it.each([undefined, "private data", { httpStatus: "private data" }, { httpStatus: 200 }])(
  "keeps ordinary error messages unchanged for cause %j",
  (cause) => {
    expect(errorText(new Error("apiError", { cause }))).toBe("apiError");
  },
);
