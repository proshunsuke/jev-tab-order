import { i18n } from "#i18n";
import en from "@/locales/en.json";
export type TextKey = keyof typeof en;
export const errorText = (error: unknown) => {
  const key = error instanceof Error ? error.message : "unknownError";
  const message = Object.hasOwn(en, key) ? i18n.t(key as TextKey) : i18n.t("unknownError");
  const cause = error instanceof Error ? error.cause : undefined;
  if (
    cause &&
    typeof cause === "object" &&
    "httpStatus" in cause &&
    typeof cause.httpStatus === "number" &&
    Number.isInteger(cause.httpStatus) &&
    cause.httpStatus >= 400 &&
    cause.httpStatus <= 599
  )
    return `${message} (HTTP ${cause.httpStatus})`;
  return message;
};
