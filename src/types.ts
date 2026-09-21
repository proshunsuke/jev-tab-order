export type Settings = { apiKey: string; rules: string; allowNewGroups: boolean };
export type Tab = {
  id: number;
  index: number;
  title: string;
  url: string;
  groupId: number;
  pinned: boolean;
};
export type Group = {
  id: number;
  title: string;
  color: "grey" | "blue" | "red" | "yellow" | "green" | "pink" | "purple" | "cyan" | "orange";
  collapsed: boolean;
};
export type Snapshot = { windowId: number; tabs: Tab[]; groups: Group[] };
export type Block = {
  key: string;
  groupId?: number;
  title: string;
  tabIds: number[];
  create?: boolean;
};
export type Plan = { before: Snapshot; blocks: Block[]; warnings: string[]; settings: Settings };
export type Undo = {
  before: Snapshot;
  after?: Snapshot;
  createdGroupIds: number[];
  pending: boolean;
};
export type Question =
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "score"; instructions: string; criteria: string[] };
export type Choice = {
  type: "choice";
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
};
export type Score = {
  type: "score";
  score: number;
  confidence: number;
  probabilities: Record<string, number>;
  legend: Record<string, string>;
};
export type Answer = Choice | Score;
export type Judge = (
  state: unknown,
  questions: Record<string, Question>,
) => Promise<Record<string, Answer>>;
