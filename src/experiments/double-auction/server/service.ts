import { claimCode } from "../../../lib/server/experiment-registry";
import { inMarketQueue } from "./market-queue";
import {
  annotateOperation,
  clientLogs,
  operationInput,
  readActionLogs,
  writeActionLogs,
} from "./action-log";
import {
  actionExport,
  type ClientAction,
  type Operation,
} from "../lib/action-log";
import { studyTiming } from "../lib/study-timing";
import {
  studyCommission,
  studyCommissionError,
  studyCommissionSchema,
  STUDY_COMMISSION_ERROR,
} from "../lib/study-commission";
import {
  studyLayoutError,
  studyMarketId,
  studyMarketSize,
  MAX_STUDY_PARTICIPANTS,
  studyUnits,
  studyUnitsError,
  studyUnitsPerSide,
  studyRole,
  studyRoleIndex,
  studyInstitutions,
  DEFAULT_STUDY_INSTITUTIONS,
  studyPeriodCount,
  studyTotalRounds,
} from "../lib/study-config";
import { timed, timedSync } from "../../../lib/server/performance";
import { randomInt, randomUUID } from "node:crypto";
import type { CommandRequest, RoomConfig, RoomView } from "../lib/types";
import type { RoomSession } from "../../../lib/room-session";
import type { RoomSummary } from "../../../lib/room-management";
import type {
  StudyGeneratorConfig,
  StudySettings,
  StudyConditions,
} from "../lib/study-types";
import { presetStudyConditions } from "../lib/study-conditions";
import { generatedStudySettings } from "../lib/study-generator";
import { studyAllocationPlan } from "../lib/study-allocation";
import {
  assertTeacherAccess,
  digest,
  equal,
  newToken,
  passwordHash,
  passwordMatches,
} from "../../../lib/server/auth";
import {
  authenticate,
  verifyTeacherPassword,
} from "@/experiments/double-auction/server/auth";
import {
  database,
  databaseTime,
  type Database,
} from "../../../lib/server/database";
import {
  assemble,
  lockBundle,
  partition,
  saveBundle,
  writeEvents,
} from "./market-store";
import {
  cachedRoomRoot,
  readRoomBundle,
  readRoomRoot,
} from "./room-read-cache";
import { execute, settleDeadline, toView } from "./engine";
import { defaultMarketSettings, limitsForSeat } from "./experiment";
import { AuctionError, emit, type AuditEvent, type Room } from "./model";
import {
  marketFor,
  marketRound,
  newStudy,
  settleStudy,
  studyTimingSchema,
  studyInstitutionsSchema,
  studyPeriodsSchema,
  studyUnitCountsSchema,
  unitLimits,
  recordStudyGeneratedAssignments,
  applyStudyGenerator,
  pptStudySettings,
} from "./study";

type Outcome<T> =
  { value: T; error?: never } | { error: AuctionError; value?: never };

export class AuctionService {
  constructor(private db: Database) {}

