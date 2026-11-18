import test from "node:test";
import assert from "node:assert/strict";
import {
  act,
  addParticipant,
  advanceClock,
  benchmarks,
  newRoom,
  phaseKey,
  unitKey,
  view,
} from "../src/experiments/emh/engine";
import { DEFAULT_CONFIG } from "../src/experiments/emh/server/default-config";
import { csv, exportData } from "../src/experiments/emh/export";
import type { Room } from "../src/experiments/emh/types";

const teacher = { role: "teacher" } as const;
const student = (n: number) =>
  ({ role: "student", participantId: `p${n}` }) as const;
const random = () => 0.999;
function setup(overrides: Partial<typeof DEFAULT_CONFIG> = {}) {
  const room = newRoom(
    "ABC234",
    { ...structuredClone(DEFAULT_CONFIG), ...overrides },
    0,
    "secret-pass",
    "secret-token",
  );
  for (let i = 0; i < 9; i++)
    addParticipant(
      room,
      {
        id: `p${i}`,
        name: `name${i}`,
        studentId: `s${i}`,
        pinHash: `secret-pin${i}`,
        tokenHash: `secret-token${i}`,
      },
      0,
    );
  act(
    room,
    teacher,
    { kind: "start", expectedPhase: phaseKey(room) },
    -5000,
    random,
  );
  advanceClock(room, 0, random);
  return room;
}
function quote(
  r: Room,
  who: number,
  side: "bid" | "ask",
  price: number,
  now = 1,
) {
  act(
    r,
    student(who),
    { kind: "quote", side, price, unitKey: unitKey(r) },
    now,
    random,
  );
}
function finish(r: Room, now: number) {
  act(
    r,
    teacher,
    { kind: "end-period", expectedPhase: phaseKey(r) },
    now,
    random,
  );
}

test("ending a paused experiment settles only the open period and clears outstanding orders", () => {
  const r = setup();
  quote(r, 0, "ask", 10);
  quote(r, 1, "bid", 10, 2);
  quote(r, 2, "ask", 50, 3);
  act(r, teacher, { kind: "pause", expectedPhase: phaseKey(r) }, 4);
  act(r, teacher, { kind: "finish", expectedPhase: phaseKey(r) }, 1000);
  assert.equal(r.status, "completed");
  assert.equal(r.trades.length, 1);
  assert.deepEqual(
    r.results.map((p) => [p.period, p.reason]),
    [["A", "teacher-finish"]],
  );
  for (const p of r.participants) {
    const payout = r.results[0].payouts.find(
      (row) => row.participantId === p.id,
    )!;
    assert.equal(
      p.totalProfit,
      p.cash + payout.holdings * r.config.dividends[p.type! - 1].a,
    );
  }
  assert.deepEqual(
    [r.ask, r.bid, r.unitEndsAt, r.periodEndsAt, r.pausedAt, r.breakEndsAt],
    Array(6).fill(null),
  );
  assert.deepEqual(r.queuedQuotes, { ask: [], bid: [] });
  const ended = structuredClone(r);
  advanceClock(r, 1e10);
  assert.deepEqual(r, ended);
});

