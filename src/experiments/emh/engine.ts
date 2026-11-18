import type {
  Action,
  Actor,
  AuditEvent,
  Config,
  Participant,
  Quote,
  PeriodResult,
  Room,
  RoomView,
  Side,
} from "./types";
import {
  initialUnitsFor,
  MAX_MARKET_SIZE,
  MAX_EXP2_MARKET_SIZE,
} from "./settings";

import {
  canSellAtMarket,
  standingQuotes,
  updateStandingQuote,
  visiblePriceLevels,
} from "./order-book";

export const START_COUNTDOWN_SECONDS = 5;

export class RuleError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}
function requireRule(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RuleError(message);
}
export const unitKey = (r: Pick<Room, "year" | "period" | "unit">) =>
  `${r.year}-${r.period}-${r.unit}`;
export const phaseKey = (
  r: Pick<Room, "year" | "period" | "status" | "pausedAt" | "reveal">,
) => `${r.year}-${r.period}-${r.status}-${r.pausedAt ?? "live"}-${r.reveal}`;
export function benchmarks(config: Config) {
  return {
    naiveA: Math.max(...config.dividends.map((d) => d.a + d.b)),
    perfectA:
      Math.max(...config.dividends.map((d) => d.a)) +
      Math.max(...config.dividends.map((d) => d.b)),
    perfectB: Math.max(...config.dividends.map((d) => d.b)),
  };
}
/** Draw once before trading; every draw uses the configured state distribution. */
export function drawStates(
  prior: number[],
  rounds: number,
  random: () => number = Math.random,
): number[] {
  const total = prior.reduce((sum, probability) => sum + probability, 0);
  requireRule(
    prior.length === 3 &&
      prior.every((p) => Number.isFinite(p) && p >= 0) &&
      Math.abs(total - 1) < 0.000001 &&
      Number.isInteger(rounds) &&
      rounds > 0,
    "状態の確率を確認してください。",
  );
  return Array.from({ length: rounds }, () => {
    const draw = random();
    requireRule(
      Number.isFinite(draw) && draw >= 0 && draw < 1,
      "抽選に失敗しました。",
    );
    const value = draw * total;
    let cumulative = 0;
    for (let i = 0; i < prior.length; i++) {
      cumulative += prior[i]!;
      if (value < cumulative) return i + 1;
    }
    return prior.findLastIndex((p) => p > 0) + 1;
  });
}
function exp2Prices(room: Room) {
  const states = room.config.states!;
  const state = states.outcomes[room.year - 1]!;
  const expected = states.dividends.map((values) =>
    values.reduce((sum, value, i) => sum + value * states.prior[i]!, 0),
  );
  const informed = states.dividends.map((values) => values[state - 1]!);
  const hasInformation = room.year >= (room.config.insiderStartRound ?? 3);
  const hasInsider = hasInformation && room.participants.some((p) => p.insider);
  const pi = Math.max(
    ...room.participants.map((p) =>
      hasInformation && p.insider
        ? informed[p.type! - 1]!
        : expected[p.type! - 1]!,
    ),
  );
  const re = Math.max(
    ...room.participants.map((p) =>
      hasInsider ? informed[p.type! - 1]! : expected[p.type! - 1]!,
    ),
  );
  return { state, pi, re };
}
export function newRoom(
  code: string,
  config: Config,
  now: number,
  teacherPasswordHash = "",
  teacherTokenHash = "",
): Room {
  return {
    code,
    schemaVersion: 1,
    config: structuredClone(config),
    createdAt: now,
    revision: 0,
    teacherPasswordHash,
    teacherTokenHash,
    participants: [],
    status: "lobby",
    year: 1,
    period: "A",
    unit: 0,
    emptyUnits: 0,
    nominatedSeat: null,
    countdownEndsAt: null,
    periodEndsAt: null,
    unitEndsAt: null,
    breakEndsAt: null,
    pausedAt: null,
    bid: null,
    ask: null,
    queuedQuotes: { bid: [], ask: [] },
    trades: [],
    results: [],
    events: [],
    reveal: false,
  };
}
export function record(
  room: Room,
  kind: string,
  actor: string,
  now: number,
  details: AuditEvent["details"] = {},
) {
  room.revision++;
  room.events.push({
    sequence: room.events.length + 1,
    at: now,
    kind,
    actor,
    details,
  });
}
export function addParticipant(
  room: Room,
  person: Pick<
    Participant,
    "id" | "name" | "studentId" | "pinHash" | "tokenHash"
  >,
  now: number,
) {
  requireRule(
    room.status === "lobby",
    "受付は終了しました。登録済みの参加者は再入室できます。",
  );
  requireRule(
    room.participants.length <
      (room.config.experiment === "exp2"
        ? MAX_EXP2_MARKET_SIZE
        : MAX_MARKET_SIZE),
    "この市場は定員に達しています。",
  );
  requireRule(
    !room.participants.some((p) => p.studentId === person.studentId),
    "この参加者番号は登録済みです。PINを確認してください。",
  );
  room.participants.push({
    ...person,
    seat: null,
    type: null,
    holdings: 0,
    cash: 0,
    dividend: 0,
    totalProfit: 0,
    joinedAt: now,
  });
  record(room, "joined", person.id, now);
}
function beginUnit(room: Room, now: number, random: () => number) {
  room.unit++;
  // Catch up overdue legacy units under their original expiry rule before upgrading.
  if (!room.queuedQuotes) {
    room.bid = null;
    room.ask = null;
  }
  room.unitEndsAt = Math.min(
    now + room.config.unitSeconds * 1000,
    room.periodEndsAt!,
  );
  room.nominatedSeat =
    room.participants[Math.floor(random() * room.participants.length)]!.seat;
  record(room, "unit-started", "system", now, {
    unit: room.unit,
    nominatedSeat: room.nominatedSeat,
    year: room.year,
    period: room.period,
  });
}
function beginPeriod(room: Room, now: number, random: () => number) {
  room.status = "trading";
  room.emptyUnits = 0;
  room.unit = 0;
  room.periodEndsAt = now + room.config.periodSeconds * 1000;
  room.breakEndsAt = null;
  record(room, "period-started", "system", now, {
    year: room.year,
    period: room.period,
  });
  beginUnit(room, now, random);
}
function resetYear(room: Room) {
  room.period = "A";
  for (const p of room.participants) {
    p.holdings = initialUnitsFor(room.config);
    p.cash = 0;
    p.dividend = 0;
  }
}
function beginYear(room: Room, now: number, random: () => number) {
  resetYear(room);
  beginPeriod(room, now, random);
}
export function endPeriod(
  room: Room,
  now: number,
  reason: PeriodResult["reason"],
  random: () => number = Math.random,
) {
  requireRule(
    room.status === "trading" && room.pausedAt === null,
    "取引中の期だけ終了できます。",
  );
  const period = room.period;
  const lastPeriodOfYear =
    period === "B" ||
    room.config.experiment === "exp2" ||
    reason === "teacher-finish";
  const trades = room.trades.filter(
    (t) => t.year === room.year && t.period === period,
  );
  const payouts = room.participants.map((p) => {
    const d = room.config.dividends[p.type! - 1];
    const perUnit =
      room.config.experiment === "exp2"
        ? room.config.states!.dividends[p.type! - 1]![
            exp2Prices(room).state - 1
          ]!
        : period === "A"
          ? d!.a
          : d!.b;
    const dividend = p.holdings * perUnit;
    p.dividend += dividend;
    if (lastPeriodOfYear) p.totalProfit += p.cash + p.dividend;
    return {
      participantId: p.id,
      seat: p.seat!,
      holdings: p.holdings,
      perUnit,
      dividend,
      cash: p.cash,
      yearProfit: p.cash + p.dividend,
    };
  });
  const actualDividend = payouts.reduce((s, p) => s + p.dividend, 0);
  const maxDividend =
    room.participants.length *
    initialUnitsFor(room.config) *
    Math.max(...payouts.map((p) => p.perUnit));
  const initialDividend = room.participants.reduce(
    (s, p) =>
      s +
      initialUnitsFor(room.config) *
        (room.config.experiment === "exp2"
          ? room.config.states!.dividends[p.type! - 1]![
              exp2Prices(room).state - 1
            ]!
          : period === "A"
            ? room.config.dividends[p.type! - 1]!.a
            : room.config.dividends[p.type! - 1]!.b),
    0,
  );
  const meanPrice = trades.length
    ? trades.reduce((s, t) => s + t.price, 0) / trades.length
    : null;
  const ref =
    room.config.experiment === "exp2" ? null : benchmarks(room.config);
  const prices = room.config.experiment === "exp2" ? exp2Prices(room) : null;
  room.results.push({
    ...(prices
      ? { state: prices.state, piPrice: prices.pi, rePrice: prices.re }
      : {}),
    year: room.year,
    period,
    endedAt: now,
    reason,
    payouts,
    volume: trades.length,
    meanPrice,
    priceRatio:
      meanPrice === null ||
      (prices ? prices.re : period === "A" ? ref!.perfectA : ref!.perfectB) ===
        0
        ? null
        : meanPrice /
          (prices ? prices.re : period === "A" ? ref!.perfectA : ref!.perfectB),
    actualDividend,
    maxDividend,
    initialDividend,
    allocationEfficiency:
      maxDividend === 0 ? null : actualDividend / maxDividend,
    gainEfficiency:
      maxDividend === initialDividend
        ? null
        : (actualDividend - initialDividend) / (maxDividend - initialDividend),
  });
  room.bid = null;
  room.ask = null;
  if (room.queuedQuotes) room.queuedQuotes = { bid: [], ask: [] };
  room.unitEndsAt = null;
  room.periodEndsAt = null;
  room.nominatedSeat = null;
  record(room, "period-ended", "system", now, {
    year: room.year,
    period,
    reason,
    actualDividend,
  });
  if (!lastPeriodOfYear) {
    room.period = "B";
    beginPeriod(room, now, random);
  } else {
    for (const p of room.participants) p.holdings = 0;
    if (room.year === room.config.rounds || reason === "teacher-finish") {
      room.status = "completed";
      room.breakEndsAt = null;
    } else {
      room.status = "break";
      room.breakEndsAt = now + room.config.breakSeconds * 1000;
    }
  }
}
/** Deadlines are persisted. Reconnection catches up at each original deadline, never at client time. */
export function advanceClock(
  room: Room,
  now: number,
  random: () => number = Math.random,
) {
  advanceDeadlines(room, now, random);
  if (!room.queuedQuotes && room.status !== "completed") {
    room.queuedQuotes = { bid: [], ask: [] };
    record(room, "order-book-upgraded", "system", now, {
      year: room.year,
      period: room.period,
      unit: room.unit,
    });
  }
}

