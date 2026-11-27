import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { localDatabase, migrate } from "../src/lib/server/database";
import { EmhService } from "../src/experiments/emh/server/service";
import { EvolutionService } from "../src/experiments/evolution/server/service";
import { defaults } from "../src/experiments/evolution/settings";
import { JudgmentService } from "../src/experiments/judgment/server/service";

const pg = new PGlite();
const db = localDatabase(pg);
before(() => migrate(db));
after(() => pg.close());
const password = "Local-Capacity-Only";

async function verifyLastSeat(
  login: (id: string) => Promise<{ token: string }>,
) {
  const ids = ["1005000", "1005001"];
  const attempts = await Promise.allSettled(ids.map(login));
  const index = attempts.findIndex((attempt) => attempt.status === "fulfilled");
  assert.notEqual(index, -1, JSON.stringify(attempts));
  const rejected = attempts[1 - index];
  assert.equal(rejected.status, "rejected");
  assert.match(rejected.reason.message, /満員|定員/);
  const original = attempts[index];
  assert.equal(original.status, "fulfilled");
  assert.notEqual((await login(ids[index])).token, original.value.token);
}

test("SEG admits exactly one final participant at 5,000 and permits reentry", async () => {
  const service = new EvolutionService(db);
  const { code } = await service.create(
    "Capacity",
    password,
    "",
    defaults("coordination"),
  );
  await db.transaction((tx) =>
    tx.query(
      `INSERT INTO evolution_players(room,id,nickname,pin_hash,token_hash,joined_at,last_seen)
     SELECT $1,gen_random_uuid(),i::text,'fixture',i::text,0,0
     FROM generate_series(1000001,1004999) AS i`,
      [code],
    ),
  );
  await verifyLastSeat((nickname) =>
    service.login(code, { role: "student", nickname, pin: "1234" }),
  );
});

test("Judgement admits exactly one final participant at 5,000 and permits reentry", async () => {
  const service = new JudgmentService(db);
  const { code } = await service.create({
    title: "Capacity",
    password,
    accessKey: "",
    settings: {
      studyIds: ["03-01"],
      randomizeExperiments: false,
      randomizeChoices: false,
    },
  });
  await db.transaction((tx) =>
    tx.query(
      `INSERT INTO judgment_participants(room_code,id,student_id,state)
     SELECT $1,i::text,i::text,'{}'::jsonb
     FROM generate_series(1000001,1004999) AS i`,
      [code],
    ),
  );
  await verifyLastSeat((studentId) =>
    service.login(code, { role: "student", studentId, pin: "1234" }),
  );
});

test("EMH admits exactly one final participant at 5,000 and permits reentry", async () => {
  const service = new EmhService(db);
  const { code } = await service.create("Capacity", password, "");
  await db.transaction((tx) =>
    tx.query(
      `UPDATE emh_sessions SET state = jsonb_set(state, '{members}', (
       SELECT jsonb_agg(jsonb_build_object(
         'id', gen_random_uuid(), 'nickname', i::text, 'pinHash', 'fixture',
         'tokenHash', i::text, 'joinedAt', 0, 'marketId', NULL
       )) FROM generate_series(1000001,1004999) AS i
     )) WHERE code = $1`,
      [code],
    ),
  );
  await verifyLastSeat((nickname) =>
    service.login(code, { role: "student", nickname, pin: "1234" }),
  );
});
