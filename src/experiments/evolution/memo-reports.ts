import { add } from "./numbers";
import type { Summary } from "./views";

type MemoRoundReport = Pick<
  Summary,
  | "round"
  | "blockRound"
  | "assigned"
  | "submitted"
  | "timeouts"
  | "counts"
  | "total"
  | "memoTransitions"
> &
  NonNullable<Summary["memoStats"]>;

export function memoRoundReports(history: Summary[], group: number) {
  const rounds = new Map<number, MemoRoundReport>();
  for (const row of history) {
    if (!row.memoStats || (group !== 0 && row.group !== group)) continue;
    let report = rounds.get(row.round);
    if (!report) {
      report = {
        round: row.round,
        blockRound: row.blockRound,
        assigned: 0,
        submitted: 0,
        timeouts: 0,
        eligible: 0,
        settledPlayers: 0,
        counts: [0, 0],
        total: row.total === null ? null : "0",
      };
      rounds.set(row.round, report);
    }
    report.assigned += row.assigned;
    report.submitted += row.submitted;
    report.timeouts += row.timeouts;
    report.eligible += row.memoStats.eligible;
    report.settledPlayers += row.memoStats.settledPlayers;
    if (report.total !== null && row.total !== null)
      report.total = add(report.total, row.total);
    for (const strategy of [0, 1])
      report.counts[strategy] += row.counts[strategy];
    if (row.memoTransitions) {
      report.memoTransitions ??= { previous: [0, 0], switched: [0, 0] };
      for (const strategy of [0, 1]) {
        report.memoTransitions.previous[strategy] +=
          row.memoTransitions.previous[strategy];
        report.memoTransitions.switched[strategy] +=
          row.memoTransitions.switched[strategy];
      }
    }
  }
  return [...rounds.values()].reverse();
}
