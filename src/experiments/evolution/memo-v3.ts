import { shuffled } from "@/experiments/double-auction/lib/study-core";
import { AuctionError } from "@/lib/server/errors";
import { add, canonical } from "./numbers";
import {
  MEMO_LOCK_ROUNDS,
  MEMO_PARTICIPANTS,
  MEMO_ROUNDS,
  isMemo,
  memoAnswerMilliseconds,
  memoSizes,
} from "./settings";
import type { Entry, Game } from "./engine";

export type FeedbackPoint = { round: number; hare: number; size: number };
export type MemoEntry = {
  group: number;
  groupSize: number;
  initialChoice: 0 | 1;
  eligible: boolean;
  timedOut: boolean;
  carriedChoice: 0 | 1;
  priorPay: string | null;
  feedbackServedAt: number | null;
};
export type MemoRound = {
  block: number;
  blockRound: number;
  groupSize: number;
  feedback: Record<number, FeedbackPoint[]>;
};
export function memoGroups(g: Game, block: number) {
  const size = isMemo(g.settings)
    ? memoSizes(g.settings.memoOrder)[block - 1]
    : 0;
  if (!size || g.seats.length !== MEMO_PARTICIPANTS)
    throw new AuctionError("この実験の開始には150人必要です。", 409);
  const roster = shuffled(g.seats);
  roster.forEach((seat, i) => {
    seat.group = Math.floor(i / size) + 1;
  });
}
export function openMemoRound(g: Game, now: number) {
  if (!isMemo(g.settings)) return;
  const previous = g.round;
  const number = (previous?.number ?? 0) + 1;
  const block = Math.ceil(number / MEMO_ROUNDS);
  const blockRound = ((number - 1) % MEMO_ROUNDS) + 1;
  const groupSize = memoSizes(g.settings.memoOrder)[block - 1];
  const groupCount = MEMO_PARTICIPANTS / groupSize;
  const fresh = blockRound === 1;
  if (fresh && block > 1) memoGroups(g, block);
  const firstDeerCount =
    groupSize === 10
      ? 8
      : groupSize === 30
        ? g.settings.memoCounterbalance === "deer"
          ? 3
          : 2
        : Number(g.settings.memoCounterbalance === "deer");
  const deerGroups = new Set(
    fresh
      ? shuffled(Array.from({ length: groupCount }, (_, i) => i + 1)).slice(
          0,
          firstDeerCount,
        )
      : [],
  );
  const entries: Record<string, Entry> = {};
  const feedback: MemoRound["feedback"] = {};
  for (let group = 1; group <= groupCount; group++) {
    const seats = g.seats.filter((s) => s.group === group);
    const eligible = new Set(
      blockRound > MEMO_LOCK_ROUNDS
        ? shuffled(seats)
            .slice(0, groupSize / 5)
            .map((s) => s.id)
        : [],
    );
    const last = previous?.memo?.feedback[group] ?? [];
    feedback[group] = fresh
      ? []
      : [
          ...last,
          {
            round: blockRound - 1,
            hare: seats.filter((s) => previous?.entries[s.id].choice === 1)
              .length,
            size: groupSize,
          },
        ].slice(-20);
    for (const s of seats) {
      const prior = fresh ? undefined : previous?.entries[s.id];
      const initialChoice = fresh
        ? deerGroups.has(group)
          ? 0
          : 1
        : prior!.memo!.initialChoice;
      const carriedChoice = prior?.choice === 1 ? 1 : prior ? 0 : initialChoice;
      const canChoose = eligible.has(s.id);
      entries[s.id] = {
        opponent: null,
        position: null,
        choice: canChoose ? null : carriedChoice,
        seenAt: null,
        submittedAt: null,
        pay: null,
        total: s.total,
        status: canChoose ? "choosing" : "submitted",
        memo: {
          group,
          groupSize,
          initialChoice,
          carriedChoice,
          eligible: canChoose,
          timedOut: false,
          priorPay: prior?.pay ?? null,
          feedbackServedAt: null,
        },
      };
    }
  }
  g.round = {
    number,
    openedAt: now,
    deadline: now + memoAnswerMilliseconds(g.settings),
    closedAt: null,
    entries,
    memo: { block, blockRound, groupSize, feedback },
  };
  g.phase = "playing";
}
export function chooseMemo(
  g: Game,
  id: string,
  round: number,
  choice: number,
  now: number,
) {
  const r = g.round,
    entry = r?.entries[id];
  if (
    !r ||
    r.number !== round ||
    !entry?.memo?.eligible ||
    (choice !== 0 && choice !== 1)
  )
    throw new AuctionError("このラウンドでは変更できません。", 409);
  if (entry.submittedAt !== null && entry.choice === choice) return;
  if (
    g.pausedAt != null ||
    g.phase !== "playing" ||
    now >= r.deadline ||
    entry.status !== "choosing"
  )
    throw new AuctionError("このラウンドの回答は締め切られました。", 409);
  entry.choice = choice;
  entry.submittedAt = now;
  entry.seenAt ??= now;
  entry.status = "submitted";
}
export function settleMemo(g: Game) {
  const r = g.round!;
  const counts = new Map<number, number>();
  for (const e of Object.values(r.entries)) {
    const m = e.memo!;
    m.timedOut = m.eligible && e.submittedAt === null;
    e.choice ??= m.carriedChoice;
    if (e.choice === 0) counts.set(m.group, (counts.get(m.group) ?? 0) + 1);
  }
  for (const seat of g.seats) {
    const e = r.entries[seat.id],
      m = e.memo!;
    e.pay =
      e.choice === 1
        ? "3"
        : canonical(
            `${4 * ((counts.get(m.group) ?? 1) - 1)}/${m.groupSize - 1}`,
          );
    e.total = seat.total = add(seat.total, e.pay);
    e.status = "settled";
  }
}
