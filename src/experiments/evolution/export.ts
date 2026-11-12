import { csv } from "@/experiments/double-auction/lib/csv";
import type { rawRows } from "./views";
type RecordRow = ReturnType<typeof rawRows>[number] & {
  heartbeatGap: boolean | null;
};
// Explicit column order also provides a header for exports before the first round.
const fields: (keyof RecordRow)[] = [
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
export function responsesCsv(rows: RecordRow[]) {
  return csv(
    [fields, ...rows.map((row) => fields.map((field) => row[field]))],
    true,
  );
}
