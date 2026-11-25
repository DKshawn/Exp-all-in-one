import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { localDatabase, migrate } from "../src/lib/server/database";
import { AuctionService } from "../src/experiments/double-auction/server/service";
import { RealtimeBroker } from "../src/experiments/double-auction/server/realtime";
import {
  applyPatch,
  type RoomPatch,
} from "../src/experiments/double-auction/lib/room-sync";
import {
  execute,
  settleDeadline,
  toView,
} from "../src/experiments/double-auction/server/engine";
import {
  newStudy,
  unitLimits,
  marketFor,
  marketRound,
  stageKey,
  settingsForInstitution,
  applyStudyGenerator,
} from "../src/experiments/double-auction/server/study";
import {
  studyMarketId,
  studyMarketCounts,
} from "../src/experiments/double-auction/lib/study-config";
import { equilibrium } from "../src/experiments/double-auction/lib/equilibrium";
import { exportData } from "../src/experiments/double-auction/server/export";
import { commandSchema } from "@/experiments/double-auction/server/validation";
import type {
  Room,
  Participant,
  AuditEvent,
} from "../src/experiments/double-auction/server/model";
import type {
  RoomConfig,
  Command,
  RoomView,
} from "../src/experiments/double-auction/lib/types";
import type { Institution } from "../src/experiments/double-auction/lib/study-types";
import { DemoSession } from "../src/experiments/double-auction/lib/demo";
import { studyRoomConfigSchema } from "../src/experiments/double-auction/lib/study-room-config";
import { DEFAULT_STAIRCASE_PARAMETERS } from "../src/experiments/double-auction/lib/study-generator";

const config: RoomConfig = {
  title: "Flexible local test",
  protocol: "institutions-v1",
  studyAdmission: "flexible",
  markets: 1,
  marketSize: 16,
  capacity: 16,
  studyInstitutions: ["cda"],
  studyPeriods: { cda: 2 },
  rounds: 2,
  duration: 180,
};
function fixture(n: number, markets = 1, institution: Institution = "cda") {
  const study = newStudy(1, 16, [institution]);
  study.lobby = {
    revision: 0,
    randomizedAt: null,
    admission: {
      status: "open",
      closesAt: null,
      closedAt: null,
      targetMarkets: markets,
    },
  };
  const room: Room = {
    code: "LOCAL2",
    config: {
      ...config,
      studyInstitutions: [institution],
      studyPeriods: { [institution]: 2 },
      studyPostedMechanism: "batch-bids-v1",
    },
    study,
    phase: "waiting",
    round: 0,
    version: 1,
    deadline: null,
    remainingMs: 0,
    createdAt: 1,
    teacherTokenHash: "",
    teacherPasswordHash: "",
    teacherFailedLogins: 0,
    teacherLockedUntil: 0,
    seats: [],
    quotes: [],
    trades: [],
    sequence: 0,
    receipts: [],
    participants: Array.from({ length: n }, (_, i): Participant => ({
      id: randomUUID(),
      nickname: `学生${i + 1}`,
      joinedAt: i + 1,
      role: "buyer",
      alias: "未割当",
      seat: -1,
      limits: { apple: 0, banana: 0, orange: 0 },
      tokenHash: "",
      pinHash: "",
      failedLogins: 0,
      lockedUntil: 0,
    })),
  };
  const events: AuditEvent[] = [];
  const send = (
    actor: Participant | "teacher",
    command: Command,
    now = 1000,
    requestId = randomUUID(),
  ) =>
    execute(
      room,
      actor,
      {
        requestId,
        expectedRound:
          actor === "teacher"
            ? room.round
            : marketRound(room, marketFor(room, actor)),
        expectedStage:
          actor === "teacher"
            ? undefined
            : stageKey(room, marketFor(room, actor)),
        command,
      },
      now,
      events,
    );
  const admission = (
    action: Extract<Command, { type: "study-admission" }>["action"],
    args: { markets?: number; seconds?: number } = {},
    now = 1000,
  ) =>
    send(
      "teacher",
      {
        type: "study-admission",
        action,
        expectedRevision: study.lobby!.revision,
        ...args,
      },
      now,
    );
  const withdraw = (p: Participant, now: number) =>
    send(
      "teacher",
      {
        type: "study-withdraw",
        participantId: p.id,
        expectedRevision: study.lobby!.revision,
      },
      now,
    );
  return { room, study, events, send, admission, withdraw };
}

