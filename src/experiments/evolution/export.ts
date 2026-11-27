import { csv } from "@/experiments/double-auction/lib/csv";
import type { rawRows } from "./views";
import { isMemoV3, memoAnswerSeconds, type Settings } from "./settings";

export function exportSettings(settings: Settings) {
  return isMemoV3(settings)
    ? { ...settings, memoAnswerSeconds: memoAnswerSeconds(settings) }
    : settings;
}

type RecordRow = ReturnType<typeof rawRows>[number] & {
  heartbeatGap: boolean | null;
};
// Explicit column order also provides a header for exports before the first round.
const standardFields: (keyof RecordRow)[] = [
  "room",
  "group",
  "round",
  "id",
  "side",
  "position",
  "opponent",
  "choice",
  "opponentChoice",
  "pay",
  "opponentPay",
  "total",
  "status",
  "openedAt",
  "deadline",
  "closedAt",
  "seenAt",
  "submittedAt",
  "opponentSubmittedAt",
  "heartbeatGap",
];
export function responsesCsv(
  rows: RecordRow[],
  header = true,
  slider = rows.some((row) => row.demand !== undefined),
  memo = rows.some((row) => row.block !== undefined),
  neighbors = rows.some((row) => row.ringSeat !== undefined),
) {
  const fields: (keyof RecordRow)[] = slider
    ? [...standardFields, "demand", "opponentDemand", "submissionSource"]
    : memo
      ? [
          ...standardFields,
          "block",
          "blockRound",
          "groupSize",
          "initialChoice",
          "eligible",
          "timedOut",
          "carriedChoice",
          "feedbackServedAt",
          ...(neighbors
            ? (["scoringStatus", "ringSeat", "neighborChoices"] as const)
            : ([
                "feedbackHare",
                "feedbackGroupSize",
                "feedbackHistory",
                "feedbackPriorPay",
                "memoAnswerSeconds",
              ] as const)),
        ]
      : standardFields;
  const values = rows.map((row) =>
    fields.map((field) =>
      field === "feedbackHistory" || field === "neighborChoices"
        ? JSON.stringify(row[field])
        : row[field],
    ),
  );
  return header ? csv([fields, ...values], true) : csv(values, true).slice(1);
}
