import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import {
  studyLayoutError,
  studyMarketCounts,
  studyMarketSettings,
  studyTemplateSideCount,
  studyUnitsPerSide,
} from "../src/experiments/double-auction/lib/study-config";
import { studyRoomConfigSchema } from "../src/experiments/double-auction/lib/study-room-config";
import { generatedStudySettings } from "../src/experiments/double-auction/lib/study-generator";
import { studySettingsSchema } from "../src/experiments/double-auction/lib/study-core";
import { pptStudySettings } from "../src/experiments/double-auction/server/study";
import { createRoomSchema } from "@/experiments/double-auction/server/validation";
import { DemoSession } from "../src/experiments/double-auction/lib/demo";
import { localDatabase, migrate } from "../src/lib/server/database";
import { AuctionService } from "../src/experiments/double-auction/server/service";
import type {
  Command,
  RoomConfig,
} from "../src/experiments/double-auction/lib/types";
import type { StudyGeneratorConfig } from "../src/experiments/double-auction/lib/study-types";

const generator: StudyGeneratorConfig = {
  kind: "overlap-staircase",
  parameters: { p: 1000, K: 1, L: 1, d: 1 },
  seed: 123456,
};
function config(size: number, units = 2, flexible = true): RoomConfig {
  return {
    protocol: "institutions-v1",
    title: "Odd attendance regression",
    ...(flexible ? { studyAdmission: "flexible" } : {}),
    markets: 1,
    marketSize: size,
    capacity: size,
    studyCdaUnits: units,
    studyInstitutions: ["cda", "call", "posted"],
    studyPeriods: { cda: 1, call: 1, posted: 1 },
    rounds: 3,
    duration: 3,
    studyTiming: {
      cdaSeconds: 3,
      callSeconds: 2,
      offerSeconds: 2,
      buyerSeconds: 2,
      purchaseSeconds: 3,
    },
    studyCommission: 0,
  };
}

test("creation accepts every integer attendance from 2 to 5,000, including odd sizes, while keeping range and capacity validation", () => {
  for (let size = 2; size <= 5000; size++)
    for (const flexible of [false, true]) {
      const draft = config(size, 2, flexible);
      assert.equal(studyLayoutError(1, size, flexible), "");
      assert.equal(studyRoomConfigSchema.safeParse(draft).success, true);
    }
  for (const size of [1, 5001, 3.5, NaN, Infinity]) {
    assert.ok(studyLayoutError(1, size, true));
    assert.equal(studyRoomConfigSchema.safeParse(config(size)).success, false);
  }
  assert.equal(
    studyRoomConfigSchema.safeParse({ ...config(17), capacity: 18 }).success,
    false,
  );
});

test("odd templates generate complete integer profiles for CDA units 1–5 and keep the other institutions at two units", () => {
  for (const size of [3, 17, 191])
    for (const units of [1, 2, 3, 4, 5]) {
      const draft = config(size, units);
      const people = studyTemplateSideCount(draft);
      for (const institution of ["cda", "call", "posted"] as const) {
        const perPerson = institution === "cda" ? units : 2;
        const settings = generatedStudySettings(
          generator,
          studyUnitsPerSide(draft, institution),
          perPerson,
        );
        for (const source of [settings, pptStudySettings(size, perPerson)]) {
          assert.equal(studySettingsSchema.safeParse(source).success, true);
          assert.equal(source.values.length, people);
          assert.equal(source.costs.length, people);
          assert.ok(
            [...source.values, ...source.costs].every(
              (profile) =>
                profile.length === perPerson && profile.every(Number.isInteger),
            ),
          );
          const actual = studyMarketSettings(draft, source, 1);
          const counts = studyMarketCounts(draft, 1);
          assert.equal(counts.buyers + counts.sellers, size);
          assert.equal(actual.values.length, counts.buyers);
          assert.equal(actual.costs.length, counts.sellers);
        }
      }
      assert.equal(
        createRoomSchema.safeParse({
          config: draft,
          generator,
          password: "Local-Only-Odd-Size",
        }).success,
        true,
      );
    }
});

