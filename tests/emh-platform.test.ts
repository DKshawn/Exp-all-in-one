import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import {
  localDatabase,
  migrate,
  type Database,
} from "../src/lib/server/database";
import { AuctionService } from "../src/experiments/double-auction/server/service";
import { EmhService } from "../src/experiments/emh/server/service";
import { allocationPlan } from "../src/experiments/emh/allocation";
import { experimentFor } from "../src/lib/server/experiment-registry";
import type { Action, Room } from "../src/experiments/emh/types";
import type {
  SessionCommand,
  RequestCommand,
} from "../src/experiments/emh/session-types";
import {
  DEFAULT_CONFIG,
  FORMAL_EXP2_OPTIONS,
} from "../src/experiments/emh/server/default-config";
import {
  DEFAULT_SETTINGS,
  EXP2_SETTINGS,
  settingsSchema,
  type EmhSettings,
} from "../src/experiments/emh/settings";
import {
  createSchema,
  commandSchema,
} from "../src/experiments/emh/server/validation";

let pg: PGlite, db: Database, emh: EmhService, da: AuctionService;
before(async () => {
  pg = new PGlite();
  db = localDatabase(pg);
  await migrate(db);
  emh = new EmhService(db);
  da = new AuctionService(db);
});
after(async () => {
  await pg.close();
});
const password = "Integration-Teacher-2026";
async function classroom(
  n: number,
  settings = DEFAULT_SETTINGS,
  experiment: "exp1" | "exp2" = "exp1",
) {
  const teacher = await emh.create(
    "EMH classroom",
    password,
    "",
    settings,
    experiment,
  );
  const students = [];
  for (let i = 0; i < n; i++)
    students.push({
      ...(await emh.login(teacher.code, {
        role: "student",
        nickname: `s${i}`,
        pin: "1234",
      })),
      name: `s${i}`,
    });
  const get = (
    token = teacher.token,
    role: "teacher" | "student" = "teacher",
    market?: number,
  ) => emh.request(teacher.code, token, role, market);
  async function command(
    kind: Exclude<SessionCommand["kind"], "update-settings">,
  ) {
    const current = await get();
    const input: RequestCommand = {
      scope: "session",
      requestId: randomUUID(),
      command: { kind, expectedRevision: current.state.revision },
    };
    const result = await emh.request(
      teacher.code,
      teacher.token,
      "teacher",
      undefined,
      input,
    );
    assert.equal(
      result.error,
      undefined,
      result.error?.message ?? "command failed",
    );
    if (kind === "start") {
      // Existing trading tests start at the elapsed countdown boundary.
      await db.query(
        "UPDATE emh_markets SET state=jsonb_set(state, '{countdownEndsAt}', to_jsonb((state->>'countdownEndsAt')::bigint - 5000)) WHERE room_code=$1",
        [teacher.code],
      );
      await get();
    }
    return result;
  }
  async function act(
    token: string,
    marketId: number,
    action: Action,
    role: "teacher" | "student" = "student",
  ) {
    return emh.request(teacher.code, token, role, marketId, {
      scope: "market",
      requestId: randomUUID(),
      marketId,
      action,
    });
  }
  return { teacher, students, get, command, act };
}

test("room finish is teacher-only, atomic across markets and idempotent across retries", async () => {
  const c = await classroom(14, { ...DEFAULT_SETTINGS, rounds: 1 });
  await c.command("assign");
  await c.command("start");
  for (const period of ["A", "B"]) {
    const market = (await c.get(c.teacher.token, "teacher", 1)).state.market!;
    assert.equal(market.period, period);
    assert.equal(
      (
        await c.act(
          c.teacher.token,
          1,
          { kind: "end-period", expectedPhase: market.phaseKey },
          "teacher",
        )
      ).error,
      undefined,
    );
  }
  const earlier = (await c.get()).state.market!.results;
  const paused = await c.command("pause-all");
  const finish: RequestCommand = {
    requestId: randomUUID(),
    scope: "session",
    command: { kind: "finish-all", expectedRevision: paused.state.revision },
  };
  assert.ok(commandSchema.safeParse(finish).success);
  const denied = await emh.request(
    c.teacher.code,
    c.students[0].token,
    "student",
    undefined,
    finish,
  );
  assert.equal(denied.error?.status, 403);
  const send = () =>
    emh.request(c.teacher.code, c.teacher.token, "teacher", 2, finish);
  const ended = await send();
  assert.equal(ended.error, undefined);
  assert.equal(ended.state.status, "completed");
  assert.deepEqual(
    ended.state.markets.map((m) => [m.status, m.paused]),
    [
      ["completed", false],
      ["completed", false],
    ],
  );
  assert.deepEqual(
    ended.state.market!.results.map((p) => [p.period, p.reason]),
    [["A", "teacher-finish"]],
  );
  const retry = await send();
  assert.equal(retry.error, undefined);
  assert.equal(retry.state.revision, ended.state.revision);
  assert.deepEqual(retry.state.market!.results, ended.state.market!.results);
  assert.deepEqual((await c.get()).state.market!.results, earlier);
});

