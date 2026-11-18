import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import {
  localDatabase,
  migrate,
  type Database,
} from "../src/lib/server/database";
import { AuctionService } from "../src/experiments/double-auction/server/service";
import { RealtimeBroker } from "../src/experiments/double-auction/server/realtime";
import {
  assemble,
  lockBundle,
  saveBundle,
} from "../src/experiments/double-auction/server/market-store";
import {
  execute,
  settleDeadline,
} from "../src/experiments/double-auction/server/engine";
import {
  marketRound,
  stageKey,
} from "../src/experiments/double-auction/server/study";
import type {
  AuditEvent,
  Participant,
} from "../src/experiments/double-auction/server/model";
import type {
  Command,
  RoomConfig,
} from "../src/experiments/double-auction/lib/types";
import { deleteRoomSchema } from "../src/lib/server/http";

let pg: PGlite, db: Database, service: AuctionService;
before(async () => {
  pg = new PGlite();
  db = localDatabase(pg);
  await migrate(db);
  service = new AuctionService(db);
});
after(async () => {
  await pg.close();
});
const password = "Room-Management-2026";
const config: RoomConfig = {
  protocol: "institutions-v1",
  title: "ルーム管理テスト",
  markets: 1,
  marketSize: 2,
  capacity: 2,
  rounds: 1,
  duration: 180,
  studyInstitutions: ["cda"],
  studyPeriods: { cda: 1 },
};
const tables = [
  "auction_rooms",
  "auction_events",
  "auction_markets",
  "auction_market_events",
  "auction_order_history",
];
async function counts(code: string) {
  return Promise.all(
    tables.map(async (table) =>
      Number(
        (
          await db.query<{ count: string }>(
            `SELECT count(*) AS count FROM ${table} WHERE ${table === "auction_rooms" ? "code" : "room_code"} = $1`,
            [code],
          )
        ).rows[0].count,
      ),
    ),
  );
}
async function tradingRoom() {
  const teacher = await service.create(config, password, "");
  const student = await service.join(teacher.code, "1234567", "1234");
  await service.join(teacher.code, "山田太郎一二三", "5678");
  await db.transaction(async (tx) => {
    const bundle = await lockBundle(tx, teacher.code);
    const room = assemble(bundle);
    const events: AuditEvent[] = [];
    const market = room.study!.markets[0];
    let now = bundle.now;
    const send = (actor: Participant | "teacher", command: Command) =>
      execute(
        room,
        actor,
        {
          requestId: randomUUID(),
          expectedRound: marketRound(room, market),
          expectedStage: stageKey(room, market),
          command,
        },
        now++,
        events,
      );
    send("teacher", { type: "study-randomize", expectedRevision: 0 });
    send("teacher", { type: "start" });
    now = market.deadline!;
    settleDeadline(room, now, events);
    const buyer = room.participants.find((p) => p.role === "buyer")!;
    const seller = room.participants.find((p) => p.role === "seller")!;
    send(seller, { type: "study-quote", price: 80 });
    send(buyer, { type: "study-quote", price: 100 });
    await saveBundle(tx, bundle, room, events);
  });
  const view = await service.view(teacher.code, student.token);
  await service.command(teacher.code, student.token, {
    requestId: randomUUID(),
    expectedRound: 1,
    expectedStage: view.study!.market.stageKey,
    command: { type: "study-quote", price: 80 },
  });
  assert.ok((await counts(teacher.code)).every((count) => count > 0));
  return { teacher, student };
}

