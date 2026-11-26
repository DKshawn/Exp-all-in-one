import { MAX_ROOM_PARTICIPANTS } from "@/lib/participant-config";
import { randomInt, randomUUID } from "node:crypto";
import {
  database,
  databaseTime,
  type Database,
  type Sql,
} from "@/lib/server/database";
import {
  assertTeacherAccess,
  digest,
  equal,
  newToken,
  passwordHash,
  passwordMatches,
} from "@/lib/server/auth";
import { claimCode } from "@/lib/server/experiment-registry";
import { AuctionError } from "@/lib/server/errors";
import type { RoomSummary } from "@/lib/room-management";
import type {
  Lesson,
  Participant,
  Room,
  Run,
  Settings,
  StudentView,
  Submission,
  TeacherView,
} from "../types";
import type { Command } from "./validation";
import {
  AppError,
  conversationPairs,
  csv,
  fingerprint,
  makeRun,
  preview,
  records,
  SOURCE_COMMIT,
  state,
  submit,
  validateSettings,
  withdraw,
} from "./core";

const encoded = (value: unknown) => JSON.stringify(value);
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const roomCode = () =>
  Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join(
    "",
  );
async function first<T>(
  tx: Sql,
  sql: string,
  params: unknown[],
): Promise<T | undefined> {
  return (await tx.query<{ state: T }>(sql, params)).rows[0]?.state;
}
async function roomFor(tx: Sql, code: string, write = false) {
  const room = await first<Room>(
    tx,
    `SELECT state FROM judgment_rooms WHERE code=$1 FOR ${write ? "UPDATE" : "SHARE"}`,
    [code],
  );
  if (!room) throw new AuctionError("ルームが見つかりません。", 404);
  return room;
}
function tokenHash(token: string | undefined) {
  if (!token || !/^[a-f0-9]{64}$/.test(token))
    throw new AuctionError("再入室してください。", 401);
  return digest(token);
}
function teacher(room: Room, token: string | undefined) {
  if (!equal(room.tokenHash, tokenHash(token)))
    throw new AuctionError("教員として再入室してください。", 401);
}
async function participantFor(
  tx: Sql,
  code: string,
  token: string | undefined,
) {
  const participant = await first<Participant>(
    tx,
    "SELECT state FROM judgment_participants WHERE room_code=$1 AND state->>'tokenHash'=$2 FOR UPDATE",
    [code, tokenHash(token)],
  );
  if (!participant)
    throw new AuctionError("学生として再入室してください。", 401);
  return participant;
}
async function saveRun(tx: Sql, run: Run) {
  await tx.query("UPDATE judgment_runs SET state=$2::jsonb WHERE id=$1", [
    run.id,
    encoded(run),
  ]);
}
async function saveRoom(tx: Sql, room: Room) {
  await tx.query("UPDATE judgment_rooms SET state=$2::jsonb WHERE code=$1", [
    room.code,
    encoded(room),
  ]);
}