  async create(
    config: RoomConfig,
    password: string,
    accessKey: string,
    generator?: StudyGeneratorConfig,
  ) {
    assertTeacherAccess(accessKey);
    if (generator && config.protocol !== "institutions-v1")
      throw new AuctionError(
        "この供需プリセットは制度比較実験で選択してください。",
      );
    if (config.protocol === "institutions-v1") {
      const capacityError = studyLayoutError(1, config.capacity, true);
      if (capacityError) throw new AuctionError(capacityError);
      const initialPlan = config.studyMarketMode
        ? studyAllocationPlan(
            config.capacity,
            config.markets ?? 1,
            config.studyMarketMode,
          )
        : null;
      const size = initialPlan?.templateSize ?? studyMarketSize(config);
      const layoutError = studyLayoutError(
        config.markets ?? 0,
        size,
        config.studyAdmission === "flexible",
        config.studyAdmission === "flexible",
      );
      if (layoutError) throw new AuctionError(layoutError);
      const unitsError = studyUnitsError(studyUnits(config));
      if (unitsError) throw new AuctionError(unitsError);
      const selection = studyInstitutionsSchema.safeParse(
        studyInstitutions(config),
      );
      if (!selection.success)
        throw new AuctionError(
          "実施する制度を重複せず1つ以上選択してください。",
        );
      const institutions = DEFAULT_STUDY_INSTITUTIONS.filter((i) =>
        selection.data.includes(i),
      );
      if (
        config.studyUnitCounts &&
        !studyUnitCountsSchema.partial().safeParse(config.studyUnitCounts)
          .success
      )
        throw new AuctionError(studyUnitsError(NaN));
      const periods = studyPeriodsSchema.safeParse(config.studyPeriods ?? {});
      if (!periods.success)
        throw new AuctionError(
          "各制度の期数は1〜20期の整数で設定してください。",
        );
      const selectedPeriods = Object.fromEntries(
        institutions.map((i) => [i, studyPeriodCount(config, i)]),
      );
      const timing = studyTimingSchema.safeParse(studyTiming(config));
      if (!timing.success)
        throw new AuctionError("各時間は1〜3600秒の整数で設定してください。");
      const commission = studyCommissionSchema.safeParse(
        studyCommission(config),
      );
      if (!commission.success) throw new AuctionError(STUDY_COMMISSION_ERROR);
      config = {
        ...config,
        marketSize: size,
        ...(initialPlan ? { markets: initialPlan.requestedMarkets } : {}),
        capacity:
          config.studyAdmission === "flexible"
            ? config.studyMarketMode
              ? config.capacity
              : Math.min(MAX_STUDY_PARTICIPANTS, config.markets! * size)
            : config.markets! * size,
        studyInstitutions: institutions,
        studyPeriods: selectedPeriods,
        rounds: studyTotalRounds({
          studyInstitutions: institutions,
          studyPeriods: selectedPeriods,
        }),
        duration: timing.data.cdaSeconds,
        studyTiming: timing.data,
        ...(institutions.includes("posted")
          ? { studyPostedMechanism: "direct-purchase-v1" as const }
          : {}),
        studyCommission: commission.data,
        studyCdaUnits: studyUnits(config),
      };
    }
    let otherStudySettings: StudySettings | undefined;
    let initialConditions: StudyConditions | undefined;
    if (config.protocol === "institutions-v1" && config.studyUnitCounts) {
      try {
        initialConditions = presetStudyConditions(
          config,
          pptStudySettings(),
          generator,
        );
        for (const condition of Object.values(initialConditions)) {
          const error = studyCommissionError(
            studyCommission(config),
            condition.settings,
          );
          if (error) throw new Error(error);
        }
      } catch (error) {
        throw new AuctionError(
          error instanceof Error
            ? error.message
            : "供需条件を確認してください。",
        );
      }
    }
    if (generator && !initialConditions) {
      generator = structuredClone(generator);
      try {
        generatedStudySettings(
          generator,
          studyUnitsPerSide(config),
          studyUnits(config),
        );
        if (
          studyUnits(config) !== 2 &&
          studyInstitutions(config).some((i) => i !== "cda")
        )
          otherStudySettings = generatedStudySettings(
            generator,
            studyUnitsPerSide(config, "call"),
          );
      } catch (error) {
        throw new AuctionError(
          error instanceof Error
            ? error.message
            : "生成条件を確認してください。",
        );
      }
    }
    if (config.protocol === "institutions-v1" && !initialConditions) {
      const settings = generator
        ? generatedStudySettings(
            generator,
            studyUnitsPerSide(config),
            studyUnits(config),
          )
        : pptStudySettings(studyMarketSize(config), studyUnits(config));
      const error = studyCommissionError(
        studyCommission(config),
        settings,
        studyUnits(config) !== 2 &&
          studyInstitutions(config).some((i) => i !== "cda")
          ? (otherStudySettings ?? pptStudySettings(studyMarketSize(config)))
          : undefined,
      );
      if (error) throw new AuctionError(error);
    }
    const token = newToken();
    const hash = passwordHash(password);
    const seats = Array.from({ length: config.capacity }, (_, i) => i);
    for (
      let i = config.protocol === "institutions-v1" ? 0 : seats.length - 1;
      i > 0;
      i--
    ) {
      const j = randomInt(i + 1);
      [seats[i], seats[j]] = [seats[j], seats[i]];
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const code = Array.from(
        { length: 6 },
        () => alphabet[randomInt(alphabet.length)],
      ).join("");
      const saved = await this.db.transaction(async (tx) => {
        if (!(await claimCode(tx, code, "institutions"))) return false;
        const now = await databaseTime(tx);
        const room: Room = {
          ...(config.protocol === "institutions-v1"
            ? {
                study: {
                  ...newStudy(
                    config.markets!,
                    studyMarketSize(config),
                    studyInstitutions(config),
                    studyUnits(config),
                  ),
                  lobby: {
                    revision: 0,
                    randomizedAt: null,
                    ...(config.studyAdmission === "flexible"
                      ? {
                          admission: {
                            status: "open" as const,
                            closesAt: null,
                            closedAt: null,
                            targetMarkets: config.markets!,
                          },
                        }
                      : {}),
                  },
                },
              }
            : {}),
          code,
          config,
          marketSettings: defaultMarketSettings(),
          settingsRevision: 0,
          phase: "waiting",
          round: 0,
          version: 1,
          deadline: null,
          remainingMs: config.duration * 1000,
          createdAt: now,
          teacherTokenHash: digest(token),
          teacherPasswordHash: hash,
          teacherFailedLogins: 0,
          teacherLockedUntil: 0,
          participants: [],
          seats,
          quotes: [],
          trades: [],
          sequence: 0,
          receipts: [],
        };
        const events: AuditEvent[] = [];
        if (initialConditions) {
          room.study!.conditionsByInstitution =
            structuredClone(initialConditions);
          room.study!.settings = structuredClone(
            initialConditions[studyInstitutions(config)[0]]!.settings,
          );
        }
        if (otherStudySettings)
          room.study!.otherSettings = structuredClone(otherStudySettings);
        if (generator) applyStudyGenerator(room, generator, now);
        emit(room, events, now, "room-created", "teacher", {
          config,
          marketSettings: room.marketSettings,
          ...(room.study
            ? {
                protocol: room.study.protocol,
                settings: room.study.settings,
                ...(room.study.conditionsByInstitution
                  ? {
                      conditionsByInstitution:
                        room.study.conditionsByInstitution,
                    }
                  : {}),
                ...(room.study.otherSettings
                  ? { otherSettings: room.study.otherSettings }
                  : {}),
                ...(room.study.generation
                  ? { generation: structuredClone(room.study.generation) }
                  : {}),
                orders: room.study.markets.map((m) => ({
                  market: m.id,
                  order: m.order,
                })),
              }
            : {}),
        });
        const inserted = await tx.query(
          "INSERT INTO auction_rooms (code, state) VALUES ($1, $2::jsonb) ON CONFLICT DO NOTHING RETURNING code",
          [code, JSON.stringify(room)],
        );
        if (!inserted.rows.length) return false;
        await partition(tx, room);
        await writeEvents(tx, code, events);
        return true;
      });
      if (saved) return { code, token };
    }
    throw new AuctionError(
      "ルームの作成に失敗しました。もう一度お試しください。",
      503,
    );
  }

