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
import { AuctionError } from "@/lib/server/errors";
import { claimCode } from "@/lib/server/experiment-registry";
import type { RoomSummary } from "@/lib/room-management";
import {
  act,
  addParticipant,
  assignParticipants,
  drawStates,
  advanceClock,
  newRoom,
  phaseKey,
  RuleError,
  view,
} from "../engine";
import { exportData } from "../export";
import { allocationPlan, MAX_PARTICIPANTS } from "../allocation";
import type { Actor, Room } from "../types";
import type {
  Member,
  RequestCommand,
  Session,
  SessionView,
} from "../session-types";
import {
  DEFAULT_CONFIG,
  EXP2_CONFIG,
  FORMAL_EXP2_OPTIONS,
} from "./default-config";
import {
  DEFAULT_SETTINGS,
  EXP2_SETTINGS,
  settingsSchema,
  settingsForExperiment,
  type EmhSettings,
} from "../settings";

const random = () => randomInt(0, 2 ** 30) / 2 ** 30;
function check(ok: unknown, message: string, status = 409): asserts ok {
  if (!ok) throw new AuctionError(message, status);
}
function authenticate(
  session: Session,
  token: string | undefined,
  role: Actor["role"],
): Actor {
  check(token && /^[a-f0-9]{64}$/.test(token), "再入室してください。", 401);
  const hash = digest(token);
  if (role === "teacher" && equal(hash, session.teacherTokenHash))
    return { role };
  if (role === "student") {
    const member = session.members.find((p) => equal(hash, p.tokenHash));
    if (member) return { role, participantId: member.id };
  }
  throw new AuctionError("再入室してください。", 401);
}
function event(
  session: Session,
  now: number,
  kind: string,
  details: Record<string, unknown> = {},
  actor = "teacher",
) {
  session.revision++;
  session.events.push({
    sequence: session.events.length + 1,
    at: now,
    kind,
    actor,
    details,
  });
}
async function saveSession(tx: Sql, session: Session) {
  await tx.query(
    "UPDATE emh_sessions SET state = $2::jsonb, updated_at = now() WHERE code = $1",
    [session.code, JSON.stringify(session)],
  );
}
async function saveMarket(tx: Sql, code: string, id: number, room: Room) {
  await tx.query(
    "UPDATE emh_markets SET state = $3::jsonb WHERE room_code = $1 AND market_id = $2",
    [code, id, JSON.stringify(room)],
  );
}
async function readSession(tx: Sql, code: string, exclusive: boolean) {
  const result = await tx.query<{ state: Session }>(
    `SELECT state FROM emh_sessions WHERE code = $1 FOR ${exclusive ? "UPDATE" : "SHARE"}`,
    [code],
  );
  check(result.rows[0], "ルームが見つかりません。", 404);
  const session = result.rows[0].state;
  session.settings = settingsSchema.parse(
    session.settings ??
      (session.experiment === "exp2" ? EXP2_SETTINGS : DEFAULT_SETTINGS),
  );
  if (session.experiment === "exp2" && !session.settings.exp2)
    session.settings.exp2 = structuredClone(FORMAL_EXP2_OPTIONS);
  session.settingsLockedAt ??=
    session.status === "open"
      ? null
      : (session.events.findLast((e) => e.kind === "assign")?.at ??
        session.createdAt);
  return session;
}
function projection(
  session: Session,
  markets: { market_id: number; state: Room }[],
  actor: Actor,
  selected: number | null,
  now: number,
): SessionView {
  const teacher = actor.role === "teacher";
  const running = session.status === "running";
  const market = markets.find((m) => m.market_id === selected);
  const complete =
    running &&
    markets.length > 0 &&
    markets.every((m) => m.state.status === "completed");
  return {
    experiment: session.experiment ?? "exp1",
    settings: teacher
      ? structuredClone(session.settings ?? DEFAULT_SETTINGS)
      : null,
    settingsLockedAt: teacher ? (session.settingsLockedAt ?? null) : null,
    code: session.code,
    title: session.title,
    revision: session.revision,
    serverNow: now,
    role: actor.role,
    status: complete ? "completed" : session.status,
    participantCount: session.members.length,
    marketId: selected,
    allocation: teacher
      ? session.allocation.length
        ? session.allocation
        : allocationPlan(session.members.length, session.settings)
      : [],
    participants: teacher
      ? session.members.map((p) => ({
          id: p.id,
          name: p.nickname,
          marketId: p.marketId,
        }))
      : [],
    markets: teacher
      ? markets.map(({ market_id, state }) => ({
          ...session.allocation.find((a) => a.id === market_id)!,
          status: state.status,
          year: state.year,
          period: state.period,
          paused: state.pausedAt !== null,
          revealed: state.reveal,
          trades: state.trades.length,
          meanPrice: state.trades.length
            ? state.trades.reduce((s, t) => s + t.price, 0) /
              state.trades.length
            : null,
        }))
      : [],
    market:
      running && market
        ? {
            ...view(market.state, actor, now),
            marketId: market.market_id,
            title: `${session.title} · 市場 ${market.market_id}`,
          }
        : null,
  };
}