test("PDF defaults, three private types, and theoretical prices", () => {
  assert.deepEqual(benchmarks(DEFAULT_CONFIG), {
    naiveA: 340,
    perfectA: 367,
    perfectB: 110,
  });
  const r = setup();
  assert.equal(r.config.rounds, 6);
  assert.equal(r.periodEndsAt, 240000);
  assert.equal(r.unitEndsAt, 30000);
  assert.deepEqual(
    r.participants.map((p) => p.seat),
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
  );
  assert.deepEqual(
    r.participants.map((p) => p.type),
    [1, 1, 1, 2, 2, 2, 3, 3, 3],
  );
  assert.equal(
    r.participants.reduce((s, p) => s + p.holdings, 0),
    18,
  );
});
test("a crossed bid settles one unit at the standing ask; quotes clear; cash conserves", () => {
  const r = setup();
  quote(r, 0, "ask", 300);
  quote(r, 6, "bid", 320, 2);
  assert.equal(r.trades[0]!.price, 300);
  assert.equal(r.trades.length, 1);
  assert.equal(r.participants[0]!.holdings, 1);
  assert.equal(r.participants[6]!.holdings, 3);
  assert.equal(r.participants[6]!.cash, -300);
  assert.equal(
    r.participants.reduce((s, p) => s + p.cash, 0),
    0,
  );
  assert.equal(r.ask, null);
  assert.equal(r.bid, null);
  assert.equal(r.unit, 2);
  assert.equal(r.unitEndsAt, 30002);
});
test("equal bids queue behind earlier bids, and only the current best can be accepted", () => {
  const r = setup();
  quote(r, 0, "bid", 310);
  quote(r, 1, "bid", 310);
  assert.equal(r.bid!.participantId, "p0");
  assert.throws(
    () =>
      act(
        r,
        student(1),
        {
          kind: "cancel",
          side: "bid",
          quoteId: r.bid!.id,
          unitKey: unitKey(r),
        },
        2,
      ),
    /取り消せ/,
  );
  const oldId = r.bid!.id;
  quote(r, 1, "bid", 320, 3);
  assert.throws(
    () =>
      act(
        r,
        student(2),
        { kind: "accept", side: "bid", quoteId: oldId, unitKey: unitKey(r) },
        4,
      ),
    /更新/,
  );
  quote(r, 2, "ask", 300, 5);
  assert.equal(r.trades[0]!.price, 320);
  assert.equal(r.bid!.participantId, "p0");
});
test("self trading and short selling are rejected; stale unit cannot trade", () => {
  const r = setup();
  quote(r, 0, "ask", 300);
  assert.throws(() => quote(r, 0, "bid", 300, 2), /自分/);
  const stale = unitKey(r);
  quote(r, 1, "bid", 300, 3);
  quote(r, 0, "ask", 300, 4);
  quote(r, 1, "bid", 300, 5);
  assert.equal(r.participants[0]!.holdings, 0);
  assert.throws(() => quote(r, 0, "ask", 1, 6), /保有/);
  assert.throws(
    () =>
      act(
        r,
        student(1),
        { kind: "quote", side: "bid", price: 400, unitKey: stale },
        7,
      ),
    /切り替わり/,
  );
});
test("A dividend uses A closing holdings; B carries stock; B extinguishes stock; next year resets only year accounts", () => {
  const r = setup();
  quote(r, 0, "ask", 300);
  quote(r, 6, "bid", 300, 2);
  finish(r, 3);
  assert.equal(r.period, "B");
  assert.equal(r.participants[6]!.holdings, 3);
  assert.equal(r.participants[6]!.dividend, 771);
  assert.equal(
    r.results[0]!.payouts.find((p) => p.participantId === "p0")!.dividend,
    216,
  );
  quote(r, 6, "ask", 100, 4);
  quote(r, 3, "bid", 100, 5);
  finish(r, 6);
  assert.equal(r.status, "break");
  assert.ok(r.participants.every((p) => p.holdings === 0));
  assert.equal(r.participants[6]!.totalProfit, -300 + 100 + 3 * 257 + 2 * 83);
  assert.equal(r.participants[3]!.totalProfit, -100 + 2 * 200 + 3 * 110);
  const total = r.participants[6]!.totalProfit;
  act(r, teacher, { kind: "next-year", expectedPhase: phaseKey(r) }, 7, random);
  assert.equal(r.year, 2);
  assert.equal(r.period, "A");
  assert.equal(r.participants[6]!.totalProfit, total);
  assert.equal(r.participants[6]!.cash, 0);
  assert.equal(r.participants[6]!.dividend, 0);
  assert.ok(r.participants.every((p) => p.holdings === 2));
});
test("two empty units advance the period, including catch-up after all clients disconnect", () => {
  const r = setup({ rounds: 2 });
  advanceClock(r, 60000, random);
  assert.equal(r.period, "B");
  assert.equal(r.results.length, 1);
  assert.equal(r.results[0]!.reason, "inactivity");
  assert.equal(r.results[0]!.endedAt, 60000);
  advanceClock(r, 300000, random);
  assert.equal(r.status, "completed");
  assert.equal(r.results.length, 4);
  assert.equal(r.trades.length, 0);
  assert.ok(
    r.results.every(
      (p) =>
        p.meanPrice === null && p.priceRatio === null && p.gainEfficiency === 0,
    ),
  );
});
test("trade clears inactivity streak; hard period deadline wins over unit expiry", () => {
  const r = setup({ periodSeconds: 45, unitSeconds: 30 });
  advanceClock(r, 30000, random);
  assert.equal(r.emptyUnits, 1);
  quote(r, 0, "ask", 300, 31000);
  quote(r, 1, "bid", 300, 32000);
  assert.equal(r.emptyUnits, 0);
  assert.equal(r.unitEndsAt, 45000);
  advanceClock(r, 45000, random);
  assert.equal(r.results[0]!.reason, "deadline");
  assert.equal(r.period, "B");
});
test("pause freezes both deadlines and resume shifts by exact paused duration", () => {
  const r = setup();
  act(r, teacher, { kind: "pause", expectedPhase: phaseKey(r) }, 10000, random);
  advanceClock(r, 999000, random);
  assert.equal(r.period, "A");
  assert.equal(r.results.length, 0);
  assert.throws(() => quote(r, 1, "bid", 10, 1000000), /取引できません/);
  act(
    r,
    teacher,
    { kind: "resume", expectedPhase: phaseKey(r) },
    1000000,
    random,
  );
  assert.equal(r.unitEndsAt, 1020000);
  assert.equal(r.periodEndsAt, 1230000);
});
test("student response never reveals other identities, payouts, credentials or benchmark before explicit reveal", () => {
  const r = setup({ rounds: 1 });
  finish(r, 1);
  finish(r, 2);
  const own = view(r, student(0), 3);
  const serialized = JSON.stringify(own);
  assert.equal(own.benchmarks, null);
  assert.equal(own.conditions, null);
  assert.equal(own.participants.length, 0);
  for (let i = 1; i < 9; i++) assert.ok(!serialized.includes(`name${i}`));
  assert.ok(!serialized.includes("secret"));
  assert.ok(own.results.every((r) => r.payouts.length === 1));
  act(r, teacher, { kind: "reveal", expectedPhase: phaseKey(r) }, 4, random);
  const shown = view(r, student(0), 5);
  assert.equal(shown.benchmarks!.perfectA, 367);
  assert.equal(shown.conditions!.length, 3);
  assert.equal(shown.participants.length, 0);
});
test("role and revision guards prevent teacher actions from students and stale double progression", () => {
  const r = setup();
  const revision = phaseKey(r);
  assert.throws(
    () =>
      act(r, student(0), { kind: "end-period", expectedPhase: revision }, 1),
    /教員/,
  );
  finish(r, 2);
  assert.throws(
    () => act(r, teacher, { kind: "end-period", expectedPhase: revision }, 3),
    /更新/,
  );
  assert.equal(r.results.length, 1);
  assert.throws(
    () => act(r, teacher, { kind: "reveal", expectedPhase: phaseKey(r) }, 4),
    /終了後/,
  );
});
test("new quotes do not invalidate a teacher's confirmation for the same phase", () => {
  const r = setup();
  const phase = phaseKey(r);
  quote(r, 0, "bid", 300, 1);
  act(r, teacher, { kind: "end-period", expectedPhase: phase }, 2, random);
  assert.equal(r.period, "B");
  assert.equal(r.results.length, 1);
  assert.throws(
    () => act(r, teacher, { kind: "end-period", expectedPhase: phase }, 3),
    /更新/,
  );
});
test("normalized efficiency and price ratio are separate; no-trade baseline gain efficiency is zero", () => {
  const r = setup();
  finish(r, 1);
  const a = r.results[0]!;
  assert.equal(a.initialDividend, 4038);
  assert.equal(a.maxDividend, 4626);
  assert.equal(a.actualDividend, 4038);
  assert.equal(a.gainEfficiency, 0);
  assert.equal(a.priceRatio, null);
  assert.ok(a.allocationEfficiency !== null && a.allocationEfficiency > 0);
});
test("CSV is Excel-safe, UTF-8, and personal export excludes others' trades", () => {
  assert.equal(csv([["=2+3", 'a"b', -300]]), '\uFEFF"\'=2+3","a""b","-300"');
  const r = setup();
  quote(r, 2, "ask", 345);
  quote(r, 3, "bid", 345, 2);
  const output = exportData(r, student(0), "conditions");
  assert.equal(output.extension, "csv");
  assert.ok(!output.body.includes("345"));
  assert.ok(!output.body.includes("secret"));
});

