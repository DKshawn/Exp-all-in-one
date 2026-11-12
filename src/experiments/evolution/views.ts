import { add } from "./numbers";
import {
  groupSizes,
  type Game,
  type Round,
  type Entry,
  type Seat,
} from "./engine";
import { choices, outcome } from "./settings";

export function personal(r: Round, id: string) {
  const e = r.entries[id],
    peer = e.status === "settled" ? r.entries[e.opponent!] : null;
  return {
    round: r.number,
    position: e.position,
    status: e.status,
    choice: e.choice,
    pay: e.pay,
    total: e.total,
    otherChoice: peer?.choice ?? null,
    otherPay: peer?.pay ?? null,
  };
}
export function summaries(g: Game, r: Round) {
  return groupSizes(g).map((_, i) => {
    const seats = g.seats.filter((s) => s.group === i + 1);
    const options = choices(g.settings);
    const counts = (side: Seat["side"]) => {
      const counts = options.map(() => 0);
      for (const s of seats)
        if (side === null || s.side === side) {
          const c = r.entries[s.id].choice;
          if (c !== null) counts[c]++;
        }
      return counts;
    };
    const pairs: Record<string, number> = {};
    let settled = 0,
      agreements = 0,
      total = "0",
      byes = 0,
      timeouts = 0,
      seen = 0,
      submitted = 0;
    for (const p of seats) {
      const e = r.entries[p.id];
      if (e.seenAt !== null) seen++;
      if (e.choice !== null) submitted++;
      if (e.status === "bye") byes++;
      if (e.status === "timeout") timeouts++;
      if (e.pay !== null) total = add(total, e.pay);
      if (e.status !== "settled" || e.position !== "row") continue;
      const right = r.entries[e.opponent!].choice!;
      const key = e.choice + "," + right;
      pairs[key] = (pairs[key] ?? 0) + 1;
      settled++;
      if (outcome(g.settings, e.choice!, right).agreement) agreements++;
    }
    return {
      round: r.number,
      group: i + 1,
      assigned: seats.length,
      paired: seats.length - byes,
      seen,
      submitted,
      counts: counts(null),
      a: g.settings.mode === "demand" ? counts("A") : null,
      b: g.settings.mode === "demand" ? counts("B") : null,
      pairs,
      settled,
      agreements,
      total,
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
    now,
    deadline:
      g.phase === "playing"
        ? g.round!.deadline
        : g.phase === "feedback"
          ? g.round!.closedAt! + g.settings.feedbackSeconds * 1000
          : null,
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
    count: g.seats.length,
    history: [...history, ...(g.round ? summaries(g, g.round) : [])],
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
    role: "student" as const,
    group: seat.group,
    side: seat.side,
    total: seat.total,
    current: g.round ? personal(g.round, id) : null,
    history,
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
      group: s.group,
      round: r.number,
      id: s.id,
      side: s.side,
      position: e.position,
      opponent: e.opponent,
      choice: e.choice,
      opponentChoice: p?.choice ?? null,
      pay: e.pay,
      opponentPay: p?.pay ?? null,
      total: e.total,
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
