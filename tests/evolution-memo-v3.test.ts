import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { localDatabase, migrate } from "../src/lib/server/database";
import { EvolutionService } from "../src/experiments/evolution/server/service";
import {
  defaults,
  isMemo,
  memoDefaults,
  settingsSchema,
} from "../src/experiments/evolution/settings";
import {
  closeAdmission,
  choose,
  newGame,
  newSeat,
  phaseDeadline,
  start,
  teacherAction,
  tick,
  type Round,
} from "../src/experiments/evolution/engine";
import {
  baseView,
  rawRows,
  studentView,
  personal,
  summaries,
} from "../src/experiments/evolution/views";
import { responsesCsv } from "../src/experiments/evolution/export";

test("memo v3 is explicit and the previous settings and timing limits remain unchanged", () => {
  const legacy = defaults("coordination");
  assert.equal(isMemo(legacy), false);
  assert.equal(settingsSchema.safeParse(legacy).success, true);
  assert.equal(
    settingsSchema.safeParse({ ...legacy, feedbackSeconds: 1 }).success,
    false,
  );
  assert.equal(
    settingsSchema.safeParse({ ...legacy, memoOrder: "small-first" }).success,
    false,
  );
  const memo = memoDefaults();
  assert.equal(settingsSchema.safeParse(memo).success, true);
  assert.equal(
    settingsSchema.safeParse({ ...memo, seconds: 2 }).success,
    false,
  );
  assert.equal(
    settingsSchema.safeParse({ ...memo, rounds: 359 }).success,
    false,
  );
  assert.equal(settingsSchema.safeParse({ ...memo, groups: 1 }).success, false);
  assert.equal(
    settingsSchema.safeParse({
      ...memo,
      matrix: legacy.mode === "coordination" ? legacy.matrix : [],
    }).success,
    false,
  );
  assert.equal(
    settingsSchema.safeParse({
      ...defaults("demand"),
      memoProtocol: memo.memoProtocol,
    }).success,
    false,
  );
});

for (const [order, initial, expected] of [
  ["small-first", "deer", [10, 30, 150]],
  ["large-first", "hare", [150, 30, 10]],
] as const) {
  test(`memo v3 runs all 360 rounds with 150 seats: ${order}, ${initial}`, () => {
    const g = newGame(memoDefaults(order, initial));
    g.seats = Array.from({ length: 149 }, (_, i) => newSeat(String(i)));
    assert.throws(() => closeAdmission(g, 0), /150/);
    g.seats.push(newSeat("149"));
    closeAdmission(g, 0);
    start(g, 0);
    const cohort = g.seats.map((s) => s.id).sort();
    const archive: Round[] = [];
    for (let n = 1; n <= 360; n++) {
      const r = g.round!;
      const m = r.memo!;
      const size = expected[m.block - 1];
      assert.equal(r.number, n);
      assert.equal(m.blockRound, ((n - 1) % 120) + 1);
      assert.deepEqual(Object.keys(r.entries).sort(), cohort);
      assert.equal(m.groupSize, size);
      assert.equal(r.deadline - r.openedAt, 5000);
      const perGroup = Object.groupBy(
        Object.entries(r.entries),
        ([, e]) => e.memo!.group,
      );
      assert.equal(Object.keys(perGroup).length, 150 / size);
      for (const seats of Object.values(perGroup)) {
        assert.equal(seats!.length, size);
        assert.equal(
          seats!.filter(([, e]) => e.memo!.eligible).length,
          m.blockRound > 10 ? size / 5 : 0,
        );
      }
      if (m.blockRound === 1) {
        assert.equal(Object.values(m.feedback).flat().length, 0);
        if (n > 1) {
          const v = studentView(
            g,
            baseView(g, "TEST", "Test", r.openedAt),
            "0",
            [personal(archive.at(-1)!, "0")],
          );
          assert.deepEqual(v.history, []);
        }
        const deerGroups = Object.values(perGroup).filter(
          (seats) => seats![0][1].memo!.initialChoice === 0,
        );
        assert.equal(
          deerGroups.length,
          size === 10
            ? 8
            : size === 30
              ? initial === "deer"
                ? 3
                : 2
              : Number(initial === "deer"),
        );
      } else {
        for (const trend of Object.values(m.feedback)) {
          assert.equal(trend.length, Math.min(20, m.blockRound - 1));
          assert.equal(trend.at(-1)?.round, m.blockRound - 1);
        }
      }
      const eligible = Object.entries(r.entries).filter(
        ([, e]) => e.memo!.eligible,
      );
      const [sample, miss] = eligible;
      if (sample) {
        const [id, e] = sample;
        choose(g, id, n, 1 - e.memo!.carriedChoice, r.openedAt + 2000);
        choose(g, id, n, 1 - e.memo!.carriedChoice, r.openedAt + 2500); // retry
        assert.throws(() =>
          choose(g, id, n, e.memo!.carriedChoice, r.openedAt + 2500),
        );
        assert.equal(e.submittedAt, r.openedAt + 2000);
      } else {
        assert.throws(() => choose(g, "0", n, 1, r.openedAt + 2000));
      }
      tick(g, r.deadline);
      if (miss) {
        assert.equal(miss[1].memo!.timedOut, true);
        assert.equal(miss[1].choice, miss[1].memo!.carriedChoice);
        assert.equal(miss[1].submittedAt, null);
      }
      for (const seats of Object.values(perGroup)) {
        const deer = seats!.filter(([, e]) => e.choice === 0).length;
        for (const [, e] of seats!) {
          const [p, q = "1"] = e.pay!.split("/");
          assert.equal(
            Number(p) * (size - 1),
            Number(q) * (e.choice === 1 ? 3 * (size - 1) : 4 * (deer - 1)),
          );
        }
      }
      archive.push(r);
      if (n < 360) {
        assert.equal(phaseDeadline(g), r.deadline + 1000);
        tick(g, r.deadline + 1000);
      }
    }
    assert.equal(g.phase, "finished");
    const first = rawRows(g, archive[0], "TEST");
    assert.equal(first.length, 150);
    assert.ok(
      first.every(
        (row) => row.group === archive[0].entries[row.id].memo!.group,
      ),
    );
    assert.equal(summaries(g, archive[0]).length, 150 / expected[0]);
    assert.match(responsesCsv([], true, false, true), /feedbackServedAt/);
    assert.doesNotMatch(
      responsesCsv([], true, false, false),
      /feedbackServedAt/,
    );
  });
}