test("custom supply conserves assets and cash, carries A into B, and resets the next round", () => {
  const r = setup({ initialUnits: 5, periodSeconds: 90 });
  assert.equal(r.periodEndsAt, 90000);
  assert.equal(
    r.participants.reduce((s, p) => s + p.holdings, 0),
    45,
  );
  quote(r, 0, "ask", 300);
  quote(r, 6, "bid", 300, 2);
  assert.equal(
    r.participants.reduce((s, p) => s + p.cash, 0),
    0,
  );
  finish(r, 3);
  const a = r.results[0];
  assert.equal(a.initialDividend, 10095);
  assert.equal(a.maxDividend, 11565);
  assert.equal(a.actualDividend, 10136);
  assert.equal(a.gainEfficiency, 41 / 1470);
  assert.equal(a.allocationEfficiency, 10136 / 11565);
  assert.equal(r.participants[6].holdings, 6);
  assert.equal(r.periodEndsAt, 90003);
  finish(r, 4);
  assert.equal(r.results[1].maxDividend, 4950);
  assert.equal(r.results[1].initialDividend, 4470);
  assert.ok(r.participants.every((p) => p.holdings === 0));
  const profit = r.participants.map((p) => p.totalProfit);
  act(r, teacher, { kind: "next-year", expectedPhase: phaseKey(r) }, 5, random);
  assert.ok(
    r.participants.every(
      (p) => p.holdings === 5 && p.cash === 0 && p.dividend === 0,
    ),
  );
  assert.deepEqual(
    r.participants.map((p) => p.totalProfit),
    profit,
  );
});