test("every attendance from 2 to 192 joins balanced markets with at least one trader per side; actual schedules equal assigned conditions", () => {
  for (let n = 2; n <= 192; n++)
    for (const requested of [1, 2, 12, 96]) {
      const { room, admission } = fixture(n, requested);
      admission("close");
      const layout = room.config.studyLayout!;
      assert.equal(layout.length, Math.min(requested, Math.floor(n / 2)));
      assert.equal(new Set(room.participants.map((p) => p.seat)).size, n);
      const sizes = layout.map((m) => m.buyers + m.sellers);
      assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
      assert.equal(
        sizes.reduce((a, b) => a + b, 0),
        n,
      );
      for (const m of room.study!.markets) {
        const people = room.participants.filter(
          (p) => studyMarketId(room.config, p.seat) === m.id,
        );
        const counts = studyMarketCounts(room.config, m.id);
        assert.ok(
          counts.buyers >= 1 &&
            counts.sellers >= 1 &&
            Math.abs(counts.buyers - counts.sellers) <= 1,
        );
        assert.equal(
          people.filter((p) => p.role === "buyer").length,
          counts.buyers,
        );
        assert.equal(
          people.filter((p) => p.role === "seller").length,
          counts.sellers,
        );
        const schedules = settingsForInstitution(room, "cda", m.id);
        for (const side of ["buyer", "seller"] as const) {
          assert.deepEqual(
            people
              .filter((p) => p.role === side)
              .sort((a, b) => a.seat - b.seat)
              .map((p) => unitLimits(room, p)),
            schedules[side === "buyer" ? "values" : "costs"],
          );
        }
      }
    }
});

test("editing the requested market count preserves an active timer and applies at cutoff", () => {
  const f = fixture(16);
  f.admission("schedule", { seconds: 5 }, 1000);
  f.admission("configure", { markets: 3 }, 2000);
  assert.equal(f.study.lobby!.admission!.targetMarkets, 3);
  assert.equal(f.study.lobby!.admission!.closesAt, 6000);
  assert.ok(f.room.participants.every((p) => p.seat === -1));
  settleDeadline(f.room, 6000, f.events);
  assert.deepEqual(
    f.room.config.studyLayout!.map((m) => m.buyers + m.sellers),
    [6, 5, 5],
  );
});

test("starting the timer or closing admission also saves the latest entered count in the same command", () => {
  for (const action of ["schedule", "close"] as const) {
    const f = fixture(16);
    f.admission(action, {
      markets: 3,
      ...(action === "schedule" ? { seconds: 5 } : {}),
    });
    assert.equal(f.study.lobby!.admission!.targetMarkets, 3);
    assert.equal(f.study.lobby!.revision, 1);
    if (action === "schedule") settleDeadline(f.room, 6000, f.events);
    assert.equal(f.study.lobby!.admission!.status, "closed");
    assert.deepEqual(
      f.room.config.studyLayout!.map((m) => m.buyers + m.sellers),
      [6, 5, 5],
    );
  }
});

test("combined admission updates validate the whole change and retain teacher/revision checks", () => {
  const f = fixture(16);
  assert.throws(
    () => f.admission("schedule", { markets: 3, seconds: 4 }),
    /5〜3600/,
  );
  assert.throws(() => f.admission("close", { markets: 0 }), /市場数/);
  const command: Command = {
    type: "study-admission",
    action: "close",
    markets: 3,
    expectedRevision: 0,
  };
  assert.throws(() => f.send(f.room.participants[0], command), /教員のみ/);
  assert.throws(
    () => f.send("teacher", { ...command, expectedRevision: 99 }),
    /入室状況が更新/,
  );
  assert.equal(f.study.lobby!.admission!.targetMarkets, 1);
  assert.equal(f.study.lobby!.admission!.closesAt, null);
  assert.equal(f.study.lobby!.admission!.status, "open");
  assert.equal(f.study.lobby!.revision, 0);
});