test("room listing is newest first, reports selected periods and counts, and excludes private data", async () => {
  const old = await service.create(config, password, "");
  await db.query(
    "UPDATE auction_rooms SET state = jsonb_set(state, '{createdAt}', '1735689600000') WHERE code = $1",
    [old.code],
  );
  const teacher = await service.create(
    {
      ...config,
      studyInstitutions: ["call", "posted"],
      studyPeriods: { call: 3, posted: 2 },
      rounds: 5,
      markets: 2,
      capacity: 4,
    },
    password,
    "",
  );
  await service.join(teacher.code, "1234567", "1234");
  const listed = await service.listRooms("");
  assert.equal(listed[0].code, teacher.code);
  assert.equal(listed[0].experiment, "institutions");
  assert.equal(listed.at(-1)!.code, old.code);
  assert.deepEqual(listed[0].institutions, [
    { institution: "call", periods: 3 },
    { institution: "posted", periods: 2 },
  ]);
  assert.equal(listed[0].marketCount, 2);
  assert.equal(listed[0].participantCount, 1);
  assert.equal(listed[0].capacity, 4);
  assert.equal(listed[0].totalRounds, 5);
  assert.equal(listed[0].phase, "waiting");
  const json = JSON.stringify(listed);
  for (const secret of [
    teacher.token,
    password,
    "1234567",
    "teacherPasswordHash",
    "tokenHash",
    "pinHash",
    "participants",
    "trades",
    "receipts",
  ])
    assert.ok(!json.includes(secret), secret);
});

test("listing derives progress and completion from all independent markets and supports old rooms", async () => {
  const teacher = await service.create(
    { ...config, markets: 2, capacity: 4 },
    password,
    "",
  );
  await db.query(
    "UPDATE auction_rooms SET state = jsonb_set(state, '{phase}', '\"running\"') WHERE code = $1",
    [teacher.code],
  );
  await db.query(
    "UPDATE auction_markets SET state = jsonb_set(jsonb_set(state, '{round}', '1'), '{stage}', '\"done\"') WHERE room_code = $1 AND market_id = 1",
    [teacher.code],
  );
  let summary = (await service.listRooms("")).find(
    (r) => r.code === teacher.code,
  )!;
  assert.equal(summary.round, 1);
  assert.equal(summary.phase, "running");
  await db.query(
    "UPDATE auction_markets SET state = jsonb_set(jsonb_set(state, '{round}', '1'), '{stage}', '\"done\"') WHERE room_code = $1",
    [teacher.code],
  );
  summary = (await service.listRooms("")).find((r) => r.code === teacher.code)!;
  assert.equal(summary.phase, "finished");
  const old = await service.create(
    {
      ...config,
      studyInstitutions: undefined,
      studyPeriods: undefined,
      rounds: 15,
    },
    password,
    "",
  );
  await db.query(
    "UPDATE auction_rooms SET state = jsonb_set(state, '{config}', (state->'config') - 'studyPeriods' - 'studyInstitutions') WHERE code = $1",
    [old.code],
  );
  assert.deepEqual(
    (await service.listRooms(""))
      .find((r) => r.code === old.code)!
      .institutions.map((i) => i.periods),
    [5, 5, 5],
  );
  const legacy = await service.create(
    { title: "旧版", capacity: 12, rounds: 2, duration: 180 },
    password,
    "",
  );
  assert.deepEqual(
    (await service.listRooms("")).find((r) => r.code === legacy.code)!
      .institutions,
    [],
  );
});

