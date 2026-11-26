import { z } from "zod";
import { interactionSchema } from "./action-log";
import { marketSettingsSchema } from "./market-settings";
import {
  studySettingsSchema,
  studyTimingSchema,
  studyInstitutionsSchema,
  studyPeriodsSchema,
  studyUnitCountsSchema,
} from "./study";
import { studyRoomConfigSchema } from "../lib/study-room-config";
import {
  generatedStudySettings,
  studyGeneratorConfigSchema,
} from "../lib/study-generator";
import {
  MAX_STUDY_ROUNDS,
  MAX_STUDY_MARKETS,
  MAX_STUDY_PARTICIPANTS,
  MAX_STUDY_UNITS,
  studyUnits,
  studyUnitsPerSide,
  studyInstitutions,
} from "../lib/study-config";
import { studyCommissionSchema } from "../lib/study-commission";
import { MAX_PRICE } from "../lib/price";

// A teacher can save the base and three institution-specific five-unit schedules.
export const MAX_STUDY_COMMAND_BODY_BYTES = 2 * 1024 * 1024;

const legacyConfigSchema = z
  .object({
    title: z.string().trim().min(1).max(60),
    capacity: z
      .number()
      .int()
      .min(12)
      .max(MAX_STUDY_PARTICIPANTS)
      .multipleOf(2),
    rounds: z.number().int().min(1).max(12),
    duration: z.number().int().min(30).max(900),
  })
  .strict();
export const configSchema = z.union([
  legacyConfigSchema,
  studyRoomConfigSchema,
]);
export const createRoomSchema = z
  .object({
    config: configSchema,
    password: z.string().min(8).max(128),
    accessKey: z.string().max(256).default(""),
    generator: studyGeneratorConfigSchema.optional(),
  })
  .strict()
  .superRefine((data, context) => {
    if (!data.generator) return;
    try {
      if (
        !("protocol" in data.config) ||
        data.config.protocol !== "institutions-v1"
      )
        throw new Error("この供需プリセットは制度比較実験で選択してください。");
      for (const institution of studyInstitutions(data.config))
        generatedStudySettings(
          data.generator,
          studyUnitsPerSide(data.config, institution),
          studyUnits(data.config, institution),
        );
    } catch (error) {
      context.addIssue({
        code: "custom",
        path: ["generator"],
        message:
          error instanceof Error
            ? error.message
            : "生成条件を確認してください。",
      });
    }
  });
const good = z.enum(["apple", "banana", "orange"]);
export const commandSchema = z
  .object({
    requestId: z.uuid(),
    interaction: interactionSchema.optional(),
    expectedRound: z.number().int().min(0).max(MAX_STUDY_ROUNDS),
    expectedStage: z.string().max(50).optional(),
    command: z.discriminatedUnion("type", [
      z
        .object({
          type: z.literal("study-admission"),
          action: z.enum([
            "open",
            "close",
            "schedule",
            "pause-timer",
            "resume-timer",
            "cancel-timer",
            "configure",
          ]),
          markets: z.number().int().min(1).max(MAX_STUDY_MARKETS).optional(),
          marketMode: z.enum(["auto", "manual"]).optional(),
          seconds: z.number().int().min(5).max(3600).optional(),
          expectedRevision: z.number().int().min(0),
        })
        .strict(),
      z
        .object({
          type: z.literal("study-withdraw"),
          participantId: z.string().min(1).max(100),
          expectedRevision: z.number().int().min(0),
        })
        .strict(),
      z
        .object({
          type: z.literal("study-program"),
          institutions: studyInstitutionsSchema,
          periods: studyPeriodsSchema,
          timing: studyTimingSchema.optional(),
          expectedRevision: z.number().int().min(0),
        })
        .strict(),
      z
        .object({
          type: z.literal("study-commission"),
          commission: studyCommissionSchema,
          expectedRevision: z.number().int().min(0),
        })
        .strict(),
      z
        .object({
          type: z.literal("study-randomize"),
          expectedRevision: z.number().int().min(0),
        })
        .strict(),
      z
        .object({
          type: z.literal("study-timing"),
          timing: studyTimingSchema,
          expectedRevision: z.number().int().min(0),
        })
        .strict(),
      z
        .object({
          type: z.literal("study-settings"),
          settings: studySettingsSchema,
          generator: studyGeneratorConfigSchema.optional(),
          commission: studyCommissionSchema.optional(),
          unitsByInstitution: studyUnitCountsSchema.optional(),
          settingsByInstitution: z
            .object({
              cda: studySettingsSchema.optional(),
              call: studySettingsSchema.optional(),
              posted: studySettingsSchema.optional(),
            })
            .strict()
            .optional(),
          unitsPerParticipant: z
            .number()
            .int()
            .min(1)
            .max(MAX_STUDY_UNITS)
            .optional(),
          expectedRevision: z.number().int().min(0),
        })
        .strict(),
      z
        .object({
          type: z.literal("study-quote"),
          price: z.number().int().min(1).max(MAX_PRICE),
        })
        .strict(),
      z.object({ type: z.literal("study-cancel") }).strict(),
      z.object({ type: z.literal("study-accept"), orderId: z.uuid() }).strict(),
      z
        .object({
          type: z.literal("call-submit"),
          prices: z
            .array(z.number().int().min(1).max(MAX_PRICE))
            .min(1)
            .max(MAX_STUDY_UNITS),
        })
        .strict(),
      z
        .object({
          type: z.literal("posted-offer"),
          price: z.number().int().min(1).max(MAX_PRICE),
          quantity: z.number().int().min(1).max(MAX_STUDY_UNITS),
        })
        .strict(),
      z
        .object({
          type: z.literal("posted-bid"),
          price: z.number().int().min(1).max(MAX_PRICE),
          quantity: z.number().int().min(1).max(MAX_STUDY_UNITS),
        })
        .strict(),
      z
        .object({
          type: z.literal("posted-buy"),
          offerId: z.uuid(),
          quantity: z.number().int().min(1).max(MAX_STUDY_UNITS),
        })
        .strict(),
      z.object({ type: z.literal("posted-pass") }).strict(),
      z
        .object({
          type: z.literal("update-markets"),
          settings: marketSettingsSchema,
          expectedRevision: z.number().int().min(0),
        })
        .strict(),
      z
        .object({
          type: z.literal("quote"),
          good,
          price: z.number().int().min(1).max(MAX_PRICE),
        })
        .strict(),
      z.object({ type: z.literal("cancel"), good }).strict(),
      z.object({ type: z.literal("accept"), quoteId: z.uuid() }).strict(),
      ...(["start", "pause", "resume", "end-round", "finish"] as const).map(
        (type) => z.object({ type: z.literal(type) }).strict(),
      ),
    ]),
  })
  .strict();
