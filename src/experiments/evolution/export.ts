import { csv } from "@/experiments/double-auction/lib/csv";
import type { rawRows } from "./views";
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
          "feedbackHare",
          "feedbackGroupSize",
          "feedbackHistory",
          "feedbackPriorPay",
        ]
      : standardFields;
  const values = rows.map((row) =>
    fields.map((field) =>
      field === "feedbackHistory"
        ? JSON.stringify(row.feedbackHistory)
        : row[field],
    ),
  );
  return header ? csv([fields, ...values], true) : csv(values, true).slice(1);
}
