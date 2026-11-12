import { randomInt, randomUUID } from "node:crypto";
import { claimCode } from "@/lib/server/experiment-registry";
import {
  database,
  databaseTime,
  type Database,
  type Sql,
} from "@/lib/server/database";
import {
  assertTeacherAccess,
  newToken,
  digest,
  passwordHash,
  passwordMatches,
  equal,
} from "@/lib/server/auth";
import { AuctionError } from "@/lib/server/errors";
import type { RoomSummary } from "@/lib/room-management";
import {
  newGame,
  newSeat,
  closeAdmission,
  start,
  choose,
  tick,
  type Action,
  type Game,
  type Round,
} from "../engine";
import {
  baseView,
  personal,
  rawRows,
  studentView,
  summaries,
  teacherView,
  type Personal,
  type Summary,
} from "../views";
import { settingsSchema, type Settings } from "../settings";
import { responsesCsv } from "../export";

type Room = {
  code: string;
  title: string;
  created_at: string;
  game: Game;
  teacher_hash: string;
  password_hash: string;
};
type Login =
  | { role: "teacher"; password: string }
  | { role: "student"; nickname: string; pin: string };
const gapMs = 15_000;
const unauthorized = () => new AuctionError("再入室してください。", 401);
async function load(tx: Sql, code: string, lock = true) {
  const room = (
    await tx.query<Room>(
      `SELECT * FROM evolution_rooms WHERE code=$1 ${lock ? "FOR UPDATE" : ""}`,
      [code],
    )
  ).rows[0];
  if (!room) throw new AuctionError("ルームが見つかりません。", 404);
  return room;
}
async function save(tx: Sql, r: Room) {
  await tx.query("UPDATE evolution_rooms SET game=$2::jsonb WHERE code=$1", [
    r.code,
    JSON.stringify(r.game),
  ]);
}
function teacher(r: Room, token?: string) {
  if (!token || !equal(r.teacher_hash, digest(token))) throw unauthorized();
}
async function actor(
  tx: Sql,
  r: Room,
  role: "teacher" | "student",
  token: string,
) {
  if (role === "teacher") {
    teacher(r, token);
    return "";
  }
  const result = await tx.query<{ id: string }>(
    "SELECT id FROM evolution_players WHERE room=$1 AND token_hash=$2",
    [r.code, digest(token)],
  );
  if (!result.rows[0]) throw unauthorized();
  return result.rows[0].id;
}
async function advance(tx: Sql, r: Room, now: number) {
  const old = r.game.round,
    phase = r.game.phase;
  tick(r.game, now);
  if (old && old !== r.game.round) {
    const histories = Object.fromEntries(
      r.game.seats.map((s) => [s.id, personal(old, s.id)]),
    );
    await tx.query(
      "INSERT INTO evolution_rounds VALUES($1,$2,$3::jsonb,$4::jsonb,$5::jsonb)",
      [
        r.code,
        old.number,
        JSON.stringify(old),
        JSON.stringify(summaries(r.game, old)),
        JSON.stringify(histories),
      ],
    );
  }
  if (phase !== r.game.phase || old !== r.game.round) await save(tx, r);
}
async function heartbeat(tx: Sql, code: string, id: string, now: number) {
  await tx.query(
    `UPDATE evolution_players SET gaps=CASE WHEN $3::bigint-last_seen>$4 THEN gaps||jsonb_build_array(jsonb_build_array(last_seen+$4,$3::bigint)) ELSE gaps END,last_seen=$3
    WHERE room=$1 AND id=$2 AND last_seen<$3::bigint`,
    [code, id, now, gapMs],
  );
}

