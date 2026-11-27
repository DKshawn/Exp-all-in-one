import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { localDatabase, migrate } from "../src/lib/server/database";
import { digest } from "../src/lib/server/auth";
import { EvolutionService } from "../src/experiments/evolution/server/service";
import {
  defaults,
  isMemo,
  isMemoV3,
  memoAnswerMilliseconds,
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
  teacherView,
  personal,
  summaries,
} from "../src/experiments/evolution/views";
import { responsesCsv } from "../src/experiments/evolution/export";
import { roundedAmount } from "../src/experiments/evolution/numbers";

test("v3 payoff displays round exact fractions to the nearest integer", () => {
  assert.equal(roundedAmount("20/9"), "2");
  assert.equal(roundedAmount("32/9"), "4");
  assert.equal(roundedAmount("5/2"), "3");
  assert.equal(roundedAmount("2.499"), "2");
  assert.equal(roundedAmount("0"), "0");
});

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

test("memo v3 accepts only durations the millisecond clock can represent exactly", () => {
  const memo = memoDefaults();
  for (const [input, expected] of [
    ["5", 5000],
    ["7", 7000],
    ["1.5", 1500],
    ["0.001", 1],
    ["15e-1", 1500],
    ["1.5000", 1500],
    ["1.001", 1001],
  ] as const) {
    const parsed = settingsSchema.parse({ ...memo, memoAnswerSeconds: input });
    assert.ok(isMemoV3(parsed));
    assert.equal(memoAnswerMilliseconds(parsed), expected);
  }
  for (const [input, error] of [
    [undefined, "memoAnswerRequired"],
    ["", "memoAnswerRequired"],
    [" ", "memoAnswerRequired"],
    [null, "memoAnswerNumber"],
    ["hello", "memoAnswerNumber"],
    ["0", "memoAnswerPositive"],
    ["-1.5", "memoAnswerPositive"],
    ["0.0009", "memoAnswerPrecision"],
    ["1.500000000000000001", "memoAnswerPrecision"],
    ["1e309", "memoAnswerPrecision"],
    ["9999999999999999999", "memoAnswerPrecision"],
  ] as const) {
    const result = settingsSchema.safeParse({
      ...memo,
      memoAnswerSeconds: input,
    });
    assert.equal(result.success, false, String(input));
    assert.ok(result.error!.issues.some((issue) => issue.message === error));
  }
  assert.equal(
    settingsSchema.safeParse({
      ...defaults("coordination"),
      memoAnswerSeconds: "7",
    }).success,
    false,
  );
  const legacy = newGame(memo);
  assert.ok(isMemo(legacy.settings));
  delete legacy.settings.memoAnswerSeconds;
  legacy.seats = Array.from({ length: 150 }, (_, i) => newSeat(String(i)));
  closeAdmission(legacy, 0);
  start(legacy, 0);
  assert.equal(legacy.round!.deadline, 5000);
});