test("classroom starts all markets with one enforced countdown", async () => {
  const c = await classroom(14);
  await c.command("assign");
  const before = (await c.get()).state;
  const started = await emh.request(
    c.teacher.code,
    c.teacher.token,
    "teacher",
    undefined,
    {
      scope: "session",
      requestId: randomUUID(),
      command: { kind: "start", expectedRevision: before.revision },
    },
  );
  assert.equal(started.error, undefined);
  assert.equal(started.state.market!.status, "countdown");
  const rows = (
    await db.query<{ state: Room }>(
      "SELECT state FROM emh_markets WHERE room_code=$1 ORDER BY market_id",
      [c.teacher.code],
    )
  ).rows;
  assert.equal(rows.length, 2);
  assert.equal(rows[0].state.countdownEndsAt, rows[1].state.countdownEndsAt);
  assert.equal(rows[0].state.countdownEndsAt! - started.state.serverNow, 5000);
  assert.ok(
    rows.every(
      ({ state }) => state.periodEndsAt === null && state.unitEndsAt === null,
    ),
  );
  const student = (await c.get(c.students[0].token, "student")).state;
  assert.equal(student.market!.status, "countdown");
  const rejected = await c.act(c.students[0].token, student.marketId!, {
    kind: "quote",
    side: "bid",
    price: 100,
    unitKey: student.market!.unitKey,
  });
  assert.equal(rejected.error?.status, 409);
  assert.equal(rejected.state.market!.trades.length, 0);
  await c.command("pause-all");
  const paused = (
    await db.query<{ state: Room }>(
      "SELECT state FROM emh_markets WHERE room_code=$1 ORDER BY market_id",
      [c.teacher.code],
    )
  ).rows;
  assert.ok(
    paused.every(
      ({ state }) => state.status === "countdown" && state.pausedAt !== null,
    ),
  );
  await c.command("resume-all");
  const resumed = (
    await db.query<{ state: Room }>(
      "SELECT state FROM emh_markets WHERE room_code=$1 ORDER BY market_id",
      [c.teacher.code],
    )
  ).rows;
  assert.ok(
    resumed.every(
      ({ state }) => state.status === "countdown" && state.pausedAt === null,
    ),
  );
  assert.equal(
    resumed[0].state.countdownEndsAt,
    resumed[1].state.countdownEndsAt,
  );
  assert.ok(
    resumed[0].state.countdownEndsAt! >= paused[0].state.countdownEndsAt!,
  );
});