test("admission pause retains exact remaining time and resume closes once at the new server deadline", () => {
  const f = fixture(7, 2);
  f.admission("schedule", { seconds: 10 }, 1000);
  f.admission("pause-timer", {}, 4251);
  assert.equal(f.study.lobby!.admission!.closesAt, null);
  assert.equal(f.study.lobby!.admission!.pausedRemainingMs, 6749);
  assert.equal(settleDeadline(f.room, 60000, f.events), false);
  const reconnected = toView(f.room, "teacher", 60000, "local");
  assert.equal(reconnected.study!.lobby!.admission!.pausedRemainingMs, 6749);
  assert.equal(reconnected.study!.lobby!.admission!.timerSeconds, 10);
  f.admission("resume-timer", {}, 62000);
  assert.equal(f.study.lobby!.admission!.closesAt, 68749);
  assert.equal(f.study.lobby!.admission!.pausedRemainingMs, undefined);
  assert.equal(settleDeadline(f.room, 68748, f.events), false);
  assert.equal(settleDeadline(f.room, 68749, f.events), true);
  assert.equal(settleDeadline(f.room, 70000, f.events), false);
  assert.equal(f.study.lobby!.admission!.closedAt, 68749);
  assert.equal(f.room.phase, "waiting");
  assert.equal(
    f.events.filter((event) => event.type === "admission-closed").length,
    1,
  );
  assert.throws(() => f.admission("resume-timer", {}, 70000), /終了/);
});

test("admission reset stops running or paused timers and preserves the configured duration", () => {
  for (const pause of [false, true]) {
    const f = fixture(7);
    f.admission("schedule", { seconds: 20 }, 1000);
    if (pause) f.admission("pause-timer", {}, 3500);
    f.admission("cancel-timer", {}, 4000);
    assert.equal(f.study.lobby!.admission!.closesAt, null);
    assert.equal(f.study.lobby!.admission!.pausedRemainingMs, undefined);
    assert.equal(f.study.lobby!.admission!.timerSeconds, 20);
    assert.equal(settleDeadline(f.room, 30000, f.events), false);
    assert.equal(f.study.lobby!.admission!.status, "open");
    assert.throws(() => f.admission("resume-timer", {}, 30000), /一時停止中/);
    f.admission("schedule", { seconds: 20 }, 30000);
    assert.equal(f.study.lobby!.admission!.closesAt, 50000);
    f.admission("pause-timer", {}, 31000);
    f.admission("close", {}, 32000);
    assert.equal(f.study.lobby!.admission!.pausedRemainingMs, undefined);
    assert.equal(f.study.lobby!.admission!.status, "closed");
  }
});

test("timer transitions enforce teacher identity, revisions, duplicate request protection and valid states", () => {
  const f = fixture(7);
  assert.throws(() => f.admission("pause-timer"), /動作中/);
  assert.throws(() => f.admission("resume-timer"), /一時停止中/);
  f.admission("schedule", { seconds: 10 }, 1000);
  assert.throws(
    () => f.admission("schedule", { seconds: 10 }, 2000),
    /リセット/,
  );
  const pause: Command = {
    type: "study-admission",
    action: "pause-timer",
    expectedRevision: f.study.lobby!.revision,
  };
  assert.throws(() => f.send(f.room.participants[0], pause, 2000), /教員のみ/);
  const requestId = randomUUID();
  f.send("teacher", pause, 2500, requestId);
  f.send("teacher", pause, 5000, requestId);
  assert.equal(f.study.lobby!.admission!.pausedRemainingMs, 8500);
  assert.throws(() => f.send("teacher", pause, 5000), /更新/);
  assert.throws(() => f.admission("pause-timer", {}, 5000), /動作中/);
  f.admission("resume-timer", {}, 6000);
  assert.throws(() => f.admission("resume-timer", {}, 7000), /一時停止中/);
  assert.equal(f.study.lobby!.admission!.closesAt, 14500);
  const expired = fixture(7);
  expired.admission("schedule", { seconds: 5 }, 1000);
  assert.throws(() => expired.admission("pause-timer", {}, 6000), /動作中/);
});