  private async locked<T>(
    code: string,
    fn: (
      room: Room,
      now: number,
      events: AuditEvent[],
      receiptCount: number,
    ) => T | Promise<T>,
    scope?: number,
    receipt?: Room["receipts"][number],
  ): Promise<T> {
    const outcome = await inMarketQueue(this.db, code, scope, () =>
      this.db.transaction(async (tx): Promise<Outcome<T>> => {
        const bundle = await timed("command.lock_bundle", () =>
          lockBundle(
            tx,
            code,
            scope,
            false,
            cachedRoomRoot(this.db, code),
            receipt,
          ),
        );
        const room = timedSync("state.assemble", () => assemble(bundle, scope));
        // Scoped commands/deadlines emit audit events for every mutation. The
        // room-wide path also includes unaudited login/administrative changes.
        const before = scope ? undefined : JSON.stringify(room);
        const receiptsBefore = room.receipts.length;
        const receiptCount =
          bundle.root.receipts.length +
          bundle.markets.reduce(
            (sum, m) => sum + m.receipts.length + (m.receipt_count ?? 0),
            0,
          );
        const now = bundle.now; // After acquiring the lock: no pre-lock timestamps.
        const events: AuditEvent[] = [];
        const deadlineChanged = settleDeadline(room, now, events);
        let result: Outcome<T>;
        try {
          result = { value: await fn(room, now, events, receiptCount) };
        } catch (error) {
          if (!(error instanceof AuctionError)) throw error;
          result = { error };
        }
        if (
          scope
            ? deadlineChanged ||
              events.length > 0 ||
              room.receipts.length !== receiptsBefore
            : JSON.stringify(room) !== before
        ) {
          await timed("command.save", () =>
            saveBundle(tx, bundle, room, events, scope),
          );
        }
        return result;
      }),
    );
    if (outcome.error) throw outcome.error;
    return outcome.value;
  }

