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
  studyAdmissionSeatsRemaining,
  studyMarketSettings,
} from "../src/experiments/double-auction/lib/study-config";
import { studyAllocationPlan } from "../src/experiments/double-auction/lib/study-allocation";
import { studyRoomConfigSchema } from "../src/experiments/double-auction/lib/study-room-config";
import { studySettingsSchema } from "../src/experiments/double-auction/lib/study-core";
import { generatedStudySettings } from "../src/experiments/double-auction/lib/study-generator";
import { body, MAX_JSON_BODY_BYTES } from "../src/lib/server/http";
import {
  commandSchema,
  createRoomSchema,
  MAX_STUDY_COMMAND_BODY_BYTES,
  studyAiAdmissionSchema,
} from "@/experiments/double-auction/server/validation";
import { aiAdmissionSchema } from "@/lib/server/ai-admission";
import { localDatabase, migrate } from "../src/lib/server/database";
import {
  assemble,
  lockBundle,
  saveBundle,
} from "../src/experiments/double-auction/server/market-store";
import { AuctionService } from "../src/experiments/double-auction/server/service";
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
    title: "9999人の人数上限",
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

test("9999 participants permit 4999 markets and an even 10000-person template", () => {
  assert.equal(MAX_STUDY_PARTICIPANTS, 9_999);
  assert.equal(MAX_STUDY_MARKETS, 4_999);
  assert.equal(MAX_STUDY_PROFILES, 5_000);
  assert.equal(MAX_STUDY_TEMPLATE_SIZE, 10_000);
  for (const draft of [
    config(9_999, "auto"),
    config(9_999, "manual"),
    config(9_999, "manual", 4_999),
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
    config(10_000, "auto"),
    config(10_000, "manual"),
    config(9_999, "manual", 5_000),
  ])
    assert.equal(studyRoomConfigSchema.safeParse(draft).success, false);
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
  assert.equal(commandSchema.safeParse(request(4_999)).success, true);
  assert.equal(commandSchema.safeParse(request(5_000)).success, false);
});

test("Double Auction AI admission uses the remaining room capacity and the Double Auction count limit", () => {
  assert.equal(studyAdmissionSeatsRemaining(0), 9_999);
  assert.equal(studyAdmissionSeatsRemaining(16), 9_983);
  assert.equal(studyAdmissionSeatsRemaining(9_998), 1);
  assert.equal(studyAdmissionSeatsRemaining(9_999), 0);
  const admission = { provider: "local", model: "local-model", count: 9_999 };
  assert.equal(studyAiAdmissionSchema.safeParse(admission).success, true);
  assert.equal(
    studyAiAdmissionSchema.safeParse({ ...admission, count: 10_000 }).success,
    false,
  );
  assert.equal(aiAdmissionSchema.safeParse(admission).success, false);
});

test("9999-person demos allocate every person once in automatic and single-market layouts", async () => {
  for (const [mode, markets] of [
    ["auto", 1],
    ["manual", 1],
  ] as const) {
    const session = new DemoSession("cda", "buyer", 1000, {
      config: config(9_999, mode, markets),
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
    assert.equal(view.participantCount, 9_999);
    const participants = view.study!.teacher!.participants;
    assert.equal(new Set(participants.map((p) => p.id)).size, 9_999);
    const layout = view.config.studyLayout!;
    assert.equal(
      layout.reduce((sum, counts) => sum + counts.buyers + counts.sellers, 0),
      9_999,
    );
    assert.equal(layout.length, mode === "auto" ? 625 : markets);
    if (mode === "auto")
      assert.deepEqual(
        layout.map((m) => m.buyers + m.sellers),
        [...Array(624).fill(16), 15],
      );
    if (markets === 1 && mode === "manual") {
      assert.equal(view.config.marketSize, 10_000);
      assert.equal(view.study!.teacher!.settings.values.length, 5_000);
      assert.equal(view.study!.teacher!.settings.costs.length, 5_000);
    }
    assert.equal(
      await session.command({ type: "start" }),
      true,
      session.getSnapshot().error,
    );
    assert.ok(
      session
        .getSnapshot()
        .view.study!.teacher!.markets.every((m) => m.stage === "countdown"),
    );
  }
});

test("the largest five-unit template generates and validates all 5000 private profiles on each side", () => {
  const settings = generatedStudySettings(
    {
      kind: "overlap-staircase",
      parameters: { p: 50_000, K: 8, L: 4, d: 1 },
      seed: 123456,
    },
    25_000,
    5,
  );
  assert.equal(studySettingsSchema.safeParse(settings).success, true);
  assert.equal(settings.values.length, 5_000);
  assert.equal(settings.costs.length, 5_000);
  assert.equal(settings.values.flat().length, 25_000);
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
    values: Array.from({ length: 5_000 }, () => Array(5).fill(99999)),
    costs: Array.from({ length: 5_000 }, () => Array(5).fill(99999)),
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
  const parse = (text: string) =>
    body(
      request(text),
      commandSchema,
      "application/json",
      MAX_STUDY_COMMAND_BODY_BYTES,
    );
  assert.deepEqual(await parse(text), payload);
  await assert.rejects(
    body(request(text), commandSchema),
    (error: unknown) => (error as { status: number }).status === 413,
  );
  const oversized = JSON.stringify({
    padding: "あ".repeat(MAX_STUDY_COMMAND_BODY_BYTES / 2),
  });
  assert.ok(oversized.length < MAX_STUDY_COMMAND_BODY_BYTES);
  await assert.rejects(
    parse(oversized),
    (error: unknown) => (error as { status: number }).status === 413,
  );
});

test("local persistence admits only one last participant at 9999, rejects the next, and saves a 10000-person template without adding a trader", async () => {
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
    await service.join(teacher.code, "1000000", "1234");
    await db.transaction(async (tx) => {
      const before = await lockBundle(tx, teacher.code);
      const room = assemble(before);
      const original = room.participants[0];
      for (let i = 1; i < 9_998; i++)
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
    assert.equal(saved.room.participants.length, 9_999);
    assert.equal(saved.room.config.marketSize, 10_000);
    assert.equal(saved.room.config.capacity, 9_999);
    const actual = studyMarketSettings(
      saved.room.config,
      saved.room.study!.settings,
      1,
    );
    assert.deepEqual(
      [actual.values.length, actual.costs.length].sort(),
      [4_999, 5_000],
    );
    const restored = await new AuctionService(db).view(
      teacher.code,
      teacher.token,
    );
    assert.equal(restored.participantCount, 9_999);
    await assert.rejects(
      service.create(config(10_000, "manual"), "Local-Capacity-Only", ""),
    );
  } finally {
    await pg.close();
  }
});