export class JudgmentService {
  constructor(private db: Database) {}
  // Convert only the vendored protocol's expected validation errors. Driver errors
  // stay opaque and are handled by the platform's existing HTTP boundary.
  private async transaction<T>(fn: (tx: Sql) => Promise<T>) {
    try {
      return await this.db.transaction(fn);
    } catch (error) {
      if (error instanceof AppError)
        throw new AuctionError(error.message, error.status);
      throw error;
    }
  }
  async create(input: {
    title: string;
    password: string;
    accessKey: string;
    settings: Settings;
  }) {
    assertTeacherAccess(input.accessKey);
    const token = newToken();
    if (
      !input.title.trim() ||
      input.title.length > 60 ||
      input.password.length < 8 ||
      input.password.length > 128
    )
      throw new AuctionError("実験名と教員パスワードを確認してください。");
    return this.transaction(async (tx) => {
      const settings = validateSettings(input.settings);
      let code = "";
      for (let i = 0; i < 20; i++) {
        const candidate = roomCode();
        if (await claimCode(tx, candidate, "judgment")) {
          code = candidate;
          break;
        }
      }
      if (!code) throw new AuctionError("もう一度作成してください。", 503);
      const room: Room = {
        code,
        title: input.title.trim(),
        createdAt: await databaseTime(tx),
        revision: 0,
        passwordHash: passwordHash(input.password),
        tokenHash: digest(token),
        settings,
        activeLesson: null,
        lessonCount: 0,
      };
      await tx.query(
        "INSERT INTO judgment_rooms(code,state) VALUES($1,$2::jsonb)",
        [code, encoded(room)],
      );
      return { code, token };
    });
  }
  async login(
    code: string,
    input:
      | { role: "student"; studentId: string; pin: string }
      | { role: "teacher"; password: string },
  ) {
    if (
      input.role === "student" &&
      (!/^\d{7}$/.test(input.studentId) || !/^\d{4}$/.test(input.pin))
    )
      throw new AuctionError(
        "学生証番号は7桁、暗証番号は4桁の数字で入力してください。",
      );
    const outcome = await this.transaction(async (tx) => {
      const room = await roomFor(tx, code, true),
        now = await databaseTime(tx),
        identity = input.role === "teacher" ? "teacher" : input.studentId;
      const attempt = (
        await tx.query<{ attempts: number }>(
          `INSERT INTO judgment_logins(room_code,identity,attempts) VALUES($1,$2,1)
        ON CONFLICT(room_code,identity) DO UPDATE SET attempts=CASE WHEN judgment_logins.window_started < now()-interval '1 minute' THEN 1 ELSE judgment_logins.attempts+1 END,
        window_started=CASE WHEN judgment_logins.window_started < now()-interval '1 minute' THEN now() ELSE judgment_logins.window_started END RETURNING attempts`,
          [code, identity],
        )
      ).rows[0];
      if (attempt.attempts > 5)
        return {
          error: new AuctionError(
            "試行回数が多いため、1分後に再試行してください。",
            429,
          ),
        };
      const token = newToken();
      if (input.role === "teacher") {
        if (!passwordMatches(input.password, room.passwordHash))
          return {
            error: new AuctionError("教員パスワードが正しくありません。", 403),
          };
        room.tokenHash = digest(token);
        await saveRoom(tx, room);
      } else {
        let participant = await first<Participant>(
          tx,
          "SELECT state FROM judgment_participants WHERE room_code=$1 AND student_id=$2 FOR UPDATE",
          [code, input.studentId],
        );
        if (participant && !passwordMatches(input.pin, participant.pinHash))
          return {
            error: new AuctionError(
              "学生証番号または暗証番号が正しくありません。",
              403,
            ),
          };
        if (!participant) {
          const {
            rows: [attendance],
          } = await tx.query<{ count: number }>(
            "SELECT count(*)::int AS count FROM judgment_participants WHERE room_code=$1",
            [code],
          );
          if (attendance.count >= MAX_ROOM_PARTICIPANTS)
            return { error: new AuctionError("このルームは満員です。", 409) };
        }
        participant = participant
          ? { ...participant, tokenHash: digest(token), lastSeen: now }
          : {
              id: randomUUID(),
              studentId: input.studentId,
              pinHash: passwordHash(input.pin),
              tokenHash: digest(token),
              joinedAt: now,
              lastSeen: now,
            };
        await tx.query(
          "INSERT INTO judgment_participants(room_code,id,student_id,state) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(room_code,id) DO UPDATE SET state=excluded.state",
          [code, participant.id, participant.studentId, encoded(participant)],
        );
      }
      await tx.query(
        "DELETE FROM judgment_logins WHERE room_code=$1 AND identity=$2",
        [code, identity],
      );
      return { code, token };
    });
    if (outcome.error) throw outcome.error;
    return { code: outcome.code!, token: outcome.token! };
  }
  private async lessonFor(tx: Sql, room: Room) {
    return first<Lesson>(
      tx,
      room.activeLesson
        ? "SELECT state FROM judgment_lessons WHERE room_code=$1 AND id=$2"
        : "SELECT state FROM judgment_lessons WHERE room_code=$1 ORDER BY number DESC LIMIT 1",
      room.activeLesson ? [room.code, room.activeLesson] : [room.code],
    );
  }
  async studentView(
    code: string,
    token: string | undefined,
  ): Promise<StudentView> {
    return this.transaction(async (tx) => {
      const room = await roomFor(tx, code),
        participant = await participantFor(tx, code, token),
        lesson = await this.lessonFor(tx, room),
        now = await databaseTime(tx);
      if (now - participant.lastSeen > 15000) {
        participant.lastSeen = now;
        await tx.query(
          "UPDATE judgment_participants SET state=$3::jsonb WHERE room_code=$1 AND id=$2",
          [code, participant.id, encoded(participant)],
        );
      }
      let run = lesson
        ? await first<Run>(
            tx,
            "SELECT state FROM judgment_runs WHERE room_code=$1 AND lesson_id=$2 AND participant_id=$3 FOR UPDATE",
            [code, lesson.id, participant.id],
          )
        : undefined;
      if (lesson?.status === "active" && !run) {
        run = makeRun(lesson, participant.studentId, now);
        await tx.query(
          "INSERT INTO judgment_runs(room_code,lesson_id,participant_id,id,state) VALUES($1,$2,$3,$4,$5::jsonb)",
          [code, lesson.id, participant.id, run.id, encoded(run)],
        );
      }
      const needsPresentation =
          run?.steps.find((s) => s.status === "active")?.presentedAt === null,
        view = run ? state(run, now) : null;
      if (run && needsPresentation) await saveRun(tx, run);
      return {
        phase:
          lesson?.status === "active"
            ? "running"
            : lesson
              ? "finished"
              : "waiting",
        studentId: participant.studentId,
        lesson: lesson
          ? {
              id: lesson.id,
              status: lesson.status,
              createdAt: lesson.createdAt,
              endedAt: lesson.endedAt,
            }
          : null,
        run: view,
      };
    });
  }
  private async dashboard(tx: Sql, room: Room): Promise<TeacherView> {
    const history = (
        await tx.query<{ state: Lesson }>(
          "SELECT state FROM judgment_lessons WHERE room_code=$1 ORDER BY number DESC",
          [room.code],
        )
      ).rows.map((r) => r.state),
      lesson = history[0] ?? null;
    const students = (
      await tx.query<{
        studentId: string;
        lastSeen: number;
        runId: string | null;
        status: "active" | "completed" | "withdrawn" | null;
        answered: number;
        totalTrials: number;
      }>(
        `SELECT p.student_id AS "studentId",(p.state->>'lastSeen')::double precision AS "lastSeen",r.id AS "runId",r.state->>'status' AS status,
      COALESCE((SELECT sum((step->>'currentIndex')::int) FROM jsonb_array_elements(r.state->'steps') step),0)::int AS answered,
      COALESCE((SELECT sum(jsonb_array_length(step->'protocol'->'trials')) FROM jsonb_array_elements(r.state->'steps') step),0)::int AS "totalTrials"
      FROM judgment_participants p LEFT JOIN judgment_runs r ON r.room_code=p.room_code AND r.participant_id=p.id AND r.lesson_id=$2 WHERE p.room_code=$1 ORDER BY p.student_id`,
        [room.code, lesson?.id ?? null],
      )
    ).rows;
    return {
      code: room.code,
      title: room.title,
      revision: room.revision,
      settings: room.settings,
      lesson,
      history,
      students,
    };
  }
  async teacherView(code: string, token: string | undefined) {
    return this.transaction(async (tx) => {
      const room = await roomFor(tx, code);
      teacher(room, token);
      return this.dashboard(tx, room);
    });
  }
  async command(code: string, token: string | undefined, command: Command) {
    return this.transaction(async (tx) => {
      const room = await roomFor(tx, code, true);
      teacher(room, token);
      const payloadHash = fingerprint(command);
      const prior = (
        await tx.query<{ payload_hash: string }>(
          "SELECT payload_hash FROM judgment_commands WHERE room_code=$1 AND request_id=$2",
          [code, command.requestId],
        )
      ).rows[0];
      if (prior) {
        if (prior.payload_hash !== payloadHash)
          throw new AuctionError("送信IDの内容が変更されています。", 409);
        return this.dashboard(tx, room);
      }
      if (room.revision !== command.expectedRevision)
        throw new AuctionError(
          "別の画面で設定が変更されました。最新の状態を確認してください。",
          409,
        );
      const now = await databaseTime(tx);
      if (command.kind === "start") {
        if (room.activeLesson)
          throw new AuctionError("実施中の課題を終了してください。", 409);
        const settings = validateSettings(command.settings),
          lesson: Lesson = {
            id: randomUUID(),
            number: room.lessonCount + 1,
            status: "active",
            createdAt: now,
            endedAt: null,
            settings,
            settingsHash: fingerprint(settings),
          };
        await tx.query(
          "INSERT INTO judgment_lessons(room_code,id,number,state) VALUES($1,$2,$3,$4::jsonb)",
          [code, lesson.id, lesson.number, encoded(lesson)],
        );
        room.settings = settings;
        room.activeLesson = lesson.id;
        room.lessonCount++;
      } else {
        if (room.activeLesson !== command.lessonId)
          throw new AuctionError("終了する実施回が一致しません。", 409);
        const lesson = (await this.lessonFor(tx, room))!;
        lesson.status = "ended";
        lesson.endedAt = now;
        const runs = (
          await tx.query<{ state: Run }>(
            "SELECT state FROM judgment_runs WHERE room_code=$1 AND lesson_id=$2 FOR UPDATE",
            [code, lesson.id],
          )
        ).rows;
        for (const { state: run } of runs) {
          if (run.status === "active") {
            withdraw(run, now);
            await saveRun(tx, run);
          }
        }
        await tx.query(
          "UPDATE judgment_lessons SET state=$3::jsonb WHERE room_code=$1 AND id=$2",
          [code, lesson.id, encoded(lesson)],
        );
        room.activeLesson = null;
      }
      room.revision++;
      await saveRoom(tx, room);
      await tx.query(
        "INSERT INTO judgment_commands(room_code,request_id,payload_hash) VALUES($1,$2,$3)",
        [code, command.requestId, payloadHash],
      );
      return this.dashboard(tx, room);
    });
  }
  async run(
    code: string,
    token: string | undefined,
    runId: string,
    operation?: Submission | "withdraw",
  ) {
    return this.transaction(async (tx) => {
      await roomFor(tx, code);
      const participant = await participantFor(tx, code, token);
      const run = await first<Run>(
        tx,
        "SELECT state FROM judgment_runs WHERE room_code=$1 AND participant_id=$2 AND id=$3 FOR UPDATE",
        [code, participant.id, runId],
      );
      if (!run) throw new AuctionError("回答が見つかりません。", 404);
      const now = await databaseTime(tx),
        needsPresentation =
          run.steps.find((s) => s.status === "active")?.presentedAt === null;
      const view =
        operation === "withdraw"
          ? withdraw(run, now)
          : operation
            ? submit(run, operation, now)
            : state(run, now);
      if (operation || needsPresentation) await saveRun(tx, run);
      return view;
    });
  }
  async preview(code: string, token: string | undefined, settings: Settings) {
    return this.transaction(async (tx) => {
      teacher(await roomFor(tx, code), token);
      return { protocols: preview(settings) };
    });
  }
  async export(
    code: string,
    token: string | undefined,
    format: "json" | "csv",
  ) {
    return this.transaction(async (tx) => {
      const room = await roomFor(tx, code);
      teacher(room, token);
      const lessons = (
        await tx.query<{ state: Lesson }>(
          "SELECT state FROM judgment_lessons WHERE room_code=$1 ORDER BY number",
          [code],
        )
      ).rows.map((r) => r.state);
      const runs = (
        await tx.query<{ state: Run }>(
          "SELECT state FROM judgment_runs WHERE room_code=$1 ORDER BY lesson_id,participant_id",
          [code],
        )
      ).rows.map((r) => r.state);
      const participants = (
        await tx.query<{ studentId: string; joinedAt: number }>(
          `SELECT student_id AS "studentId",(state->>'joinedAt')::double precision AS "joinedAt" FROM judgment_participants WHERE room_code=$1 ORDER BY student_id`,
          [code],
        )
      ).rows;
      if (format === "json")
        return {
          formatVersion: 1,
          sourceCommit: SOURCE_COMMIT,
          room: { code, title: room.title, createdAt: room.createdAt },
          participants,
          lessons,
          runs: runs.map(records),
          conversationPairs: conversationPairs(runs),
        };
      const headers = [
        "source_commit",
        "room",
        "lesson_id",
        "student_id",
        "run_id",
        "run_status",
        "experiment_order_seed",
        "session_id",
        "study_id",
        "protocol_version",
        "protocol_seed",
        "condition",
        "protocol_hash",
        "trial_index",
        "trial_id",
        "answer",
        "metrics",
        "presented_at",
        "received_at",
        "analysis",
      ];
      const rows = runs.flatMap((run) =>
        records(run).sessions.flatMap((session) =>
          session.responses.map((response) => [
            SOURCE_COMMIT,
            code,
            run.lessonId,
            run.studentId,
            run.id,
            run.status,
            run.orderSeed,
            session.id,
            session.studyId,
            session.protocol.version,
            session.seed,
            session.condition,
            session.protocolHash,
            response.trialIndex,
            response.trialId,
            encoded(response.answer),
            encoded(response.metrics),
            response.presentedAt,
            response.receivedAt,
            encoded(session.analysis),
          ]),
        ),
      );
      return csv([headers, ...rows]);
    });
  }
  async listRooms(accessKey: string): Promise<RoomSummary[]> {
    assertTeacherAccess(accessKey);
    const rows = (
      await this.db.query<{ state: Room; count: number }>(
        "SELECT r.state,(SELECT count(*)::int FROM judgment_participants p WHERE p.room_code=r.code) AS count FROM judgment_rooms r",
      )
    ).rows;
    return rows.map(({ state: r, count }) => ({
      experiment: "judgment",
      code: r.code,
      title: r.title,
      createdAt: r.createdAt,
      phase: r.activeLesson
        ? "running"
        : r.lessonCount
          ? "finished"
          : "waiting",
      round: r.lessonCount,
      totalRounds: r.lessonCount,
      participantCount: count,
      capacity: MAX_ROOM_PARTICIPANTS,
      flexibleAdmission: true,
      marketCount: 0,
      institutions: [],
    }));
  }
  async deleteRoom(code: string, accessKey: string) {
    assertTeacherAccess(accessKey);
    return this.transaction(async (tx) => {
      await roomFor(tx, code, true);
      await tx.query("DELETE FROM judgment_rooms WHERE code=$1", [code]);
      await tx.query(
        "DELETE FROM lab_room_registry WHERE code=$1 AND experiment='judgment'",
        [code],
      );
    });
  }
}
export async function judgmentService() {
  return new JudgmentService(await database());
}
