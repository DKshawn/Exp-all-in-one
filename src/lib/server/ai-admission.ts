import { z } from "zod";
import { AI_ADMISSION_LIMIT } from "../ai-console";

export const aiAdmissionSchema = z
  .object({
    provider: z.enum(["local", "openai"]),
    model: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(/^[^\r\n]+$/),
    count: z.int().min(1).max(AI_ADMISSION_LIMIT),
  })
  .strict();