test("server deadline closes once, never starts experiment, insufficient attendance can reopen in the same room", () => {
  for (const n of [0, 1, 7]) {
    const f = fixture(n, 6);
    f.admission("schedule", { seconds: 5 }, 1000);
    assert.equal(settleDeadline(f.room, 5999, f.events), false);
    assert.equal(settleDeadline(f.room, 6000, f.events), true);
    assert.equal(f.study.lobby!.admission!.closedAt, 6000);
    assert.equal(f.room.phase, "waiting");
    assert.equal(settleDeadline(f.room, 9000, f.events), false);
    assert.equal(
      f.events.filter((e) => e.type === "admission-closed").length,
      1,
    );
    if (n < 2) {
      assert.throws(
        () => f.send("teacher", { type: "start" }),
        /参加者が2人以上/,
      );
      assert.ok(f.study.lobby!.admission!.error);
    } else {
      const saved = JSON.stringify(f.room.participants);
      f.send("teacher", { type: "start" }, 9000);
      assert.ok(
        f.study.markets.every(
          (m) => m.stage === "countdown" && m.deadline === 14000,
        ),
      );
      f.send("teacher", { type: "pause" }, 10000);
      settleDeadline(f.room, 50000, f.events);
      assert.ok(f.study.markets.every((m) => m.stage === "countdown"));
      f.send("teacher", { type: "resume" }, 50000);
      settleDeadline(f.room, 54000, f.events);
      assert.ok(f.study.markets.every((m) => m.stage === "cda"));
      assert.equal(JSON.stringify(f.room.participants), saved);
      continue;
    }
    f.admission("open");
    assert.equal(f.study.lobby!.admission!.status, "open");
    assert.equal(f.room.code, "LOCAL2");
  }
});

test("allocation is teacher-only, stale-safe and idempotent; settings edits keep waiting students unassigned", () => {
  const f = fixture(17, 2),
    student = f.room.participants[0];
  const command: Command = {
    type: "study-admission",
    action: "close",
    expectedRevision: 0,
  };
  assert.throws(() => f.send(student, command), /教員/);
  f.send("teacher", {
    type: "study-program",
    institutions: ["cda"],
    periods: { cda: 3 },
    expectedRevision: 0,
  });
  assert.ok(f.room.participants.every((p) => p.seat === -1));
  const id = randomUUID();
  f.send("teacher", command, 1000, id);
  const saved = JSON.stringify(f.room.participants);
  f.send("teacher", command, 1001, id);
  assert.equal(JSON.stringify(f.room.participants), saved);
  assert.throws(() => f.send("teacher", command), /更新/);
  const actual = toView(f.room, student, 1100, "local");
  assert.equal(actual.study!.unitLimits, null);
  assert.equal(actual.study!.teacher, undefined);
  assert.ok(!JSON.stringify(actual).includes('学生2"'));
  f.withdraw(student, 1200);
  assert.equal(f.study.lobby!.admission!.status, "open");
  assert.equal(f.study.lobby!.randomizedAt, null);
  f.admission("close", {}, 1300);
  assert.equal(f.room.config.capacity, 16);
  assert.equal(student.seat, -1);
});

test("CDA withdrawal cancels unfilled orders, retains previous trades and benchmark, and remaining people continue", () => {
  const f = fixture(7, 2);
  f.admission("close");
  f.send("teacher", { type: "start" });
  settleDeadline(f.room, 6000, f.events);
  const market = f.study.markets[0];
  const people = f.room.participants.filter(
    (p) => marketFor(f.room, p).id === market.id,
  );
  const buyer = people.find((p) => p.role === "buyer")!,
    seller = people.find((p) => p.role === "seller")!;
  f.send(seller, { type: "study-quote", price: 100 }, 6100);
  f.send(buyer, { type: "study-quote", price: 100 }, 6200);
  f.send(seller, { type: "study-quote", price: 110 }, 6300);
  const before = toView(f.room, "teacher", 6300, "local").study!.teacher!;
  const fills = structuredClone(market.trades);
  f.withdraw(seller, 6400);
  assert.equal(
    market.orders.some((o) => o.participantId === seller.id),
    false,
  );
  assert.equal(market.orderHistory!.at(-1)!.status, "cancelled");
  assert.deepEqual(market.trades, fills);
  const after = toView(f.room, "teacher", 6400, "local").study!.teacher!;
  assert.deepEqual(after.marketEquilibria, before.marketEquilibria);
  assert.equal(
    after.participants.find((p) => p.id === seller.id)!.profit,
    before.participants.find((p) => p.id === seller.id)!.profit,
  );
  assert.throws(
    () => f.send(seller, { type: "study-quote", price: 90 }, 6500),
    /参加できません/,
  );
  f.send(buyer, { type: "study-quote", price: 90 }, 6500);
  settleDeadline(f.room, 194000, f.events);
  assert.ok(f.study.markets.every((m) => m.round === 2 && m.stage === "cda"));
  assert.ok(seller.withdrawnAt);
  const settings = JSON.parse(
    exportData(f.room, f.events, 194000, "settings").content,
  );
  assert.equal(
    settings.participants.find((p: { id: string }) => p.id === seller.id)
      .withdrawnAt,
    6400,
  );
  assert.deepEqual(
    settings.markets[0].schedules.cda,
    settingsForInstitution(f.room, "cda", market.id),
  );
  const eq = equilibrium(
    people
      .filter((p) => p.role === "buyer")
      .flatMap((p) => unitLimits(f.room, p)),
    people
      .filter((p) => p.role === "seller")
      .flatMap((p) => unitLimits(f.room, p)),
  );
  assert.deepEqual(after.marketEquilibria![market.id].cda, eq);
  assert.equal(after.metrics[0].quantityRatio, 1 / eq.quantity);
});