test("Exp2 supports variable attendance, custom conditions and locks them on assignment", async () => {
  const c = await classroom(
    11,
    { ...DEFAULT_SETTINGS, initialUnits: 9, periodSeconds: 300 },
    "exp2",
  );
  let current = (await c.get()).state;
  assert.equal(current.experiment, "exp2");
  assert.equal(current.settings!.initialUnits, 9);
  assert.deepEqual(
    current.allocation.map((a) => a.size),
    [11],
  );
  const request = async (command: SessionCommand) =>
    emh.request(c.teacher.code, c.teacher.token, "teacher", undefined, {
      scope: "session",
      requestId: randomUUID(),
      command,
    });
  const invalidSettings = {
    ...current.settings!,
    exp2: { ...current.settings!.exp2!, marketCount: 4 },
  };
  assert.equal(
    (
      await request({
        kind: "update-settings",
        settings: invalidSettings,
        expectedRevision: current.revision,
      })
    ).error,
    undefined,
  );
  current = (await c.get()).state;
  assert.deepEqual(current.allocation, []);
  assert.ok(
    (await request({ kind: "assign", expectedRevision: current.revision }))
      .error,
  );
  const validSettings: EmhSettings = {
    ...current.settings!,
    initialUnits: 4,
    targetMarketSize: 6,
    typeRatios: [2, 1, 1],
    periodSeconds: 180,
    rounds: 3,
    unitSeconds: 15,
    breakSeconds: 45,
    exp2: {
      ...current.settings!.exp2!,
      marketCount: 2,
      emptyUnitsLimit: 3,
      insiderStartRound: 1,
      insiderCountPerType: 1,
      states: {
        prior: [0.2, 0.3, 0.5],
        dividends: [
          [10, 20, 30],
          [40, 50, 60],
          [70, 80, 90],
        ],
      },
    },
  };
  const updated = await request({
    kind: "update-settings",
    settings: validSettings,
    expectedRevision: current.revision,
  });
  assert.equal(updated.error, undefined);
  assert.deepEqual(updated.state.settings, validSettings);
  current = (await c.get()).state;
  assert.deepEqual(
    current.allocation.map((a) => a.size),
    [6, 5],
  );
  await c.command("assign");
  current = (await c.get()).state;
  assert.ok(
    (
      await request({
        kind: "update-settings",
        settings: validSettings,
        expectedRevision: current.revision,
      })
    ).error,
  );
  await c.command("start");
  const studentState = (await c.get(c.students[0]!.token, "student")).state;
  const studentView = studentState.market!;
  assert.equal(studentState.settings, null);
  assert.equal(studentView.exp2!.allDividends, null);
  assert.deepEqual(studentView.exp2!.prior, [0.2, 0.3, 0.5]);
  assert.equal(studentView.initialUnits, 4);
  assert.equal(studentView.emptyUnitsLimit, 3);
  assert.equal(studentView.periodSeconds, 180);
  const conditions = JSON.parse(
    (await emh.export(c.teacher.code, c.teacher.token, "teacher", "conditions"))
      .body,
  );
  assert.equal(conditions.experiment, "emh-exp2");
  assert.deepEqual(conditions.settings, validSettings);
  assert.equal(conditions.markets.length, 2);
  for (const market of conditions.markets) {
    assert.equal(
      market.conditions.assignment.filter(
        (p: { insider: boolean }) => p.insider,
      ).length,
      3,
    );
    assert.equal(market.conditions.rules.maxEmptyUnits, 3);
    assert.deepEqual(
      market.conditions.config.states.prior,
      validSettings.exp2!.states.prior,
    );
    assert.deepEqual(
      market.conditions.config.states.dividends,
      validSettings.exp2!.states.dividends,
    );
    assert.equal(market.conditions.config.states.outcomes.length, 3);
    assert.ok(
      market.conditions.config.states.outcomes.every(
        (state: number) => state >= 1 && state <= 3,
      ),
    );
  }
  assert.deepEqual(
    conditions.markets[0].conditions.config.states.outcomes,
    conditions.markets[1].conditions.config.states.outcomes,
  );
  const drawnStates = conditions.markets[0].conditions.config.states.outcomes;
  const insiderClues: number[] = [];
  for (const student of c.students) {
    const snapshot = (await c.get(student.token, "student")).state;
    assert.equal(snapshot.settings, null);
    assert.equal(JSON.stringify(snapshot).includes('"outcomes"'), false);
    if (snapshot.market!.exp2!.clue !== null)
      insiderClues.push(snapshot.market!.exp2!.clue!);
  }
  assert.equal(insiderClues.length, 6);
  assert.ok(insiderClues.every((state) => state === drawnStates[0]));
  await c.command("pause-all");
  await c.command("resume-all");
  const reloaded = JSON.parse(
    (await emh.export(c.teacher.code, c.teacher.token, "teacher", "conditions"))
      .body,
  );
  assert.deepEqual(
    reloaded.markets.map(
      (market: {
        conditions: { config: { states: { outcomes: number[] } } };
      }) => market.conditions.config.states.outcomes,
    ),
    [drawnStates, drawnStates],
  );
});

test("Exp2 allocation validates a chosen market count without requiring multiples of 12", () => {
  const opts = { ...structuredClone(FORMAL_EXP2_OPTIONS), marketCount: 2 };
  const settings = {
    ...EXP2_SETTINGS,
    exp2: opts,
    targetMarketSize: 7,
    typeRatios: [2, 1, 1] as [number, number, number],
  };
  assert.deepEqual(
    allocationPlan(11, settings).map((group) => group.size),
    [6, 5],
  );
  assert.deepEqual(allocationPlan(5, settings), []);
  assert.deepEqual(
    allocationPlan(25, settings).map((group) => group.size),
    [13, 12],
  );
  assert.deepEqual(
    allocationPlan(30, {
      ...settings,
      targetMarketSize: 30,
      exp2: { ...opts, marketCount: 1 },
    }).map((group) => group.size),
    [30],
  );
  assert.equal(
    settingsSchema.safeParse({
      ...settings,
      exp2: { ...opts, states: { ...opts.states, prior: [0.5, 0.5, 0.5] } },
    }).success,
    false,
  );
});

test("new Exp2 draws once for all markets, keeps the draw on retry and exposes only the insider's clue", async () => {
  const options = structuredClone(FORMAL_EXP2_OPTIONS);
  options.marketCount = 2;
  options.insiderStartRound = 1;
  options.insiderCountPerType = 1;
  options.states.prior = [0, 0, 1];
  const c = await classroom(
    6,
    { ...EXP2_SETTINGS, rounds: 3, exp2: options },
    "exp2",
  );
  await c.command("assign");
  const revision = (await c.get()).state.revision;
  const input: RequestCommand = {
    scope: "session",
    requestId: randomUUID(),
    command: { kind: "start", expectedRevision: revision },
  };
  const start = await emh.request(
    c.teacher.code,
    c.teacher.token,
    "teacher",
    undefined,
    input,
  );
  assert.equal(start.error, undefined);
  const retry = await emh.request(
    c.teacher.code,
    c.teacher.token,
    "teacher",
    undefined,
    input,
  );
  assert.equal(retry.error, undefined);
  const exported = JSON.parse(
    (await emh.export(c.teacher.code, c.teacher.token, "teacher", "conditions"))
      .body,
  );
  for (const market of exported.markets)
    assert.deepEqual(market.conditions.config.states.outcomes, [3, 3, 3]);
  for (const student of c.students) {
    const snapshot = (await c.get(student.token, "student")).state;
    assert.equal(snapshot.market!.exp2!.clue, 3);
    assert.equal(snapshot.market!.exp2!.state, null);
    assert.equal(JSON.stringify(snapshot).includes('"outcomes"'), false);
  }
});

