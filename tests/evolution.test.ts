import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { localDatabase, migrate } from "../src/lib/server/database";
import { EvolutionService } from "../src/experiments/evolution/server/service";
import {
  defaults,
  outcome,
  settingsSchema,
} from "../src/experiments/evolution/settings";
import { add } from "../src/experiments/evolution/numbers";
import {
  newGame,
  newSeat,
  closeAdmission,
  start,
  choose,
  tick,
} from "../src/experiments/evolution/engine";
import { personal, summaries } from "../src/experiments/evolution/views";
import { rawRows } from "../src/experiments/evolution/views";
import { responsesCsv } from "../src/experiments/evolution/export";

test("both payoff models, orientation and exact input boundaries", () => {
  const c = defaults("coordination");
  assert.equal(c.mode, "coordination");
  assert.deepEqual(
    [0, 1].flatMap((a) => [0, 1].map((b) => outcome(c, a, b).pay)),
    [
      ["4", "4"],
      ["0", "3"],
      ["3", "0"],
      ["2", "2"],
    ],
  );
  c.matrix[1][0] = ["-1.25", "0.01"];
  assert.deepEqual(outcome(c, 1, 0).pay, ["-5/4", "1/100"]);
  assert.ok(!settingsSchema.safeParse({ ...c, names: ["a", "a"] }).success);
  const d = defaults("demand");
  assert.equal(d.mode, "demand");
  assert.deepEqual(outcome(d, 0, 2).pay, ["1/3", "2/3"]);
  assert.deepEqual(outcome(d, 1, 1).pay, ["1/2", "1/2"]);
  assert.deepEqual(outcome(d, 2, 2), { pay: ["0", "0"], agreement: false });
  assert.equal(
    outcome({ ...d, total: ".3", options: [".1", "0.2"] }, 0, 1).agreement,
    true,
  );
  assert.equal(add("999999998/999999999", "1/999999999"), "1");
  for (const options of [
    ["0.5", "1/2"],
    ["-1", "0"],
    ["1/0", "0"],
    ["0", "1.01"],
    ["Infinity", "0"],
    ["1e-3", "1"],
  ])
    assert.equal(settingsSchema.safeParse({ ...d, options }).success, false);
  for (const patch of [
    { rounds: 0 },
    { groups: 1.5 },
    { seconds: 0 },
    { total: "0" },
    { feedbackSeconds: -1 },
  ])
    assert.equal(settingsSchema.safeParse({ ...d, ...patch }).success, false);
});
for (const mode of ["demand", "coordination"] as const)
  test(
    mode +
      " isolates groups, rotates byes, permits repeats and skips missing payoffs",
    () => {
      const g = newGame({
        ...defaults(mode),
        groups: 3,
        rounds: 9,
        seconds: 5,
        feedbackSeconds: 3,
      });
      g.seats = Array.from({ length: 5 }, (_, i) => newSeat("P" + i));
      assert.throws(() => closeAdmission(g, 0));
      for (let i = 5; i < 10; i++) g.seats.push(newSeat("P" + i));
      closeAdmission(g, 0);
      const membership = g.seats.map((p) => [p.group, p.side]);
      start(g, 100);
      for (let n = 1; n <= 9; n++) {
        const r = g.round!;
        assert.equal(r.number, n);
        const records = r.entries;
        assert.equal(
          Object.values(records).filter((e) => e.status === "bye").length,
          2,
        );
        for (const p of g.seats) {
          const e = records[p.id];
          if (e.opponent) {
            const peer = g.seats.find((q) => q.id === e.opponent)!;
            assert.equal(peer.group, p.group);
            assert.notEqual(p.id, peer.id);
            assert.equal(records[peer.id].opponent, p.id);
            if (mode === "demand") assert.notEqual(p.side, peer.side);
            choose(g, p.id, n, 0, r.openedAt + 1);
          } else assert.throws(() => choose(g, p.id, n, 0, r.openedAt + 1));
        }
        assert.deepEqual(
          g.seats.map((p) => [p.group, p.side]),
          membership,
        );
        if (n < 9) tick(g, r.closedAt! + 3000);
      }
      assert.equal(g.phase, "finished");
      for (const group of [1, 2, 3]) {
        const pool = g.seats.filter((p) => p.group === group);
        const larger =
          pool.filter((p) => p.side === "A").length >= pool.length / 2
            ? "A"
            : "B";
        const eligible = pool.filter((p) => !p.side || p.side === larger);
        const byes = eligible.map((p) => p.byes);
        assert.ok(Math.max(...byes) - Math.min(...byes) <= 1);
      }
    },
  );
