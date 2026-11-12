import { shuffled } from "@/experiments/double-auction/lib/study-core";
import { randomInt } from "@/experiments/double-auction/lib/random";
import { AuctionError } from "@/lib/server/errors";
import { add } from "./numbers";
import { choices, outcome, type Settings } from "./settings";

export type Phase = "open" | "ready" | "playing" | "feedback" | "finished";
export type Seat = {
  id: string;
  group: number;
  side: "A" | "B" | null;
  byes: number;
  total: string;
};
export type Entry = {
  opponent: string | null;
  position: "row" | "column" | null;
  choice: number | null;
  seenAt: number | null;
  submittedAt: number | null;
  pay: string | null;
  total: string;
  status:
    "choosing" | "submitted" | "settled" | "bye" | "timeout" | "unmatched";
};
export type Round = {
  number: number;
  openedAt: number;
  deadline: number;
  closedAt: number | null;
  entries: Record<string, Entry>;
};
export type Game = {
  settings: Settings;
  phase: Phase;
  seats: Seat[];
  closedAt: number | null;
  round: Round | null;
};
export type Action =
  | { kind: "close" | "start" }
  | { kind: "choose"; round: number; choice: number };
export const newGame = (settings: Settings): Game => ({
  settings,
  phase: "open",
  seats: [],
  closedAt: null,
  round: null,
});
export const newSeat = (id: string): Seat => ({
  id,
  group: 0,
  side: null,
  byes: 0,
  total: "0",
});
function reject(message: string): never {
  throw new AuctionError(message, 409);
}
export function groupSizes(g: Game) {
  const n = g.seats.length,
    k = g.settings.groups;
  return Array.from(
    { length: k },
    (_, i) => Math.floor(n / k) + Number(i < n % k),
  );
}
export function closeAdmission(g: Game, now: number) {
  if (g.phase !== "open" || groupSizes(g).some((n) => n < 2))
    reject("各グループに2人以上必要です。");
  const roster = shuffled(g.seats);
  let offset = 0;
  for (const [i, size] of groupSizes(g).entries()) {
    const firstSide = g.settings.mode === "demand" ? randomInt(2) : 0;
    roster.slice(offset, offset + size).forEach((p, j) => {
      p.group = i + 1;
      p.side =
        g.settings.mode === "demand"
          ? (j + firstSide) % 2 === 0
            ? "A"
            : "B"
          : null;
    });
    offset += size;
  }
  g.phase = "ready";
  g.closedAt = now;
}
function openRound(g: Game, now: number) {
  const entries: Round["entries"] = {};
  function seat(p: Seat, opponent: string | null, position: Entry["position"]) {
    entries[p.id] = {
      opponent,
      position,
      choice: null,
      seenAt: null,
      submittedAt: null,
      pay: null,
      total: p.total,
      status: opponent ? "choosing" : "bye",
    };
    if (!opponent) p.byes++;
  }
  function match(a: Seat, b: Seat) {
    seat(a, b.id, "row");
    seat(b, a.id, "column");
  }
  // Random tie-breaking among eligible people with the fewest previous byes.
  function removeBye(pool: Seat[]) {
    const min = Math.min(...pool.map((p) => p.byes));
    const selected = shuffled(pool.filter((p) => p.byes === min))[0];
    const [p] = pool.splice(pool.indexOf(selected), 1);
    seat(p, null, null);
  }
  for (let i = 1; i <= g.settings.groups; i++) {
    const pool = shuffled(g.seats.filter((p) => p.group === i));
    if (g.settings.mode === "demand") {
      const a = pool.filter((p) => p.side === "A"),
        b = pool.filter((p) => p.side === "B");
      while (a.length !== b.length) removeBye(a.length > b.length ? a : b);
      a.forEach((p, j) => match(p, b[j]));
    } else {
      if (pool.length % 2) removeBye(pool);
      for (let j = 0; j < pool.length; j += 2) match(pool[j], pool[j + 1]);
    }
  }
  g.round = {
    number: (g.round?.number ?? 0) + 1,
    openedAt: now,
    deadline: now + g.settings.seconds * 1000,
    closedAt: null,
    entries,
  };
  g.phase = "playing";
}
export function start(g: Game, now: number) {
  if (g.phase !== "ready") reject("入室を締め切ってから開始してください。");
  openRound(g, now);
}
function closeRound(g: Game, at: number) {
  const r = g.round!;
  r.closedAt = at;
  g.phase = r.number === g.settings.rounds ? "finished" : "feedback";
}
export function tick(g: Game, now: number) {
  const r = g.round;
  if (!r) return;
  if (g.phase === "playing" && now >= r.deadline) {
    for (const e of Object.values(r.entries)) {
      if (e.status === "choosing") e.status = "timeout";
      if (e.status === "submitted") e.status = "unmatched";
    }
    closeRound(g, r.deadline);
  }
  if (
    g.phase === "feedback" &&
    now >= r.closedAt! + g.settings.feedbackSeconds * 1000
  )
    openRound(g, now);
}
export function choose(
  g: Game,
  id: string,
  round: number,
  choice: number,
  now: number,
) {
  const r = g.round,
    e = r?.entries[id];
  if (!r || r.number !== round || !e || !e.opponent)
    reject("現在の組合せを確認してください。");
  if (e.choice === choice) return; // An acknowledged submission can be retried.
  if (g.phase !== "playing" || now >= r.deadline || e.status !== "choosing")
    reject("このラウンドの回答は締め切られました。");
  if (
    !Number.isInteger(choice) ||
    choice < 0 ||
    choice >= choices(g.settings).length
  )
    reject("選択肢を確認してください。");
  e.choice = choice;
  e.submittedAt = now;
  e.seenAt ??= now;
  e.status = "submitted";
  const other = r.entries[e.opponent];
  if (other.choice === null) return;
  const row = e.position === "row" ? e : other,
    column = e.position === "row" ? other : e;
  const { pay } = outcome(g.settings, row.choice!, column.choice!);
  for (const [index, entry] of [row, column].entries()) {
    const player = g.seats.find(
      (p) => p.id === (entry === e ? id : e.opponent),
    )!;
    entry.status = "settled";
    entry.pay = pay[index];
    entry.total = add(player.total, entry.pay);
    player.total = entry.total;
  }
  if (
    Object.values(r.entries).every(
      (x) => x.status === "settled" || x.status === "bye",
    )
  )
    closeRound(g, now);
}