test("legacy assigned Exp2 rooms preserve their saved states on start", async () => {
  const c = await classroom(3, EXP2_SETTINGS, "exp2");
  await c.command("assign");
  await db.query(
    "UPDATE emh_sessions SET state=jsonb_set(state, '{settings,exp2,states,outcomes}', '[2,1,2,1,2,1]'::jsonb) WHERE code=$1",
    [c.teacher.code],
  );
  await db.query(
    "UPDATE emh_markets SET state=jsonb_set(state, '{config,states,outcomes}', '[2,1,2,1,2,1]'::jsonb) WHERE room_code=$1",
    [c.teacher.code],
  );
  await c.command("start");
  const exported = JSON.parse(
    (await emh.export(c.teacher.code, c.teacher.token, "teacher", "conditions"))
      .body,
  );
  assert.deepEqual(
    exported.markets[0].conditions.config.states.outcomes,
    [2, 1, 2, 1, 2, 1],
  );
  assert.equal("outcomes" in exported.settings.exp2.states, false);
});

test("Exp2 can assign fifteen real students to one market", async () => {
  const c = await classroom(
    15,
    {
      ...EXP2_SETTINGS,
      exp2: { ...structuredClone(FORMAL_EXP2_OPTIONS), marketCount: 1 },
    },
    "exp2",
  );
  assert.deepEqual(
    (await c.get()).state.allocation.map((a) => [a.size, ...a.typeCounts]),
    [[15, 5, 5, 5]],
  );
  await c.command("assign");
  await c.command("start");
  const student = (await c.get(c.students[0]!.token, "student")).state;
  assert.equal(student.market!.participantCount, 15);
  assert.equal(student.market!.exp2!.allDividends, null);
});

test("every attendance 3–999 includes everyone, balances groups and types locally and across the class", () => {
  assert.deepEqual(allocationPlan(0), []);
  for (let n = 3; n <= 999; n++) {
    const groups = allocationPlan(n);
    const sizes = groups.map((g) => g.size);
    assert.equal(
      sizes.reduce((a, b) => a + b, 0),
      n,
    );
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
    assert.ok(sizes.every((size) => size >= 3 && size <= 12));
    const totals = [0, 0, 0];
    for (const group of groups) {
      assert.equal(
        group.typeCounts.reduce((a, b) => a + b, 0),
        group.size,
      );
      assert.ok(
        Math.max(...group.typeCounts) - Math.min(...group.typeCounts) <= 1,
      );
      group.typeCounts.forEach((v, i) => (totals[i] += v));
    }
    assert.ok(Math.max(...totals) - Math.min(...totals) <= 1);
  }
  assert.deepEqual(
    allocationPlan(30).map((g) => g.size),
    [10, 10, 10],
  );
  assert.deepEqual(
    allocationPlan(100).map((g) => g.size),
    [10, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9],
  );
  for (const bad of [-1, 3.5, 1000]) assert.throws(() => allocationPlan(bad));
});

test("shared registry preserves both experiments and safely backfills existing room codes", async () => {
  const first = await emh.create("EMH", password, "");
  const second = await da.create(
    { title: "DA", capacity: 12, rounds: 1, duration: 60 },
    password,
    "",
  );
  assert.equal(await experimentFor(first.code, db), "emh");
  assert.equal(await experimentFor(second.code, db), "institutions");
  assert.notEqual(first.code, second.code);
  assert.equal(
    (await emh.listRooms("")).find((r) => r.code === first.code)?.experiment,
    "emh",
  );
  assert.ok((await da.listRooms("")).some((r) => r.code === second.code));
  await db.query("DELETE FROM lab_room_registry WHERE code=$1", [second.code]);
  await migrate(db);
  assert.equal(await experimentFor(second.code, db), "institutions");
  await da.deleteRoom(second.code, "");
  assert.equal(await experimentFor(second.code, db), null);
  await emh.deleteRoom(first.code, "");
  assert.equal(await experimentFor(first.code, db), null);
});