test("legacy market snapshots retain two-unit resets and correct exported conditions", () => {
  const r = setup();
  delete r.config.initialUnits;
  finish(r, 1);
  finish(r, 2);
  act(r, teacher, { kind: "next-year", expectedPhase: phaseKey(r) }, 3, random);
  assert.ok(r.participants.every((p) => p.holdings === 2));
  assert.equal(view(r, teacher, 3).initialUnits, 2);
  const output = JSON.parse(exportData(r, teacher, "conditions").body);
  assert.equal(output.config.initialUnits, 2);
  assert.equal(output.rules.totalUnits, 18);
});

test("all participants may quote regardless of nomination, with counterpart identities absent from student views", () => {
  const r = setup();
  assert.notEqual(r.nominatedSeat, r.participants[0]!.seat);
  quote(r, 0, "ask", 300);
  const other = view(r, student(1), 1);
  assert.equal(other.nominatedSeat, null);
  assert.equal(other.ask!.price, 300);
  assert.equal(other.ask!.participantId, null);
  assert.equal(other.ask!.seat, null);
  assert.equal(view(r, student(0), 1).ask!.participantId, "p0");
  assert.equal(view(r, teacher, 1).ask!.participantId, "p0");
  quote(r, 1, "bid", 300, 2);
  const observer = view(r, student(2), 2).trades[0]!;
  assert.equal(observer.price, 300);
  for (const key of ["buyerId", "sellerId", "buyerSeat", "sellerSeat"] as const)
    assert.equal(observer[key], null);
  const buyer = view(r, student(1), 2).trades[0]!;
  assert.equal(buyer.buyerId, "p1");
  assert.equal(buyer.sellerId, null);
  assert.equal(view(r, teacher, 2).trades[0]!.sellerId, "p0");
  r.reveal = true;
  assert.equal(view(r, student(2), 3).trades[0]!.sellerId, null);
});

test("a better bid or ask changes priority without removing other participants' quotes", () => {
  const r = setup();
  for (const [i, side, price] of [
    [0, "bid", 100],
    [1, "bid", 110],
    [2, "bid", 100],
    [3, "ask", 200],
    [4, "ask", 190],
    [5, "ask", 200],
  ] as const)
    quote(r, i, side, price);
  const owner = view(r, student(0), 1);
  const levels = (side: "bid" | "ask") =>
    owner.orderBook[side].map(({ price, quantity, ownQuantity }) => [
      price,
      quantity,
      ownQuantity,
    ]);
  assert.deepEqual(levels("bid"), [
    [110, 1, 0],
    [100, 2, 1],
  ]);
  assert.deepEqual(levels("ask"), [
    [190, 1, 0],
    [200, 2, 0],
  ]);
  assert.ok(owner.orderBook.bid.every((level) => level.aliases === ""));
  assert.equal(
    view(r, teacher, 1).orderBook.bid[1]!.aliases,
    "被験者 #1・被験者 #3",
  );
  const firstBidId = owner.ownQuotes.bid.quoteId;
  quote(r, 0, "bid", 100);
  assert.equal(view(r, student(0), 1).ownQuotes.bid.quoteId, firstBidId);
  quote(r, 6, "ask", 90, 2);
  quote(r, 7, "bid", 250, 3);
  assert.deepEqual(
    r.trades.map((t) => [t.price, t.buyerId, t.sellerId]),
    [
      [110, "p1", "p6"],
      [190, "p7", "p4"],
    ],
  );
  advanceClock(r, 30003, random);
  assert.equal(r.emptyUnits, 1);
  assert.equal(r.bid!.id, firstBidId);
  assert.equal(r.ask!.participantId, "p3");
  // Execute depth in FIFO order after serialization and another unit's timeout.
  const restored: Room = JSON.parse(JSON.stringify(r));
  for (const [i, side, price] of [
    [6, "ask", 95],
    [8, "ask", 95],
    [1, "bid", 210],
    [2, "bid", 210],
  ] as const)
    quote(restored, i, side, price, 30005);
  assert.deepEqual(
    restored.trades.slice(2).map((t) => [t.price, t.buyerId, t.sellerId]),
    [
      [100, "p0", "p6"],
      [100, "p2", "p8"],
      [200, "p1", "p3"],
      [200, "p2", "p5"],
    ],
  );
  assert.deepEqual(view(restored, student(0), 30005).ownQuotes.bid, {
    status: "filled",
    price: 100,
  });
  assert.deepEqual(view(restored, student(5), 30005).ownQuotes.ask, {
    status: "filled",
    price: 200,
  });
});