  async join(
    code: string,
    nickname: string,
    pin: string,
    currentToken?: string,
  ) {
    return this.locked(code, (room, now, events) => {
      let participant = room.participants.find((p) => p.nickname === nickname);
      let token = newToken();
      if (participant) {
        if (participant.lockedUntil > now)
          throw new AuctionError(
            "再入室の試行回数が多いため、しばらく待ってください。",
            429,
          );
        if (!passwordMatches(pin, participant.pinHash)) {
          participant.failedLogins++;
          if (participant.failedLogins >= 5) {
            participant.lockedUntil = now + 60_000;
            participant.failedLogins = 0;
          }
          throw new AuctionError(
            "同じ名前が使われています。再入室する場合は正しい暗証番号を入力してください。",
            403,
          );
        }
        // Reuse a cookie only for this student, after checking their PIN.
        // A teacher or another student's session must not override the form.
        if (currentToken && equal(digest(currentToken), participant.tokenHash))
          token = currentToken;
        participant.tokenHash = digest(token);
        participant.failedLogins = 0;
        participant.lockedUntil = 0;
        emit(
          room,
          events,
          now,
          "rejoined",
          participant.id,
          room.study ? { market: marketFor(room, participant).id } : {},
          room.study
            ? marketRound(room, marketFor(room, participant))
            : room.round,
        );
      } else {
        if (
          room.study && !room.study.lobby
            ? room.phase === "finished"
            : room.phase !== "waiting"
        )
          throw new AuctionError(
            room.study && room.phase === "finished"
              ? "実験は終了しています。記録を確認する場合は以前の名前と暗証番号で再入室してください。"
              : "実験開始後は新しく参加できません。以前の名前と暗証番号で再入室してください。",
            409,
          );
        const flexible = !!room.study?.lobby?.admission;
        if (flexible && room.study!.lobby!.admission!.status !== "open")
          throw new AuctionError(
            "入室受付は終了しました。教員に確認してください。",
            409,
          );
        if (
          room.participants.length >=
          (flexible ? MAX_STUDY_PARTICIPANTS : room.config.capacity)
        )
          throw new AuctionError("このルームは満員です。", 409);
        const seat = flexible ? -1 : room.seats[room.participants.length];
        const role = room.study
          ? studyRole(room.config, seat)
          : seat < room.config.capacity / 2
            ? "buyer"
            : "seller";
        const number =
          (room.study
            ? studyRoleIndex(room.config, seat)
            : role === "buyer"
              ? seat
              : seat - room.config.capacity / 2) + 1;
        participant = {
          id: randomUUID(),
          joinedAt: now,
          alias: flexible
            ? "未割当"
            : `${role === "buyer" ? "買" : "売"}${String(number).padStart(2, "0")}`,
          nickname,
          role,
          seat,
          limits: limitsForSeat(
            seat,
            room.config.capacity,
            room.marketSettings,
          ),
          tokenHash: digest(token),
          pinHash: passwordHash(pin),
          failedLogins: 0,
          lockedUntil: 0,
        };
        room.participants.push(participant);
        if (room.study)
          participant.limits = {
            apple: unitLimits(room, participant)[0] ?? 0,
            banana: 0,
            orange: 0,
          };
        emit(
          room,
          events,
          now,
          "joined",
          participant.id,
          {
            alias: participant.alias,
            role,
            seat,
            limits: participant.limits,
            ...(room.study
              ? {
                  market: studyMarketId(room.config, seat),
                  unitLimits: unitLimits(room, participant),
                }
              : {}),
          },
          room.study
            ? marketRound(room, marketFor(room, participant))
            : room.round,
        );
        if (room.study) settleStudy(room, now, events);
        if (room.study?.lobby?.admission) room.study.lobby.revision++;
        recordStudyGeneratedAssignments(room);
      }
      return { code, token };
    });
  }

