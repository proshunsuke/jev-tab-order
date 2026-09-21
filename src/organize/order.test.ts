import { expect, it } from "vitest";
import { orderByRank, rankOf } from "@/src/organize/order";

it("sorts priorities locally and keeps equal ranks stable", () => {
  const input = [2, 1, 2, 3, 1, 2].map((rank, id) => ({ rank, id }));
  expect(orderByRank(input, (item) => item.rank)).toEqual([
    input[1],
    input[4],
    input[0],
    input[2],
    input[5],
    input[3],
  ]);
  expect(input.map((item) => item.id)).toEqual([0, 1, 2, 3, 4, 5]);
  expect(orderByRank([], () => 0)).toEqual([]);
});
it("preserves unknown slots while ordering known priorities", () => {
  expect(orderByRank([4, undefined, 2, 1, undefined, 3], (value) => value)).toEqual([
    1,
    undefined,
    2,
    3,
    undefined,
    4,
  ]);
});
it.each([
  [0, 1, 0],
  [1.25, 0.5, 1.25],
  [1.25, 0.49, undefined],
  [NaN, 1, undefined],
] as const)("interprets score %s at confidence %s", (score, confidence, expected) => {
  expect(rankOf({ type: "score", score, confidence, probabilities: {}, legend: {} })).toBe(
    expected,
  );
});