export class EvolutionService {
  constructor(
    private db: Database,
    private time = databaseTime,
  ) {}
  async create(
    title: string,
    password: string,
    accessKey: string,
    input: Settings,
  ) {
    assertTeacherAccess(accessKey);
    const parsed = settingsSchema.safeParse(input);
    if (
      !parsed.success ||
      !title.trim() ||
      title.length > 60 ||
      password.length < 8 ||
      password.length > 128
    )
      throw new AuctionError("設定を確認してください。");
    const token = newToken();
    return this.db.transaction(async (tx) => {
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      for (let i = 0; i < 12; i++) {
        const code = Array.from(
          { length: 6 },
          () => alphabet[randomInt(alphabet.length)],
        ).join("");
        if (!(await claimCode(tx, code, "evolution"))) continue;
        await tx.query(
          "INSERT INTO evolution_rooms VALUES($1,$2,$3,$4,$5,$6::jsonb)",
          [
            code,
            title.trim(),
            await this.time(tx),
            passwordHash(password),
            digest(token),
            JSON.stringify(newGame(parsed.data)),
          ],
        );
        return { code, token };
      }
      throw new AuctionError("もう一度作成してください。", 503);
    });
  }
  async login(code: string, input: Login) {
    const token = newToken();
    const error = await this.db.transaction(async (tx) => {
      const room = await load(tx, code),
        now = await this.time(tx);
      const identity =
        input.role === "teacher" ? "teacher" : "student/" + input.nickname;
      const counter = (
        await tx.query<{ attempts: number }>(
          `INSERT INTO evolution_logins(room,identity,attempts) VALUES($1,$2,1)
        ON CONFLICT(room,identity) DO UPDATE SET attempts=CASE WHEN evolution_logins.since < now()-interval '1 minute' THEN 1 ELSE evolution_logins.attempts+1 END,
        since=CASE WHEN evolution_logins.since < now()-interval '1 minute' THEN now() ELSE evolution_logins.since END RETURNING attempts`,
          [code, identity],
        )
      ).rows[0];
      if (counter.attempts > 5)
        return new AuctionError("1分後に再試行してください。", 429);
      if (input.role === "teacher") {
        if (!passwordMatches(input.password, room.password_hash))
          return unauthorized();
        await tx.query(
          "UPDATE evolution_rooms SET teacher_hash=$2 WHERE code=$1",
          [code, digest(token)],
        );
      } else {
        const p = (
          await tx.query<{ id: string; pin_hash: string }>(
            "SELECT id,pin_hash FROM evolution_players WHERE room=$1 AND nickname=$2",
            [code, input.nickname],
          )
        ).rows[0];
        if (p) {
          if (!passwordMatches(input.pin, p.pin_hash)) return unauthorized();
          await tx.query(
            "UPDATE evolution_players SET token_hash=$3 WHERE room=$1 AND id=$2",
            [code, p.id, digest(token)],
          );
          if (room.game.phase !== "finished")
            await heartbeat(tx, code, p.id, now);
        } else {
          if (room.game.phase !== "open")
            return new AuctionError("新規入室は締め切られました。", 409);
          const id = randomUUID();
          await tx.query(
            "INSERT INTO evolution_players(room,id,nickname,pin_hash,token_hash,joined_at,last_seen) VALUES($1,$2,$3,$4,$5,$6,$6)",
            [
              code,
              id,
              input.nickname,
              passwordHash(input.pin),
              digest(token),
              now,
            ],
          );
          room.game.seats.push(newSeat(id));
          await save(tx, room);
        }
      }
      await tx.query(
        "DELETE FROM evolution_logins WHERE room=$1 AND identity=$2",
        [code, identity],
      );
    });
    if (error) throw error;
    return { code, token };
  }
  async view(
    code: string,
    token: string | undefined,
    role: "teacher" | "student",
    action?: Action,
  ) {
    if (!token) throw unauthorized();
    if (action && (role === "student") !== (action.kind === "choose"))
      throw unauthorized();
    return this.db.transaction(async (tx) => {
      // Steady-state student polls update only their own heartbeat. Acquire the
      // shared room's write lock for first visits, deadlines and explicit actions.
      let r = await load(tx, code, Boolean(action));
      let id = await actor(tx, r, role, token),
        now = await this.time(tx);
      const deadline = baseView(r.game, code, r.title, now).deadline;
      const needsWrite =
        Boolean(action) ||
        (deadline !== null && now >= deadline) ||
        (r.game.phase === "playing" &&
          r.game.round?.entries[id]?.seenAt === null) ||
        (role === "student" && !r.game.seats.some((p) => p.id === id));
      if (needsWrite) {
        if (!action) {
          r = await load(tx, code);
          id = await actor(tx, r, role, token);
          now = await this.time(tx);
        }
        await advance(tx, r, now);
      }
      const g = r.game;
      const entry = g.round?.entries[id];
      if (role === "student" && g.phase !== "finished") {
        await heartbeat(tx, code, id, now);
        if (entry && entry.seenAt === null && g.phase === "playing") {
          entry.seenAt = now;
          await save(tx, r);
        }
      }
      if (action) {
        if (action.kind === "close") closeAdmission(g, now);
        if (action.kind === "start") start(g, now);
        if (action.kind === "choose")
          choose(g, id, action.round, action.choice, now);
        await save(tx, r);
      }
      const base = baseView(g, code, r.title, now);
      if (role === "teacher") {
        const history = await tx.query<{ summary: Summary[] }>(
          "SELECT summary FROM evolution_rounds WHERE room=$1 AND number<$2 ORDER BY number",
          [code, base.round],
        );
        return teacherView(
          g,
          base,
          history.rows.flatMap((x) => x.summary),
        );
      }
      const history = await tx.query<{ item: Personal }>(
        "SELECT personal -> $2::text AS item FROM evolution_rounds WHERE room=$1 AND number<$3 ORDER BY number",
        [code, id, base.round],
      );
      return studentView(
        g,
        base,
        id,
        history.rows.map((x) => x.item),
      );
    });
  }
  async export(
    code: string,
    token: string | undefined,
    format: "json" | "csv",
  ) {
    return this.db.transaction(async (tx) => {
      const r = await load(tx, code);
      teacher(r, token);
      const now = await this.time(tx);
      await advance(tx, r, now);
      const g = r.game;
      const rounds = (
        await tx.query<{ data: Round }>(
          "SELECT data FROM evolution_rounds WHERE room=$1 ORDER BY number",
          [code],
        )
      ).rows.map((x) => x.data);
      if (g.round) rounds.push(g.round);
      const people = await tx.query<{
        id: string;
        joined_at: string;
        last_seen: string;
        gaps: [number, number][];
      }>(
        "SELECT id,joined_at,last_seen,gaps FROM evolution_players WHERE room=$1",
        [code],
      );
      const end = g.phase === "finished" ? g.round!.closedAt! : now;
      const participants = people.rows.map((p) => {
        const lastSeen = Math.min(Number(p.last_seen), end);
        const gaps = p.gaps
          .filter(([a]) => a < end)
          .map(([a, b]) => [a, Math.min(b, end)]);
        if (end - lastSeen > gapMs) gaps.push([lastSeen + gapMs, end]);
        return {
          ...g.seats.find((s) => s.id === p.id)!,
          joinedAt: Number(p.joined_at),
          lastSeen,
          gaps,
        };
      });
      const gapsById = new Map(participants.map((p) => [p.id, p.gaps]));
      const rows = rounds.flatMap((round) =>
        rawRows(g, round, code).map((row) => ({
          ...row,
          heartbeatGap: gapsById
            .get(row.id)!
            .some(
              ([a, b]) => a < (round.closedAt ?? now) && b > round.openedAt,
            ),
        })),
      );
      if (format === "csv") return responsesCsv(rows);
      return JSON.stringify(
        {
          version: 1,
          code,
          title: r.title,
          createdAt: Number(r.created_at),
          admissionClosedAt: g.closedAt,
          exportedAt: now,
          phase: g.phase,
          settings: g.settings,
          participants,
          rounds: rounds.flatMap((x) => summaries(g, x)),
          rows,
        },
        null,
        2,
      );
    });
  }
  async listRooms(key: string): Promise<RoomSummary[]> {
    assertTeacherAccess(key);
    const { rows } = await this.db.query<{
      code: string;
      title: string;
      created_at: string;
      phase: Game["phase"];
      round: number;
      rounds: number;
      groups: number;
      count: number;
    }>(
      `SELECT code,title,created_at,game->>'phase' AS phase,COALESCE((game->'round'->>'number')::int,0) AS round,(game->'settings'->>'rounds')::int AS rounds,(game->'settings'->>'groups')::int AS groups,jsonb_array_length(game->'seats') AS count FROM evolution_rooms`,
    );
    return rows.map((r) => ({
      code: r.code,
      title: r.title,
      createdAt: Number(r.created_at),
      experiment: "evolution",
      phase:
        r.phase === "playing"
          ? "running"
          : r.phase === "feedback"
            ? "review"
            : r.phase === "finished"
              ? "finished"
              : "waiting",
      round: r.round,
      totalRounds: r.rounds,
      participantCount: r.count,
      capacity: 0,
      flexibleAdmission: true,
      marketCount: r.groups,
      institutions: [],
    }));
  }
  async deleteRoom(code: string, key: string) {
    assertTeacherAccess(key);
    await this.db.transaction(async (tx) => {
      await load(tx, code);
      await tx.query("DELETE FROM evolution_rooms WHERE code=$1", [code]);
      await tx.query(
        "DELETE FROM lab_room_registry WHERE code=$1 AND experiment='evolution'",
        [code],
      );
    });
  }
}
export async function evolutionService() {
  return new EvolutionService(await database());
}