export class EmhService {
  constructor(private db: Database) {}
  async create(
    title: string,
    password: string,
    accessKey: string,
    input: EmhSettings | undefined = undefined,
    experiment: "exp1" | "exp2" = "exp1",
  ) {
    assertTeacherAccess(accessKey);
    input ??= experiment === "exp2" ? EXP2_SETTINGS : DEFAULT_SETTINGS;
    check(
      experiment !== "exp2" || input.rounds <= 6,
      "実験2は1〜6ラウンドで設定してください。",
      400,
    );
    const settings = settingsForExperiment(
      experiment === "exp2"
        ? { ...input, exp2: input.exp2 ?? structuredClone(FORMAL_EXP2_OPTIONS) }
        : input,
      experiment,
    );
    const token = newToken();
    const hash = passwordHash(password);
    for (let attempt = 0; attempt < 8; attempt++) {
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const code = Array.from(
        { length: 6 },
        () => alphabet[randomInt(alphabet.length)],
      ).join("");
      const saved = await this.db.transaction(async (tx) => {
        if (!(await claimCode(tx, code, "emh"))) return false;
        const now = await databaseTime(tx);
        const session: Session = {
          code,
          protocol: "emh-v1",
          experiment,
          settings: structuredClone(settings),
          settingsLockedAt: null,
          title,
          createdAt: now,
          revision: 0,
          status: "open",
          teacherPasswordHash: hash,
          teacherTokenHash: digest(token),
          members: [],
          allocation: [],
          events: [],
        };
        event(session, now, "created", {
          protocol: session.protocol,
          settings,
        });
        await tx.query(
          "INSERT INTO emh_sessions (code, state) VALUES ($1, $2::jsonb)",
          [code, JSON.stringify(session)],
        );
        return true;
      });
      if (saved) return { code, token };
    }
    throw new AuctionError("ルームを作成できませんでした。", 503);
  }
  async login(
    code: string,
    credentials:
      | { role: "teacher"; password: string }
      | { role: "student"; nickname: string; pin: string },
  ) {
    const token = newToken();
    const result = await this.db.transaction(async (tx) => {
      const session = await readSession(tx, code, true);
      const identity =
        credentials.role === "teacher"
          ? "teacher"
          : `student:${credentials.nickname}`;
      const attempt = await tx.query<{ attempts: number }>(
        `INSERT INTO emh_login_attempts (room_code, identity, attempts) VALUES ($1,$2,1)
        ON CONFLICT (room_code,identity) DO UPDATE SET attempts=CASE WHEN emh_login_attempts.window_started < now()-interval '5 minutes' THEN 1 ELSE emh_login_attempts.attempts+1 END,
        window_started=CASE WHEN emh_login_attempts.window_started < now()-interval '5 minutes' THEN now() ELSE emh_login_attempts.window_started END RETURNING attempts`,
        [code, identity],
      );
      if (attempt.rows[0]!.attempts > 10)
        return new AuctionError("5分後に再度お試しください。", 429);
      if (credentials.role === "teacher") {
        if (!passwordMatches(credentials.password, session.teacherPasswordHash))
          return new AuctionError("教員パスワードが正しくありません。", 403);
        session.teacherTokenHash = digest(token);
      } else {
        let member = session.members.find(
          (p) => p.nickname === credentials.nickname,
        );
        if (member) {
          if (!passwordMatches(credentials.pin, member.pinHash))
            return new AuctionError(
              "名前または暗証番号を確認してください。",
              403,
            );
          member.tokenHash = digest(token);
        } else {
          if (session.status !== "open")
            return new AuctionError(
              "入室受付は終了しました。登録済みの方は同じ名前と暗証番号で入室してください。",
            );
          if (session.members.length >= MAX_PARTICIPANTS)
            return new AuctionError("このルームは定員に達しています。");
          const now = await databaseTime(tx);
          member = {
            id: randomUUID(),
            nickname: credentials.nickname,
            pinHash: passwordHash(credentials.pin),
            tokenHash: digest(token),
            joinedAt: now,
            marketId: null,
          };
          session.members.push(member);
          event(
            session,
            now,
            "joined",
            { participantId: member.id },
            member.id,
          );
        }
      }
      await tx.query(
        "DELETE FROM emh_login_attempts WHERE room_code=$1 AND identity=$2",
        [code, identity],
      );
      await saveSession(tx, session);
      return null;
    });
    if (result) throw result;
    return { code, token };
  }
  async request(
    code: string,
    token: string | undefined,
    role: Actor["role"],
    selected?: number,
    input?: RequestCommand,
  ) {
    const outcome = await this.db.transaction(async (tx) => {
      const session = await readSession(tx, code, input?.scope === "session");
      const actor = authenticate(session, token, role);
      const member =
        actor.role === "student"
          ? session.members.find((p) => p.id === actor.participantId)!
          : null;
      const marketId = member
        ? member.marketId
        : (selected ?? session.allocation[0]?.id ?? null);
      if (member && selected !== undefined && selected !== member.marketId)
        throw new AuctionError("この市場には参加していません。", 403);
      if (input?.scope === "market")
        check(
          input.marketId === marketId,
          "市場が変更されました。もう一度操作してください。",
        );
      const loaded = await tx.query<{ market_id: number; state: Room }>(
        `SELECT market_id,state FROM emh_markets WHERE room_code=$1 AND ($2::int IS NULL OR market_id=$2) ORDER BY market_id FOR UPDATE`,
        [code, actor.role === "teacher" ? null : (member?.marketId ?? -1)],
      );
      const markets = loaded.rows;
      const now = await databaseTime(tx);
      for (const m of markets) {
        const before = m.state.revision;
        advanceClock(m.state, now, random);
        if (m.state.revision !== before)
          await saveMarket(tx, code, m.market_id, m.state);
      }
      let error: AuctionError | undefined;
      if (input) {
        const actorId =
          actor.role === "teacher" ? "teacher" : actor.participantId;
        const hash = digest(JSON.stringify(input));
        const receipt = await tx.query<{ payload_hash: string }>(
          "SELECT payload_hash FROM emh_command_receipts WHERE room_code=$1 AND actor=$2 AND request_id=$3",
          [code, actorId, input.requestId],
        );
        if (receipt.rows[0]) {
          if (receipt.rows[0].payload_hash !== hash)
            error = new AuctionError("同じ操作IDで内容を変更できません。");
        } else {
          try {
            if (input.scope === "session") {
              check(actor.role === "teacher", "教員の操作です。", 403);
              check(
                input.command.expectedRevision === session.revision,
                "名簿または進行が更新されました。確認してもう一度操作してください。",
              );
              const command = input.command;
              const { kind } = command;
              if (kind === "update-settings") {
                check(
                  session.status === "open" && session.settingsLockedAt == null,
                  "割り当て確定後は条件を変更できません。開始前に割り当てを解除してください。",
                );
                if (session.experiment === "exp2") {
                  const proposed = command.settings;
                  check(
                    proposed.rounds <= 6,
                    "実験2は1〜6ラウンドで設定してください。",
                    400,
                  );
                }
                session.settings = settingsForExperiment(
                  session.experiment === "exp2"
                    ? {
                        ...command.settings,
                        exp2:
                          command.settings.exp2 ??
                          session.settings?.exp2 ??
                          structuredClone(FORMAL_EXP2_OPTIONS),
                      }
                    : command.settings,
                  session.experiment === "exp2" ? "exp2" : "exp1",
                );
              } else if (kind === "assign") {
                check(
                  session.status === "open" && session.members.length >= 3,
                  "受付中に3人以上がそろってから割り当ててください。",
                );
                session.allocation = allocationPlan(
                  session.members.length,
                  session.settings,
                );
                check(
                  session.allocation.length > 0,
                  session.experiment === "exp2"
                    ? "市場数を確認してください。各市場には3人以上必要です。"
                    : "市場数を確認してください。各市場は3〜12人です。",
                );
                session.settingsLockedAt = now;
                const shuffled = [...session.members];
                for (let i = shuffled.length - 1; i > 0; i--) {
                  const j = randomInt(i + 1);
                  [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
                }
                let offset = 0;
                for (const allocation of session.allocation) {
                  const room = newRoom(
                    code,
                    {
                      ...(session.experiment === "exp2"
                        ? EXP2_CONFIG
                        : DEFAULT_CONFIG),
                      title: session.title,
                      initialUnits: session.settings!.initialUnits,
                      periodSeconds: session.settings!.periodSeconds,
                      rounds: session.settings!.rounds,
                      unitSeconds: session.settings!.unitSeconds,
                      breakSeconds: session.settings!.breakSeconds,
                      ...(session.experiment === "exp2"
                        ? {
                            states: {
                              ...structuredClone(
                                session.settings!.exp2!.states,
                              ),
                              outcomes: [],
                            },
                            emptyUnitsLimit:
                              session.settings!.exp2!.emptyUnitsLimit,
                            insiderStartRound:
                              session.settings!.exp2!.insiderStartRound,
                            insiderCountPerType:
                              session.settings!.exp2!.insiderCountPerType,
                          }
                        : {}),
                    },
                    now,
                    "",
                    "",
                  );
                  room.typeCounts = allocation.typeCounts;
                  for (const person of shuffled.slice(
                    offset,
                    offset + allocation.size,
                  )) {
                    person.marketId = allocation.id;
                    addParticipant(
                      room,
                      {
                        id: person.id,
                        name: person.nickname,
                        studentId: person.nickname,
                        pinHash: "",
                        tokenHash: "",
                      },
                      now,
                    );
                  }
                  assignParticipants(room, random);
                  offset += allocation.size;
                  await tx.query(
                    "INSERT INTO emh_markets (room_code,market_id,state) VALUES ($1,$2,$3::jsonb)",
                    [code, allocation.id, JSON.stringify(room)],
                  );
                  markets.push({ market_id: allocation.id, state: room });
                }
                session.status = "assigned";
              } else if (kind === "reopen") {
                check(
                  session.status === "assigned",
                  "開始前だけ入室を再開できます。",
                );
                await tx.query("DELETE FROM emh_markets WHERE room_code=$1", [
                  code,
                ]);
                markets.length = 0;
                session.allocation = [];
                session.settingsLockedAt = null;
                session.members.forEach((p) => (p.marketId = null));
                session.status = "open";
              } else {
                check(
                  kind === "start"
                    ? session.status === "assigned"
                    : session.status === "running",
                  "この段階では操作できません。",
                );
                if (kind === "reveal-all")
                  check(
                    markets.every((m) => m.state.status === "completed"),
                    "全市場の終了後に公開できます。",
                  );
                if (kind === "finish-all")
                  check(
                    markets.some((m) => m.state.status !== "completed"),
                    "全市場が終了しています。",
                  );
                const actionKind = (
                  {
                    "pause-all": "pause",
                    "resume-all": "resume",
                    "finish-all": "finish",
                    "reveal-all": "reveal",
                    start: "start",
                  } as const
                )[kind];
                const next = structuredClone(markets);
                // One room-wide draw keeps all markets on the same state each round.
                if (actionKind === "start" && session.experiment === "exp2") {
                  const pending = next.filter(
                    (m) => m.state.config.states?.outcomes.length === 0,
                  );
                  if (pending.length) {
                    const states = drawStates(
                      session.settings!.exp2!.states.prior,
                      session.settings!.rounds,
                      random,
                    );
                    for (const m of pending)
                      m.state.config.states!.outcomes = [...states];
                  }
                }
                for (const m of next) {
                  if (actionKind === "finish" && m.state.status === "completed")
                    continue;
                  if (
                    actionKind === "pause" &&
                    (m.state.status === "completed" ||
                      m.state.pausedAt !== null)
                  )
                    continue;
                  if (actionKind === "resume" && m.state.pausedAt === null)
                    continue;
                  act(
                    m.state,
                    { role: "teacher" },
                    { kind: actionKind, expectedPhase: phaseKey(m.state) },
                    now,
                    random,
                  );
                }
                for (const m of next)
                  await saveMarket(tx, code, m.market_id, m.state);
                markets.splice(0, markets.length, ...next);
                if (kind === "start") session.status = "running";
              }
              event(
                session,
                now,
                kind,
                kind === "assign"
                  ? {
                      allocation: session.allocation,
                      settings: session.settings,
                      settingsLockedAt: session.settingsLockedAt,
                      assignments: session.members.map((p) => ({
                        id: p.id,
                        market: p.marketId,
                      })),
                    }
                  : kind === "update-settings"
                    ? { settings: session.settings }
                    : {},
              );
              await saveSession(tx, session);
            } else {
              check(session.status === "running", "実験は開始されていません。");
              const market = markets.find(
                (m) => m.market_id === input.marketId,
              );
              check(market, "市場が見つかりません。", 404);
              check(
                input.action.kind !== "reveal",
                "全市場の終了後に、ルーム全体から解説を公開してください。",
              );
              check(
                input.action.kind !== "start",
                "ルーム全体から開始してください。",
              );
              check(
                input.action.kind !== "finish",
                "ルーム全体から終了してください。",
              );
              const next = structuredClone(market.state);
              act(next, actor, input.action, now, random);
              await saveMarket(tx, code, market.market_id, next);
              market.state = next;
            }
            await tx.query(
              "INSERT INTO emh_command_receipts (room_code,actor,request_id,payload_hash) VALUES ($1,$2,$3,$4)",
              [code, actorId, input.requestId, hash],
            );
          } catch (e) {
            if (e instanceof AuctionError) error = e;
            else if (e instanceof RuleError)
              error = new AuctionError(e.message, e.status);
            else throw e;
          }
        }
      }
      return {
        state: projection(
          session,
          markets,
          actor,
          marketId ?? session.allocation[0]?.id ?? null,
          now,
        ),
        error,
      };
    });
    return outcome;
  }
  async listRooms(accessKey: string): Promise<RoomSummary[]> {
    assertTeacherAccess(accessKey);
    const result = await this.db.query<{
      code: string;
      title: string;
      created_at: string;
      status: string;
      count: number;
      markets: number;
      round: number;
      finished: boolean;
      paused: boolean;
    }>(`SELECT s.code,s.state->>'title' title,s.state->>'createdAt' created_at,s.state->>'status' status,
      jsonb_array_length(s.state->'members') count, jsonb_array_length(s.state->'allocation') markets,
      COALESCE(m.round,0) round,COALESCE(m.finished,false) finished,COALESCE(m.paused,false) paused
      FROM emh_sessions s LEFT JOIN LATERAL (SELECT max((state->>'year')::int) round,bool_and(state->>'status'='completed') finished,bool_or(state->>'pausedAt' IS NOT NULL) paused FROM emh_markets WHERE room_code=s.code) m ON true`);
    return result.rows.map((r) => ({
      code: r.code,
      title: r.title,
      createdAt: Number(r.created_at),
      experiment: "emh",
      phase: r.finished
        ? "finished"
        : r.paused
          ? "paused"
          : r.status === "running"
            ? "running"
            : "waiting",
      round: r.round,
      totalRounds: 6,
      participantCount: r.count,
      capacity: MAX_PARTICIPANTS,
      flexibleAdmission: true,
      marketCount: r.markets,
      institutions: [],
    }));
  }
  async deleteRoom(code: string, accessKey: string) {
    assertTeacherAccess(accessKey);
    await this.db.transaction(async (tx) => {
      await readSession(tx, code, true);
      await tx.query("DELETE FROM emh_sessions WHERE code=$1", [code]);
      await tx.query("DELETE FROM lab_room_registry WHERE code=$1", [code]);
    });
  }
  async export(
    code: string,
    token: string | undefined,
    role: Actor["role"],
    kind: string,
    selected?: number,
  ) {
    return this.db.transaction(async (tx) => {
      const session = await readSession(tx, code, false);
      const actor = authenticate(session, token, role);
      const member: Member | undefined =
        actor.role === "student"
          ? session.members.find((p) => p.id === actor.participantId)
          : undefined;
      if (member)
        check(
          member.marketId !== null &&
            (selected === undefined || selected === member.marketId),
          "この市場には参加していません。",
          403,
        );
      if (member)
        check(kind === "personal", "個人の記録のみ保存できます。", 403);
      const id = member ? member.marketId : (selected ?? null);
      const result = await tx.query<{ market_id: number; state: Room }>(
        "SELECT market_id,state FROM emh_markets WHERE room_code=$1 AND ($2::int IS NULL OR market_id=$2) ORDER BY market_id FOR UPDATE",
        [code, id],
      );
      const now = await databaseTime(tx);
      for (const m of result.rows) {
        const before = m.state.revision;
        advanceClock(m.state, now, random);
        if (before !== m.state.revision)
          await saveMarket(tx, code, m.market_id, m.state);
      }
      if (actor.role === "teacher" && kind === "conditions")
        return {
          extension: "json",
          contentType: "application/json; charset=utf-8",
          body: JSON.stringify(
            {
              experiment: session.experiment === "exp2" ? "emh-exp2" : "emh-v1",
              code,
              title: session.title,
              settings: session.settings,
              settingsLockedAt: session.settingsLockedAt,
              config: result.rows[0]?.state.config ?? {
                ...(session.experiment === "exp2"
                  ? EXP2_CONFIG
                  : DEFAULT_CONFIG),
                title: session.title,
                initialUnits: session.settings!.initialUnits,
                periodSeconds: session.settings!.periodSeconds,
                rounds: session.settings!.rounds,
                unitSeconds: session.settings!.unitSeconds,
                breakSeconds: session.settings!.breakSeconds,
                ...(session.experiment === "exp2"
                  ? {
                      states: {
                        ...structuredClone(session.settings!.exp2!.states),
                        outcomes: [],
                      },
                      emptyUnitsLimit: session.settings!.exp2!.emptyUnitsLimit,
                      insiderStartRound:
                        session.settings!.exp2!.insiderStartRound,
                      insiderCountPerType:
                        session.settings!.exp2!.insiderCountPerType,
                    }
                  : {}),
              },
              allocation: session.allocation,
              members: session.members.map((p) => ({
                id: p.id,
                nickname: p.nickname,
                marketId: p.marketId,
              })),
              events: session.events,
              markets: result.rows.map((m) => ({
                marketId: m.market_id,
                conditions: JSON.parse(
                  exportData(m.state, actor, "conditions").body,
                ),
              })),
            },
            null,
            2,
          ),
        };
      check(result.rows.length, "取引記録は市場の割り当て後に保存できます。");
      check(
        [
          "trades",
          "results",
          "payouts",
          "participants",
          "audit",
          "personal",
        ].includes(kind),
        "出力形式を確認してください。",
        400,
      );
      const files = result.rows.map((m) => ({
        id: m.market_id,
        file: exportData(m.state, actor, kind),
      }));
      // Preserve quoted embedded newlines and the original cell escaping.
      const records = (body: string) => {
        const rows: string[] = [];
        let quoted = false,
          start = 0;
        const text = body.replace(/^\uFEFF/, "");
        for (let i = 0; i < text.length; i++) {
          if (text[i] === '"') {
            if (quoted && text[i + 1] === '"') i++;
            else quoted = !quoted;
          }
          if (!quoted && text[i] === "\n") {
            rows.push(text.slice(start, i).replace(/\r$/, ""));
            start = i + 1;
          }
        }
        if (start < text.length) rows.push(text.slice(start));
        return rows;
      };
      const rows = files.flatMap(({ id, file }, i) =>
        records(file.body).flatMap((row, j) =>
          j === 0 ? (i === 0 ? [`"market",${row}`] : []) : [`"${id}",${row}`],
        ),
      );
      return { ...files[0]!.file, body: "\uFEFF" + rows.join("\r\n") };
    });
  }
}
export async function emhService() {
  return new EmhService(await database());
}
