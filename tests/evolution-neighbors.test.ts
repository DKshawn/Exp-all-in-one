import assert from "node:assert/strict";
import { test } from "node:test";
import {
  closeAdmission,
  choose,
  newGame,
  newSeat,
  start,
  tick,
  type Round,
} from "../src/experiments/evolution/engine";
import {
  exportSettings,
  responsesCsv,
} from "../src/experiments/evolution/export";
import { neighborIndices } from "../src/experiments/evolution/memo-v3";
import {
  neighborDefaults,
  settingsSchema,
} from "../src/experiments/evolution/settings";
import {
  baseView,
  personal,
  rawRows,
  studentView,
  summaries,
} from "../src/experiments/evolution/views";

test("H5 uses a single fixed 150-seat block and the original decision windows", () => {
  const h5 = neighborDefaults();
  assert.equal(settingsSchema.safeParse(h5).success, true);
  for (const override of [
    { memoOrder: "large-first" },
    { groups: 5 },
    { rounds: 360 },
    { seconds: 2 },
    { memoAnswerSeconds: "1.5" },
  ]) {
    assert.equal(
      settingsSchema.safeParse({ ...h5, ...override }).success,
      false,
    );
  }
  assert.deepEqual(exportSettings(h5), h5);
  assert.deepEqual(
    neighborIndices(0, 150),
    [145, 146, 147, 148, 149, 1, 2, 3, 4, 5],
  );
  assert.deepEqual(
    neighborIndices(149, 150),
    [144, 145, 146, 147, 148, 0, 1, 2, 3, 4],
  );
});

test("H5 plays 120 rounds with a stable ring, previous-neighbor-only feedback and pending payoffs", () => {
  const g = newGame(neighborDefaults("hare"));
  g.seats = Array.from({ length: 149 }, (_, i) => newSeat("player-" + i));
  assert.throws(() => closeAdmission(g, 0), /150/);
  g.seats.push(newSeat("player-149"));
  closeAdmission(g, 0);
  start(g, 0);
  const ring = [...g.memoRing!];
  assert.deepEqual([...ring].sort(), g.seats.map((seat) => seat.id).sort());
  let prior: Round | undefined;

  for (let round = 1; round <= 120; round++) {
    const r = g.round!;
    assert.equal(r.number, round);
    assert.equal(r.deadline - r.openedAt, 5000);
    assert.deepEqual(g.memoRing, ring);
    assert.deepEqual(r.memo?.feedback, { 1: [] });
    const eligible = ring.filter((id) => r.entries[id].memo?.eligible);
    assert.equal(eligible.length, round <= 10 ? 0 : 30);

    for (const [index, id] of ring.entries()) {
      const offsets = [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5];
      assert.deepEqual(r.entries[id].memo?.neighborhood, {
        seat: index + 1,
        previous: prior
          ? offsets.map(
              (offset) =>
                prior!.entries[ring[(index + 150 + offset) % 150]].choice,
            )
          : [],
      });
    }
    const locked = ring.find((id) => !r.entries[id].memo?.eligible)!;
    assert.throws(() => choose(g, locked, round, 0, r.openedAt + 100));
    const [change, keep, timeout] = eligible;
    if (change) {
      const carried = r.entries[change].memo!.carriedChoice;
      choose(g, change, round, 1 - carried, r.openedAt + 100);
      choose(
        g,
        keep,
        round,
        r.entries[keep].memo!.carriedChoice,
        r.openedAt + 100,
      );
      assert.equal(r.entries[change].choice, 1 - carried);
      assert.throws(() => choose(g, timeout, round, 0, r.deadline));
    }
    assert.equal(
      r.entries[locked].choice,
      r.entries[locked].memo?.carriedChoice,
    );
    tick(g, r.deadline);
    assert.ok(
      Object.values(r.entries).every(
        (e) => e.pay === null && e.choice !== null,
      ),
    );
    if (round <= 10)
      assert.ok(Object.values(r.entries).every((e) => e.choice === 1));
    if (keep) {
      assert.equal(r.entries[keep].memo?.timedOut, false);
      assert.equal(r.entries[keep].choice, r.entries[keep].memo?.carriedChoice);
      assert.equal(r.entries[timeout].memo?.timedOut, true);
      assert.equal(
        r.entries[timeout].choice,
        r.entries[timeout].memo?.carriedChoice,
      );
    }
    const [summary] = summaries(g, r, true);
    assert.deepEqual(summary.memoStats, {
      eligible: eligible.length,
      settledPlayers: 150,
    });
    assert.equal(summary.timeouts, eligible.length ? 28 : 0);
    assert.equal(summary.total, null);
    if (round === 11) {
      assert.deepEqual(summary.memoTransitions, {
        previous: [0, 150],
        switched: [0, 1],
      });
    }

    if (round === 12) {
      const stagSeat = ring.findIndex((id) => prior!.entries[id].choice === 0);
      assert.notEqual(stagSeat, -1);
      const witness = ring[(stagSeat + 1) % 150];
      const v = studentView(
        g,
        baseView(g, "ABC123", "H5", r.deadline),
        witness,
        [personal(prior!, witness)],
      );
      const wire = JSON.parse(JSON.stringify(v));
      const feedback = wire.current.memo.neighborhood.previous;
      assert.equal(feedback.length, 10);
      assert.equal(feedback.filter((choice: number) => choice === 1).length, 9);
      assert.deepEqual(wire.current.memo.feedback, []);
      assert.deepEqual(wire.history, []);
      assert.equal(wire.total, null);
      assert.equal(wire.current.total, null);
      for (const field of [
        "memoRing",
        "memoCounterbalance",
        "feedbackHare",
        "player-",
      ]) {
        assert.ok(!JSON.stringify(wire).includes(field), field);
      }
      const rows = rawRows(g, r, "ABC123");
      assert.ok(
        rows.every(
          (row) =>
            row.scoringStatus === "pending" &&
            row.pay === null &&
            row.total === null,
        ),
      );
      assert.equal(new Set(rows.map((row) => row.ringSeat)).size, 150);
      const csv = responsesCsv(
        rows.map((row) => ({ ...row, heartbeatGap: null })),
      );
      assert.match(
        csv.split("\r\n")[0],
        /"scoringStatus","ringSeat","neighborChoices"/,
      );
      assert.doesNotMatch(csv, /feedbackHare|memoAnswerSeconds/);
    }
    if (round < 120) {
      assert.equal(g.phase, "feedback");
      tick(g, r.deadline + 999);
      assert.equal(g.round, r);
      tick(g, r.deadline + 1000);
    }
    prior = r;
  }
  assert.equal(g.phase, "finished");
});
