import { afterEach, expect, it, vi } from "vitest";
import { createJudge, parseAnswers } from "@/src/ai/jev";
const questions = {
  q: { type: "choice" as const, instructions: "Choose", criteria: { a: "A", b: "B" } },
};
const valid = {
  answers: {
    q: { type: "choice", choice: "a", confidence: 0.8, probabilities: { a: 0.9, b: 0.1 } },
  },
};
const scoreQuestions = {
  rank: {
    type: "score" as const,
    instructions: "Rate priority",
    criteria: ["Early", "Middle", "Late"],
  },
};
const scoreAnswer = {
  type: "score",
  score: 1.25,
  confidence: 0.8,
  legend: { "0": "Early", "1": "Middle", "2": "Late" },
  probabilities: { "0": 0, "1": 0.75, "2": 0.25 },
};
it("accepts mixed choice and fractional score responses", () => {
  const answers = { ...valid.answers, rank: scoreAnswer };
  expect(parseAnswers({ answers }, { ...questions, ...scoreQuestions })).toEqual(answers);
});
it("allows accumulated two-decimal rounding from the live API", () => {
  const criteria = Array.from({ length: 5 }, (_, i) => `Level ${i}`);
  const answer = {
    type: "score",
    score: 2.04,
    confidence: 0.1,
    legend: Object.fromEntries(criteria.map((value, i) => [String(i), value])),
    probabilities: { "0": 0.18, "1": 0.2, "2": 0.2, "3": 0.2, "4": 0.2 },
  };
  expect(
    parseAnswers(
      { answers: { rank: answer } },
      {
        rank: { type: "score", instructions: "Priority", criteria },
      },
    ),
  ).toEqual({ rank: answer });
  const options = Object.fromEntries(Array.from({ length: 16 }, (_, i) => [String(i), ""]));
  const rounded = {
    type: "choice",
    choice: "0",
    confidence: 0,
    probabilities: Object.fromEntries(Object.keys(options).map((key) => [key, 0.06])),
  };
  expect(
    parseAnswers(
      { answers: { q: rounded } },
      {
        q: { type: "choice", instructions: "Choose", criteria: options },
      },
    ),
  ).toEqual({ q: rounded });
});
it.each([
  { type: "choice", choice: "1" },
  { score: NaN },
  { score: -1 },
  { score: 3 },
  { score: 1.8 },
  { legend: { "0": "Early", "1": "Middle" } },
  { legend: { "0": "Early", "1": "Wrong", "2": "Late" } },
  { probabilities: { "0": 0, "1": 1 } },
  { probabilities: { "0": 0, "1": 0.75, "2": 0.25, "3": 0 } },
])("rejects malformed score response %j", (patch) => {
  expect(() =>
    parseAnswers({ answers: { rank: { ...scoreAnswer, ...patch } } }, scoreQuestions),
  ).toThrow("invalidResponse");
});
afterEach(() => vi.unstubAllGlobals());
it("identifies Jev's input limit without retrying or exposing response data", async () => {
  const fetch = vi.fn().mockResolvedValue(
    Response.json(
      {
        detail: { error_type: "max_tokens_exceeded", input: "private data" },
      },
      { status: 400 },
    ),
  );
  vi.stubGlobal("fetch", fetch);
  await expect(
    createJudge("key", new AbortController().signal)({}, questions),
  ).rejects.toMatchObject({
    message: "tokenLimit",
    cause: { httpStatus: 400 },
  });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("validates distributions and rejects fabricated choice IDs", () => {
  expect(parseAnswers(valid, questions)).toEqual(valid.answers);
  expect(() =>
    parseAnswers({ answers: { q: { ...valid.answers.q, choice: "invented" } } }, questions),
  ).toThrow("invalidResponse");
  expect(() =>
    parseAnswers(
      { answers: { q: { ...valid.answers.q, probabilities: { a: 1, b: 1 } } } },
      questions,
    ),
  ).toThrow("invalidResponse");
});
it("never includes server text or credentials in authentication errors", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private-key", { status: 401 })));
  await expect(
    createJudge("private-key", new AbortController().signal)({}, questions),
  ).rejects.toThrow("invalidKey");
});
it("aborts before any request", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const abort = new AbortController();
  abort.abort();
  await expect(createJudge("key", abort.signal)({}, questions)).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});