test("row locks, reconnects, scoped views, timed advancement and research exports survive service restart", async () => {
  const pg = new PGlite();
  try {
    const db = localDatabase(pg);
    await migrate(db);
    let at = 100000;
    const svc = new EvolutionService(db, async () => at);
    const room = await svc.create(
      "Research",
      "room-password",
      process.env.TEACHER_ACCESS_KEY ?? "",
      { ...defaults("demand"), rounds: 3, seconds: 5, feedbackSeconds: 3 },
    );
    const { code, token } = room;
    const join = (nickname: string, pin = "6521") =>
      svc.login(code, { role: "student", nickname, pin });
    const a = await join("NickA"),
      b = await join("NickB");
    const view = (tk: string, role: "student" | "teacher" = "student") =>
      svc.view(code, tk, role);
    const cmd = (kind: "start" | "close") =>
      svc.view(code, token, "teacher", { kind });
    const submit = (tk: string, round: number, choice: number) =>
      svc.view(code, tk, "student", { kind: "choose", round, choice });
    await assert.rejects(cmd("start"));
    await cmd("close");
    await assert.rejects(join("late"));
    await cmd("start");
    await submit(a.token, 1, 0);
    await assert.rejects(submit(a.token, 1, 1));
    const waiting = await view(b.token);
    assert.equal(waiting.role, "student");
    assert.equal(waiting.current!.otherChoice, null);
    assert.ok(!("seats" in waiting));
    assert.ok(!("sizes" in waiting));
    await assert.rejects(svc.export(code, b.token, "json"));
    await assert.rejects(view(token));
    await assert.rejects(view(b.token, "teacher"));
    await assert.rejects(svc.view(code, b.token, "student", { kind: "start" }));
    await assert.rejects(join("NickA", "1111"));
    const reconnect = await join("NickA");
    await assert.rejects(view(a.token));
    const restored = await new EvolutionService(db, async () => at).view(
      code,
      reconnect.token,
      "student",
    );
    assert.equal(restored.role, "student");
    assert.equal(restored.current!.choice, 0);
    const both = await Promise.all([
      submit(b.token, 1, 2),
      submit(b.token, 1, 2),
    ]);
    assert.ok(both.every((v) => v.role === "student" && v.total === "2/3"));
    at += 3000;
    await view(token, "teacher");
    await submit(reconnect.token, 2, 1);
    at += 5000;
    await assert.rejects(submit(b.token, 2, 0));
    const missed = await view(reconnect.token);
    assert.equal(missed.role, "student");
    assert.equal(missed.current!.status, "unmatched");
    assert.equal(missed.current!.pay, null);
    at += 3000;
    await view(token, "teacher");
    at += 25000;
    const done = await view(token, "teacher");
    assert.equal(done.phase, "finished");
    const raw = JSON.parse(await svc.export(code, token, "json"));
    assert.equal(raw.rows.length, 6);
    assert.equal(raw.rounds.length, 3);
    assert.equal(
      raw.rows.filter((r: { status: string }) => r.status === "timeout").length,
      3,
    );
    assert.equal(raw.rows[0].opponent, raw.rows[1].id);
    assert.equal(raw.rounds[0].agreements, 1);
    assert.equal(raw.rounds[2].submitted, 0);
    assert.doesNotMatch(
      JSON.stringify(raw),
      /NickA|NickB|pin_hash|token_hash|room-password/,
    );
    assert.equal(raw.settings.groups, 1);
    const file = await svc.export(code, token, "csv");
    assert.equal(file.trim().split("\r\n").length, 7);
    assert.match(file, /opponentSubmittedAt/);
    const again = await view(b.token);
    assert.equal(again.role, "student");
    assert.equal(again.history.length, 2);
    assert.ok(!JSON.stringify(again).includes(raw.rows[0].id));
    assert.equal(
      (await svc.listRooms(process.env.TEACHER_ACCESS_KEY ?? ""))[0].phase,
      "finished",
    );
    await svc.deleteRoom(code, process.env.TEACHER_ACCESS_KEY ?? "");
    await assert.rejects(view(token, "teacher"));
  } finally {
    await pg.close();
  }
});
test("a timeout exactly at deadline preserves responses and forbids late edits", () => {
  const g = newGame(defaults("coordination"));
  g.seats = ["a", "b"].map(newSeat);
  closeAdmission(g, 0);
  start(g, 10);
  choose(g, "a", 1, 0, 20);
  const r = g.round!;
  assert.throws(() => choose(g, "b", 1, 1, r.deadline));
  tick(g, r.deadline);
  assert.equal(personal(r, "a").otherChoice, null);
  assert.equal(personal(r, "a").status, "unmatched");
  assert.equal(personal(r, "b").pay, null);
  assert.equal(summaries(g, r)[0].settled, 0);
  assert.equal(summaries(g, r)[0].submitted, 1);
});