  async recoverTeacher(code: string, password: string) {
    return this.locked(code, (room, now, events) => {
      verifyTeacherPassword(room, now, password);
      const token = newToken();
      room.teacherTokenHash = digest(token);
      emit(room, events, now, "teacher-rejoined", "teacher");
      return { code, token };
    });
  }

  async listRooms(accessKey: string, code?: string): Promise<RoomSummary[]> {
    assertTeacherAccess(accessKey);
    // Project only management metadata: credentials, names and trading history
    // never leave the database through this list.
    const result = await this.db.query<{
      code: string;
      config: RoomConfig;
      created_at: string;
      phase: Room["phase"];
      round: number;
      participant_count: number;
      registered_count: number;
      admission_status: string | null;
      markets_finished: boolean;
    }>(
      `SELECT r.code, r.state->'config' AS config,
        r.state->>'createdAt' AS created_at, r.state->>'phase' AS phase,
        COALESCE(m.round, (r.state->>'round')::int, 0) AS round,
        (SELECT count(*)::int FROM jsonb_array_elements(r.state->'participants') p WHERE p->>'withdrawnAt' IS NULL) AS participant_count,
        jsonb_array_length(r.state->'participants') AS registered_count,
        r.state #>> '{study,lobby,admission,status}' AS admission_status,
        COALESCE(m.finished, false) AS markets_finished
      FROM auction_rooms r
      LEFT JOIN LATERAL (
        SELECT max(COALESCE((state->>'round')::int, 0)) AS round,
          bool_and(state->>'stage' = 'done' AND
            (state->>'round')::int = (r.state->'config'->>'rounds')::int) AS finished
        FROM auction_markets WHERE room_code = r.code
      ) m ON true
      WHERE ($1::text IS NULL OR r.code = $1)
      ORDER BY (r.state->>'createdAt')::bigint DESC, r.code`,
      [code ?? null],
    );
    return result.rows.map((row) => ({
      experiment: "institutions",
      code: row.code,
      title: row.config.title,
      createdAt: Number(row.created_at),
      phase:
        row.markets_finished && ["running", "paused"].includes(row.phase)
          ? "finished"
          : row.phase,
      round: row.round,
      totalRounds: row.config.rounds,
      participantCount: row.participant_count,
      capacity: row.config.capacity,
      ...(row.phase === "waiting" &&
      (row.admission_status === "open" || row.admission_status === null)
        ? {
            admissionRemaining: Math.max(
              0,
              (row.admission_status === "open"
                ? MAX_STUDY_PARTICIPANTS
                : row.config.capacity) - row.registered_count,
            ),
          }
        : {}),
      ...(row.config.studyAdmission === "flexible"
        ? { flexibleAdmission: true }
        : {}),
      marketCount: row.config.markets ?? 1,
      institutions:
        row.config.protocol === "institutions-v1"
          ? studyInstitutions(row.config).map((institution) => ({
              institution,
              periods: studyPeriodCount(row.config, institution),
            }))
          : [],
    }));
  }

  async deleteRoom(code: string, accessKey: string) {
    assertTeacherAccess(accessKey);
    await this.db.transaction(async (tx) => {
      // Scoped commands take a SHARE lock on this row. This UPDATE lock waits
      // for them and prevents new commands while all room data is removed.
      const result = await tx.query<{ code: string }>(
        "SELECT code FROM auction_rooms WHERE code = $1 FOR UPDATE",
        [code],
      );
      if (!result.rows.length)
        throw new AuctionError("ルームが見つかりません。", 404);
      for (const table of [
        "auction_market_events",
        "auction_order_history",
        "auction_markets",
        "auction_events",
        "auction_rooms",
      ]) {
        await tx.query(
          `DELETE FROM ${table} WHERE ${table === "auction_rooms" ? "code" : "room_code"} = $1`,
          [code],
        );
      }
      await tx.query("DELETE FROM lab_room_registry WHERE code = $1", [code]);
      await tx.query("SELECT pg_notify('auction_changes', $1)", [
        JSON.stringify({ code, market: 0 }),
      ]);
    });
  }