it.each([
  null,
  {},
  { answers: {} },
  ...[
    { type: "number" },
    { confidence: -0.1 },
    { confidence: 1.1 },
    { confidence: NaN },
    { confidence: Infinity },
    { confidence: "0.8" },
    { probabilities: null },
    { probabilities: { a: 1 } },
    { probabilities: { a: 1, c: 0 } },
    { probabilities: { a: 1, b: 0, c: 0 } },
    { probabilities: { a: -0.1, b: 1.1 } },
    { probabilities: { a: NaN, b: 0 } },
    { probabilities: { a: "1", b: 0 } },
  ].map((patch) => ({ answers: { q: { ...valid.answers.q, ...patch } } })),
])("rejects malformed or missing answers: %j", (response) => {
  expect(() => parseAnswers(response, questions)).toThrow("invalidResponse");
});

it.each([400, 403, 413, 422, 429, 503, 529, 500])(
  "reports HTTP %s without automatic retry",
  async (status) => {
    const fetch = vi.fn().mockResolvedValue(new Response("private server body", { status }));
    vi.stubGlobal("fetch", fetch);
    await expect(
      createJudge("key", new AbortController().signal)({}, questions),
    ).rejects.toMatchObject({
      message: status === 403 ? "invalidKey" : status === 429 ? "rateLimited" : "apiError",
      cause: { httpStatus: status },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);

it("rejects invalid JSON and network errors without exposing response details", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response("not JSON"))
    .mockRejectedValueOnce(new Error("secret"));
  vi.stubGlobal("fetch", fetch);
  const judge = createJudge("key", new AbortController().signal);
  await expect(judge({}, questions)).rejects.toThrow("invalidResponse");
  await expect(judge({}, questions)).rejects.toThrow("networkError");
});

it("skips requests when there are no questions", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  expect(await createJudge("key", new AbortController().signal)({}, {})).toEqual({});
  expect(fetch).not.toHaveBeenCalled();
});

it("sends the full state and all questions in one request", async () => {
  const state = { text: "あ".repeat(30000) };
  const many = Object.fromEntries(
    Array.from({ length: 50 }, (_, i) => [
      `q${i}`,
      { ...questions.q, instructions: "あ".repeat(3000) },
    ]),
  );
  const answers = Object.fromEntries(Object.keys(many).map((id) => [id, valid.answers.q]));
  const fetch = vi.fn().mockResolvedValue(Response.json({ answers }));
  vi.stubGlobal("fetch", fetch);
  expect(await createJudge("key", new AbortController().signal)(state, many)).toEqual(answers);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
    model: "jev-latest",
    state,
    questions: many,
  });
});

it("cancels an in-flight fetch", async () => {
  const controller = new AbortController();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      controller.abort();
      throw Error("aborted");
    }),
  );
  await expect(createJudge("key", controller.signal)({}, questions)).rejects.toThrow("cancelled");
});

it("times out after 25 seconds without retrying", async () => {
  vi.useFakeTimers();
  try {
    const fetch = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal!.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const result = expect(
      createJudge("key", new AbortController().signal)({}, questions),
    ).rejects.toThrow("networkError");
    await vi.advanceTimersByTimeAsync(24999);
    expect(fetch.mock.calls[0][1].signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await result;
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].signal!.aborted).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});

it("authenticates with the user's key through the SDK in a browser runtime", async () => {
  vi.stubGlobal("window", {});
  vi.stubGlobal("document", {});
  const fetch = vi.fn().mockResolvedValue(Response.json(valid));
  vi.stubGlobal("fetch", fetch);
  expect(await createJudge("user-key", new AbortController().signal)({}, questions)).toEqual(
    valid.answers,
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, init] = fetch.mock.calls[0];
  expect(url).toBe("https://api.typesafe.ai/v1/systemone");
  expect(init.method).toBe("POST");
  const headers = new Headers(init.headers);
  expect(headers.get("Authorization")).toBe("Bearer user-key");
  expect(headers.get("Content-Type")).toBe("application/json");
});
