import { shuffled } from "@/experiments/double-auction/lib/study-core";
import { randomInt } from "@/experiments/double-auction/lib/random";
import { AuctionError } from "@/lib/server/errors";
import { add } from "./numbers";
import {
  chooseMemo,
  openMemoRound,
  settleMemo,
  type MemoEntry,
  type MemoRound,
} from "./memo-v3";
import {
  choiceCount,
  choiceStride,
  continuous,
  outcome,
  isMemo,
  memoSizes,
  MEMO_PARTICIPANTS,
  type Settings,
} from "./settings";

export type Phase = "open" | "ready" | "playing" | "feedback" | "finished";
export type Seat = {
  id: string;
  group: number;
  side: "A" | "B" | null;
  byes: number;
  total: string;
};
export type Entry = {
  memo?: MemoEntry;
  opponent: string | null;
  position: "row" | "column" | null;
  choice: number | null;
  draftChoice?: number;
  submittedAutomatically?: true;
  seenAt: number | null;
  submittedAt: number | null;
  pay: string | null;
  total: string;
  status:
    | "choosing"
    | "submitted"
    | "settled"
    | "bye"
    | "timeout"
    | "unmatched"
    | "interrupted";
};
export type Round = {
  memo?: MemoRound;
  number: number;
  openedAt: number;
  shortened?: boolean;
  deadline: number;
  closedAt: number | null;
  entries: Record<string, Entry>;
};
export type Game = {
  distributed?: true;
  settings: Settings;
  phase: Phase;
  seats: Seat[];
  closedAt: number | null;
  round: Round | null;
  admission?: {
    seconds: number;
    deadline: number | null;
    remaining: number | null;
    insufficient: boolean;
  };
  pausedAt?: number | null;
  feedbackDeadline?: number;
  endedAt?: number;
  controls?: { kind: string; at: number; round: number; value?: number }[];
};
export type RunControl = {
  kind: "pause" | "resume" | "advance" | "shorten" | "end";
  round: number;
  phase: "playing" | "feedback";
  revision: number;
};
export type ParticipantAction =
  | { kind: "choose"; round: number; choice: number }
  | { kind: "draft"; round: number; choice: number };