test("30 students become three private markets; all six-round default conditions remain unchanged", async () => {
  const c = await classroom(30);
  const open = await c.get();
  await c.command("assign");
  const stale = await emh.request(
    c.teacher.code,
    c.teacher.token,
    "teacher",
    undefined,
    {
      scope: "session",
      requestId: randomUUID(),
      command: { kind: "start", expectedRevision: open.state.revision },
    },
  );
  assert.ok(stale.error);
  const assigned = await c.get();
  assert.equal(assigned.state.market, null);
  assert.deepEqual(
    assigned.state.allocation.map((m) => m.size),
    [10, 10, 10],
  );
  assert.equal(new Set(assigned.state.participants.map((p) => p.id)).size, 30);
  await assert.rejects(
    emh.login(c.teacher.code, {
      role: "student",
      nickname: "late",
      pin: "1234",
    }),
  );
  await c.command("start");
  const stored = await db.query<{ state: Room }>(
    "SELECT state FROM emh_markets WHERE room_code=$1 ORDER BY market_id",
    [c.teacher.code],
  );
  assert.equal(stored.rows.length, 3);
  for (const { state } of stored.rows) {
    assert.deepEqual(state.config, {
      ...DEFAULT_CONFIG,
      title: "EMH classroom",
    });
    assert.equal(
      state.participants.reduce((s, p) => s + p.holdings, 0),
      20,
    );
    assert.equal(state.participants.length, 10);
    assert.deepEqual(
      [1, 2, 3].map(
        (type) => state.participants.filter((p) => p.type === type).length,
      ),
      state.typeCounts,
    );
  }
  const student = (await c.get(c.students[0].token, "student")).state;
  assert.equal(student.allocation.length, 0);
  assert.equal(student.markets.length, 0);
  assert.equal(student.participants.length, 0);
  assert.equal(student.market?.participants.length, 0);
  assert.equal(student.market?.conditions, null);
  assert.equal(student.market?.me?.holdings, 2);
  const serialized = JSON.stringify(student);
  for (const secret of [
    "pinHash",
    "tokenHash",
    "teacherPasswordHash",
    '"nickname"',
  ])
    assert.ok(!serialized.includes(secret));
  await assert.rejects(
    c.get(c.students[0].token, "student", student.marketId === 1 ? 2 : 1),
  );
  await assert.rejects(c.get(c.students[0].token, "teacher"));
  await assert.rejects(c.get(c.teacher.token, "student"));
  const denied = await c.act(c.students[0].token, student.marketId!, {
    kind: "end-period",
    expectedPhase: student.market!.phaseKey,
  });
  assert.ok(denied.error);
  const conditions = JSON.parse(
    (await emh.export(c.teacher.code, c.teacher.token, "teacher", "conditions"))
      .body,
  );
  assert.equal(conditions.markets.length, 3);
  for (const secret of ["pinHash", "tokenHash", "teacherPasswordHash"])
    assert.ok(!JSON.stringify(conditions).includes(secret));
  await assert.rejects(
    emh.export(c.teacher.code, c.students[0].token, "student", "conditions"),
  );
  const personal = (
    await emh.export(c.teacher.code, c.students[0].token, "student", "personal")
  ).body;
  assert.ok(!personal.includes('"dividends"'));
  await assert.rejects(
    emh.export(
      c.teacher.code,
      c.students[0].token,
      "student",
      "trades",
      student.marketId === 1 ? 2 : 1,
    ),
  );
  await c.command("pause-all");
  assert.ok((await c.get()).state.markets.every((m) => m.paused));
  await c.command("resume-all");
  assert.ok((await c.get()).state.markets.every((m) => !m.paused));
  const premature = await emh.request(
    c.teacher.code,
    c.teacher.token,
    "teacher",
    undefined,
    {
      scope: "session",
      requestId: randomUUID(),
      command: {
        kind: "reveal-all",
        expectedRevision: (await c.get()).state.revision,
      },
    },
  );
  assert.ok(premature.error);
});

test("market trades, payouts and retries stay isolated; concurrent accept settles once", async () => {
  const c = await classroom(14);
  await c.command("assign");
  await c.command("start");
  const views = await Promise.all(
    c.students.map(async (s) => ({
      s,
      v: (await c.get(s.token, "student")).state,
    })),
  );
  const group = views.filter((p) => p.v.marketId === 1);
  const untouched = (await c.get(c.teacher.token, "teacher", 2)).state.market!;
  const seller = group[0],
    buyer = group[1];
  const quoted = await c.act(seller.s.token, 1, {
    kind: "quote",
    side: "ask",
    price: 300,
    unitKey: seller.v.market!.unitKey,
  });
  assert.equal(quoted.error, undefined);
  const offer = quoted.state.market!.ask!;
  const input: RequestCommand = {
    requestId: randomUUID(),
    scope: "market",
    marketId: 1,
    action: {
      kind: "accept",
      side: "ask",
      quoteId: offer.id,
      unitKey: quoted.state.market!.unitKey,
    },
  };
  const results = await Promise.all(
    [1, 2].map(() =>
      emh.request(c.teacher.code, buyer.s.token, "student", 1, input),
    ),
  );
  assert.ok(results.every((r) => !r.error));
  const traded = (await c.get(c.teacher.token, "teacher", 1)).state.market!;
  assert.equal(traded.trades.length, 1);
  assert.equal(
    (await c.get(c.teacher.token, "teacher", 2)).state.market!.revision,
    untouched.revision,
  );
  const changed = await emh.request(
    c.teacher.code,
    buyer.s.token,
    "student",
    1,
    {
      ...input,
      action: { kind: "quote", side: "bid", price: 1, unitKey: traded.unitKey },
    },
  );
  assert.ok(changed.error);
  const nextQuote = await c.act(seller.s.token, 1, {
    kind: "quote",
    side: "ask",
    price: 301,
    unitKey: traded.unitKey,
  });
  const nextOffer = nextQuote.state.market!.ask!;
  const attempts = await Promise.all(
    group.slice(1, 3).map((p) =>
      c.act(p.s.token, 1, {
        kind: "accept",
        side: "ask",
        quoteId: nextOffer.id,
        unitKey: nextQuote.state.market!.unitKey,
      }),
    ),
  );
  assert.equal(attempts.filter((r) => !r.error).length, 1);
  let current = (await c.get(c.teacher.token, "teacher", 1)).state.market!;
  await c.act(
    c.teacher.token,
    1,
    { kind: "end-period", expectedPhase: current.phaseKey },
    "teacher",
  );
  current = (await c.get(c.teacher.token, "teacher", 1)).state.market!;
  assert.equal(current.period, "B");
  assert.equal(current.results[0].maxDividend, 14 * 257);
  assert.equal(
    (await c.get(c.teacher.token, "teacher", 2)).state.market!.period,
    "A",
  );
  const all = (
    await emh.export(c.teacher.code, c.teacher.token, "teacher", "trades")
  ).body;
  assert.equal(all.split('"market"').length, 2);
  assert.equal(all.split("\r\n").length, 3);
  assert.ok(all.startsWith('\uFEFF"market",'));
});

