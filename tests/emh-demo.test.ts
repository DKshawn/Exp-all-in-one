import assert from "node:assert/strict";
import { test } from "node:test";
import {
  advanceDemoTime,
  demoTraderValue,
  makeDemo,
  makeDemoMarkets,
  PRACTICE_EXP2_OPTIONS,
} from "../src/experiments/emh/demo-model";
import { allocationPlan } from "../src/experiments/emh/allocation";
import {
  act,
  advanceClock,
  assignParticipants,
  phaseKey,
  view,
} from "../src/experiments/emh/engine";
import {
  DEFAULT_SETTINGS,
  EXP2_SETTINGS,
} from "../src/experiments/emh/settings";
import { exportData } from "../src/experiments/emh/export";

test("both EMH demos run 5,000 seats in markets with the formal size rules", () => {
  const now = 1793580000000;
  for (const experiment of ["exp1", "exp2"] as const) {
    const settings = experiment === "exp1" ? DEFAULT_SETTINGS : EXP2_SETTINGS;
    const rooms = makeDemoMarkets("Capacity", settings, now, experiment, 5000);
    const allocation = allocationPlan(5000, settings);
    assert.equal(rooms.length, allocation.length);
    assert.deepEqual(
      rooms.map((room) => room.participants.length),
      allocation.map((market) => market.size),
    );
    assert.equal(
      rooms.reduce((total, room) => total + room.participants.length, 0),
      5000,
    );
    for (const room of rooms) {
      assert.ok(room.participants.length <= (experiment === "exp1" ? 12 : 999));
      assignParticipants(room);
      assert.ok(room.typeCounts!.every((count) => count >= 1));
      act(
        room,
        { role: "teacher" },
        { kind: "start", expectedPhase: phaseKey(room) },
        now,
      );
      advanceClock(room, now + 5000);
      assert.equal(room.status, "trading");
    }
    assert.throws(() =>
      makeDemoMarkets("Capacity", settings, now, experiment, 5001),
    );
  }
});

test("EMH demo uses formal settings limits, allocation, clocks, reset and settlement through six rounds", () => {
  let now = 1793580000000;
  const settings = {
    ...DEFAULT_SETTINGS,
    initialUnits: 5,
    targetMarketSize: 8,
    typeRatios: [2, 1, 1] as [number, number, number],
    periodSeconds: 90,
  };
  const room = makeDemo("Demo", settings, now);
  assert.equal(room.participants.length, 8);
  assert.deepEqual(room.typeCounts, allocationPlan(8, settings)[0].typeCounts);
  assert.equal(room.config.initialUnits, 5);
  assert.equal(room.config.periodSeconds, 90);
  assert.equal(room.config.rounds, 6);
  assert.equal(room.config.breakSeconds, 60);
  assignParticipants(room, () => 0.4);
  const assignment = room.participants.map((p) => [p.id, p.type, p.seat]);
  const teacher = { role: "teacher" as const };
  const command = (kind: "start" | "end-period" | "next-year") =>
    act(room, teacher, { kind, expectedPhase: phaseKey(room) }, ++now);
  command("start");
  now += 5000;
  advanceClock(room, now);
  assert.deepEqual(
    room.participants.map((p) => [p.id, p.type, p.seat]),
    assignment,
  );
  assert.equal(room.periodEndsAt, now + 90000);
  assert.equal(
    room.participants.reduce((sum, p) => sum + p.holdings, 0),
    40,
  );
  assert.equal(
    view(room, { role: "student", participantId: "demo-0" }, now).initialUnits,
    5,
  );
  for (let round = 1; round <= 6; round++) {
    command("end-period");
    command("end-period");
    assert.ok(room.participants.every((p) => p.holdings === 0));
    if (round < 6) {
      command("next-year");
      assert.ok(room.participants.every((p) => p.holdings === 5));
    }
  }
  assert.equal(room.status, "completed");
  assert.equal(room.results.length, 12);
  for (const result of room.results) {
    const dividends = room.config.dividends.map((d) =>
      result.period === "A" ? d.a : d.b,
    );
    assert.equal(
      result.initialDividend,
      5 * (4 * dividends[0] + 2 * dividends[1] + 2 * dividends[2]),
    );
    assert.equal(result.actualDividend, result.initialDividend);
    assert.equal(result.maxDividend, 40 * Math.max(...dividends));
    assert.equal(result.gainEfficiency, 0);
  }
  assert.equal(
    JSON.parse(exportData(room, teacher, "conditions").body).rules.totalUnits,
    40,
  );
});

