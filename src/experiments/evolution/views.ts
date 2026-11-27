import { add } from "./numbers";
import {
  groupSizes,
  phaseDeadline,
  admissionClock,
  type Game,
  type Round,
  type Entry,
  type Seat,
} from "./engine";
import {
  choices,
  continuous,
  demandBand,
  isMemoV3,
  memoAnswerSeconds,
  MEMO_ROUNDS,
  isNeighborMemo,
  outcome,
} from "./settings";

export function personal(r: Round, id: string) {
  const e = r.entries[id],
    peer = e.status === "settled" && e.opponent ? r.entries[e.opponent] : null;
  return {
    round: r.number,
    ...(r.memo && e.memo
      ? {
          memo: {
            block: r.memo.block,
            blockRound: r.memo.blockRound,
            groupSize: r.memo.groupSize,
            initialChoice: e.memo.initialChoice,
            eligible: e.memo.eligible,
            timedOut: e.memo.timedOut,
            carriedChoice: e.memo.carriedChoice,
            priorPay: e.memo.priorPay,
            ...(e.memo.neighborhood
              ? { neighborhood: e.memo.neighborhood }
              : {}),
            feedback: e.memo.neighborhood ? [] : r.memo.feedback[e.memo.group],
          },
        }
      : {}),
    position: e.position,
    status: e.status,
    choice: e.choice,
    ...(e.draftChoice === undefined ? {} : { draftChoice: e.draftChoice }),
    pay: e.pay,
    total: e.memo?.neighborhood ? null : e.total,
    otherChoice: peer?.choice ?? null,
    otherPay: peer?.pay ?? null,
  };
}
export function summaries(g: Game, r: Round, includeMemoStats = false) {
  const sizes = r.memo
    ? Object.values(r.memo.feedback).map(() => r.memo!.groupSize)
    : groupSizes(g);
  return sizes.map((_, i) => {
    const seats = g.seats.filter(
      (s) => (r.entries[s.id]?.memo?.group ?? s.group) === i + 1,
    );
    const slider = continuous(g.settings);
    const counts = (side: Seat["side"]) => {
      const counts = Array<number>(
        slider ? 10 : choices(g.settings).length,
      ).fill(0);
      for (const s of seats)
        if (
          (side === null || s.side === side) &&
          (!r.memo || r.closedAt !== null)
        ) {
          const c = r.entries[s.id].choice;
          if (c !== null) counts[slider ? demandBand(c) : c]++;
        }
      return counts;
    };
    const pairs: Record<string, number> = {};
    let eligible = 0,
      settledPlayers = 0,
      settled = 0,
      agreements = 0,
      total = "0",
      byes = 0,
      timeouts = 0,
      seen = 0,
      submitted = 0;
    const memoTransitions =
      includeMemoStats && r.memo && r.memo.blockRound > 1 && r.closedAt !== null
        ? { previous: [0, 0], switched: [0, 0] }
        : null;
    for (const p of seats) {
      const e = r.entries[p.id];
      if (e.seenAt !== null) seen++;
      if (e.memo ? e.submittedAt !== null : e.choice !== null) submitted++;
      if (e.status === "bye") byes++;
      if (e.status === "timeout" || e.memo?.timedOut) timeouts++;
      if (e.pay !== null) total = add(total, e.pay);
      const memo = e.memo;
      if (includeMemoStats && memo) {
        if (memo.eligible) eligible++;
        if (e.status === "settled") {
          settledPlayers++;
          if (memoTransitions && (e.choice === 0 || e.choice === 1)) {
            const previous = memo.carriedChoice;
            memoTransitions.previous[previous]++;
            if (e.choice !== previous) memoTransitions.switched[previous]++;
          }
        }
      }
      if (e.status !== "settled" || e.position !== "row") continue;
      const right = r.entries[e.opponent!].choice!;
      if (!slider) {
        const key = e.choice + "," + right;
        pairs[key] = (pairs[key] ?? 0) + 1;
      }
      settled++;
      if (outcome(g.settings, e.choice!, right).agreement) agreements++;
    }
    return {
      round: r.number,
      ...(r.memo ? { block: r.memo.block, blockRound: r.memo.blockRound } : {}),
      ...(includeMemoStats && r.memo
        ? { memoStats: { eligible, settledPlayers } }
        : {}),
      ...(memoTransitions && settledPlayers ? { memoTransitions } : {}),
      group: i + 1,
      assigned: seats.length,
      paired: r.memo ? 0 : seats.length - byes,
      seen,
      submitted,
      counts: counts(null),
      a: g.settings.mode === "demand" ? counts("A") : null,
      b: g.settings.mode === "demand" ? counts("B") : null,
      pairs,
      settled,
      agreements,
      total: isNeighborMemo(g.settings) ? null : total,
      byes,
      timeouts,
    };
  });
}
export type Summary = ReturnType<typeof summaries>[number];
export type Personal = ReturnType<typeof personal>;
export function baseView(g: Game, code: string, title: string, now: number) {
  return {
    code,
    title,
    settings: g.settings,
    phase: g.phase,
    round: g.round?.number ?? 0,
    ...(g.round?.memo
      ? { memoBlock: g.round.memo.block, memoRound: g.round.memo.blockRound }
      : {}),
    now,
    deadline: phaseDeadline(g),
    pausedAt: g.pausedAt ?? null,
    admission: admissionClock(g),
  };
}
export function teacherView(
  g: Game,
  base: ReturnType<typeof baseView>,
  history: Summary[],
) {
  const sizes = groupSizes(g);
  const sides = sizes.map(
    (_, i) => g.seats.filter((p) => p.group === i + 1 && p.side === "A").length,
  );
  return {
    ...base,
    role: "teacher" as const,
    sizes,
    sides,
    revision: g.controls?.length ?? 0,
    seats: g.round
      ? []
      : g.seats.map((seat, i) => ({
          number: i + 1,
          group: seat.group,
          side: seat.side,
        })),
    count: g.seats.length,
    history: [
      ...(g.round?.memo
        ? history.filter((item) => item.block === g.round!.memo!.block)
        : history),
      ...(g.round ? summaries(g, g.round, true) : []),
    ],
  };
}
export function studentView(
  g: Game,
  base: ReturnType<typeof baseView>,
  id: string,
  history: Personal[],
) {
  const seat = g.seats.find((p) => p.id === id)!;
  return {
    ...base,
    settings: isNeighborMemo(base.settings)
      ? { ...base.settings, memoCounterbalance: undefined }
      : base.settings,
    role: "student" as const,
    group: seat.group,
    side: seat.side,
    total: isNeighborMemo(g.settings) ? null : seat.total,
    current: g.round ? personal(g.round, id) : null,
    history: isNeighborMemo(g.settings)
      ? []
      : g.round?.memo
        ? history.filter(
            (item) => item.round > (g.round!.memo!.block - 1) * MEMO_ROUNDS,
          )
        : history,
  };
}
export type View =
  ReturnType<typeof studentView> | ReturnType<typeof teacherView>;
