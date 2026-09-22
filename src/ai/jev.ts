import { APIError, TypeSafeClient } from "@typesafe-ai/sdk";
import type { Answer, Choice, Judge, Question } from "@/src/types";

export const parseAnswers = (value: unknown, questions: Record<string, Question>) => {
  if (
    !value ||
    typeof value !== "object" ||
    !("answers" in value) ||
    !value.answers ||
    typeof value.answers !== "object"
  )
    throw new Error("invalidResponse");
  const answers: Record<string, Answer> = {};
  for (const [id, question] of Object.entries(questions)) {
    const answer = (value.answers as Record<string, unknown>)[id] as Partial<Answer> | undefined;
    if (
      !answer ||
      answer.type !== question.type ||
      typeof answer.confidence !== "number" ||
      !Number.isFinite(answer.confidence) ||
      answer.confidence < 0 ||
      answer.confidence > 1 ||
      !answer.probabilities ||
      typeof answer.probabilities !== "object"
    )
      throw new Error("invalidResponse");
    if (question.type === "choice") {
      if (
        answer.type !== "choice" ||
        typeof answer.choice !== "string" ||
        !Object.hasOwn(question.criteria, answer.choice)
      )
        throw new Error("invalidResponse");
    } else if (
      answer.type !== "score" ||
      typeof answer.score !== "number" ||
      !Number.isFinite(answer.score) ||
      answer.score < 0 ||
      answer.score > question.criteria.length - 1 ||
      !answer.legend ||
      typeof answer.legend !== "object" ||
      Object.keys(answer.legend).length !== question.criteria.length ||
      question.criteria.some((level, index) => answer.legend?.[String(index)] !== level)
    ) {
      throw new Error("invalidResponse");
    }
    const keys = Object.keys(question.criteria);
    if (Object.keys(answer.probabilities).length !== keys.length)
      throw new Error("invalidResponse");
    let sum = 0;
    for (const key of keys) {
      const p = answer.probabilities[key];
      if (typeof p !== "number" || !Number.isFinite(p) || p < 0 || p > 1)
        throw new Error("invalidResponse");
      sum += p;
    }
    // The live API rounds probabilities to two decimals. Accumulated rounding
    // grows with the number of options; it is not a malformed distribution.
    if (sum <= 0 || Math.abs(sum - 1) > Math.max(0.03, keys.length * 0.005) + 1e-9)
      throw new Error("invalidResponse");
    if (answer.type === "score") {
      const expected = keys.reduce(
        (total, key) => total + Number(key) * answer.probabilities![key],
        0,
      );
      const rounding = 0.005 * (1 + keys.reduce((total, key) => total + Number(key), 0));
      if (Math.abs(expected - answer.score!) > Math.max(0.03, rounding) + 1e-9)
        throw new Error("invalidResponse");
    }
    answers[id] = answer as Answer;
  }
  return answers;
};
export const createJudge = (apiKey: string, signal: AbortSignal): Judge => {
  if (!apiKey.trim()) throw new Error("missingKey");
  const client = new TypeSafeClient({
    apiKey,
    baseURL: "https://api.typesafe.ai",
    defaultModel: "jev-latest",
    timeout: 25000,
    retry: { maxRetries: 0 },
    logLevel: "off",
    // Users supply their own key in the extension's settings.
    dangerouslyAllowBrowser: true,
  });
  return async (state, questions) => {
    if (!Object.keys(questions).length) return {};
    signal.throwIfAborted();
    const sdkQuestions = Object.fromEntries(
      Object.entries(questions).map(([id, question]) => {
        if (question.type === "choice") return [id, question];
        const [first, second, ...rest] = question.criteria;
        if (first === undefined || second === undefined) throw new Error("invalidResponse");
        return [id, { ...question, criteria: [first, second, ...rest] as const }];
      }),
    );
    let data: unknown;
    try {
      data = await client.systemOne({ state, questions: sdkQuestions }, { signal });
    } catch (error) {
      if (signal.aborted) throw new Error("cancelled");
      if (error instanceof APIError) {
        const body = error.body;
        const detail = body && typeof body === "object" && "detail" in body ? body.detail : null;
        const tokenLimit =
          error.status === 400 &&
          detail &&
          typeof detail === "object" &&
          "error_type" in detail &&
          detail.error_type === "max_tokens_exceeded";
        throw new Error(
          tokenLimit
            ? "tokenLimit"
            : error.status === 401 || error.status === 403
              ? "invalidKey"
              : error.status === 429
                ? "rateLimited"
                : "apiError",
          { cause: { httpStatus: error.status } },
        );
      }
      throw new Error("networkError");
    }
    return parseAnswers(data, questions);
  };
};

export const isConfident = (answer: Answer): answer is Choice =>
  answer.type === "choice" &&
  answer.confidence >= 0.3 &&
  answer.probabilities[answer.choice] >= 0.5;