test("EMH demo scales the virtual group and rejects settings rejected by the classroom", () => {
  for (let size = 3; size <= 12; size++) {
    const room = makeDemo(
      "Demo",
      { ...DEFAULT_SETTINGS, targetMarketSize: size },
      Date.now(),
    );
    assert.equal(room.participants.length, size);
    assert.equal(
      room.participants.filter((p) => p.id !== "demo-0").length,
      size - 1,
    );
    assert.ok(room.typeCounts!.every((n) => n >= 1));
  }
  for (const change of [
    { initialUnits: 0 },
    { targetMarketSize: 13 },
    { periodSeconds: 59 },
    { typeRatios: [0, 1, 1] as [number, number, number] },
  ])
    assert.throws(() =>
      makeDemo("Demo", { ...DEFAULT_SETTINGS, ...change }, Date.now()),
    );
});

test("Exp2 demo can use a market larger than twelve participants", () => {
  const room = makeDemo(
    "Large",
    { ...EXP2_SETTINGS, targetMarketSize: 30, exp2: PRACTICE_EXP2_OPTIONS },
    0,
    "exp2",
  );
  assert.equal(room.participants.length, 30);
  assert.deepEqual(room.typeCounts, [10, 10, 10]);
});

test("Exp2 demo uses adjustable securities, practice conditions, and private-information bot valuations", () => {
  let now = 1793580000000;
  const room = makeDemo(
    "Exp2 demo",
    { ...EXP2_SETTINGS, initialUnits: 10 },
    now,
    "exp2",
  );
  assert.equal(room.participants.length, 12);
  assert.deepEqual(room.typeCounts, [4, 4, 4]);
  assert.equal(room.config.initialUnits, 10);
  assert.equal(room.config.periodSeconds, 300);
  assert.deepEqual(room.config.states!.outcomes, []);
  assignParticipants(room, () => 0.999);
  const insider = room.participants.find((p) => p.type === 1 && p.insider)!;
  const uninformed = room.participants.find((p) => p.type === 1 && !p.insider)!;
  const teacher = { role: "teacher" as const };
  const command = (kind: "start" | "end-period" | "next-year") =>
    act(
      room,
      teacher,
      { kind, expectedPhase: phaseKey(room) },
      ++now,
      () => 0.999,
    );
  command("start");
  assert.deepEqual(room.config.states!.outcomes, [3, 3, 3, 3, 3, 3]);
  now += 5000;
  advanceClock(room, now);
  const expected = 80 * 0.35 + 110 * 0.42 + 170 * 0.23;
  assert.ok(Math.abs(demoTraderValue(room, insider) - expected) < 1e-8);
  for (let round = 1; round <= 6; round++) {
    assert.equal(
      view(room, { role: "student", participantId: insider.id }, now).exp2!
        .clue,
      round > 2 ? room.config.states!.outcomes[round - 1] : null,
    );
    assert.equal(
      view(room, { role: "student", participantId: uninformed.id }, now).exp2!
        .clue,
      null,
    );
    assert.ok(Math.abs(demoTraderValue(room, uninformed) - expected) < 1e-8);
    if (round > 2)
      assert.equal(
        demoTraderValue(room, insider),
        room.config.states!.dividends[0]![
          room.config.states!.outcomes[round - 1]! - 1
        ],
      );
    command("end-period");
    assert.ok(room.participants.every((p) => p.holdings === 0));
    if (round < 6) command("next-year");
  }
  assert.equal(room.status, "completed");
  assert.equal(room.results.length, 6);
});

