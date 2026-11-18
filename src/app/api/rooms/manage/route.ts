import { emhService } from "@/experiments/emh/server/service";
import { evolutionService } from "@/experiments/evolution/server/service";
import { judgmentService } from "@/experiments/judgment/server/service";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { body, failure, json } from "@/lib/server/http";
import { service } from "@/experiments/double-auction/server/service";
import { teacherAccessKey } from "@/lib/server/teacher-session";

export const runtime = "nodejs";
const schema = z
  .object({ accessKey: z.string().max(256).default("") })
  .strict();

export async function POST(request: NextRequest) {
  try {
    const data = await body(request, schema);
    const accessKey = teacherAccessKey(request, data.accessKey);
    const rooms = [
      ...(await (await service()).listRooms(accessKey)),
      ...(await (await emhService()).listRooms(accessKey)),
      ...(await (await judgmentService()).listRooms(accessKey)),
      ...(await (await evolutionService()).listRooms(accessKey)),
    ];
    return json({ rooms: rooms.sort((a, b) => b.createdAt - a.createdAt) });
  } catch (error) {
    return failure(error);
  }
}
