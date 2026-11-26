import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { PGlite } from "@electric-sql/pglite";
import {
  MAX_STUDY_PARTICIPANTS,
  MAX_STUDY_MARKETS,
  MAX_STUDY_PROFILES,
  MAX_STUDY_TEMPLATE_SIZE,
  studyMarketSettings,
} from "../src/experiments/double-auction/lib/study-config";
import { studyAllocationPlan } from "../src/experiments/double-auction/lib/study-allocation";
import { studyRoomConfigSchema } from "../src/experiments/double-auction/lib/study-room-config";
import { studySettingsSchema } from "../src/experiments/double-auction/lib/study-core";
import { generatedStudySettings } from "../src/experiments/double-auction/lib/study-generator";
import { body, MAX_JSON_BODY_BYTES } from "../src/lib/server/http";
import {
  MAX_STUDY_COMMAND_BODY_BYTES,
  commandSchema,
  configSchema,
  createRoomSchema,
} from "@/experiments/double-auction/server/validation";
import { localDatabase, migrate } from "../src/lib/server/database";
import {
  assemble,
  lockBundle,
  saveBundle,
} from "../src/experiments/double-auction/server/market-store";
import { AuctionService } from "../src/experiments/double-auction/server/service";
import {
  limitsForSeat,
  schedules,
} from "../src/experiments/double-auction/server/experiment";
import { DemoSession } from "../src/experiments/double-auction/lib/demo";
import type {
  RoomConfig,
  Command,
} from "../src/experiments/double-auction/lib/types";

function config(
  attendance: number,
  mode: "auto" | "manual",
  markets = 1,
): RoomConfig {
  const plan = studyAllocationPlan(attendance, markets, mode);
  return {
    title: "5,000人の人数上限",
    protocol: "institutions-v1",
    studyAdmission: "flexible",
    studyMarketMode: mode,
    markets: plan.requestedMarkets,
    marketSize: plan.templateSize,
    capacity: attendance,
    studyInstitutions: ["cda"],
    studyPeriods: { cda: 1 },
    studyUnitCounts: { cda: 5, call: 2, posted: 2 },
    studyCommission: 0,
    rounds: 1,
    duration: 180,
  };
}

test("5,000 actual participants permit 2,500 markets, and 5,001 are rejected", () => {
  assert.equal(MAX_STUDY_PARTICIPANTS, 5000);
  assert.equal(MAX_STUDY_MARKETS, 2500);
  assert.equal(MAX_STUDY_PROFILES, 2500);
  assert.equal(MAX_STUDY_TEMPLATE_SIZE, 5000);
  for (const draft of [
    config(5000, "auto"),
    config(5000, "manual"),
    config(5000, "manual", 2500),
  ]) {
    assert.equal(studyRoomConfigSchema.safeParse(draft).success, true);
    assert.equal(
      createRoomSchema.safeParse({
        config: draft,
        password: "Local-Capacity-Only",
      }).success,
      true,
    );
  }
  for (const draft of [
    config(5001, "auto"),
    config(5001, "manual"),
    config(5000, "manual", 2501),
  ])
    assert.equal(studyRoomConfigSchema.safeParse(draft).success, false);
  const legacy = { title: "Legacy classroom", rounds: 1, duration: 180 };
  assert.equal(
    configSchema.safeParse({ ...legacy, capacity: 5000 }).success,
    true,
  );
  assert.equal(
    configSchema.safeParse({ ...legacy, capacity: 5001 }).success,
    false,
  );
  assert.equal(
    configSchema.safeParse({ ...legacy, capacity: 5002 }).success,
    false,
  );
  const classic = schedules(5000);
  assert.equal(classic.apple.values.length, 2500);
  assert.equal(classic.apple.costs.length, 2500);
  assert.ok(classic.apple.values.includes(limitsForSeat(2499, 5000).apple));
  assert.ok(classic.apple.costs.includes(limitsForSeat(4999, 5000).apple));
  const request = (markets: number) => ({
    requestId: randomUUID(),
    expectedRound: 0,
    command: {
      type: "study-admission",
      action: "configure",
      markets,
      expectedRevision: 0,
    },
  });
  assert.equal(commandSchema.safeParse(request(2500)).success, true);
  assert.equal(commandSchema.safeParse(request(2501)).success, false);
});

test("5,000-person demos allocate every person once in automatic and single-market layouts", async () => {
  for (const [mode, institution, stage] of [
    ["auto", "cda", "cda"],
    ["auto", "call", "call"],
    ["auto", "posted", "offer"],
    ["manual", "cda", "cda"],
  ] as const) {
    const session = new DemoSession(institution, "buyer", 1000, {
      config: {
        ...config(5000, mode),
        studyInstitutions: [institution],
        studyPeriods: { [institution]: 1 },
      },
      lobby: true,
      teacher: true,
    });
    assert.equal(
      await session.command({
        type: "study-admission",
        action: "close",
        expectedRevision: 0,
      }),
      true,
      session.getSnapshot().error,
    );
    const view = session.getSnapshot().view;
    assert.equal(view.participantCount, 5000);
    const participants = view.study!.teacher!.participants;
    assert.equal(new Set(participants.map((p) => p.id)).size, 5000);
    const layout = view.config.studyLayout!;
    assert.equal(
      layout.reduce((sum, counts) => sum + counts.buyers + counts.sellers, 0),
      5000,
    );
    assert.equal(layout.length, mode === "auto" ? 313 : 1);
    if (mode === "auto")
      assert.deepEqual(
        layout.map((m) => m.buyers + m.sellers),
        [...Array(312).fill(16), 8],
      );
    if (mode === "manual") {
      assert.equal(view.config.marketSize, 5000);
      assert.equal(view.study!.teacher!.settings.values.length, 2500);
      assert.equal(view.study!.teacher!.settings.costs.length, 2500);
    }
    assert.equal(
      await session.command({ type: "start" }),
      true,
      session.getSnapshot().error,
    );
    session.advanceTime(5);
    assert.ok(
      session
        .getSnapshot()
        .view.study!.teacher!.markets.every((m) => m.stage === stage),
    );
  }
});