test("reopening keeps all participants, replaces unstarted allocations, and allows PIN re-entry", async () => {
  const c = await classroom(3);
  await c.command("assign");
  await c.command("reopen");
  await emh.login(c.teacher.code, {
    role: "student",
    nickname: "late",
    pin: "1234",
  });
  await c.command("assign");
  assert.equal((await c.get()).state.participantCount, 4);
  await assert.rejects(
    emh.login(c.teacher.code, { role: "student", nickname: "s0", pin: "9999" }),
  );
  const renewed = await emh.login(c.teacher.code, {
    role: "student",
    nickname: "s0",
    pin: "1234",
  });
  await assert.rejects(c.get(c.students[0].token, "student"));
  assert.equal(
    (await c.get(renewed.token, "student")).state.status,
    "assigned",
  );
  await c.command("start");
  const forbidden = await emh.request(
    c.teacher.code,
    c.teacher.token,
    "teacher",
    undefined,
    {
      scope: "session",
      requestId: randomUUID(),
      command: {
        kind: "reopen",
        expectedRevision: (await c.get()).state.revision,
      },
    },
  );
  assert.ok(forbidden.error);
  await emh.deleteRoom(c.teacher.code, "");
  assert.equal(
    (
      await db.query("SELECT * FROM emh_markets WHERE room_code=$1", [
        c.teacher.code,
      ])
    ).rows.length,
    0,
  );
});

test("clock changes survive a stale action and complete every default round before reveal", async () => {
  const c = await classroom(3);
  await c.command("assign");
  await c.command("start");
  const before = (await c.get(c.students[0].token, "student")).state;
  const record = await db.query<{ state: Room }>(
    "SELECT state FROM emh_markets WHERE room_code=$1",
    [c.teacher.code],
  );
  const room = record.rows[0].state;
  room.periodEndsAt = Date.now() - 1;
  room.unitEndsAt = room.periodEndsAt;
  await db.query("UPDATE emh_markets SET state=$2::jsonb WHERE room_code=$1", [
    c.teacher.code,
    JSON.stringify(room),
  ]);
  const stale = await c.act(c.students[0].token, 1, {
    kind: "quote",
    side: "bid",
    price: 1,
    unitKey: before.market!.unitKey,
  });
  assert.ok(stale.error);
  assert.equal(stale.state.market!.period, "B");
  for (let i = 0; i < 20; i++) {
    const market = (await c.get()).state.market!;
    if (market.status === "completed") break;
    const step = await c.act(
      c.teacher.token,
      1,
      {
        kind: market.status === "break" ? "next-year" : "end-period",
        expectedPhase: market.phaseKey,
      },
      "teacher",
    );
    assert.equal(step.error, undefined);
  }
  const finished = (await c.get()).state;
  assert.equal(finished.status, "completed");
  assert.equal(finished.market!.results.length, 12);
  const individualReveal = await c.act(
    c.teacher.token,
    1,
    { kind: "reveal", expectedPhase: finished.market!.phaseKey },
    "teacher",
  );
  assert.ok(individualReveal.error);
  const allRevealed = await c.command("reveal-all");
  assert.ok(allRevealed.state.markets.every((m) => m.revealed));
  const revealed = (await c.get(c.students[0].token, "student")).state.market!;
  assert.deepEqual(revealed.conditions, DEFAULT_CONFIG.dividends);
  assert.equal(revealed.me!.holdings, 0);
});