test("Call and Posted withdrawals remove open orders without granting students cancellation rights", () => {
  for (const institution of ["call", "posted"] as const) {
    const f = fixture(5, 1, institution);
    f.admission("close");
    f.send("teacher", { type: "start" });
    settleDeadline(f.room, 6000, f.events);
    const seller = f.room.participants.find((p) => p.role === "seller")!,
      buyer = f.room.participants.find((p) => p.role === "buyer")!;
    const market = f.study.markets[0];
    if (institution === "call") {
      f.send(buyer, { type: "call-submit", prices: [100, 90] }, 6100);
      f.withdraw(buyer, 6200);
      assert.equal(market.orders.length, 0);
      settleDeadline(f.room, market.deadline!, f.events);
      assert.equal(market.clearings[0].quantity, 0);
    } else {
      f.send(seller, { type: "posted-offer", price: 100, quantity: 2 }, 6100);
      settleDeadline(f.room, market.deadline!, f.events);
      f.send(buyer, { type: "posted-bid", price: 100, quantity: 2 }, 66100);
      f.withdraw(buyer, 66200);
      assert.equal(market.posted!.bids.length, 0);
      f.withdraw(seller, 66300);
      assert.equal(market.offers[0].remaining, 0);
      settleDeadline(f.room, market.deadline!, f.events);
      assert.equal(market.trades.length, 0);
    }
  }
});

test("legacy waiting rooms can admit actual attendance; withdrawing while admission is open preserves its deadline", () => {
  const f = fixture(7);
  delete f.study.lobby!.admission;
  delete f.room.config.studyAdmission;
  f.admission("open");
  f.admission("schedule", { seconds: 5 }, 2000);
  const removed = f.room.participants[0];
  f.withdraw(removed, 3000);
  assert.equal(f.study.lobby!.admission!.closesAt, 7000);
  settleDeadline(f.room, 7000, f.events);
  assert.equal(f.room.config.capacity, 6);
  assert.equal(removed.seat, -1);
  assert.equal(f.room.participants.length, 7);
  assert.ok(f.room.participants.slice(1).every((p) => p.seat >= 0));
  const cutoff = f.events.find((event) => event.type === "admission-closed")!;
  assert.equal(cutoff.actor, "system");
  assert.equal(cutoff.detail.trigger, "deadline");
  assert.equal(cutoff.at, 7000);
});

test("legacy Posted skips departed buyers and never opens an empty buyer turn", () => {
  const f = fixture(4, 1, "posted");
  delete f.room.config.studyPostedMechanism;
  f.admission("close");
  f.send("teacher", { type: "start" });
  settleDeadline(f.room, 6000, f.events);
  const buyers = f.room.participants.filter((p) => p.role === "buyer");
  for (const buyer of buyers) f.withdraw(buyer, 6100);
  const market = f.study.markets[0];
  settleDeadline(f.room, market.deadline!, f.events);
  assert.equal(market.stage, "feedback");
  assert.equal(market.remainingMs, 5000);
  settleDeadline(f.room, market.deadline!, f.events);
  assert.equal(market.round, 2);
  assert.equal(market.stage, "offer");
  assert.equal(market.buyerOrder.length, 0);
  assert.ok(!f.events.some((e) => e.type === "buyer-timeout"));
});