test("a trader can amend or cancel a queued order without affecting a better quote", () => {
  const r = setup();
  quote(r, 0, "ask", 160);
  const first = r.ask!.id;
  quote(r, 1, "ask", 150);
  quote(r, 2, "ask", 165);
  quote(r, 0, "ask", 165);
  const remaining = view(r, student(0), 1).ownQuotes.ask;
  assert.notEqual(remaining.quoteId, first);
  const cancel = (i: number, id: string) =>
    act(
      r,
      student(i),
      { kind: "cancel", side: "ask", quoteId: id, unitKey: unitKey(r) },
      2,
    );
  assert.throws(() => cancel(0, first), /取り消せ/);
  assert.throws(() => cancel(1, remaining.quoteId!), /取り消せ/);
  assert.equal(r.ask!.price, 150);
  assert.equal(r.queuedQuotes!.ask[0]!.participantId, "p2");
  cancel(0, remaining.quoteId!);
  assert.equal(r.ask!.participantId, "p1");
  assert.equal(view(r, student(0), 2).ownQuotes.ask.status, "cancelled");
  finish(r, 3);
  assert.equal(r.period, "B");
  assert.deepEqual(view(r, teacher, 3).orderBook, { bid: [], ask: [] });
  assert.equal(view(r, student(1), 3).ownQuotes.ask.status, "cleared");
});

test("market orders leave the trader's independent limits active and cannot spend reserved stock", () => {
  const r = setup();
  quote(r, 0, "bid", 100);
  quote(r, 0, "ask", 210);
  quote(r, 1, "bid", 110);
  const sell = () =>
    act(
      r,
      student(0),
      { kind: "accept", side: "bid", quoteId: r.bid!.id, unitKey: unitKey(r) },
      3,
    );
  sell();
  assert.equal(r.participants[0]!.holdings, 1);
  quote(r, 1, "bid", 110, 4);
  const before = JSON.stringify(r);
  assert.throws(sell, /売り指値注文/);
  assert.throws(() => quote(r, 0, "bid", 210, 5), /自分/);
  assert.equal(JSON.stringify(r), before);
  // Amending the existing ask may use the reserved unit, including a crossing price.
  quote(r, 0, "ask", 105, 6);
  assert.equal(r.participants[0]!.holdings, 0);
  assert.equal(r.ask, null);
  assert.equal(r.bid!.participantId, "p0");
  assert.equal(r.trades.at(-1)!.price, 110);
  assert.deepEqual(view(r, student(0), 6).ownQuotes.ask, {
    status: "filled",
    price: 110,
  });
  assert.equal(
    r.participants.reduce((sum, p) => sum + p.cash, 0),
    0,
  );
});

test("legacy snapshots promote live best quotes but never resurrect expired ones", () => {
  const r = setup();
  quote(r, 0, "bid", 100);
  delete r.queuedQuotes;
  const expired: Room = structuredClone(r);
  const completed: Room = {
    ...structuredClone(r),
    status: "completed",
    bid: null,
  };
  const id = r.bid!.id;
  advanceClock(r, 2, random);
  quote(r, 1, "bid", 101, 3);
  advanceClock(r, 30000, random);
  assert.equal(view(r, student(0), 30000).ownQuotes.bid.quoteId, id);
  assert.equal(
    r.events.filter((e) => e.kind === "order-book-upgraded").length,
    1,
  );
  advanceClock(expired, 30001, random);
  assert.equal(expired.bid, null);
  assert.equal(expired.queuedQuotes!.bid.length, 0);
  advanceClock(completed, 30001, random);
  assert.equal(completed.queuedQuotes, undefined);
  assert.equal(
    JSON.parse(exportData(completed, teacher, "conditions").body).rules
      .orderPriority,
    undefined,
  );
  assert.equal(
    JSON.parse(exportData(r, teacher, "conditions").body).rules.orderPriority,
    "price-then-arrival",
  );
});