test("EMH API preserves fixed dividends and rounds and validates command scope", () => {
  assert.ok(createSchema.safeParse({ title: "EMH", password }).success);
  assert.equal(
    createSchema.parse({ title: "EMH", password, experiment: "exp2" }).settings
      .periodSeconds,
    300,
  );
  assert.ok(
    !createSchema.safeParse({ title: "EMH", password, rounds: 1 }).success,
  );
  assert.ok(
    !commandSchema.safeParse({
      scope: "market",
      requestId: randomUUID(),
      marketId: 1,
      action: { kind: "start", expectedPhase: "x" },
    }).success,
  );
});

test("weighted allocations include everyone and preserve all types across supported target sizes", () => {
  for (const targetMarketSize of [3, 4, 6, 9, 12]) {
    for (const typeRatios of [
      [1, 1, 1],
      [2, 1, 1],
      [1, 5, 2],
      [100, 1, 1],
    ] as [number, number, number][]) {
      for (let n = 3; n <= 999; n++) {
        const groups = allocationPlan(n, {
          ...DEFAULT_SETTINGS,
          targetMarketSize,
          typeRatios,
        });
        assert.equal(
          groups.reduce((sum, g) => sum + g.size, 0),
          n,
        );
        const sizes = groups.map((g) => g.size);
        assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
        for (const group of groups) {
          assert.ok(group.size >= 3 && group.size <= 12);
          assert.ok(
            group.typeCounts.every((v) => Number.isInteger(v) && v >= 1),
          );
          assert.equal(
            group.typeCounts.reduce((a, b) => a + b, 0),
            group.size,
          );
        }
      }
    }
  }
  const settings: EmhSettings = {
    ...DEFAULT_SETTINGS,
    targetMarketSize: 8,
    typeRatios: [2, 1, 1],
  };
  assert.deepEqual(
    allocationPlan(16, settings).map((g) => g.typeCounts),
    [
      [4, 2, 2],
      [4, 2, 2],
    ],
  );
  assert.deepEqual(
    allocationPlan(28).map((g) => g.size),
    [10, 9, 9],
  );
  assert.deepEqual(allocationPlan(2), []);
});

test("custom settings persist, lock with assignments, reject stale edits, and survive retry and refresh", async () => {
  const initial: EmhSettings = {
    initialUnits: 5,
    targetMarketSize: 8,
    typeRatios: [2, 1, 1],
    periodSeconds: 180,
    rounds: 6,
    unitSeconds: 30,
    breakSeconds: 60,
  };
  const c = await classroom(8, initial);
  const before = (await c.get()).state;
  assert.deepEqual(before.settings, initial);
  const changed: EmhSettings = {
    ...initial,
    initialUnits: 4,
    periodSeconds: 120,
    rounds: 3,
    unitSeconds: 17,
    breakSeconds: 42,
  };
  const update: RequestCommand = {
    scope: "session",
    requestId: randomUUID(),
    command: {
      kind: "update-settings",
      settings: changed,
      expectedRevision: before.revision,
    },
  };
  const saved = await emh.request(
    c.teacher.code,
    c.teacher.token,
    "teacher",
    undefined,
    update,
  );
  assert.equal(saved.error, undefined);
  assert.deepEqual(saved.state.settings, changed);
  const repeated = await emh.request(
    c.teacher.code,
    c.teacher.token,
    "teacher",
    undefined,
    update,
  );
  assert.equal(repeated.state.revision, saved.state.revision);
  assert.equal(repeated.error, undefined);
  const stale = await emh.request(
    c.teacher.code,
    c.teacher.token,
    "teacher",
    undefined,
    { ...update, requestId: randomUUID() },
  );
  assert.ok(stale.error);
  const studentEdit = await emh.request(
    c.teacher.code,
    c.students[0].token,
    "student",
    undefined,
    { ...update, requestId: randomUUID() },
  );
  assert.equal(studentEdit.error?.status, 403);
  assert.equal(studentEdit.state.settings, null);
  await c.command("assign");
  const assigned = (await c.get()).state;
  assert.ok(assigned.settingsLockedAt);
  const snapshot = async () =>
    (
      await db.query<{ state: Room }>(
        "SELECT state FROM emh_markets WHERE room_code=$1 ORDER BY market_id",
        [c.teacher.code],
      )
    ).rows.map(({ state }) => state);
  const frozen = (await snapshot())[0];
  assert.deepEqual(frozen.typeCounts, [4, 2, 2]);
  assert.ok(
    frozen.participants.every((p) => p.type !== null && p.seat !== null),
  );
  const assignments = frozen.participants.map((p) => [p.id, p.seat, p.type]);
  const denied = await emh.request(
    c.teacher.code,
    c.teacher.token,
    "teacher",
    undefined,
    {
      ...update,
      requestId: randomUUID(),
      command: {
        kind: "update-settings",
        settings: initial,
        expectedRevision: assigned.revision,
      },
    },
  );
  assert.match(denied.error!.message, /確定後/);
  await c.get();
  await c.command("start");
  const running = (await snapshot())[0];
  assert.deepEqual(
    running.participants.map((p) => [p.id, p.seat, p.type]),
    assignments,
  );
  assert.equal(
    running.participants.reduce((sum, p) => sum + p.holdings, 0),
    32,
  );
  assert.equal(running.config.periodSeconds, 120);
  assert.equal(running.config.rounds, 3);
  assert.equal(running.config.unitSeconds, 17);
  assert.equal(running.config.breakSeconds, 42);
  assert.equal(
    running.unitEndsAt! -
      running.events.find((e) => e.kind === "period-started")!.at,
    17000,
  );
  const start = running.events.find((e) => e.kind === "period-started")!.at;
  assert.equal(running.periodEndsAt! - start, 120000);
  const teacherView = (await c.get()).state;
  const locked = await emh.request(
    c.teacher.code,
    c.teacher.token,
    "teacher",
    undefined,
    {
      ...update,
      requestId: randomUUID(),
      command: {
        kind: "update-settings",
        settings: initial,
        expectedRevision: teacherView.revision,
      },
    },
  );
  assert.ok(locked.error);
  const student = (await c.get(c.students[0].token, "student")).state;
  assert.equal(student.settings, null);
  assert.equal(student.market!.initialUnits, 4);
  assert.equal(student.market!.conditions, null);
  const exported = JSON.parse(
    (await emh.export(c.teacher.code, c.teacher.token, "teacher", "conditions"))
      .body,
  );
  assert.deepEqual(exported.settings, changed);
  assert.equal(exported.settingsLockedAt, assigned.settingsLockedAt);
  assert.equal(exported.markets[0].conditions.rules.participants, 8);
  assert.equal(exported.markets[0].conditions.rules.totalUnits, 32);
  assert.deepEqual(exported.markets[0].conditions.typeCounts, [4, 2, 2]);
  const market = (await c.get()).state.market!;
  await c.act(
    c.teacher.token,
    1,
    { kind: "end-period", expectedPhase: market.phaseKey },
    "teacher",
  );
  const result = (await c.get()).state.market!.results[0];
  assert.equal(result.initialDividend, 4 * (4 * 216 + 2 * 200 + 2 * 257));
  assert.equal(result.actualDividend, result.initialDividend);
  assert.equal(result.maxDividend, 32 * 257);
  assert.equal(result.gainEfficiency, 0);
  const results = (
    await emh.export(c.teacher.code, c.teacher.token, "teacher", "results")
  ).body;
  assert.ok(results.includes('"initial_units","total_units","period_seconds"'));
  assert.ok(results.endsWith('"8","4","32","120"'));
});