test("flexible creation separates requested markets from condition-template capacity", () => {
  const draft = { ...config, markets: 625, capacity: 9_999 };
  assert.equal(studyRoomConfigSchema.safeParse(draft).success, true);
  const fixed = { ...draft };
  delete fixed.studyAdmission;
  assert.equal(studyRoomConfigSchema.safeParse(fixed).success, false);
  assert.equal(
    studyRoomConfigSchema.safeParse({
      ...draft,
      studyLayout: [{ buyers: 2, sellers: 1 }],
    }).success,
    false,
  );
});

test("odd-market allocation retains reproducible generator assignments and exports the actual sampled conditions", () => {
  const f = fixture(17, 3);
  applyStudyGenerator(
    f.room,
    {
      kind: "overlap-staircase",
      parameters: { ...DEFAULT_STAIRCASE_PARAMETERS, K: 2, L: 2 },
      seed: 123456,
    },
    500,
  );
  f.admission("close");
  const layout = structuredClone(f.room.config.studyLayout);
  const assignments = structuredClone(f.study.generation!.assignments);
  f.admission("open");
  f.admission("close");
  assert.deepEqual(f.room.config.studyLayout, layout);
  assert.deepEqual(f.study.generation!.assignments, assignments);
  assert.equal(assignments.length, 17);
  assert.ok(assignments.every((a) => a.limits.length === 2));
});

test("withdrawing a resting CDA order while paused does not count pause time in the spread", () => {
  const f = fixture(4);
  f.admission("close");
  f.send("teacher", { type: "start" });
  settleDeadline(f.room, 6000, f.events);
  const buyer = f.room.participants.find((p) => p.role === "buyer")!,
    seller = f.room.participants.find((p) => p.role === "seller")!;
  f.send(buyer, { type: "study-quote", price: 90 }, 6100);
  f.send(seller, { type: "study-quote", price: 110 }, 6200);
  f.send("teacher", { type: "pause" }, 7200);
  f.withdraw(seller, 57200);
  const market = f.study.markets[0];
  assert.equal(market.periods[0].spreadMs, 1000);
  assert.equal(market.periods[0].spreadArea, 20000);
  assert.equal(market.spreadValue, null);
  assert.equal(market.deadline, null);
  assert.equal(f.room.phase, "paused");
});

test("single-user demo shares flexible admission, resize, timer and withdrawal behavior", async () => {
  const demo = new DemoSession("cda", "buyer", 1000, {
    config,
    lobby: true,
    teacher: true,
  });
  const send = (
    action: Extract<Command, { type: "study-admission" }>["action"],
    extra: { markets?: number; seconds?: number } = {},
  ) =>
    demo.command({
      type: "study-admission",
      action,
      expectedRevision: demo.getSnapshot().view.study!.lobby!.revision,
      ...extra,
    });
  assert.equal(await send("configure", { markets: 3 }), true);
  assert.equal(await send("schedule", { seconds: 5 }), true);
  demo.tick(1000);
  assert.equal(await send("pause-timer"), true);
  const remaining =
    demo.getSnapshot().view.study!.lobby!.admission!.pausedRemainingMs;
  demo.advanceTime(30);
  assert.equal(demo.getSnapshot().view.study!.lobby!.admission!.status, "open");
  assert.equal(
    demo.getSnapshot().view.study!.lobby!.admission!.pausedRemainingMs,
    remaining,
  );
  assert.equal(await send("resume-timer"), true);
  for (let i = 0; i < 4; i++) demo.tick(1000);
  assert.deepEqual(
    demo
      .getSnapshot()
      .view.config.studyLayout!.map((m) => m.buyers + m.sellers),
    [6, 5, 5],
  );
  assert.equal(await demo.command({ type: "start" }), true);
  demo.advanceTime(10);
  assert.equal(demo.getSnapshot().view.study!.teacher!.markets.length, 3);
  assert.ok(
    demo.getSnapshot().view.study!.teacher!.markets.every((m) => m.round === 1),
  );
});