  async view(
    code: string,
    token?: string,
    session?: RoomSession,
  ): Promise<RoomView> {
    const { scope } = await timed("command.auth_scope", () =>
      this.scope(code, token, session),
    );
    const bundle = await readRoomBundle(this.db, code, scope);
    const room = timedSync("state.assemble", () => assemble(bundle, scope));
    const actor = authenticate(room, token);
    const now = bundle.now;
    if (
      (room.phase === "running" &&
        room.deadline !== null &&
        room.deadline <= now) ||
      (room.phase === "waiting" &&
        room.study?.lobby?.admission?.status === "open" &&
        room.study.lobby.admission.closesAt !== null &&
        room.study.lobby.admission.closesAt <= now)
    ) {
      await this.advance(code, scope);
      return this.view(code, token, session);
    }
    return timedSync("view.project", () =>
      toView(room, actor, now, this.db.mode),
    );
  }

  private async scope(
    code: string,
    token?: string,
    session?: RoomSession,
  ): Promise<{ scope: number | undefined; actor: string }> {
    const { root } = await readRoomRoot(this.db, code);
    const actor = authenticate(root, token);
    if (session && (actor === "teacher") !== (session === "teacher"))
      throw new AuctionError(
        session === "teacher"
          ? "教員として再認証してください。"
          : "学生として入室してください。",
        401,
      );
    if (root.study && !root.storageVersion) {
      await this.locked(code, () => undefined);
      return this.scope(code, token, session);
    }
    // Admission and reallocation are room-wide transactions. Avoid capturing an
    // old market scope while a teacher is moving participants between markets.
    const scope =
      root.storageVersion &&
      actor !== "teacher" &&
      actor.seat >= 0 &&
      !(root.study?.lobby && root.phase === "waiting")
        ? studyMarketId(root.config, actor.seat)
        : undefined;
    return { scope, actor: actor === "teacher" ? actor : actor.id };
  }

  async advance(code: string, scope?: number) {
    // A teacher read must not serialize deadlines in unrelated markets.
    if (!scope) {
      const bundle = await readRoomBundle(this.db, code);
      if (bundle.root.storageVersion) {
        if (
          bundle.root.phase === "waiting" &&
          bundle.root.study?.lobby?.admission
        ) {
          await this.locked(code, () => undefined);
          return;
        }
        if (bundle.root.phase !== "running") return;
        await Promise.all(
          bundle.markets
            .filter(
              (m) =>
                m.state.deadline !== null && m.state.deadline <= bundle.now,
            )
            .map((m) => this.locked(code, () => undefined, m.market_id)),
        );
        return;
      }
    }
    await this.locked(code, () => undefined, scope);
  }

  async command(
    code: string,
    token: string | undefined,
    request: CommandRequest,
    session?: RoomSession,
    receivedAt = Date.now(),
  ) {
    let failureContext:
      Pick<Operation, "actor" | "round" | "market" | "stage"> | undefined;
    const { scope, actor: actorId } = await timed("command.auth_scope", () =>
      this.scope(code, token, session),
    );
    try {
      await this.locked(
        code,
        (room, now, events, receiptCount) => {
          const actor = authenticate(room, token);
          const actorId = actor === "teacher" ? actor : actor.id;
          const market =
            room.study && actor !== "teacher" && actor.seat >= 0
              ? marketFor(room, actor)
              : undefined;
          failureContext = {
            actor: actorId,
            round: market?.round ?? room.round,
            ...(market ? { market: market.id, stage: market.stage } : {}),
          };
          if (
            actor !== "teacher" &&
            (scope ? receiptCount : room.sequence) > 50_000 &&
            !room.receipts.some(
              (r) => r.actor === actorId && r.requestId === request.requestId,
            )
          )
            throw new AuctionError(
              "操作数の上限に達しました。実験データを保存してください。",
              429,
            );
          // Never persist a partially applied rejected command.
          const candidate = timedSync("command.clone", () =>
            structuredClone(room),
          );
          const commandEvents: AuditEvent[] = [];
          timedSync("command.execute", () =>
            execute(
              candidate,
              actor === "teacher"
                ? actor
                : candidate.participants.find((p) => p.id === actor.id)!,
              request,
              now,
              commandEvents,
            ),
          );
          // Extend the existing event INSERT, with no additional SQL or network
          // round trip on successful commands. Replayed request IDs stay inert.
          if (
            candidate.receipts.length > room.receipts.length ||
            commandEvents.length
          )
            annotateOperation(
              candidate,
              commandEvents,
              actorId,
              request,
              receivedAt,
              now,
              failureContext,
            );
          Object.assign(room, candidate);
          events.push(...commandEvents);
        },
        scope,
        scope ? { actor: actorId, requestId: request.requestId } : undefined,
      );
    } catch (error) {
      // The market queue/transaction has already released its lock. Rejection
      // diagnostics never update room state, receipts, or historical events.
      if (failureContext) {
        const operation: Operation = {
          ...failureContext,
          requestId: request.requestId,
          commandType: request.command.type,
          input: operationInput(request.command),
          receivedAt,
          processedAt: Date.now(),
          ...(request.interaction ? { interaction: request.interaction } : {}),
          status: error instanceof AuctionError ? "rejected" : "unconfirmed",
          errorCode:
            error instanceof AuctionError ? error.code : "SERVER_UNAVAILABLE",
          reason:
            error instanceof AuctionError
              ? error.message
              : "処理結果を確認できません。リクエストIDで照合してください。",
        };
        try {
          await writeActionLogs(this.db, code, [
            {
              source: "server",
              actor: operation.actor,
              at: operation.processedAt,
              data: operation,
            },
          ]);
        } catch {
          console.error("Action diagnostics could not be saved");
        }
      }
      throw error;
    }
    // A failed response projection must never turn an already committed command
    // into a rejected operation. Outcome lookup uses the durable event above.
    return this.view(code, token, session);
  }