test("custom round, trade and break timing applies to both demo experiments", () => {
  for (const experiment of ["exp1", "exp2"] as const) {
    let now = 1793580000000;
    const settings = {
      ...DEFAULT_SETTINGS,
      rounds: 3,
      unitSeconds: 13,
      breakSeconds: 37,
    };
    const room = makeDemo("Timing", settings, now, experiment);
    assert.equal(room.config.rounds, 3);
    assert.equal(room.config.unitSeconds, 13);
    assert.equal(room.config.breakSeconds, 37);
    assignParticipants(room, () => 0.4);
    const teacher = { role: "teacher" as const };
    const command = (kind: "start" | "end-period" | "next-year") =>
      act(room, teacher, { kind, expectedPhase: phaseKey(room) }, ++now);
    command("start");
    now += 5000;
    advanceClock(room, now);
    assert.equal(room.unitEndsAt, now + 13000);
    for (let round = 1; round <= 3; round++) {
      command("end-period");
      if (experiment === "exp1") command("end-period");
      if (round < 3) {
        assert.equal(room.breakEndsAt, now + 37000);
        command("next-year");
      }
    }
    assert.equal(room.status, "completed");
    assert.equal(room.results.length, experiment === "exp1" ? 6 : 3);
  }
  assert.throws(() =>
    makeDemo("Timing", { ...DEFAULT_SETTINGS, rounds: 7 }, Date.now(), "exp2"),
  );
});

test("demo fast-forward processes clocks and virtual participants without skipping the next period", () => {
  for (const experiment of ["exp1", "exp2"] as const) {
    const start = 1793580000000;
    const room = makeDemo(
      "Demo",
      {
        ...DEFAULT_SETTINGS,
        periodSeconds: 60,
        unitSeconds: 100,
        breakSeconds: 37,
      },
      start,
      experiment,
    );
    assignParticipants(room, () => 0.4);
    act(
      room,
      { role: "teacher" },
      { kind: "start", expectedPhase: phaseKey(room) },
      start,
    );
    const botTimes: number[] = [];
    const bot = (_room: typeof room, at: number) => botTimes.push(at);
    assert.equal(
      advanceDemoTime(room, start, start, bot, "30-seconds").now,
      start,
    );
    advanceClock(room, start + 5000);
    const advanced = advanceDemoTime(
      room,
      start + 5000,
      start,
      bot,
      "30-seconds",
    );
    assert.equal(advanced.now, start + 35000);
    assert.ok(botTimes.length > 10);
    assert.equal(room.year, 1);
    assert.equal(room.period, "A");
    const next = advanceDemoTime(
      room,
      advanced.now,
      advanced.lastBotAt,
      bot,
      "next-period",
    );
    assert.equal(room.status, "trading");
    if (experiment === "exp1") {
      assert.equal(room.year, 1);
      assert.equal(room.period, "B");
      assert.equal(next.now, start + 65000);
    } else {
      assert.equal(room.year, 2);
      assert.equal(next.now, start + 102000);
    }
    act(
      room,
      { role: "teacher" },
      { kind: "pause", expectedPhase: phaseKey(room) },
      next.now,
    );
    assert.equal(
      advanceDemoTime(room, next.now, next.lastBotAt, bot, "30-seconds").now,
      next.now,
    );
  }
});

test("demo can advance from a break to the next round", () => {
  const now = 1793580000000;
  const room = makeDemo("Demo", EXP2_SETTINGS, now, "exp2");
  assignParticipants(room, () => 0.4);
  const teacher = { role: "teacher" as const };
  act(room, teacher, { kind: "start", expectedPhase: phaseKey(room) }, now);
  advanceClock(room, now + 5000);
  act(
    room,
    teacher,
    { kind: "end-period", expectedPhase: phaseKey(room) },
    now + 5001,
  );
  assert.equal(room.status, "break");
  const result = advanceDemoTime(
    room,
    now + 5001,
    now,
    () => {},
    "next-period",
  );
  assert.equal(result.now, now + 5001 + room.config.breakSeconds * 1000);
  assert.equal(room.year, 2);
  assert.equal(room.status, "trading");
});