test("management requires the existing teacher access key and fails closed on an unconfigured Vercel server", async () => {
  const oldKey = process.env.TEACHER_ACCESS_KEY,
    oldVercel = process.env.VERCEL;
  const teacher = await service.create(config, password, "");
  try {
    process.env.TEACHER_ACCESS_KEY = "test-management-access";
    for (const key of ["", "wrong-key"]) {
      await assert.rejects(service.listRooms(key), { status: 403 });
      await assert.rejects(service.deleteRoom(teacher.code, key), {
        status: 403,
      });
    }
    assert.ok(
      (await service.listRooms("test-management-access")).some(
        (r) => r.code === teacher.code,
      ),
    );
    delete process.env.TEACHER_ACCESS_KEY;
    process.env.VERCEL = "1";
    await assert.rejects(service.listRooms(""), { status: 503 });
    await assert.rejects(service.deleteRoom(teacher.code, ""), {
      status: 503,
    });
  } finally {
    if (oldKey === undefined) delete process.env.TEACHER_ACCESS_KEY;
    else process.env.TEACHER_ACCESS_KEY = oldKey;
    if (oldVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = oldVercel;
  }
  assert.equal(
    (await service.view(teacher.code, teacher.token)).code,
    teacher.code,
  );
});

test("deletion requires explicit confirmation without a room password", () => {
  assert.deepEqual(deleteRoomSchema.parse({ confirmed: true }), {
    confirmed: true,
    accessKey: "",
  });
  for (const input of [{}, { confirmed: false }, { confirmed: "true" }])
    assert.equal(deleteRoomSchema.safeParse(input).success, false);
});

test("management key authorizes deletion without a room password, independently of reentry lockout", async () => {
  const teacher = await service.create(config, password, "");
  const before = await counts(teacher.code);
  for (let attempt = 0; attempt < 5; attempt++)
    await assert.rejects(
      service.recoverTeacher(teacher.code, "wrong-password"),
      { status: 403 },
    );
  await assert.rejects(service.recoverTeacher(teacher.code, password), {
    status: 429,
  });
  const oldKey = process.env.TEACHER_ACCESS_KEY;
  try {
    process.env.TEACHER_ACCESS_KEY = "test-delete-access";
    for (const key of ["", "wrong-key", teacher.token])
      await assert.rejects(service.deleteRoom(teacher.code, key), {
        status: 403,
      });
    assert.deepEqual(await counts(teacher.code), before);
    await service.deleteRoom(teacher.code, "test-delete-access");
    assert.deepEqual(await counts(teacher.code), [0, 0, 0, 0, 0]);
  } finally {
    if (oldKey === undefined) delete process.env.TEACHER_ACCESS_KEY;
    else process.env.TEACHER_ACCESS_KEY = oldKey;
  }
});

test("a failed database deletion rolls back every table", async () => {
  const { teacher } = await tradingRoom();
  const before = await counts(teacher.code);
  const failing: Database = {
    ...db,
    transaction: (fn) =>
      db.transaction((tx) =>
        fn({
          query: async (sql, params) => {
            if (sql.startsWith("DELETE FROM auction_rooms"))
              throw new Error("test rollback");
            return tx.query(sql, params);
          },
        }),
      ),
  };
  await assert.rejects(
    new AuctionService(failing).deleteRoom(teacher.code, ""),
    /test rollback/,
  );
  assert.deepEqual(await counts(teacher.code), before);
  assert.equal(
    (await service.view(teacher.code, teacher.token)).participantCount,
    2,
  );
});

test("deletion removes all room data, notifies live clients, and preserves other rooms", async () => {
  const { teacher, student } = await tradingRoom();
  const other = await service.create(config, password, "");
  const realtime = new RealtimeBroker(db);
  let deleted = false;
  const stop = await realtime.subscribe(
    teacher.code,
    student.token,
    (event) => {
      if (
        event.type === "session-error" &&
        (event.data as { status: number }).status === 404
      )
        deleted = true;
    },
  );
  try {
    await service.deleteRoom(teacher.code, "");
    const until = Date.now() + 3000;
    while (!deleted && Date.now() < until)
      await new Promise((resolve) => setTimeout(resolve, 10));
    assert.ok(deleted, "live student must be told the room no longer exists");
    assert.deepEqual(await counts(teacher.code), [0, 0, 0, 0, 0]);
    assert.ok(
      !(await service.listRooms("")).some((r) => r.code === teacher.code),
    );
    await assert.rejects(service.view(teacher.code, student.token), {
      status: 404,
    });
    await assert.rejects(service.recoverTeacher(teacher.code, password), {
      status: 404,
    });
    await assert.rejects(service.join(teacher.code, "new", "1234"), {
      status: 404,
    });
    await assert.rejects(service.deleteRoom(teacher.code, ""), {
      status: 404,
    });
    assert.equal(
      (await service.view(other.code, other.token)).code,
      other.code,
    );
  } finally {
    stop();
    await realtime.close();
  }
});