function advanceDeadlines(room: Room, now: number, random: () => number) {
  if (
    room.pausedAt !== null ||
    room.status === "lobby" ||
    room.status === "completed"
  )
    return;
  for (let i = 0; i < 1000; i++) {
    if (room.status === "countdown") {
      const at = room.countdownEndsAt;
      if (at == null || now < at) return;
      room.countdownEndsAt = null;
      beginPeriod(room, at, random);
      continue;
    }
    if (room.status === "break") {
      if (now < room.breakEndsAt!) return;
      const at = room.breakEndsAt!;
      room.year++;
      beginYear(room, at, random);
      continue;
    }
    if (room.status !== "trading") return;
    if (room.unitEndsAt! <= now && room.unitEndsAt! < room.periodEndsAt!) {
      const at = room.unitEndsAt!;
      room.emptyUnits++;
      record(room, "unit-expired", "system", at, {
        year: room.year,
        period: room.period,
        unit: room.unit,
      });
      if (room.emptyUnits >= (room.config.emptyUnitsLimit ?? 2))
        endPeriod(room, at, "inactivity", random);
      else beginUnit(room, at, random);
      continue;
    }
    if (room.periodEndsAt! <= now) {
      endPeriod(room, room.periodEndsAt!, "deadline", random);
      continue;
    }
    return;
  }
  throw new Error("Clock transition limit exceeded");
}
function recordQuote(
  room: Room,
  participant: Participant,
  side: Side,
  price: number,
  now: number,
): Quote {
  const quote = {
    id: `q${room.revision + 1}`,
    participantId: participant.id,
    seat: participant.seat!,
    price,
    at: now,
  };
  record(room, "quote-submitted", participant.id, now, {
    quoteId: quote.id,
    side,
    price,
    year: room.year,
    period: room.period,
    unit: room.unit,
  });
  return quote;
}