export type Action =
  | { kind: "close" | "start"; revision?: number }
  | { kind: "timerStart"; seconds: number; revision: number }
  | { kind: "setGroups"; groups: number; revision: number }
  | {
      kind: "timerPause" | "timerResume" | "timerReset" | "reopen";
      revision: number;
    }
  | RunControl
  | ParticipantAction;
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
    k = isMemo(g.settings)
      ? MEMO_PARTICIPANTS /
        memoSizes(g.settings.memoOrder)[(g.round?.memo?.block ?? 1) - 1]
      : g.settings.groups;
  return Array.from(
    { length: k },
    (_, i) => Math.floor(n / k) + Number(i < n % k),
  );
}
export function closeAdmission(g: Game, now: number) {
  if (isMemo(g.settings) && g.seats.length !== MEMO_PARTICIPANTS)
    reject("この実験の開始には150人必要です。");
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
  g.admission = {
    ...admissionClock(g),
    deadline: null,
    remaining: null,
    insufficient: false,
  };
}
function openRound(g: Game, now: number) {
  if (isMemo(g.settings)) {
    openMemoRound(g, now);
    return;
  }
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
export function closeRound(g: Game, at: number) {
  const r = g.round!;
  r.closedAt = at;
  g.phase = r.number === g.settings.rounds ? "finished" : "feedback";
  g.feedbackDeadline = at + g.settings.feedbackSeconds * 1000;
}
export const admissionClock = (g: Game) =>
  g.admission ?? {
    seconds: 60,
    deadline: null,
    remaining: null,
    insufficient: false,
  };
export function phaseDeadline(g: Game) {
  if (g.phase === "open") return admissionClock(g).deadline;
  if (g.phase === "playing") return g.round!.deadline;
  if (g.phase === "feedback")
    return (
      g.feedbackDeadline ??
      g.round!.closedAt! + g.settings.feedbackSeconds * 1000
    );
  return null;
}
export function tick(g: Game, now: number) {
  if (g.pausedAt != null) return;
  const timer = admissionClock(g);
  if (g.phase === "open" && timer.deadline !== null && now >= timer.deadline) {
    if (
      isMemo(g.settings)
        ? g.seats.length === MEMO_PARTICIPANTS
        : groupSizes(g).every((n) => n >= 2)
    )
      closeAdmission(g, timer.deadline);
    else g.admission = { ...timer, deadline: null, insufficient: true };
  }
  const r = g.round;
  if (!r) return;
  if (g.phase === "playing" && now >= r.deadline && r.memo) {
    settleMemo(g);
    closeRound(g, r.deadline);
  }
  if (g.phase === "playing" && now >= r.deadline) {
    let submittedDraft = false;
    for (const [id, entry] of Object.entries(r.entries)) {
      if (entry.status !== "choosing" || entry.draftChoice === undefined)
        continue;
      recordChoice(g.settings, r, id, entry.draftChoice, r.deadline);
      entry.submittedAutomatically = true;
      submittedDraft = true;
    }
    if (submittedDraft)
      for (const seat of g.seats) seat.total = r.entries[seat.id].total;
    for (const e of Object.values(r.entries)) {
      if (e.status === "choosing")
        e.status = r.shortened ? "interrupted" : "timeout";
      if (e.status === "submitted")
        e.status = r.shortened ? "interrupted" : "unmatched";
    }
    closeRound(g, r.deadline);
  }
  if (g.phase === "feedback" && now >= phaseDeadline(g)!) openRound(g, now);
}
export function choose(
  g: Game,
  id: string,
  round: number,
  choice: number,
  now: number,
) {
  if (isMemo(g.settings)) {
    chooseMemo(g, id, round, choice, now);
    return;
  }
  if (!choosePair(g, g.round, id, round, choice, now)) return;
  const e = g.round!.entries[id];
  if (e.status === "settled")
    for (const player of g.seats) {
      if (player.id === id || player.id === e.opponent)
        player.total = g.round!.entries[player.id].total;
    }
  if (
    Object.values(g.round!.entries).every(
      (x) => x.status === "settled" || x.status === "bye",
    )
  )
    closeRound(g, now);
}

// Settle a pair without requiring access to the rest of the round.
export function choosePair(
  g: Pick<Game, "settings" | "phase" | "pausedAt">,
  r: Round | null,
  id: string,
  round: number,
  choice: number,
  now: number,
) {
  assertPaired(r, id, round);
  const entry = r.entries[id];
  if (entry.choice === choice) return false; // An acknowledged submission can be retried.
  checkDecision(g, r, entry, choice, now);
  recordChoice(g.settings, r, id, choice, now);
  return true;
}

type DecisionState = Pick<Game, "settings" | "phase" | "pausedAt">;

export function saveDemandDraft(
  g: DecisionState,
  r: Round | null,
  id: string,
  round: number,
  choice: number,
  now: number,
) {
  if (!continuous(g.settings)) reject("要求額の下書きは保存できません。");
  assertPaired(r, id, round);
  const entry = r.entries[id];
  checkDecision(g, r, entry, choice, now);
  if (entry.draftChoice === choice) return false;
  entry.draftChoice = choice;
  entry.seenAt ??= now;
  return true;
}

function assertPaired(
  r: Round | null,
  id: string,
  round: number,
): asserts r is Round {
  if (!r || r.number !== round || !r.entries[id]?.opponent)
    reject("現在の組合せを確認してください。");
}

function checkDecision(
  g: DecisionState,
  r: Round,
  entry: Entry,
  choice: number,
  now: number,
) {
  if (g.pausedAt != null) reject("一時停止中です。");
  if (g.phase !== "playing" || now >= r.deadline || entry.status !== "choosing")
    reject("このラウンドの回答は締め切られました。");
  const stride = choiceStride(g.settings);
  if (
    !Number.isInteger(choice) ||
    choice < 0 ||
    choice % stride !== 0 ||
    choice / stride >= choiceCount(g.settings)
  )
    reject("選択肢を確認してください。");
}

function recordChoice(
  settings: Settings,
  r: Round,
  id: string,
  choice: number,
  now: number,
) {
  const e = r.entries[id];
  delete e.draftChoice;
  e.choice = choice;
  e.submittedAt = now;
  e.seenAt ??= now;
  e.status = "submitted";
  const other = r.entries[e.opponent!];
  if (other.choice === null) return;
  const row = e.position === "row" ? e : other,
    column = e.position === "row" ? other : e;
  const { pay } = outcome(settings, row.choice!, column.choice!);
  for (const [index, entry] of [row, column].entries()) {
    entry.status = "settled";
    entry.pay = pay[index];
    entry.total = add(entry.total, entry.pay);
  }
}

export function teacherAction(
  g: Game,
  action: Exclude<Action, ParticipantAction>,
  now: number,
) {
  if (
    action.revision !== undefined &&
    action.revision !== (g.controls?.length ?? 0)
  )
    reject("操作が更新されました。");
  const timer = admissionClock(g);
  if (action.kind === "close") closeAdmission(g, now);
  else if (action.kind === "start") start(g, now);
  else if (action.kind === "reopen") {
    if (g.phase !== "ready") reject("入室受付を再開できません。");
    g.phase = "open";
    g.closedAt = null;
    for (const seat of g.seats) {
      seat.group = 0;
      seat.side = null;
    }
  } else if ("phase" in action) {
    if (
      isMemo(g.settings) &&
      (action.kind === "advance" || action.kind === "shorten")
    )
      reject("この実験の時間は変更できません。");
    if (g.phase !== action.phase || g.round?.number !== action.round)
      reject("ラウンドが更新されました。");
    if (action.kind === "pause") {
      if (g.pausedAt != null) reject("一時停止中です。");
      g.pausedAt = now;
    } else if (action.kind === "resume") {
      if (g.pausedAt == null) reject("一時停止していません。");
      const shifted = phaseDeadline(g)! + now - g.pausedAt;
      if (g.phase === "playing") g.round.deadline = shifted;
      else g.feedbackDeadline = shifted;
      g.pausedAt = null;
    } else {
      if (action.kind !== "end" && g.pausedAt != null)
        reject("一時停止中です。");
      const reducedDeadline = phaseDeadline(g)! - 30000;
      if (action.kind === "shorten" && reducedDeadline > now) {
        if (g.phase === "playing") {
          g.round.deadline = reducedDeadline;
          g.round.shortened = true;
        } else g.feedbackDeadline = reducedDeadline;
      } else if (g.phase === "playing") {
        for (const e of Object.values(g.round.entries)) {
          delete e.draftChoice;
          if (e.status === "choosing" || e.status === "submitted")
            e.status = "interrupted";
        }
        closeRound(g, now);
      } else if (action.kind !== "end") openRound(g, now);
      if (action.kind === "end") {
        g.phase = "finished";
        g.endedAt = now;
        g.pausedAt = null;
      }
    }
  } else {
    if (g.phase !== "open") reject("入室受付は終了しました。");
    switch (action.kind) {
      case "setGroups":
        if (isMemo(g.settings)) reject("この実験のグループ数は固定です。");
        if (
          !Number.isInteger(action.groups) ||
          action.groups < 1 ||
          action.groups > 32
        )
          reject("グループ数を確認してください。");
        g.settings = { ...g.settings, groups: action.groups };
        break;
      case "timerStart":
        if (
          timer.deadline !== null ||
          timer.remaining !== null ||
          !Number.isInteger(action.seconds) ||
          action.seconds < 5 ||
          action.seconds > 3600
        )
          reject("受付時間を確認してください。");
        g.admission = {
          seconds: action.seconds,
          deadline: now + action.seconds * 1000,
          remaining: null,
          insufficient: false,
        };
        break;
      case "timerPause":
        if (timer.deadline === null) reject("タイマーが開始されていません。");
        g.admission = {
          ...timer,
          deadline: null,
          remaining: Math.max(0, timer.deadline - now),
        };
        break;
      case "timerResume":
        if (timer.remaining === null)
          reject("タイマーは一時停止していません。");
        g.admission = {
          ...timer,
          deadline: now + timer.remaining,
          remaining: null,
        };
        break;
      case "timerReset":
        g.admission = {
          ...timer,
          deadline: null,
          remaining: null,
          insufficient: false,
        };
        break;
    }
  }
  (g.controls ??= []).push({
    kind: action.kind,
    at: now,
    round: "round" in action ? action.round : (g.round?.number ?? 0),
    value:
      "seconds" in action
        ? action.seconds
        : "groups" in action
          ? action.groups
          : undefined,
  });
}