test("explicitly releasing an unstarted allocation unlocks settings; legacy rooms use defaults", async () => {
  const c = await classroom(3);
  await db.query(
    "UPDATE emh_sessions SET state=state-'settings'-'settingsLockedAt' WHERE code=$1",
    [c.teacher.code],
  );
  assert.deepEqual((await c.get()).state.settings, DEFAULT_SETTINGS);
  await c.command("assign");
  await c.command("reopen");
  const open = (await c.get()).state;
  assert.equal(open.settingsLockedAt, null);
  const next = { ...DEFAULT_SETTINGS, initialUnits: 7 };
  const saved = await emh.request(
    c.teacher.code,
    c.teacher.token,
    "teacher",
    undefined,
    {
      scope: "session",
      requestId: randomUUID(),
      command: {
        kind: "update-settings",
        settings: next,
        expectedRevision: open.revision,
      },
    },
  );
  assert.equal(saved.error, undefined);
  await c.command("assign");
  await c.command("start");
  assert.equal(
    (await c.get(c.students[0].token, "student")).state.market!.me!.holdings,
    7,
  );
});

test("settings reject invalid ratios, supplies, group sizes and clocks at the API boundary", () => {
  for (const patch of [
    { initialUnits: 0 },
    { initialUnits: 21 },
    { initialUnits: 1.5 },
    { targetMarketSize: 2 },
    { targetMarketSize: 13 },
    { typeRatios: [0, 1, 1] },
    { typeRatios: [1, 1] },
    { typeRatios: [1, 1, 101] },
    { typeRatios: [1, 1, 1.5] },
    { periodSeconds: 59 },
    { periodSeconds: 1801 },
    { periodSeconds: 90.5 },
    { dividends: [] },
  ]) {
    const settings = { ...DEFAULT_SETTINGS, ...patch };
    assert.equal(settingsSchema.safeParse(settings).success, false);
    assert.equal(
      createSchema.safeParse({ title: "EMH", password, settings }).success,
      false,
    );
    assert.equal(
      commandSchema.safeParse({
        scope: "session",
        requestId: randomUUID(),
        command: { kind: "update-settings", settings, expectedRevision: 0 },
      }).success,
      false,
    );
  }
  assert.deepEqual(
    createSchema.parse({ title: "EMH", password }).settings,
    DEFAULT_SETTINGS,
  );
});