test("the largest five-unit template generates and validates all 2,500 private profiles on each side", () => {
  const settings = generatedStudySettings(
    {
      kind: "overlap-staircase",
      parameters: { p: 50000, K: 8, L: 4, d: 4 },
      seed: 123456,
    },
    12500,
    5,
  );
  assert.equal(studySettingsSchema.safeParse(settings).success, true);
  assert.equal(settings.values.length, 2500);
  assert.equal(settings.costs.length, 2500);
  assert.equal(settings.values.flat().length, 12500);
  assert.equal(
    studySettingsSchema.safeParse({
      values: [...settings.values, settings.values[0]],
      costs: [...settings.costs, settings.costs[0]],
    }).success,
    false,
  );
});

test("HTTP accepts a complete maximum-size three-institution settings command and still rejects oversized UTF-8 bodies", async () => {
  const settings = {
    values: Array.from({ length: 2500 }, () => Array(5).fill(99999)),
    costs: Array.from({ length: 2500 }, () => Array(5).fill(99999)),
  };
  const payload = {
    requestId: randomUUID(),
    expectedRound: 0,
    command: {
      type: "study-settings",
      settings,
      settingsByInstitution: {
        cda: settings,
        call: settings,
        posted: settings,
      },
      unitsByInstitution: { cda: 5, call: 5, posted: 5 },
      expectedRevision: 0,
    },
  };
  const text = JSON.stringify(payload);
  assert.ok(Buffer.byteLength(text) > MAX_JSON_BODY_BYTES);
  assert.ok(Buffer.byteLength(text) < MAX_STUDY_COMMAND_BODY_BYTES);
  const request = (text: string) =>
    new NextRequest("http://127.0.0.1:3100/api/rooms/ABC234/commands", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: text,
    });
  assert.deepEqual(
    await body(
      request(text),
      commandSchema,
      "application/json",
      MAX_STUDY_COMMAND_BODY_BYTES,
    ),
    payload,
  );
  const oversized = JSON.stringify({
    padding: "あ".repeat(MAX_JSON_BODY_BYTES / 2),
  });
  assert.ok(oversized.length < MAX_JSON_BODY_BYTES);
  await assert.rejects(
    body(request(oversized), commandSchema),
    (error: unknown) => (error as { status: number }).status === 413,
  );
});

test("local persistence admits only one last participant at 5,000, rejects the next, and saves a 5,000-person template without adding a trader", async () => {
  const pg = new PGlite();
  const db = localDatabase(pg);
  try {
    await migrate(db);
    const service = new AuctionService(db);
    const teacher = await service.create(
      config(16, "auto"),
      "Local-Capacity-Only",
      "",
    );
    const first = await service.join(teacher.code, "1000000", "1234");
    await db.transaction(async (tx) => {
      const before = await lockBundle(tx, teacher.code);
      const room = assemble(before);
      const original = room.participants[0];
      for (let i = 1; i < 4999; i++)
        room.participants.push({
          ...original,
          id: randomUUID(),
          nickname: String(1000000 + i),
          tokenHash: randomUUID(),
        });
      await saveBundle(tx, before, room, []);
    });
    const joins = await Promise.allSettled([
      service.join(teacher.code, "2000001", "1234"),
      service.join(teacher.code, "2000002", "1234"),
    ]);
    assert.equal(
      joins.filter((result) => result.status === "fulfilled").length,
      1,
    );
    const rejected = joins.find(
      (result) => result.status === "rejected",
    ) as PromiseRejectedResult;
    assert.match(rejected.reason.message, /満員/);
    const reentered = await service.join(teacher.code, "1000000", "1234");
    assert.notEqual(reentered.token, first.token);
    const send = async (command: Command) => {
      const view = await service.view(teacher.code, teacher.token);
      return service.command(teacher.code, teacher.token, {
        requestId: randomUUID(),
        expectedRound: view.round,
        command,
      });
    };
    const arrived = await service.view(teacher.code, teacher.token);
    await send({
      type: "study-admission",
      action: "configure",
      markets: 1,
      expectedRevision: arrived.study!.lobby!.revision,
    });
    const configured = await service.view(teacher.code, teacher.token);
    await send({
      type: "study-admission",
      action: "close",
      expectedRevision: configured.study!.lobby!.revision,
    });
    const saved = await service.export(teacher.code, teacher.token);
    assert.equal(saved.room.participants.length, 5000);
    assert.equal(saved.room.config.marketSize, 5000);
    assert.equal(saved.room.config.capacity, 5000);
    const actual = studyMarketSettings(
      saved.room.config,
      saved.room.study!.settings,
      1,
    );
    assert.deepEqual(
      [actual.values.length, actual.costs.length].sort(),
      [2500, 2500],
    );
    const restored = await new AuctionService(db).view(
      teacher.code,
      teacher.token,
    );
    assert.equal(restored.participantCount, 5000);
    await assert.rejects(
      service.create(config(5001, "manual"), "Local-Capacity-Only", ""),
    );
  } finally {
    await pg.close();
  }
});
