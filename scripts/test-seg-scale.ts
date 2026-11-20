import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { postgresDatabase, migrate } from "../src/lib/server/database";
import { digest } from "../src/lib/server/auth";
import { EvolutionService } from "../src/experiments/evolution/server/service";
import { defaults } from "../src/experiments/evolution/settings";
import type { View } from "../src/experiments/evolution/views";
import type { Action } from "../src/experiments/evolution/engine";

async function burst<T>(requests: Promise<T>[]) {
  // Let in-flight requests finish even when one fails, before deleting the fixture room.
  return (await Promise.allSettled(requests)).map((result) => {
    if (result.status === "rejected") throw result.reason;
    return result.value;
  });
}

// Run against an isolated, loopback Next server and PostgreSQL database.
async function main() {
  const url = new URL(process.env.SEG_TEST_URL ?? "http://127.0.0.1:3265");
  assert.equal(url.hostname, "127.0.0.1");
  const db = postgresDatabase(process.env.LOCAL_TEST_DATABASE_URL!);
  const key = process.env.TEACHER_ACCESS_KEY ?? "";
  await migrate(db);
  try {
    for (const mode of ["coordination", "demand"] as const) {
      const svc = new EvolutionService(db);
      const { code, token } = await svc.create(
        "Synthetic scale test",
        "scale-test-only",
        key,
        {
          ...defaults(mode),
          groups: 20,
          rounds: 2,
          seconds: 120,
          feedbackSeconds: 90,
        },
      );
      const accounts = await seed(code, 2000);
      const target = new URL(
        "/api/rooms/" + code + "/evolution?session=student",
        url,
      );
      async function request(student: string, action?: Action) {
        const response = await fetch(target, {
          method: action ? "POST" : "GET",
          headers: {
            cookie: `auction_${code}_student=${student}`,
            ...(action && { "content-type": "application/json" }),
          },
          body: action && JSON.stringify(action),
          signal: AbortSignal.timeout(90_000),
        });
        const body = await response.text();
        assert.equal(response.status, 200, body);
        return JSON.parse(body) as Extract<View, { role: "student" }>;
      }
      await svc.view(code, token, "teacher", { kind: "close" });
      assert.equal((await request(accounts[0].token)).phase, "ready");
      await svc.view(code, token, "teacher", { kind: "start" });
      try {
        for (let number = 1; number <= 2; number++) {
          const opened = performance.now();
          const inputs = await burst(
            accounts.map(({ token }) => request(token)),
          );
          assert(
            inputs.every(
              (view) =>
                view.round === number && view.current?.status === "choosing",
            ),
          );
          const reading = performance.now() - opened;
          const started = performance.now();
          const durations = await burst(
            accounts.map(async ({ token }, i) => {
              const sent = performance.now();
              const choice = mode === "demand" ? 300 + (i % 2) * 400 : i % 2;
              const result = await request(token, {
                kind: "choose",
                round: number,
                choice,
              });
              assert.equal(result.current?.choice, choice);
              if (result.current?.status === "submitted")
                assert.equal(result.current.otherChoice, null);
              return performance.now() - sent;
            }),
          );
          const writing = performance.now() - started;
          const settled = await burst(
            accounts.map(({ token }) => request(token)),
          );
          assert(settled.every((v) => v.current?.status === "settled"));
          const teacher = await svc.view(code, token, "teacher");
          assert.equal(teacher.role, "teacher");
          assert.equal(
            teacher.history
              .filter((x) => x.round === number)
              .reduce((n, x) => n + x.settled, 0),
            1000,
          );
          console.log({
            mode,
            round: number,
            players: accounts.length,
            pollMs: Math.round(reading),
            submitMs: Math.round(writing),
            submitP95Ms: Math.round(durations.sort((a, b) => a - b)[1899]),
          });
          if (number === 1 && teacher.phase === "feedback")
            await svc.view(code, token, "teacher", {
              kind: "advance",
              round: number,
              phase: teacher.phase,
              revision: teacher.revision,
            });
        }
        const research = JSON.parse(await svc.export(code, token, "json"));
        assert.equal(research.rows.length, 4000);
        assert(
          research.rows.every(
            (row: { status: string }) => row.status === "settled",
          ),
        );
      } finally {
        await svc.deleteRoom(code, key);
      }
    }

    let now = 100_000;
    const svc = new EvolutionService(db, async () => now);
    const { code, token } = await svc.create(
      "Synthetic long session",
      "scale-test-only",
      key,
      { ...defaults("demand"), rounds: 1000, seconds: 5, feedbackSeconds: 3 },
    );
    try {
      const [a, b] = await seed(code, 2);
      await svc.view(code, token, "teacher", { kind: "close" });
      await svc.view(code, token, "teacher", { kind: "start" });
      const started = performance.now();
      for (let round = 1; round <= 1000; round++) {
        await svc.view(
          code,
          a.token,
          "student",
          { kind: "choose", round, choice: 300 },
          round - 1,
        );
        const v = await svc.view(
          code,
          b.token,
          "student",
          { kind: "choose", round, choice: 700 },
          round - 1,
        );
        assert.equal(v.role, "student");
        assert.equal(v.current?.pay, "7/10");
        assert.equal(v.history.length, 0);
        assert.equal(v.phase, round === 1000 ? "finished" : "feedback");
        now += 3000;
        if (round < 1000)
          assert.equal(
            (await svc.view(code, a.token, "student", undefined, round - 1))
              .round,
            round + 1,
          );
      }
      const report = JSON.parse(await svc.export(code, token, "json"));
      assert.equal(report.rounds.length, 1000);
      assert.equal(report.rows.length, 2000);
      assert.equal(
        report.participants.find((p: { id: string }) => p.id === b.id).total,
        "700",
      );
      const older = await svc.view(code, a.token, "student", undefined, 0, 21);
      assert.equal(older.history.length, 20);
      assert.equal(older.history[0].round, 1);
      assert.equal(older.history[19].round, 20);
      console.log({
        rounds: 1000,
        players: 2,
        durationMs: Math.round(performance.now() - started),
      });
    } finally {
      await svc.deleteRoom(code, key);
    }
  } finally {
    await db.close();
  }

  async function seed(room: string, count: number) {
    const now = Date.now();
    const accounts = Array.from({ length: count }, () => ({
      id: randomUUID(),
      token: randomUUID(),
    }));
    await db.query(
      `INSERT INTO evolution_players(room,id,nickname,pin_hash,token_hash,joined_at,last_seen)
       SELECT $1,p.id::uuid,p.id,'synthetic',p.token_hash,$3,$3
       FROM jsonb_to_recordset($2::jsonb) AS p(id text,token_hash text)`,
      [
        room,
        JSON.stringify(
          accounts.map(({ id, token }) => ({ id, token_hash: digest(token) })),
        ),
        now,
      ],
    );
    return accounts;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
