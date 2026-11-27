import { MAX_STUDY_PARTICIPANTS } from "@/experiments/double-auction/lib/study-config";

export const aiExperiments = {
  institutions: "Double Auction",
  emh: "EMH",
  evolution: "SEG",
} as const;

export type AiExperiment = keyof typeof aiExperiments;
export type AiProvider = "local" | "openai";
export const AI_ADMISSION_LIMIT = 999;
export function aiParticipantLimit(experiment: AiExperiment) {
  return experiment === "institutions"
    ? MAX_STUDY_PARTICIPANTS
    : AI_ADMISSION_LIMIT;
}
export const AI_ADMISSION_DEFAULTS = {
  count: 40,
  parallel: 8,
  interval: 10,
  timeout: 60,
  maxOutputTokens: 2048,
};
export type AiSetup = { localModel: string; openaiAvailable: boolean };
export type AiAdmission = {
  provider: AiProvider;
  model: string;
  count: number;
};
export type AiPhase =
  | "joining"
  | "ready"
  | "running"
  | "stopping"
  | "finished"
  | "stopped"
  | "failed"
  | "interrupted";

export function aiRunActive(phase: AiPhase) {
  return (
    phase === "joining" ||
    phase === "ready" ||
    phase === "running" ||
    phase === "stopping"
  );
}

export function isAiExperiment(value: string): value is AiExperiment {
  return Object.hasOwn(aiExperiments, value);
}

export type AiRun = {
  id: string;
  code: string;
  experiment: AiExperiment;
  provider: AiProvider;
  model: string;
  count: number;
  joined: number;
  phase: AiPhase;
  startedAt: string;
  submitted: number;
  decisions: number;
  error?: string;
};

export type AiRecord = {
  at: string;
  type: string;
  student?: string;
  market?: number;
  group?: number;
  block?: number;
  round?: number;
  period?: string;
  modelDurationMs?: number;
  decision?: {
    action?: string;
    reason?: string;
    price?: number;
    choice?: number;
  };
  selectedOption?: string | { action?: string; price?: number };
  skipReason?: string;
  error?: string;
  fills?: { id: string; price: number }[];
};

export type AiConsoleView = {
  runs: AiRun[];
  records: AiRecord[];
  selected: string | null;
};