export function rawRows(g: Game, r: Round, code: string) {
  return g.seats.map((s) => {
    const e: Entry = r.entries[s.id],
      p = e.opponent ? r.entries[e.opponent] : null;
    return {
      room: code,
      group: e.memo?.group ?? s.group,
      round: r.number,
      ...(r.memo && e.memo
        ? {
            block: r.memo.block,
            blockRound: r.memo.blockRound,
            groupSize: r.memo.groupSize,
            initialChoice: e.memo.initialChoice,
            eligible: e.memo.eligible,
            timedOut: e.memo.timedOut,
            carriedChoice: e.memo.carriedChoice,
            feedbackServedAt: e.memo.feedbackServedAt,
            ...(e.memo.neighborhood && {
              scoringStatus: "pending" as const,
              ringSeat: e.memo.neighborhood.seat,
              neighborChoices: e.memo.neighborhood.previous,
            }),
            ...(!e.memo.neighborhood && {
              feedbackHare: r.memo.feedback[e.memo.group].at(-1)?.hare ?? null,
              feedbackGroupSize:
                r.memo.feedback[e.memo.group].at(-1)?.size ?? null,
              feedbackHistory: r.memo.feedback[e.memo.group],
              feedbackPriorPay: e.memo.priorPay,
            }),
            ...(isMemoV3(g.settings)
              ? { memoAnswerSeconds: memoAnswerSeconds(g.settings) }
              : {}),
          }
        : {}),
      id: s.id,
      side: s.side,
      position: e.position,
      opponent: e.opponent,
      choice: e.choice,
      opponentChoice: p?.choice ?? null,
      ...(continuous(g.settings)
        ? {
            demand: e.choice === null ? null : e.choice / 1000,
            opponentDemand: p?.choice == null ? null : p.choice / 1000,
            submissionSource:
              e.choice === null
                ? null
                : e.submittedAutomatically
                  ? "deadline"
                  : "manual",
          }
        : {}),
      pay: e.pay,
      opponentPay: p?.pay ?? null,
      total: e.memo?.neighborhood ? null : e.total,
      status: e.status,
      openedAt: r.openedAt,
      deadline: r.deadline,
      closedAt: r.closedAt,
      seenAt: e.seenAt,
      submittedAt: e.submittedAt,
      opponentSubmittedAt: p?.submittedAt ?? null,
    };
  });
}