test("memo v3 settles at the shared deadline even when everyone submits early", () => {
  const g = newGame({ ...memoDefaults(), memoAnswerSeconds: "1.5" });
  g.seats = Array.from({ length: 150 }, (_, i) => newSeat(String(i)));
  closeAdmission(g, 0);
  start(g, 0);
  for (let round = 1; round <= 10; round++) {
    const deadline = g.round!.deadline;
    tick(g, deadline);
    tick(g, deadline + 1000);
  }
  const r = g.round!;
  const eligible = Object.entries(r.entries).filter(
    ([, entry]) => entry.memo!.eligible,
  );
  const [lastId] = eligible.pop()!;
  for (const [id] of eligible) choose(g, id, 11, 0, r.openedAt + 1);
  assert.equal(r.entries[lastId].status, "choosing");
  assert.throws(() => choose(g, lastId, 11, 0, r.deadline));
  choose(g, lastId, 11, 0, r.deadline - 1);
  tick(g, r.deadline - 1);
  assert.equal(g.phase, "playing");
  assert.equal(r.closedAt, null);
  assert.equal(r.deadline - r.openedAt, 1500);
  tick(g, r.deadline);
  assert.equal(g.phase, "feedback");
  assert.equal(r.closedAt, r.deadline);
  assert.equal(phaseDeadline(g), r.deadline + 1000);
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
        for (const [group, trend] of Object.entries(m.feedback)) {
          const window = archive.slice(-Math.min(20, m.blockRound - 1));
          assert.deepEqual(
            trend,
            window.map((previous) => ({
              round: previous.memo!.blockRound,
              hare: Object.values(previous.entries).filter(
                (e) => e.memo!.group === Number(group) && e.choice === 1,
              ).length,
              size,
            })),
          );
        }
      }
      const eligible = Object.entries(r.entries).filter(
        ([, e]) => e.memo!.eligible,
      );
      const [sample, miss, keep] = eligible;
      if (keep) {
        const [id, e] = keep;
        choose(g, id, n, e.memo!.carriedChoice, r.openedAt + 3000);
      }
      if (m.blockRound > 10) {
        const ineligible = Object.entries(r.entries).find(
          ([, e]) => !e.memo!.eligible,
        )!;
        assert.throws(() => choose(g, ineligible[0], n, 1, r.openedAt + 2000));
      }
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
      if (keep) {
        const [, e] = keep;
        assert.equal(e.choice, e.memo!.carriedChoice);
        assert.equal(e.memo!.timedOut, false);
        assert.equal(e.submittedAt, r.openedAt + 3000);
      }
      const live = teacherView(g, baseView(g, "TEST", "Test", r.deadline), []);
      for (const [group, seats] of Object.entries(perGroup)) {
        const report = live.history.find((row) => row.group === Number(group))!;
        assert.deepEqual(report.memoStats, {
          eligible: m.blockRound <= 10 ? 0 : size / 5,
          settledPlayers: size,
        });
        assert.equal(
          report.submitted,
          seats!.filter(([id]) => id === sample?.[0] || id === keep?.[0])
            .length,
        );
        assert.equal(
          report.timeouts,
          report.memoStats.eligible - report.submitted,
        );
        const deer = seats!.filter(([, e]) => e.choice === 0).length;
        assert.deepEqual(report.counts, [deer, size - deer]);
        for (const [, e] of seats!) {
          if (!e.memo!.eligible || e.memo!.timedOut) {
            assert.equal(e.choice, e.memo!.carriedChoice);
            assert.equal(e.submittedAt, null);
          }
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
    assert.equal(summaries(g, archive[0])[0].memoStats, undefined);
    const rows = archive.flatMap((r) => rawRows(g, r, "TEST"));
    assert.equal(rows.length, 54_000);
    assert.equal(rows.filter((row) => row.eligible).length, 9900);
    assert.equal(rows.filter((row) => row.submittedAt !== null).length, 660);
    assert.equal(rows.filter((row) => row.timedOut).length, 9240);
    const csv = responsesCsv(
      rows.map((row) => ({ ...row, heartbeatGap: null })),
      true,
      false,
      true,
    );
    assert.equal(csv.split("\r\n").length, 54_001);
    assert.match(
      csv.split("\r\n")[0],
      /"eligible","timedOut","carriedChoice","feedbackServedAt"/,
    );
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
      { ...memoDefaults(), memoAnswerSeconds: "1.5" },
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
    const tokens = new Map([[game.seats[0].id, player.token]]);
    for (let n = 1; n < 150; n++) {
      const id = randomUUID();
      game.seats.push(newSeat(id));
      const studentToken = randomUUID();
      tokens.set(id, studentToken);
      await db.query(
        "INSERT INTO evolution_players(room,id,nickname,pin_hash,token_hash,joined_at,last_seen) VALUES ($1,$2,$3,'unused',$4,$5,$5)",
        [code, id, "Synthetic" + n, digest(studentToken), now],
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
    now += 1_500;
    await control();
    now += 1_000;
    const second = await svc.view(code, player.token, "student");
    assert.equal(second.role, "student");
    assert.equal(second.current?.memo?.feedback.length, 1);
    const data = JSON.parse(await svc.export(code, token, "json"));
    assert.equal(data.settings.memoProtocol, "stag-hunt-memo-v3");
    assert.equal(data.settings.memoAnswerSeconds, "1.5");
    assert.ok(
      data.rows.every(
        (row: ReturnType<typeof rawRows>[number]) =>
          row.memoAnswerSeconds === "1.5",
      ),
    );
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
    assert.match(csv, /"memoAnswerSeconds"\r\n.*,"1\.5"\r\n/);
    const reentry = await svc.login(code, {
      role: "student",
      nickname: "Demo",
      pin: "6521",
    });
    tokens.set(game.seats[0].id, reentry.token);
    const reconnected = await svc.view(code, reentry.token, "student");
    assert.ok(isMemo(reconnected.settings));
    assert.equal(reconnected.settings.memoAnswerSeconds, "1.5");
    assert.equal(reconnected.deadline, second.deadline);
    const active = await control();
    assert.equal(active.role, "teacher");
    const archived = active.history.find(
      (row) => row.round === 1 && row.group === second.group,
    );
    assert.deepEqual(archived?.memoStats, { eligible: 0, settledPlayers: 10 });
    assert.equal(archived?.submitted, 0);
    assert.equal(
      archived?.counts.reduce((a, b) => a + b),
      10,
    );
    assert.equal(data.rounds[0].memoStats, undefined);
    await assert.rejects(
      control({
        kind: "advance",
        round: 2,
        phase: "playing",
        revision: active.revision,
      }),
    );

    let next = active;
    while (next.round < 11) {
      now = next.deadline!;
      const advanced = await control();
      assert.equal(advanced.role, "teacher");
      next = advanced;
    }
    const live = await db.query<{ game: ReturnType<typeof newGame> }>(
      "SELECT game FROM evolution_rooms WHERE code=$1",
      [code],
    );
    const group = Object.entries(live.rows[0].game.round!.entries).filter(
      ([, entry]) => entry.memo?.group === 1,
    );
    const [[submitId, submitEntry], [timeoutId]] = group.filter(
      ([, entry]) => entry.memo!.eligible,
    );
    const [carryId] = group.find(([, entry]) => !entry.memo!.eligible)!;
    const open = next.history.find(
      (row) => row.round === 11 && row.group === 1,
    )!;
    assert.deepEqual(open.memoStats, { eligible: 2, settledPlayers: 0 });
    assert.deepEqual(open.counts, [0, 0]);
    assert.equal(open.timeouts, 0);
    const action = {
      kind: "choose" as const,
      round: 11,
      choice: submitEntry.memo!.carriedChoice,
    };
    await assert.rejects(
      svc.view(code, tokens.get(carryId), "student", action),
    );
    now = next.deadline! - 1;
    const submitted = await svc.view(
      code,
      tokens.get(submitId),
      "student",
      action,
    );
    assert.equal(submitted.role, "student");
    assert.equal(submitted.current?.status, "submitted");
    assert.equal(submitted.current?.memo?.feedback.length, 10);

    now = next.deadline!;
    await assert.rejects(
      svc.view(code, tokens.get(timeoutId), "student", action),
    );
    const finishedRound = await control();
    assert.equal(finishedRound.role, "teacher");
    const settled = finishedRound.history.find(
      (row) => row.round === 11 && row.group === 1,
    )!;
    assert.deepEqual(settled.memoStats, { eligible: 2, settledPlayers: 10 });
    assert.equal(settled.submitted, 1);
    assert.equal(settled.timeouts, 1);
    assert.deepEqual(settled.counts, action.choice === 0 ? [10, 0] : [0, 10]);
    assert.equal(settled.total, action.choice === 0 ? "40" : "30");

    const revisionExport = JSON.parse(await svc.export(code, token, "json"));
    assert.equal(revisionExport.rows.length, 1650);
    const rowFor = (id: string) =>
      revisionExport.rows.find(
        (row: ReturnType<typeof rawRows>[number]) =>
          row.round === 11 && row.id === id,
      );
    const [kept, missed, carried] = [submitId, timeoutId, carryId].map(rowFor);
    assert.equal(kept.choice, kept.carriedChoice);
    assert.equal(kept.eligible, true);
    assert.equal(kept.timedOut, false);
    assert.equal(kept.submittedAt, kept.feedbackServedAt);
    assert.deepEqual(kept.feedbackHistory, submitted.current?.memo?.feedback);
    assert.equal(missed.eligible, true);
    assert.equal(missed.timedOut, true);
    assert.equal(missed.submittedAt, null);
    assert.equal(carried.eligible, false);
    assert.equal(carried.timedOut, false);
    assert.equal(carried.submittedAt, null);
    assert.equal(missed.choice, carried.choice);
    const revisionCsv = await svc.export(code, token, "csv");
    assert.equal(revisionCsv.split("\r\n").length, 1651);
    for (const id of [submitId, timeoutId, carryId])
      assert.ok(revisionCsv.includes(`"${code}","1","11","${id}"`));

    const legacy = await svc.create(
      "Legacy Memo v3",
      "room-password",
      process.env.TEACHER_ACCESS_KEY ?? "",
      memoDefaults(),
    );
    await db.query(
      "UPDATE evolution_rooms SET game = game #- '{settings,memoAnswerSeconds}' WHERE code=$1",
      [legacy.code],
    );
    const legacyExport = JSON.parse(
      await svc.export(legacy.code, legacy.token, "json"),
    );
    assert.equal(legacyExport.settings.memoAnswerSeconds, "5");
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
  const summary = teacherView(g, baseView(g, "TEST", "Test", 0), []).history[0];
  assert.deepEqual(summary.memoStats, { eligible: 2, settledPlayers: 0 });
  assert.equal(summary.timeouts, 0);
});