test("memo v3 service stores server feedback delivery and restricts eligibility and admission", async () => {
  const pg = new PGlite();
  try {
    const db = localDatabase(pg);
    await migrate(db);
    let now = 100_000;
    const svc = new EvolutionService(db, async () => now);
    const { code, token } = await svc.create(
      "Memo v3",
      "room-password",
      process.env.TEACHER_ACCESS_KEY ?? "",
      memoDefaults(),
    );
    const player = await svc.login(code, {
      role: "student",
      nickname: "Demo",
      pin: "6521",
    });
    const control = (a?: Parameters<typeof svc.view>[3]) =>
      svc.view(code, token, "teacher", a);
    await assert.rejects(control({ kind: "close" }), /150/);
    const roster = await db.query<{ game: ReturnType<typeof newGame> }>(
      "SELECT game FROM evolution_rooms WHERE code=$1",
      [code],
    );
    const game = roster.rows[0].game;
    for (let n = 1; n < 150; n++) {
      const id = randomUUID();
      game.seats.push(newSeat(id));
      await db.query(
        "INSERT INTO evolution_players(room,id,nickname,pin_hash,token_hash,joined_at,last_seen) VALUES ($1,$2,$3,'unused',$2::uuid::text,$4,$4)",
        [code, id, "Synthetic" + n, now],
      );
    }
    await db.query("UPDATE evolution_rooms SET game=$2::jsonb WHERE code=$1", [
      code,
      JSON.stringify(game),
    ]);
    await assert.rejects(
      svc.login(code, { role: "student", nickname: "Extra", pin: "6522" }),
    );
    await control({ kind: "close" });
    await control({ kind: "start" });
    const first = await svc.view(code, player.token, "student");
    assert.equal(first.role, "student");
    assert.deepEqual(first.current?.memo?.feedback, []);
    assert.equal(first.current?.otherChoice, null);
    await assert.rejects(
      svc.view(code, player.token, "student", {
        kind: "choose",
        round: 1,
        choice: 1,
      }),
    );
    now += 5_000;
    await control();
    now += 1_000;
    const second = await svc.view(code, player.token, "student");
    assert.equal(second.role, "student");
    assert.equal(second.current?.memo?.feedback.length, 1);
    const data = JSON.parse(await svc.export(code, token, "json"));
    assert.equal(data.settings.memoProtocol, "stag-hunt-memo-v3");
    assert.equal(data.rows.length, 300);
    const observed = data.rows.filter(
      (r: { feedbackServedAt: number | null }) => r.feedbackServedAt !== null,
    );
    assert.equal(observed.length, 2);
    assert.equal(observed[1].feedbackServedAt, now);
    assert.equal(
      observed[1].feedbackHare,
      second.current?.memo?.feedback[0].hare,
    );
    assert.doesNotMatch(JSON.stringify(data), /Synthetic|6521|room-password/);
    const csv = await svc.export(code, token, "csv");
    assert.match(csv, /feedbackServedAt/);
    const active = await control();
    assert.equal(active.role, "teacher");
    await assert.rejects(
      control({
        kind: "advance",
        round: 2,
        phase: "playing",
        revision: active.revision,
      }),
    );
  } finally {
    await pg.close();
  }
});

test("ending a live memo round records interruption and not timeout", () => {
  const g = newGame(memoDefaults());
  g.seats = Array.from({ length: 150 }, (_, i) => newSeat(String(i)));
  closeAdmission(g, 0);
  start(g, 0);
  for (let i = 0; i < 10; i++) {
    const r = g.round!;
    tick(g, r.deadline);
    tick(g, r.deadline + 1000);
  }
  teacherAction(
    g,
    { kind: "end", phase: "playing", round: 11, revision: 0 },
    g.round!.openedAt + 1,
  );
  assert.equal(g.phase, "finished");
  assert.ok(
    Object.values(g.round!.entries).every(
      (e) => e.status === "interrupted" && !e.memo!.timedOut && e.pay === null,
    ),
  );
});