function settle(
  room: Room,
  taker: Participant,
  restingSide: Side,
  quote: Quote,
  now: number,
  random: () => number,
  limitPrice?: number,
) {
  requireRule(
    quote.participantId !== taker.id,
    "自分の反対側の提示を取り消してください。",
  );
  const maker = room.participants.find((p) => p.id === quote.participantId)!;
  const buying = restingSide === "ask";
  const buyer = buying ? taker : maker;
  const seller = buying ? maker : taker;
  const buyerId = buyer.id;
  const sellerId = seller.id;
  const price = quote.price;
  requireRule(seller.holdings > 0, "保有証券が不足しています。");
  if (!buying && limitPrice === undefined) {
    const hasAsk = standingQuotes(room, "ask").some(
      (order) => order.participantId === sellerId,
    );
    requireRule(
      canSellAtMarket(seller.holdings, hasAsk),
      "売り指値注文に証券を使用しています。先に注文を取り消してください。",
    );
  }

  if (limitPrice !== undefined) {
    const side = buying ? "bid" : "ask";
    recordQuote(room, taker, side, limitPrice, now);
    updateStandingQuote(room, side, taker.id);
  }
  updateStandingQuote(room, restingSide, maker.id);
  buyer.holdings++;
  seller.holdings--;
  buyer.cash -= price;
  seller.cash += price;
  room.trades.push({
    id: `t${room.trades.length + 1}`,
    sequence: room.trades.length + 1,
    year: room.year,
    period: room.period,
    unit: room.unit,
    buyerId,
    sellerId,
    buyerSeat: buyer.seat!,
    sellerSeat: seller.seat!,
    price,
    at: now,
  });
  record(room, "traded", buyerId, now, {
    restingQuoteId: quote.id,
    sellerId,
    price,
    year: room.year,
    period: room.period,
    unit: room.unit,
  });
  room.emptyUnits = 0;
  beginUnit(room, now, random);
}
export function assignParticipants(
  room: Room,
  random: () => number = Math.random,
) {
  requireRule(room.status === "lobby", "開始後は割り当てを変更できません。");
  const counts =
    room.typeCounts ??
    Array.from(
      { length: 3 },
      (_, i) =>
        Math.floor(room.participants.length / 3) +
        (i < room.participants.length % 3 ? 1 : 0),
    );
  requireRule(
    counts.length === 3 &&
      counts.every((n) => Number.isInteger(n) && n > 0) &&
      counts.reduce((a, b) => a + b, 0) === room.participants.length,
    "タイプの割り当てを確認してください。",
  );
  const seats = Array.from(
    { length: room.participants.length },
    (_, i) => i + 1,
  );
  for (let i = seats.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [seats[i], seats[j]] = [seats[j]!, seats[i]!];
  }
  room.participants.forEach((p, i) => {
    p.seat = seats[i]!;
    p.type =
      p.seat <= counts[0]! ? 1 : p.seat <= counts[0]! + counts[1]! ? 2 : 3;
  });
  if (room.config.experiment === "exp2") {
    // Seats are public, so type assignments must not be derivable from them.
    const types = counts.flatMap(
      (count, index) => Array(count).fill(index + 1) as number[],
    );
    for (let i = types.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [types[i], types[j]] = [types[j]!, types[i]!];
    }
    room.participants.forEach((p, i) => {
      p.type = types[i]!;
    });
    for (const type of [1, 2, 3]) {
      const group = room.participants.filter((p) => p.type === type);
      for (let i = group.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [group[i], group[j]] = [group[j]!, group[i]!];
      }
      group.forEach((p, i) => {
        p.insider = i < (room.config.insiderCountPerType ?? 2);
      });
    }
  }
}
export function act(
  room: Room,
  actor: Actor,
  action: Action,
  now: number,
  random: () => number = Math.random,
) {
  advanceClock(room, now, random);
  if (
    action.kind === "quote" ||
    action.kind === "accept" ||
    action.kind === "cancel"
  ) {
    requireRule(actor.role === "student", "学生として入室してください。");
    requireRule(
      room.status === "trading" && room.pausedAt === null,
      "現在は取引できません。",
    );
    requireRule(
      action.unitKey === unitKey(room),
      "取引が切り替わりました。画面を確認してもう一度操作してください。",
    );
    const p = room.participants.find((p) => p.id === actor.participantId);
    requireRule(p, "参加者が見つかりません。");
    const side = action.side;
    if (action.kind === "cancel") {
      const quote = standingQuotes(room, side).find(
        (order) => order.id === action.quoteId,
      );
      requireRule(
        quote && quote.participantId === p.id,
        "この提示は取り消せません。",
      );
      const price = quote.price;
      updateStandingQuote(room, side, p.id);
      record(room, "quote-cancelled", p.id, now, {
        quoteId: quote.id,
        side,
        price,
        year: room.year,
        period: room.period,
        unit: room.unit,
      });
      return;
    }
    if (action.kind === "accept") {
      const quote = room[side];
      requireRule(
        quote?.id === action.quoteId,
        "提示が更新されました。新しい価格を確認してください。",
      );
      const accepted = {
        side: side === "ask" ? "bid" : "ask",
        price: quote.price,
        year: room.year,
        period: room.period,
        unit: room.unit,
      };
      settle(room, p, side, quote, now, random);
      record(room, "quote-accepted", p.id, now, accepted);
      return;
    }
    requireRule(
      Number.isSafeInteger(action.price) &&
        action.price >= 1 &&
        action.price <= 100000,
      "価格は1〜100,000の整数で入力してください。",
    );
    if (side === "ask")
      requireRule(p.holdings > 0, "保有証券がないため売れません。");
    const existing = standingQuotes(room, side).find(
      (order) => order.participantId === p.id,
    );
    // An unchanged limit retains its place at this price.
    if (existing?.price === action.price) return;
    const otherSide: Side = side === "bid" ? "ask" : "bid";
    const opposing = room[otherSide];
    if (
      opposing &&
      (side === "bid"
        ? action.price >= opposing.price
        : action.price <= opposing.price)
    ) {
      settle(room, p, otherSide, opposing, now, random, action.price);
    } else {
      const quote = recordQuote(room, p, side, action.price, now);
      updateStandingQuote(room, side, p.id, quote);
    }
    return;
  }
  requireRule(actor.role === "teacher", "教員の操作です。");
  requireRule(
    action.expectedPhase === phaseKey(room),
    "進行が更新されました。確認してもう一度操作してください。",
  );
  switch (action.kind) {
    case "start": {
      requireRule(room.status === "lobby", "この実験は開始済みです。");
      requireRule(room.participants.length >= 3, "3人以上の参加者が必要です。");
      if (room.participants.every((p) => p.seat === null && p.type === null)) {
        assignParticipants(room, random);
      }
      const assignedCounts = [1, 2, 3].map(
        (type) => room.participants.filter((p) => p.type === type).length,
      );
      requireRule(
        assignedCounts.every(
          (n, i) =>
            n > 0 &&
            (room.typeCounts === undefined || room.typeCounts[i] === n),
        ) &&
          room.participants.every(
            (p) =>
              Number.isInteger(p.seat) &&
              p.seat! >= 1 &&
              p.seat! <= room.participants.length,
          ) &&
          new Set(room.participants.map((p) => p.seat)).size ===
            room.participants.length,
        "タイプの割り当てを確認してください。",
      );
      if (
        room.config.experiment === "exp2" &&
        room.config.states?.outcomes.length === 0
      ) {
        room.config.states.outcomes = drawStates(
          room.config.states.prior,
          room.config.rounds,
          random,
        );
      }
      resetYear(room);
      room.status = "countdown";
      room.countdownEndsAt = now + START_COUNTDOWN_SECONDS * 1000;
      record(room, "start-countdown", "system", now, {
        startsAt: room.countdownEndsAt,
      });
      break;
    }
    case "pause":
      requireRule(
        (room.status === "countdown" ||
          room.status === "trading" ||
          room.status === "break") &&
          room.pausedAt === null,
        "一時停止できません。",
      );
      room.pausedAt = now;
      break;
    case "resume": {
      requireRule(room.pausedAt !== null, "一時停止していません。");
      const delta = now - room.pausedAt;
      if (room.countdownEndsAt != null) room.countdownEndsAt += delta;
      if (room.periodEndsAt !== null) room.periodEndsAt += delta;
      if (room.unitEndsAt !== null) room.unitEndsAt += delta;
      if (room.breakEndsAt !== null) room.breakEndsAt += delta;
      room.pausedAt = null;
      break;
    }
    case "end-period":
      endPeriod(room, now, "teacher", random);
      break;
    case "finish":
      requireRule(
        room.status === "countdown" ||
          room.status === "trading" ||
          room.status === "break",
        "実施中の実験だけ終了できます。",
      );
      room.pausedAt = null;
      if (room.status === "trading") {
        endPeriod(room, now, "teacher-finish", random);
      } else {
        room.countdownEndsAt = null;
        room.breakEndsAt = null;
        room.status = "completed";
        for (const p of room.participants) p.holdings = 0;
      }
      break;
    case "next-year":
      requireRule(
        room.status === "break" && room.pausedAt === null,
        "休憩中だけ次のラウンドへ進めます。",
      );
      room.year++;
      beginYear(room, now, random);
      break;
    case "reveal":
      requireRule(room.status === "completed", "実験終了後に公開できます。");
      room.reveal = true;
      break;
  }
  record(room, action.kind, "teacher", now);
}
/** Reconstruct the student's last quote without exposing the private audit log. */
function ownQuoteState(
  room: Room,
  participantId: string | undefined,
  side: Side,
): RoomView["ownQuotes"]["bid"] {
  if (!participantId) return { status: "none", price: null };
  const current = standingQuotes(room, side).find(
    (quote) => quote.participantId === participantId,
  );
  if (current)
    return { status: "active", price: current.price, quoteId: current.id };
  const last = room.events.findLast((event) =>
    event.kind === "traded"
      ? (side === "bid" ? event.actor : event.details.sellerId) ===
        participantId
      : event.actor === participantId &&
        event.details.side === side &&
        (event.kind === "quote-submitted" ||
          event.kind === "quote-cancelled" ||
          event.kind === "quote-accepted"),
  );
  if (!last || last.details.year !== room.year)
    return { status: "none", price: null };
  const price =
    typeof last.details.price === "number" ? last.details.price : null;
  if (last.kind === "quote-cancelled") return { status: "cancelled", price };
  if (last.kind === "quote-accepted" || last.kind === "traded")
    return { status: "filled", price };
  return {
    status:
      room.status !== "trading" ||
      last.details.period !== room.period ||
      last.details.unit !== room.unit
        ? "cleared"
        : "replaced",
    price,
  };
}
/** Explicit allowlist: private conditions, identities and scores never enter another student's response. */
export function view(room: Room, actor: Actor, now: number): RoomView {
  const teacher = actor.role === "teacher";
  const me =
    actor.role === "student"
      ? room.participants.find((p) => p.id === actor.participantId)
      : undefined;
  const person = (p: Participant) => ({
    id: p.id,
    name: p.name,
    studentId: p.studentId,
    seat: p.seat,
    type: p.type,
    holdings: p.holdings,
    cash: p.cash,
    dividend: p.dividend,
    totalProfit: p.totalProfit,
    dividends:
      p.type === null ? null : (room.config.dividends[p.type - 1] ?? null),
  });
  const visibleResults = room.results.map((result) => {
    if (teacher || room.reveal)
      return {
        ...result,
        payouts: teacher
          ? result.payouts
          : result.payouts.filter((p) => p.participantId === me?.id),
      };
    return {
      ...result,
      piPrice: undefined,
      rePrice: undefined,
      payouts: result.payouts.filter((p) => p.participantId === me?.id),
      priceRatio: null,
      actualDividend: 0,
      maxDividend: 0,
      initialDividend: 0,
      allocationEfficiency: 0,
      gainEfficiency: null,
    };
  });
  return {
    experiment: room.config.experiment ?? "exp1",
    ...(room.config.experiment === "exp2"
      ? {
          exp2: {
            prior: room.config.states!.prior,
            dividends: me?.type
              ? room.config.states!.dividends[me.type - 1]!
              : null,
            clue:
              me?.insider &&
              room.year >= (room.config.insiderStartRound ?? 3) &&
              (room.status === "trading" || room.status === "countdown")
                ? exp2Prices(room).state
                : null,
            state:
              room.results.find((r) => r.year === room.year)?.state ?? null,
            allDividends:
              teacher || room.reveal ? room.config.states!.dividends : null,
          },
        }
      : {}),
    code: room.code,
    title: room.config.title,
    revision: room.revision,
    serverNow: now,
    role: actor.role,
    status: room.status,
    year: room.year,
    period: room.period,
    unit: room.unit,
    unitKey: unitKey(room),
    phaseKey: phaseKey(room),
    rounds: room.config.rounds,
    initialUnits: initialUnitsFor(room.config),
    periodSeconds: room.config.periodSeconds,
    unitSeconds: room.config.unitSeconds,
    breakSeconds: room.config.breakSeconds,
    participantCount: room.participants.length,
    nominatedSeat: teacher ? room.nominatedSeat : null,
    emptyUnits: room.emptyUnits,
    emptyUnitsLimit: room.config.emptyUnitsLimit ?? 2,
    countdownEndsAt: room.countdownEndsAt ?? null,
    periodEndsAt: room.periodEndsAt,
    unitEndsAt: room.unitEndsAt,
    breakEndsAt: room.breakEndsAt,
    pausedAt: room.pausedAt,
    bid: room.bid
      ? {
          ...room.bid,
          participantId:
            teacher || room.bid.participantId === me?.id
              ? room.bid.participantId
              : null,
          seat:
            teacher || room.bid.participantId === me?.id ? room.bid.seat : null,
        }
      : null,
    ask: room.ask
      ? {
          ...room.ask,
          participantId:
            teacher || room.ask.participantId === me?.id
              ? room.ask.participantId
              : null,
          seat:
            teacher || room.ask.participantId === me?.id ? room.ask.seat : null,
        }
      : null,
    orderBook: {
      bid: visiblePriceLevels(standingQuotes(room, "bid"), teacher, me?.id),
      ask: visiblePriceLevels(standingQuotes(room, "ask"), teacher, me?.id),
    },
    trades: teacher
      ? room.trades
      : room.trades.map((trade) => ({
          ...trade,
          buyerId: trade.buyerId === me?.id ? trade.buyerId : null,
          sellerId: trade.sellerId === me?.id ? trade.sellerId : null,
          buyerSeat: trade.buyerId === me?.id ? trade.buyerSeat : null,
          sellerSeat: trade.sellerId === me?.id ? trade.sellerSeat : null,
        })),
    ownQuotes: {
      bid: ownQuoteState(room, me?.id, "bid"),
      ask: ownQuoteState(room, me?.id, "ask"),
    },
    me: me ? person(me) : null,
    participants: teacher ? room.participants.map(person) : [],
    results: visibleResults,
    reveal: room.reveal,
    benchmarks:
      room.config.experiment !== "exp2" && (teacher || room.reveal)
        ? benchmarks(room.config)
        : null,
    conditions:
      room.config.experiment !== "exp2" && (teacher || room.reveal)
        ? room.config.dividends
        : null,
  };
}
