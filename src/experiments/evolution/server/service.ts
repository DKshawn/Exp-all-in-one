import { MAX_ROOM_PARTICIPANTS } from "@/lib/participant-config";
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
  teacherAction,
  phaseDeadline,
  choose,
  tick,
  closeRound,
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
import {
  continuous,
  DEFAULT_DEMAND_STEP,
  HISTORY_ROUNDS,
  MAX_ROUNDS,
  settingsSchema,
  type Settings,
} from "../settings";
import { responsesCsv } from "../export";
import {
  gapMs,
  claimAdvance,
  unauthorized,
  pollParticipant,
  publish,
  readEntries,
  roundComplete,
  submitPair,
  writeEntries,
} from "./live";

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
async function load(tx: Sql, code: string, lock = true, roster = true) {
  const room = (
    await tx.query<Room>(
      `SELECT * FROM evolution_rooms WHERE code=$1 ${lock ? "FOR UPDATE" : ""}`,
      [code],
    )
  ).rows[0];
  if (!room) throw new AuctionError("ルームが見つかりません。", 404);
  if (roster && room.game.distributed && room.game.phase === "open") {
    const { rows } = await tx.query<{ id: string }>(
      "SELECT id FROM evolution_players WHERE room=$1 ORDER BY joined_at,id",
      [code],
    );
    room.game.seats = rows.map(({ id }) => newSeat(id));
  }
  return room;
}
async function save(tx: Sql, r: Room) {
  const g = r.game;
  await tx.query("UPDATE evolution_rooms SET game=$2::jsonb WHERE code=$1", [
    r.code,
    JSON.stringify(
      g.distributed
        ? {
            ...g,
            seats: g.phase === "open" ? [] : g.seats,
            round: g.round && { ...g.round, entries: {} },
          }
        : g,
    ),
  ]);
  if (g.distributed) await publish(tx, g, r.code, r.title);
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
async function archiveRound(tx: Sql, r: Room, old: Round | null) {
  if (old && old !== r.game.round) {
    const histories = r.game.distributed
      ? {}
      : Object.fromEntries(
          r.game.seats.map((s) => [s.id, personal(old, s.id)]),
        );
    await tx.query(
      "INSERT INTO evolution_rounds VALUES($1,$2,$3::jsonb,$4::jsonb,$5::jsonb)",
      [
        r.code,
        old.number,
        JSON.stringify(r.game.distributed ? { ...old, entries: {} } : old),
        JSON.stringify(summaries(r.game, old)),
        JSON.stringify(histories),
      ],
    );
  }
}
async function advance(tx: Sql, r: Room, now: number) {
  const deadline = phaseDeadline(r.game);
  const g = r.game;
  if (g.pausedAt != null || deadline === null) return;
  const allSubmitted =
    g.distributed &&
    g.phase === "playing" &&
    (await roundComplete(tx, r.code, g.round!.number));
  if (now < deadline && !allSubmitted) return;
  const old = g.round;
  const wasPlaying = g.phase === "playing";
  if (allSubmitted) {
    const last = Math.max(
      old!.openedAt,
      ...Object.values(old!.entries).map((e) => e.submittedAt ?? 0),
    );
    closeRound(g, last);
  }
  tick(g, now);
  if (g.distributed && old && wasPlaying && !allSubmitted)
    await writeEntries(tx, r.code, old);
  if (g.distributed && g.round && g.round !== old)
    await writeEntries(tx, r.code, g.round);
  await archiveRound(tx, r, old);
  await save(tx, r);
  if (g.distributed && g.phase === "ready") await allocate(tx, r);
}

async function allocate(tx: Sql, r: Room) {
  await tx.query(
    `UPDATE evolution_players p SET allocation=j.value
      FROM jsonb_each($2::jsonb) j WHERE p.room=$1 AND p.id=j.key::uuid`,
    [
      r.code,
      JSON.stringify(
        Object.fromEntries(
          r.game.seats.map(({ id, group, side }) => [id, { group, side }]),
        ),
      ),
    ],
  );
}

function syncTotals(g: Game) {
  for (const seat of g.seats) seat.total = g.round!.entries[seat.id].total;
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
    const settings = continuous(parsed.data)
      ? {
          ...parsed.data,
          demandStep: parsed.data.demandStep ?? DEFAULT_DEMAND_STEP,
        }
      : parsed.data;
    const token = newToken();
    return this.db.transaction(async (tx) => {
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      for (let i = 0; i < 12; i++) {
        const code = Array.from(
          { length: 6 },
          () => alphabet[randomInt(alphabet.length)],
        ).join("");
        if (!(await claimCode(tx, code, "evolution"))) continue;
        const now = await this.time(tx);
        const game: Game = { ...newGame(settings), distributed: true };
        await tx.query(
          "INSERT INTO evolution_rooms VALUES($1,$2,$3,$4,$5,$6::jsonb)",
          [
            code,
            title.trim(),
            now,
            passwordHash(password),
            digest(token),
            JSON.stringify(game),
          ],
        );
        await publish(tx, game, code, title.trim());
        return { code, token };
      }
      throw new AuctionError("もう一度作成してください。", 503);
    });
  }
  async login(code: string, input: Login) {
    const token = newToken();
    const error = await this.db.transaction(async (tx) => {
      let room = await load(tx, code, true, false);
      const now = await this.time(tx);
      const deadline = phaseDeadline(room.game);
      if (room.game.phase === "open" && deadline !== null && now >= deadline) {
        if (room.game.distributed) room = await load(tx, code, false);
        await advance(tx, room, now);
      }
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
          const {
            rows: [attendance],
          } = await tx.query<{ count: number }>(
            "SELECT count(*)::int AS count FROM evolution_players WHERE room=$1",
            [code],
          );
          if (attendance.count >= MAX_ROOM_PARTICIPANTS)
            return new AuctionError("このルームは満員です。", 409);
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
          if (!room.game.distributed) {
            room.game.seats.push(newSeat(id));
            await save(tx, room);
          }
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
    after = 0,
    before = MAX_ROUNDS + 1,
  ) {
    if (!token) throw unauthorized();
    if (action && (role === "student") !== (action.kind === "choose"))
      throw unauthorized();
    if (role === "student") {
      const clock = () =>
        this.time === databaseTime ? null : this.time(this.db);
      const read = async () =>
        pollParticipant(this.db, code, token, await clock(), after, before);
      if (action?.kind === "choose")
        await submitPair(this.db, code, token, action, await clock());
      const live = await read();
      if (live) {
        const v = live.view;
        if (
          v.pausedAt == null &&
          v.deadline !== null &&
          (v.now >= v.deadline || (v.phase === "playing" && live.complete)) &&
          (await claimAdvance(this.db, v))
        ) {
          const advanced = await this.db.transaction(async (tx) => {
            const lock = await tx.query(
              "SELECT 1 FROM evolution_rooms WHERE code=$1 FOR UPDATE SKIP LOCKED",
              [code],
            );
            if (!lock.rows.length) return false;
            const r = await load(tx, code, false);
            if (
              (r.game.round?.number ?? 0) !== v.round ||
              r.game.phase !== v.phase ||
              r.game.pausedAt != null ||
              phaseDeadline(r.game) !== v.deadline
            )
              return true;
            await this.hydrate(tx, r, true);
            await advance(tx, r, await this.time(tx));
            return true;
          });
          if (advanced) return (await read())?.view ?? v;
        }
        return v;
      }
    }
    return this.db.transaction(async (tx) => {
      // Steady-state student polls update only their own heartbeat. Acquire the
      // shared room's write lock for first visits, deadlines and explicit actions.
      let r = await load(tx, code, Boolean(action));
      let id = await actor(tx, r, role, token),
        now = await this.time(tx);
      const deadline = phaseDeadline(r.game);
      const needsWrite =
        Boolean(action) ||
        (r.game.pausedAt == null && deadline !== null && now >= deadline) ||
        (r.game.phase === "playing" &&
          r.game.round?.entries[id]?.seenAt === null) ||
        (role === "student" && !r.game.seats.some((p) => p.id === id)) ||
        (r.game.distributed &&
          r.game.phase === "playing" &&
          r.game.pausedAt == null &&
          (await roundComplete(tx, code, r.game.round!.number)));
      if (needsWrite) {
        if (!action) {
          r = await load(tx, code);
          id = await actor(tx, r, role, token);
          now = await this.time(tx);
        }
        await this.hydrate(tx, r, true);
        if (r.game.distributed) now = await this.time(tx);
        await advance(tx, r, now);
      } else {
        await this.hydrate(tx, r, false);
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
        const old = g.round;
        if (action.kind === "choose")
          choose(g, id, action.round, action.choice, now);
        else teacherAction(g, action, now);
        if (g.distributed) {
          if (old && old.closedAt === now) await writeEntries(tx, code, old);
          if (g.round && old !== g.round) await writeEntries(tx, code, g.round);
          if (action.kind === "close" || action.kind === "reopen")
            await allocate(tx, r);
        }
        await archiveRound(tx, r, old);
        await save(tx, r);
      }
      const base = baseView(g, code, r.title, now);
      if (role === "teacher") {
        const history = await tx.query<{ summary: Summary[] }>(
          "SELECT summary FROM evolution_rounds WHERE room=$1 AND number<$2 AND number>=greatest($2-$3,$4+1) ORDER BY number",
          [code, Math.min(base.round, before), HISTORY_ROUNDS, after],
        );
        return teacherView(
          g,
          base,
          history.rows.flatMap((x) => x.summary),
        );
      }
      const history = await tx.query<{ item: Personal }>(
        "SELECT personal -> $2::text AS item FROM evolution_rounds WHERE room=$1 AND number<$3 AND number>=greatest($3-$4,$5+1) ORDER BY number",
        [code, id, Math.min(base.round, before), HISTORY_ROUNDS, after],
      );
      return studentView(
        g,
        base,
        id,
        history.rows.map((x) => x.item),
      );
    });
  }
  private async hydrate(tx: Sql, r: Room, lock: boolean) {
    if (!r.game.distributed) return;
    if (lock)
      await tx.query("SELECT 1 FROM evolution_live WHERE room=$1 FOR UPDATE", [
        r.code,
      ]);
    if (!r.game.round) return;
    await readEntries(tx, r.code, r.game.round);
    syncTotals(r.game);
  }
  async export(
    code: string,
    token: string | undefined,
    format: "json" | "csv",
  ) {
    return new Response(await this.exportStream(code, token, format)).text();
  }

  async exportStream(
    code: string,
    token: string | undefined,
    format: "json" | "csv",
  ) {
    const snapshot = await this.db.transaction(async (tx) => {
      const r = await load(tx, code);
      teacher(r, token);
      await this.hydrate(tx, r, true);
      const now = await this.time(tx);
      await advance(tx, r, now);
      const g = r.game;
      const people = await tx.query<{
        id: string;
        joined_at: string;
        last_seen: string;
        gaps: [number, number][];
      }>(
        "SELECT id,joined_at,last_seen,gaps FROM evolution_players WHERE room=$1",
        [code],
      );
      const end =
        g.phase === "finished" ? (g.endedAt ?? g.round!.closedAt!) : now;
      const seats = new Map(g.seats.map((seat) => [seat.id, seat]));
      const participants = people.rows.map((p) => {
        const lastSeen = Math.min(Number(p.last_seen), end);
        const gaps = p.gaps
          .filter(([a]) => a < end)
          .map(([a, b]) => [a, Math.min(b, end)]);
        if (end - lastSeen > gapMs) gaps.push([lastSeen + gapMs, end]);
        return {
          ...seats.get(p.id)!,
          joinedAt: Number(p.joined_at),
          lastSeen,
          gaps,
        };
      });
      return { r, now, participants };
    });
    const { r, now, participants } = snapshot;
    const g = r.game;
    const tx = this.db;
    const upper = g.round?.number ?? 0;
    const gapsById = new Map(participants.map((p) => [p.id, p.gaps]));
    async function* chunks() {
      const slider = continuous(g.settings);
      if (format === "csv") yield responsesCsv([], true, slider);
      else {
        const info = JSON.stringify({
          version: 1,
          code,
          title: r.title,
          createdAt: Number(r.created_at),
          admissionClosedAt: g.closedAt,
          controls: g.controls ?? [],
          endedAt:
            g.endedAt ?? (g.phase === "finished" ? g.round?.closedAt : null),
          pausedAt: g.pausedAt ?? null,
          exportedAt: now,
          phase: g.phase,
          settings: g.settings,
          participants,
        });
        yield info.slice(0, -1) + ',"rows":[';
      }
      let first = true;
      function roundChunk(round: Round) {
        const rows = rawRows(g, round, code).map((row) => ({
          ...row,
          heartbeatGap: gapsById
            .get(row.id)!
            .some(
              ([a, b]) => a < (round.closedAt ?? now) && b > round.openedAt,
            ),
        }));
        if (format === "csv") return "\r\n" + responsesCsv(rows, false, slider);
        const body = (first ? "" : ",") + JSON.stringify(rows).slice(1, -1);
        first = false;
        return body;
      }
      // Archived rounds are immutable. Read them in small batches without holding a room lock.
      for (let at = 1; at < upper; at += 4) {
        const { rows } = await tx.query<{ data: Round }>(
          `SELECT ${
            g.distributed
              ? `data || jsonb_build_object('entries', (
                SELECT jsonb_object_agg(id, entry || jsonb_build_object('seenAt',seen_at))
                FROM evolution_entries e WHERE e.room=r.room AND e.number=r.number
              ))`
              : "data"
          } AS data
            FROM evolution_rounds r WHERE room=$1 AND number>=$2
            AND number<least($2+4,$3) ORDER BY number`,
          [code, at, upper],
        );
        for (const item of rows) yield roundChunk(item.data);
      }
      if (g.round) yield roundChunk(g.round);
      if (format === "json") {
        yield '],"rounds":[';
        let separator = "";
        for (let at = 1; at < upper; at += 100) {
          const { rows } = await tx.query<{ summary: Summary[] }>(
            "SELECT summary FROM evolution_rounds WHERE room=$1 AND number>=$2 AND number<least($2+100,$3) ORDER BY number",
            [code, at, upper],
          );
          if (!rows.length) continue;
          yield separator +
            JSON.stringify(rows.flatMap((r) => r.summary)).slice(1, -1);
          separator = ",";
        }
        if (g.round)
          yield separator + JSON.stringify(summaries(g, g.round)).slice(1, -1);
        yield "]}";
      }
    }
    const encoder = new TextEncoder();
    const iterator = chunks();
    return new ReadableStream<Uint8Array>({
      async pull(controller) {
        const next = await iterator.next();
        if (next.done) controller.close();
        else controller.enqueue(encoder.encode(next.value));
      },
      async cancel() {
        await iterator.return(undefined);
      },
    });
  }
  async listRooms(key: string): Promise<RoomSummary[]> {
    assertTeacherAccess(key);
    const { rows } = await this.db.query<{
      code: string;
      title: string;
      created_at: string;
      mode: Settings["mode"];
      phase: Game["phase"];
      round: number;
      rounds: number;
      groups: number;
      paused: boolean;
      count: number;
    }>(
      `SELECT code,title,created_at,game->'settings'->>'mode' AS mode,
        game->>'phase' AS phase,(game->>'pausedAt' IS NOT NULL) AS paused,
        COALESCE((game->'round'->>'number')::int,0) AS round,
        (game->'settings'->>'rounds')::int AS rounds,
        (game->'settings'->>'groups')::int AS groups,
        CASE WHEN game->>'distributed'='true' AND game->>'phase'='open'
          THEN (SELECT count(*)::int FROM evolution_players WHERE room=code)
          ELSE jsonb_array_length(game->'seats') END AS count FROM evolution_rooms`,
    );
    return rows.map((r) => ({
      code: r.code,
      title: r.title,
      createdAt: Number(r.created_at),
      experiment: "evolution",
      variant: r.mode,
      phase: r.paused
        ? "paused"
        : r.phase === "playing"
          ? "running"
          : r.phase === "feedback"
            ? "review"
            : r.phase === "finished"
              ? "finished"
              : "waiting",
      round: r.round,
      totalRounds: r.rounds,
      participantCount: r.count,
      capacity: MAX_ROOM_PARTICIPANTS,
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