test("admission HTTP schema rejects invalid timer, target count and extra fields", () => {
  for (const fields of [
    { seconds: 4 },
    { seconds: 3601 },
    { seconds: 5.5 },
    { markets: 0 },
    { markets: 5_000 },
    { markets: 2.5 },
    { studyLayout: [] },
  ]) {
    assert.equal(
      commandSchema.safeParse({
        requestId: randomUUID(),
        expectedRound: 0,
        command: {
          type: "study-admission",
          action: "schedule",
          expectedRevision: 0,
          ...fields,
        },
      }).success,
      false,
    );
  }
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check: () => boolean, timeout = 8000) {
  const end = Date.now() + timeout;
  while (!check()) {
    assert.ok(Date.now() < end, "update did not arrive");
    await sleep(25);
  }
}

test("local database: open enrollment exceeds template capacity; server timer, reconnect, reshaping and withdrawal preserve the room and push correct student markets", async () => {
  const pg = new PGlite(),
    db = localDatabase(pg),
    service = new AuctionService(db),
    broker = new RealtimeBroker(db);
  const stops: (() => void)[] = [],
    views = new Map<string, RoomView>();
  try {
    await migrate(db);
    const teacher = await service.create(
      { ...config, marketSize: 2, capacity: 2 },
      "Local-Flexible-Only-2026",
      "",
    );
    const send = async (token: string, command: Command) => {
      const v = await service.view(teacher.code, token);
      return service.command(teacher.code, token, {
        requestId: randomUUID(),
        expectedRound: v.round,
        expectedStage: v.study!.market.stageKey,
        command,
      });
    };
    const admin = async (
      action: Extract<Command, { type: "study-admission" }>["action"],
      extra: { markets?: number; seconds?: number } = {},
    ) => {
      const v = await service.view(teacher.code, teacher.token);
      return send(teacher.token, {
        type: "study-admission",
        action,
        expectedRevision: v.study!.lobby!.revision,
        ...extra,
      });
    };
    const watch = async (token: string) =>
      stops.push(
        await broker.subscribe(teacher.code, token, (event) => {
          if (event.type === "snapshot")
            views.set(token, event.data as RoomView);
          if (event.type === "patch")
            views.set(
              token,
              applyPatch(views.get(token)!, event.data as RoomPatch),
            );
          if (event.type === "session-error")
            assert.fail(JSON.stringify(event.data));
        }),
      );
    await watch(teacher.token);
    const students: { code: string; token: string }[] = [];
    for (let i = 0; i < 7; i++) {
      const s = await service.join(teacher.code, `Local Student ${i}`, "1234");
      students.push(s);
      await watch(s.token);
      assert.equal(
        (await service.view(teacher.code, s.token)).study!.unitLimits,
        null,
      );
    }
    await until(() => views.get(teacher.token)?.participantCount === 7);
    const original = (
      await service.export(teacher.code, teacher.token)
    ).room.participants.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      tokenHash: p.tokenHash,
    }));
    const scheduled = await admin("schedule", { seconds: 5, markets: 3 });
    assert.equal(
      (await new AuctionService(db).view(teacher.code, teacher.token)).study!
        .lobby!.admission!.closesAt,
      scheduled.study!.lobby!.admission!.closesAt,
    );
    const paused = await admin("pause-timer");
    const remaining = paused.study!.lobby!.admission!.pausedRemainingMs!;
    assert.ok(remaining > 0 && remaining <= 5000);
    const restarted = new AuctionService(db);
    const reconnected = await restarted.view(teacher.code, teacher.token);
    assert.equal(reconnected.study!.lobby!.admission!.closesAt, null);
    assert.equal(
      reconnected.study!.lobby!.admission!.pausedRemainingMs,
      remaining,
    );
    assert.equal(reconnected.study!.lobby!.admission!.timerSeconds, 5);
    await until(
      () =>
        views.get(teacher.token)?.study?.lobby?.admission?.pausedRemainingMs ===
        remaining,
    );
    const resumed = await admin("resume-timer");
    assert.equal(resumed.study!.lobby!.admission!.pausedRemainingMs, undefined);
    assert.ok(resumed.study!.lobby!.admission!.closesAt! > Date.now());
    await until(
      () =>
        views.get(teacher.token)?.study?.lobby?.admission?.status === "closed",
    );
    const allocated = await service.view(teacher.code, teacher.token);
    assert.equal(allocated.phase, "waiting");
    assert.deepEqual(
      allocated.config.studyLayout!.map((m) => m.buyers + m.sellers),
      [3, 2, 2],
    );
    await assert.rejects(
      service.join(teacher.code, "Late Student", "1234"),
      /受付は終了/,
    );
    const reentered = await service.join(
      teacher.code,
      "Local Student 0",
      "1234",
      students[0].token,
    );
    assert.equal(reentered.token, students[0].token);
    const after = await service.export(teacher.code, teacher.token);
    assert.deepEqual(
      after.room.participants.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        tokenHash: p.tokenHash,
      })),
      original,
    );
    const version = allocated.version;
    await admin("open");
    await admin("configure", { markets: 1 });
    const reduced = await admin("close");
    assert.ok(reduced.version > version);
    assert.equal(reduced.study!.teacher!.markets.length, 1);
    const removed = reduced.study!.teacher!.participants[0];
    await send(teacher.token, {
      type: "study-withdraw",
      participantId: removed.id,
      expectedRevision: reduced.study!.lobby!.revision,
    });
    await admin("close");
    await send(teacher.token, { type: "start" });
    await until(
      () =>
        views.get(teacher.token)?.study?.teacher?.markets[0].stage === "cda",
    );
    const withdrawnView = await service.view(teacher.code, students[0].token);
    assert.ok(withdrawnView.me.withdrawnAt);
    await until(
      () => views.get(students[0].token)?.me.withdrawnAt !== undefined,
    );
    const active = await service.view(teacher.code, students[1].token);
    assert.equal(active.study!.market.id, 1);
    await send(students[1].token, {
      type: "study-quote",
      price: active.me.role === "buyer" ? 10 : 900,
    });
    await until(
      () => views.get(students[2].token)?.study?.market.orders.length === 1,
    );
    assert.equal((await service.listRooms(""))[0].participantCount, 6);
    // Merely reconnecting does not remove any active participant or their order.
    await service.join(
      teacher.code,
      "Local Student 1",
      "1234",
      students[1].token,
    );
    assert.equal(
      (await service.view(teacher.code, teacher.token)).participantCount,
      6,
    );
    assert.equal(
      (await service.view(teacher.code, students[1].token)).study!.market.orders
        .length,
      1,
    );
  } finally {
    stops.forEach((stop) => stop());
    await broker.close();
    await pg.close();
  }
});

