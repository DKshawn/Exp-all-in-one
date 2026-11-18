import assert from "node:assert/strict";
import { test } from "node:test";
import {
  act,
  advanceClock,
  assignParticipants,
  phaseKey,
  unitKey,
  view,
} from "../src/experiments/emh/engine";
import { makeDemo } from "../src/experiments/emh/demo-model";
import { DEFAULT_SETTINGS } from "../src/experiments/emh/settings";

for (const experiment of ["exp1", "exp2"] as const) {
  test(`${experiment}: ending the countdown records no unplayed period or dividend`, () => {
    const room = makeDemo("Countdown", DEFAULT_SETTINGS, 10000, experiment);
    assignParticipants(room);
    const teacher = { role: "teacher" as const };
    act(room, teacher, { kind: "start", expectedPhase: phaseKey(room) }, 10000);
    act(
      room,
      teacher,
      { kind: "finish", expectedPhase: phaseKey(room) },
      11000,
    );
    advanceClock(room, 90000);
    assert.equal(room.status, "completed");
    assert.equal(room.countdownEndsAt, null);
    assert.deepEqual(room.results, []);
    assert.ok(room.participants.every((p) => p.totalProfit === 0));
  });
  test(`${experiment}: countdown exposes own conditions, blocks trades and pauses without consuming trading time`, () => {
    const room = makeDemo("Countdown", DEFAULT_SETTINGS, 10000, experiment);
    assignParticipants(room, () => 0.99);
    const teacher = { role: "teacher" as const };
    const student = { role: "student" as const, participantId: "demo-0" };
    const command = (kind: "start" | "pause" | "resume", now: number) =>
      act(
        room,
        teacher,
        { kind, expectedPhase: phaseKey(room) },
        now,
        () => 0.99,
      );
    command("start", 10000);
    assert.equal(room.status, "countdown");
    assert.equal(room.countdownEndsAt, 15000);
    assert.equal(room.periodEndsAt, null);
    assert.equal(room.unitEndsAt, null);
    assert.equal(room.participants[0]!.holdings, room.config.initialUnits);
    const waiting = view(room, student, 10000);
    assert.equal(waiting.countdownEndsAt, 15000);
    assert.equal(waiting.participants.length, 0);
    if (experiment === "exp1") assert.ok(waiting.me!.dividends);
    else {
      assert.ok(waiting.exp2!.dividends);
      assert.equal(waiting.exp2!.allDividends, null);
    }
    assert.throws(
      () =>
        act(
          room,
          student,
          { kind: "quote", side: "bid", price: 100, unitKey: unitKey(room) },
          14999,
        ),
      /取引できません/,
    );
    command("pause", 12000);
    advanceClock(room, 30000);
    assert.equal(room.status, "countdown");
    command("resume", 30000);
    assert.equal(room.countdownEndsAt, 33000);
    advanceClock(room, 32999);
    assert.equal(room.status, "countdown");
    advanceClock(room, 35000);
    assert.equal(room.status, "trading");
    assert.equal(room.countdownEndsAt, null);
    assert.equal(room.periodEndsAt, 33000 + room.config.periodSeconds * 1000);
    assert.equal(room.unitEndsAt, 33000 + room.config.unitSeconds * 1000);
    assert.equal(
      room.events.filter((event) => event.kind === "period-started").length,
      1,
    );
    act(
      room,
      student,
      { kind: "quote", side: "bid", price: 100, unitKey: unitKey(room) },
      35000,
    );
    assert.equal(room.bid?.price, 100);
  });
}