test("odd demos preserve the human in either role, match actual schedules and record integer generated assignments", async () => {
  for (const size of [3, 17, 191])
    for (const flexible of [false, true])
      for (const role of ["buyer", "seller"] as const) {
        const draft = config(size, 5, flexible);
        const demo = new DemoSession("cda", role, 1000, {
          config: draft,
          generator,
          lobby: true,
          teacher: true,
        });
        assert.equal(
          demo
            .getSnapshot()
            .view.study!.teacher!.participants.filter(
              (p) => p.nickname === "あなた",
            ).length,
          1,
        );
        assert.equal(
          await demo.command({
            type: "study-randomize",
            expectedRevision: demo.getSnapshot().view.study!.lobby!.revision,
          }),
          true,
          demo.getSnapshot().error,
        );
        const view = demo.getSnapshot().view;
        const teacher = view.study!.teacher!;
        const counts = studyMarketCounts(view.config, 1);
        assert.equal(counts.buyers + counts.sellers, size);
        assert.equal(Math.abs(counts.buyers - counts.sellers), 1);
        assert.equal(teacher.generation!.assignments.length, size);
        for (const side of ["buyer", "seller"] as const) {
          const schedules = studyMarketSettings(
            view.config,
            teacher.settings,
            1,
          );
          const profiles = teacher.participants
            .filter((p) => p.role === side)
            .sort((a, b) => a.alias.localeCompare(b.alias))
            .map((p) => p.limits);
          assert.deepEqual(
            profiles,
            schedules[side === "buyer" ? "values" : "costs"],
          );
        }
        assert.ok(
          teacher.generation!.assignments.every(
            (a) =>
              a.sortedUnits.length === 5 &&
              a.sortedUnits.every(Number.isInteger) &&
              a.limits.length === 5 &&
              a.limits.every(Number.isInteger),
          ),
        );
        assert.equal(await demo.command({ type: "start" }), true);
        for (let i = 0; demo.getSnapshot().view.phase !== "finished"; i++) {
          assert.ok(i < 20, "all three institutions must finish");
          demo.advanceTime(60);
        }
        const final = demo.getSnapshot().view.study!.teacher!;
        assert.equal(final.metrics.length, 3);
        assert.ok(final.metrics.every((m) => m.completion === "complete"));
        assert.ok(final.participants.every((p) => Number.isFinite(p.profit)));
        assert.ok(
          [...final.settings.values, ...final.settings.costs].every(
            (p) => p.length === 5,
          ),
        );
        assert.ok(
          [...final.otherSettings!.values, ...final.otherSettings!.costs].every(
            (p) => p.length === 2,
          ),
        );
      }
});

test("local room persistence accepts an odd custom size, edits conditions, assigns all actual arrivals and starts", async () => {
  const pg = new PGlite();
  const db = localDatabase(pg);
  try {
    await migrate(db);
    let service = new AuctionService(db);
    const teacher = await service.create(
      { ...config(17, 5), markets: 3, capacity: 51 },
      "Local-Only-Odd-Size",
      "",
      generator,
    );
    const students = [];
    for (let i = 0; i < 19; i++)
      students.push(
        await service.join(teacher.code, String(1000000 + i), "1234"),
      );
    service = new AuctionService(db);
    let view = await service.view(teacher.code, teacher.token);
    assert.equal(view.config.marketSize, 17);
    assert.deepEqual(
      view.study!.teacher!.otherSettings,
      generatedStudySettings(generator, 18),
    );
    const send = async (command: Command) => {
      view = await service.view(teacher.code, teacher.token);
      return service.command(teacher.code, teacher.token, {
        requestId: randomUUID(),
        expectedRound: view.round,
        expectedStage: view.study!.market.stageKey,
        command,
      });
    };
    await send({
      type: "study-settings",
      settings: generatedStudySettings(generator, 12, 3),
      generator,
      unitsPerParticipant: 3,
      commission: 0,
      expectedRevision: view.study!.settingsRevision,
    });
    view = await service.view(teacher.code, teacher.token);
    await send({
      type: "study-admission",
      action: "close",
      expectedRevision: view.study!.lobby!.revision,
    });
    view = await service.view(teacher.code, teacher.token);
    assert.deepEqual(
      view.config.studyLayout!.map((m) => m.buyers + m.sellers),
      [7, 6, 6],
    );
    assert.equal(view.config.capacity, 19);
    assert.equal(view.study!.teacher!.generation!.assignments.length, 19);
    await send({ type: "start" });
    assert.equal(
      (await service.view(teacher.code, teacher.token)).phase,
      "running",
    );
    for (const student of students) {
      const studentView = await service.view(teacher.code, student.token);
      const units = studentView.study!.market.institution === "cda" ? 3 : 2;
      assert.equal(studentView.study!.unitLimits!.length, units);
      assert.ok(studentView.study!.unitLimits!.every(Number.isInteger));
    }
  } finally {
    await pg.close();
  }
});