test("local database: an overdue persisted cutoff is enforced on reads and late joins without a connected browser", async () => {
  const pg = new PGlite(),
    db = localDatabase(pg),
    service = new AuctionService(db);
  try {
    await migrate(db);
    for (const trigger of ["read", "join"]) {
      const teacher = await service.create(
        config,
        "Local-Cutoff-Only-2026",
        "",
      );
      for (let i = 0; i < 3; i++)
        await service.join(teacher.code, `Test${i}`, "1234");
      const view = await service.view(teacher.code, teacher.token);
      await service.command(teacher.code, teacher.token, {
        requestId: randomUUID(),
        expectedRound: 0,
        command: {
          type: "study-admission",
          action: "schedule",
          seconds: 5,
          expectedRevision: view.study!.lobby!.revision,
        },
      });
      // Simulate the saved deadline passing while every browser/server feed was offline.
      const expired = Date.now() - 1000;
      await db.query(
        "UPDATE auction_rooms SET state = jsonb_set(state, '{study,lobby,admission,closesAt}', $2::jsonb) WHERE code = $1",
        [teacher.code, String(expired)],
      );
      const restarted = new AuctionService(db);
      if (trigger === "join")
        await assert.rejects(
          restarted.join(teacher.code, "Late", "1234"),
          /受付は終了/,
        );
      const closed = await restarted.view(teacher.code, teacher.token);
      assert.equal(closed.study!.lobby!.admission!.status, "closed");
      assert.equal(closed.study!.lobby!.admission!.closedAt, expired);
      assert.equal(closed.participantCount, 3);
      assert.equal(closed.phase, "waiting");
      const saved = await service.export(teacher.code, teacher.token);
      assert.equal(
        saved.events.filter((e) => e.type === "admission-closed").length,
        1,
      );
    }
  } finally {
    await pg.close();
  }
});