  async recordActions(
    code: string,
    token: string | undefined,
    entries: ClientAction[],
    expectedParticipantId?: string,
  ) {
    const { root } = await readRoomRoot(this.db, code);
    const actor = authenticate(root, token);
    if (actor === "teacher")
      throw new AuctionError("学生として入室してください。", 403);
    if (expectedParticipantId && expectedParticipantId !== actor.id)
      throw new AuctionError(
        "入室情報が変わりました。元の学生として再入室してください。",
        401,
        "SESSION_CHANGED",
      );
    await writeActionLogs(
      this.db,
      code,
      clientLogs(actor.id, entries, Date.now()),
    );
    return { saved: entries.map((entry) => entry.id) };
  }

  async operationOutcome(
    code: string,
    token: string | undefined,
    requestId: string,
  ) {
    const { root } = await readRoomRoot(this.db, code);
    const actor = authenticate(root, token);
    const logs = await readActionLogs(
      this.db,
      code,
      actor === "teacher" ? actor : actor.id,
      requestId,
    );
    const operations = logs
      .filter((log) => log.source === "server")
      .map((log) => log.data as Operation);
    return (
      operations.find((op) => op.status === "success") ??
      operations.find((op) => op.status === "rejected") ??
      null
    );
  }

  async exportActions(code: string, token?: string) {
    const { root } = await readRoomRoot(this.db, code);
    if (authenticate(root, token) !== "teacher")
      throw new AuctionError("データ出力は教員のみ利用できます。", 403);
    // Read-only: no deadline settlement, partitioning or room version changes.
    return actionExport(await readActionLogs(this.db, code));
  }

  async export(code: string, token?: string) {
    // The locked snapshot ensures event log and room state describe the same commit.
    return this.db.transaction(async (tx) => {
      const bundle = await lockBundle(tx, code, undefined, true);
      const room = assemble(bundle);
      if (authenticate(room, token) !== "teacher")
        throw new AuctionError("データ出力は教員のみ利用できます。", 403);
      const now = bundle.now;
      const pendingEvents: AuditEvent[] = [];
      settleDeadline(room, now, pendingEvents);
      if (pendingEvents.length) {
        await saveBundle(tx, bundle, room, pendingEvents);
      }
      const events = await tx.query<{ event: AuditEvent }>(
        `SELECT event FROM (
           SELECT event FROM auction_events WHERE room_code = $1
           UNION ALL SELECT event FROM auction_market_events WHERE room_code = $1
         ) e ORDER BY (event->>'at')::bigint, (event->>'sequence')::int, COALESCE((event->>'scope')::int, 0)`,
        [code],
      );
      return {
        room,
        events: events.rows.map((r) => r.event),
        now,
      };
    });
  }
}

export async function service() {
  return new AuctionService(await database());
}