test("a fresh draw can repeat or change partners, preserving exact signed CSV payoffs", (t) => {
  let draw = 0;
  t.mock.method(globalThis.crypto, "getRandomValues", (buffer: Uint32Array) =>
    buffer.fill(draw),
  );
  const settings = defaults("coordination");
  assert.equal(settings.mode, "coordination");
  settings.matrix[0][0] = ["-1/3", "-1/3"];
  const g = newGame({ ...settings, rounds: 3 });
  g.seats = ["a", "b", "c", "d"].map(newSeat);
  closeAdmission(g, 0);
  start(g, 0);
  const opponent = () => g.round!.entries.a.opponent;
  const first = opponent();
  function finish() {
    const r = g.round!;
    g.seats.forEach((p) => choose(g, p.id, r.number, 0, r.openedAt + 1));
  }
  finish();
  tick(g, g.round!.closedAt! + 8000);
  assert.equal(opponent(), first);
  finish();
  draw = 1;
  tick(g, g.round!.closedAt! + 8000);
  assert.notEqual(opponent(), first);
  finish();
  const rows = rawRows(g, g.round!, "ABC234").map((row) => ({
    ...row,
    heartbeatGap: false,
  }));
  assert.ok(rows.every((r) => r.total === "-1"));
  assert.match(responsesCsv(rows), /"-1\/3"/);
  assert.doesNotMatch(responsesCsv(rows), /"'-/);
  assert.match(responsesCsv([]), /heartbeatGap/);
});

test("heartbeat gaps and PIN re-entry do not imply timeout or change the assigned match", async () => {
  const pg = new PGlite();
  try {
    const db = localDatabase(pg);
    await migrate(db);
    let now = 1000;
    const svc = new EvolutionService(db, async () => now);
    const { code, token } = await svc.create(
      "Presence",
      "presence-pass",
      process.env.TEACHER_ACCESS_KEY ?? "",
      { ...defaults("coordination"), rounds: 1, seconds: 60 },
    );
    const a = await svc.login(code, {
      role: "student",
      nickname: "left",
      pin: "0234",
    });
    const b = await svc.login(code, {
      role: "student",
      nickname: "right",
      pin: "4321",
    });
    await svc.view(code, token, "teacher", { kind: "close" });
    await svc.view(code, token, "teacher", { kind: "start" });
    await svc.view(code, a.token, "student");
    now += 10000;
    await svc.view(code, b.token, "student");
    now += 8000;
    const back = await svc.login(code, {
      role: "student",
      nickname: "left",
      pin: "0234",
    });
    await svc.view(code, back.token, "student", {
      kind: "choose",
      round: 1,
      choice: 0,
    });
    await svc.view(code, b.token, "student", {
      kind: "choose",
      round: 1,
      choice: 1,
    });
    const raw = JSON.parse(await svc.export(code, token, "json"));
    assert.ok(
      raw.rows.every((r: { status: string }) => r.status === "settled"),
    );
    assert.equal(
      raw.rows.filter((r: { heartbeatGap: boolean }) => r.heartbeatGap).length,
      1,
    );
    assert.deepEqual(
      raw.participants.flatMap((p: { gaps: number[][] }) => p.gaps),
      [[16000, 19000]],
    );
  } finally {
    await pg.close();
  }
});
