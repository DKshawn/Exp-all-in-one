import { STUDY_RULES } from "./study-rules";
import type { Institution, StudyTiming, StudyMarketView } from "./study-types";
import { STUDY_START_SECONDS } from "./study-types";
import {
  DEFAULT_STUDY_INSTITUTIONS,
  studyTemplateSideCount,
  studyPeriodAt,
} from "./study-config";
import type { RoomConfig, Phase } from "./types";

export function isCurrentStudyPeriod(
  phase: Phase,
  market: Pick<StudyMarketView, "round" | "stage">,
) {
  return (
    market.round > 0 &&
    (phase === "running" || phase === "paused") &&
    market.stage !== "waiting" &&
    market.stage !== "done"
  );
}

export function studyRemainingMs(
  phase: Phase,
  market: Pick<StudyMarketView, "deadline" | "remainingMs">,
  serverNow: number,
) {
  return phase === "running" && market.deadline !== null
    ? Math.max(0, market.deadline - serverNow)
    : market.remainingMs;
}

export function studyCountdownLabel(
  market: Pick<StudyMarketView, "stage" | "round"> &
    Partial<Pick<StudyMarketView, "institution">>,
  totalRounds: number,
) {
  if (market.stage === "call") return "次の清算まで";
  if (market.stage === "purchase") return "取引終了まで";
  if (market.stage === "offer") return "価格提示の締切まで";
  if (market.stage === "feedback")
    return market.round === totalRounds ? "実験終了まで" : "次の取引開始まで";
  if (market.stage === "countdown") return "取引開始まで";
  return "この段階の残り時間";
}

// Review the next period during the last five seconds of server-side feedback.
// CDA and institution endings retain eight seconds of results; other periods
// use a five-second Start. The trading deadline is never shortened.
export function studyPeriodTransition(
  config: RoomConfig,
  phase: Phase,
  market: StudyMarketView,
  now: number,
): { kind: "Start" | "End"; period: number; seconds: number } | null {
  if (phase !== "running" && phase !== "paused") return null;
  const remaining = studyRemainingMs(phase, market, now);
  if (market.stage === "countdown")
    return { kind: "Start", period: 1, seconds: Math.ceil(remaining / 1000) };
  if (market.stage !== "feedback") return null;
  const next =
    market.round < config.rounds
      ? studyPeriodAt(config, market.order, market.round + 1)
      : null;
  if (remaining <= STUDY_START_SECONDS * 1000 && next)
    return {
      kind: "Start",
      period: next.period,
      seconds: Math.ceil(remaining / 1000),
    };
  if (market.institution === "cda" && remaining > STUDY_START_SECONDS * 1000)
    return {
      kind: "End",
      period: market.institutionPeriod,
      seconds: Math.ceil(remaining / 1000) - STUDY_START_SECONDS,
    };
  return null;
}

export const postedPurchaseSeconds = (
  config: Pick<RoomConfig, "studyTiming" | "marketSize">,
) =>
  studyTiming(config).purchaseSeconds ??
  studyTiming(config).buyerSeconds * studyTemplateSideCount(config);

export const MAX_STAGE_SECONDS = 3600;
export const DEFAULT_STUDY_TIMING: StudyTiming = {
  cdaSeconds: STUDY_RULES.cdaSeconds,
  callSeconds: STUDY_RULES.callSeconds,
  offerSeconds: STUDY_RULES.offerSeconds,
  buyerSeconds: STUDY_RULES.buyerSeconds,
};
export const STUDY_TIMING_FIELDS = [
  { key: "cdaSeconds", institution: "cda", label: "CDA：1期の取引時間（秒）" },
  {
    key: "callSeconds",
    institution: "call",
    label: "Call Market：1回の注文受付（秒）",
  },
  {
    key: "offerSeconds",
    institution: "posted",
    label: "Posted Offer：売り手の価格提示（秒）",
  },
  {
    key: "buyerSeconds",
    institution: "posted",
    label: "Posted Offer：買い手1人の購入時間（秒）",
  },
  {
    key: "purchaseSeconds",
    institution: "posted",
    label: "Posted Offer：買い手の共通取引時間（秒）",
  },
] as const;

// Saved rooms without timing settings keep their original deadlines.
export const studyTiming = (config: Pick<RoomConfig, "studyTiming">) =>
  config.studyTiming ?? DEFAULT_STUDY_TIMING;

export function studyTimingForInstitutions(
  timing: StudyTiming,
  institutions: readonly Institution[],
) {
  const result = { ...timing };
  for (const { key, institution } of STUDY_TIMING_FIELDS)
    if (!institutions.includes(institution))
      if (key === "purchaseSeconds") delete result.purchaseSeconds;
      else result[key] = DEFAULT_STUDY_TIMING[key];
  return result;
}

export function studyTimingError(
  timing: StudyTiming,
  institutions: readonly Institution[] = DEFAULT_STUDY_INSTITUTIONS,
) {
  return STUDY_TIMING_FIELDS.filter((field) =>
    institutions.includes(field.institution),
  ).some(({ key }) => {
    const value = timing[key];
    if (key === "purchaseSeconds" && value === undefined) return false;
    return !Number.isInteger(value) || value! < 1 || value! > MAX_STAGE_SECONDS;
  })
    ? `各時間は1〜${MAX_STAGE_SECONDS}秒の整数で設定してください。`
    : "";
}
