import type { Answer } from "@/src/types";

export const rankOf = (answer: Answer | undefined) => {
  if (!answer || answer.type !== "score" || answer.confidence < 0.5) return undefined;
  return Number.isFinite(answer.score) ? answer.score : undefined;
};

// Unknown priorities keep their slots; equal priorities keep their original order.
export const orderByRank = <T>(items: T[], rank: (item: T) => number | undefined) => {
  const scored = items.map((item) => ({ item, score: rank(item) }));
  const known = scored
    .filter((entry): entry is { item: T; score: number } => entry.score !== undefined)
    .sort((a, b) => a.score - b.score);
  let index = 0;
  return scored.map((entry) => (entry.score === undefined ? entry.item : known[index++].item));
};
