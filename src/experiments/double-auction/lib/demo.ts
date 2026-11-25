import {
  AuctionError,
  type AuditEvent,
  type Participant,
  type Room,
} from "./auction-model";
import type { Command, Role, RoomConfig, RoomView } from "./types";
import type {
  Institution,
  StudySettings,
  StudyGeneratorConfig,
} from "./study-types";
import { randomUUID } from "./random";
import {
  createStudy,
  executeStudy,
  marketFor,
  marketRound,
  settleStudy,
  stageKey,
  unitLimits,
  unitsUsed,
  applyStudyGenerator,
} from "./study-core";
import { studyView } from "./study-view";
import {
  resizeStudySettings,
  studyInstitutions,
  studyMarketId,
  studyMarketSize,
  studyMarketCounts,
  studyUnitsPerSide,
  studyUnits,
  studySingleUnitOrders,
  studyRole,
  studyRoleIndex,
} from "./study-config";
import { studyRoomConfigSchema } from "./study-room-config";
import { generatedStudySettings } from "./study-generator";
import { presetStudyConditions } from "./study-conditions";
import { studyCommission, studyCommissionError } from "./study-commission";
import { csv } from "./csv";
import { studyExport } from "./study-export";
import { EXPORTS, type ExportKind, type ExportFile } from "./exports";

export const DEMO_MARKETS = 12;
export const DEMO_CAPACITY = DEMO_MARKETS * 16;
const CDA_THINKING_MS = 3000;
const BOT_INTERVAL_MS = 2000;
// Public practice conditions, deliberately separate from the classroom schedules.
export const DEMO_SETTINGS: StudySettings = {
  values: Array.from({ length: 8 }, (_, i) => [160 - i * 8, 140 - i * 8]),
  costs: Array.from({ length: 8 }, (_, i) => [40 + i * 8, 60 + i * 8]),
};
export type DemoSnapshot = {
  view: RoomView;
  now: number;
  role: Role;
  institution: Institution;
  teacher: boolean;
  error: string;
  generation: number;
};

/** In-memory demo only: no cookies, API requests or classroom persistence. */
export class DemoSession {
  private room!: Room;
  private config: RoomConfig;
  private now: number;
  private humanId = "";
  private role: Role;
  private institution: Institution;
  private teacher = false;
  private error = "";
  private generation = 0;
  private events: AuditEvent[] = [];
  private botClocks = new Map<
    number,
    { nextAt: number; round: number; indices: Record<Role, number> }
  >();
  private listeners = new Set<() => void>();
  private snapshot!: DemoSnapshot;
  private publishedEventCount = -1;

  constructor(
    institution: Institution = "cda",
    role: Role = "buyer",
    now = Date.now(),
    private options: {
      lobby?: boolean;
      teacher?: boolean;
      config?: RoomConfig;
      generator?: StudyGeneratorConfig;
    } = {},
  ) {
    this.config = studyRoomConfigSchema.parse(
      options.config ?? {
        title: "ひとりデモ",
        protocol: "institutions-v1",
        markets: DEMO_MARKETS,
        capacity: DEMO_CAPACITY,
        rounds: 15,
        duration: 180,
      },
    );
    if (studyInstitutions(this.config).includes("posted"))
      this.config.studyPostedMechanism = "direct-purchase-v1";
    this.teacher = options.teacher ?? false;
    if (options.generator)
      this.options.generator = structuredClone(options.generator);
    this.now = now;
    this.role = role;
    this.institution = institution;
    this.reset(institution, role);
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;
  exportData = (kind: ExportKind): ExportFile => {
    if (!this.teacher)
      throw new AuctionError("教員画面でダウンロードしてください。", 403);
    const result = studyExport(this.room, this.events, this.now, kind, csv);
    if (result.rowCount === 0)
      throw new AuctionError(
        EXPORTS.find((item) => item.kind === kind)!.empty,
        422,
      );
    return result;
  };
  getGeneratorConfig = (): StudyGeneratorConfig | undefined => {
    const saved = this.room.study?.generation;
    return saved
      ? {
          kind: saved.kind,
          parameters: { ...saved.parameters },
          seed: saved.seed,
        }
      : undefined;
  };

  private get market() {
    return marketFor(this.room, this.human);
  }
  private get human() {
    return this.room.participants.find((p) => p.id === this.humanId)!;
  }
  private get bots() {
    return this.room.participants.filter(
      (p) => !p.withdrawnAt && p.id !== this.humanId,
    );
  }

  private publish() {
    const view = studyView(
      this.room,
      this.teacher ? "teacher" : this.human,
      this.now,
      "local",
    );
    const previous = this.snapshot;
    if (
      previous &&
      previous.generation === this.generation &&
      previous.view.me.id === view.me.id &&
      previous.view.version === view.version &&
      this.publishedEventCount === this.events.length
    ) {
      // Clock-only ticks still refresh deadlines and time-weighted metrics,
      // while immutable history keeps the same references as a live SSE view.
      const reuseHistory = (
        next: NonNullable<RoomView["study"]>["market"],
        old: NonNullable<RoomView["study"]>["market"],
      ) => {
        if (next.id !== old.id || next.institution !== old.institution) return;
        next.orderHistory = old.orderHistory;
        next.trades = old.trades;
        next.clearings = old.clearings;
        next.offerHistory = old.offerHistory;
      };
      reuseHistory(view.study!.market, previous.view.study!.market);
      const oldMarkets = previous.view.study!.teacher?.markets;
      for (const market of view.study!.teacher?.markets ?? []) {
        const old = oldMarkets?.find((item) => item.id === market.id);
        if (old) reuseHistory(market, old);
      }
    }
    this.publishedEventCount = this.events.length;
    if (view.study?.teacher)
      view.study.teacher.preset = {
        label: "Default",
        settings: structuredClone(DEMO_SETTINGS),
      };
    this.snapshot = {
      view,
      now: this.now,
      role: this.role,
      institution: this.institution,
      teacher: this.teacher,
      error: this.error,
      generation: this.generation,
    };
    this.listeners.forEach((listener) => listener());
  }

  reset = (institution = this.institution, role = this.role) => {
    this.institution = institution;
    this.role = role;
    this.error = "";
    this.botClocks.clear();
    this.events = [];
    this.generation++;
    const config = structuredClone(this.config);
    const size = studyMarketSize(config);
    const institutions = studyInstitutions(config);
    const study = createStudy(
      config.markets!,
      resizeStudySettings(DEMO_SETTINGS, size, studyUnits(config)),
      institutions,
      studyUnits(config) === 2
        ? undefined
        : !config.studyUnitCounts &&
            this.options.generator &&
            institutions.some((i) => i !== "cda")
          ? generatedStudySettings(
              this.options.generator,
              studyUnitsPerSide(config, "call"),
            )
          : resizeStudySettings(DEMO_SETTINGS, size),
    );
    study.conditionBasis = {
      settings: structuredClone(DEMO_SETTINGS),
      otherSettings: structuredClone(DEMO_SETTINGS),
    };
    if (config.studyUnitCounts) {
      study.conditionsByInstitution = presetStudyConditions(
        config,
        DEMO_SETTINGS,
        this.options.generator,
      );
      study.settings = study.conditionsByInstitution[institutions[0]]!.settings;
    }
    if (this.options.lobby)
      study.lobby = {
        revision: 0,
        randomizedAt: null,
        ...(config.studyAdmission === "flexible"
          ? {
              admission: {
                status: "open",
                closesAt: null,
                closedAt: null,
                targetMarkets: config.markets!,
              },
            }
          : {}),
      };
    if (!this.options.config) {
      const firstOrder = [
        institution,
        ...institutions.filter((i) => i !== institution),
      ];
      // Older demo callers can still choose their first institution while
      // keeping the balanced assignment. Configured demos use the real order.
      const preferred = study.markets.find(
        (market) => market.order.join() === firstOrder.join(),
      )!;
      [study.markets[0].order, preferred.order] = [
        preferred.order,
        study.markets[0].order,
      ];
    }
    this.institution = study.markets[0].order[0];
    for (const market of study.markets)
      this.botClocks.set(market.id, {
        nextAt: this.now,
        round: 0,
        indices: { buyer: 0, seller: 0 },
      });
    this.room = {
      code: "DEMO",
      study,
      config,
      phase: "waiting",
      round: 0,
      version: 1,
      deadline: null,
      remainingMs: 0,
      createdAt: this.now,
      teacherTokenHash: "",
      teacherPasswordHash: "",
      teacherFailedLogins: 0,
      teacherLockedUntil: 0,
      participants: [],
      seats: [],
      quotes: [],
      trades: [],
      sequence: 0,
      receipts: [],
    };
    for (let seat = 0; seat < config.capacity; seat++) {
      const side = studyRole(config, seat);
      const market = studyMarketId(config, seat);
      const alias = `${side === "buyer" ? "買" : "売"}${String(studyRoleIndex(config, seat) + 1).padStart(2, "0")}`;
      const human =
        seat === (role === "buyer" ? 0 : studyMarketCounts(config, 1).buyers);
      const id = randomUUID();
      if (human) this.humanId = id;
      this.room.participants.push({
        id,
        seat,
        role: side,
        alias,
        nickname: human
          ? "あなた"
          : this.options.lobby
            ? `仮想${String(seat + 1).padStart(3, "0")}`
            : `仮想参加者 市場${market}・${alias}`,
        joinedAt: this.now,
        limits: { apple: 0, banana: 0, orange: 0 },
        tokenHash: "",
        pinHash: "",
        failedLogins: 0,
        lockedUntil: 0,
      });
    }
    if (this.options.generator) {
      applyStudyGenerator(this.room, this.options.generator, this.now);
      this.role = this.human.role;
      this.institution = this.market.order[0];
    }
    if (study.lobby?.admission)
      for (const person of this.room.participants) {
        person.seat = -1;
        person.alias = "未割当";
        person.limits = { apple: 0, banana: 0, orange: 0 };
      }
    const commissionError = studyCommissionError(
      studyCommission(config),
      this.room.study!.settings,
      !study.conditionsByInstitution && institutions.some((i) => i !== "cda")
        ? this.room.study!.otherSettings
        : undefined,
    );
    if (commissionError) throw new Error(commissionError);
    for (const condition of Object.values(
      study.conditionsByInstitution ?? {},
    )) {
      const error = studyCommissionError(
        studyCommission(config),
        condition.settings,
      );
      if (error) throw new Error(error);
    }
    this.publish();
  };

  toggleTeacher = () => {
    this.teacher = !this.teacher;
    this.error = "";
    this.publish();
  };

  private send(actor: Participant | "teacher", command: Command) {
    // Match the server's transactional behavior: rejected commands cannot partially mutate the room.
    const candidate = structuredClone(this.room);
    const events: AuditEvent[] = [];
    this.applyCommand(candidate, actor, command, events);
    this.room = candidate;
    this.events.push(...events);
  }

  private applyCommand(
    room: Room,
    actor: Participant | "teacher",
    command: Command,
    events: AuditEvent[],
  ) {
    const person =
      actor === "teacher"
        ? actor
        : room.participants.find((p) => p.id === actor.id)!;
    executeStudy(
      room,
      person,
      {
        requestId: randomUUID(),
        expectedRound:
          person === "teacher"
            ? room.round
            : marketRound(room, marketFor(room, person)),
        expectedStage: stageKey(
          room,
          person === "teacher"
            ? room.study!.markets[0]
            : marketFor(room, person),
        ),
        command,
      },
      this.now,
      events,
    );
    room.version++;
  }

  private sendBot(bot: Participant, command: Command) {
    // Bots build valid commands from the current state, synchronously. They use
    // the same validating engine without copying the entire room per order.
    this.applyCommand(this.room, bot, command, this.events);
  }

  command = async (command: Command, asTeacher = this.teacher) => {
    this.error = "";
    try {
      this.send(asTeacher ? "teacher" : this.human, command);
      if (
        command.type === "study-randomize" ||
        command.type === "study-admission" ||
        command.type === "study-withdraw" ||
        command.type === "study-settings"
      ) {
        this.role = this.human.role;
        this.institution = this.market.order[0];
      }
      this.runBots();
      this.publish();
      return true;
    } catch (error) {
      this.error =
        error instanceof Error ? error.message : "操作を実行できませんでした。";
      this.publish();
      return false;
    }
  };

  tick = (elapsedMs: number) => {
    if (this.room.phase !== "running" && this.room.phase !== "waiting") return;
    this.now += Math.max(0, Math.min(1000, elapsedMs));
    settleStudy(this.room, this.now, this.events);
    if (this.human.seat >= 0) this.role = this.human.role;
    this.runBots();
    this.publish();
  };

  skipStage = () => {
    if (
      this.room.phase !== "running" ||
      this.market.deadline === null ||
      this.market.stage === "feedback"
    )
      return;
    this.error = "";
    this.submitSealedBots();
    this.advanceTo(this.market.deadline, true);
    // Leave the next buyer's full ten seconds available after a manual jump.
    this.botClocks.get(this.market.id)!.nextAt = this.now + 2000;
    this.submitSealedBots();
    this.publish();
  };

  // Advance every market through its own deadlines so intermediate Call
  // clearings and Posted Offer purchases still run through the real engine.
  private advanceTo(
    target: number,
    stopAtFeedback = false,
    stopWhen?: () => boolean,
  ) {
    const initialFeedback =
      this.market.stage === "feedback"
        ? stageKey(this.room, this.market)
        : null;
    const reachedFeedback = () =>
      stopAtFeedback &&
      this.market.stage === "feedback" &&
      stageKey(this.room, this.market) !== initialFeedback;
    while (this.now < target && this.room.phase === "running") {
      this.now = Math.min(target, this.now + 1000);
      settleStudy(this.room, this.now, this.events);
      if (reachedFeedback() || stopWhen?.()) break;
      if (this.now < target) {
        this.runBots();
        if (reachedFeedback() || stopWhen?.()) break;
      }
    }
  }

  advanceTime = (seconds = 30) => {
    if (this.room.phase !== "running") return;
    this.error = "";
    this.runBots();
    this.advanceTo(this.now + seconds * 1000, true);
    this.runBots();
    this.publish();
  };

  skipPeriod = (marketId = this.market.id) => {
    const market = this.room.study!.markets.find((m) => m.id === marketId);
    if (
      this.room.phase !== "running" ||
      !market ||
      ["waiting", "countdown", "done"].includes(market.stage)
    )
      return;
    this.error = "";
    const round = marketRound(this.room, market);
    const completed = () =>
      marketRound(this.room, market) !== round || market.stage === "done";
    // Fast-forward the clock through every clearing, purchase and feedback
    // deadline, rather than interrupting a period or discarding its orders.
    while (this.room.phase === "running" && !completed()) {
      this.runBots();
      if (completed() || market.deadline === null) break;
      this.advanceTo(market.deadline, false, completed);
    }
    this.runBots();
    this.publish();
  };

  skipToHuman = () => {
    if (this.room.phase !== "running" || this.role !== "buyer") return;
    if (this.market.stage === "offer") this.skipStage();
    if (this.market.posted) return;
    const attempts =
      this.market.buyerOrder.length *
      (studyUnits(this.room.config, "posted") + 1);
    for (let i = 0; i < attempts && this.market.stage === "purchase"; i++) {
      const id = this.market.buyerOrder[this.market.buyerIndex];
      if (id === this.humanId) break;
      this.buyAsBot(this.room.participants.find((p) => p.id === id)!);
    }
    this.botClocks.get(this.market.id)!.nextAt = this.now + 2000;
    this.publish();
  };

  private submitSealedBots() {
    if (this.room.phase !== "running") return;
    for (const bot of this.bots) {
      const market = marketFor(this.room, bot);
      const sequential = studySingleUnitOrders(this.room.config);
      const nextOffer =
        sequential &&
        market.stage === "purchase" &&
        bot.role === "seller" &&
        unitsUsed(this.room, bot) > 0;
      if (!["call", "offer"].includes(market.stage) && !nextOffer) continue;
      if (
        nextOffer
          ? market.offers.some(
              (offer) => offer.participantId === bot.id && offer.remaining > 0,
            )
          : market.submitted.includes(bot.id)
      )
        continue;
      const used = unitsUsed(this.room, bot);
      if (
        used >=
        studyUnits(
          this.room.config,
          market.stage === "call" ? "call" : "posted",
        )
      )
        continue;
      const limits = unitLimits(this.room, bot);
      if (market.stage === "call") {
        this.sendBot(bot, {
          type: "call-submit",
          prices: limits
            .slice(used, sequential ? used + 1 : undefined)
            .map((limit) => (bot.role === "buyer" ? limit - 12 : limit + 12)),
        });
      } else if (
        (market.stage === "offer" || nextOffer) &&
        bot.role === "seller"
      ) {
        this.sendBot(bot, {
          type: "posted-offer",
          price: (sequential ? limits[used] : limits.at(-1)!) + 12,
          quantity: sequential
            ? 1
            : studyUnits(this.room.config, "posted") - used,
        });
      }
    }
  }

  private buyAsBot(bot: Participant) {
    if (bot.id === this.humanId) return;
    const used = unitsUsed(this.room, bot);
    const market = marketFor(this.room, bot);
    if (
      market.posted &&
      this.room.config.studyPostedMechanism === "batch-bids-v1"
    ) {
      const reserved = market.posted.bids
        .filter((bid) => bid.participantId === bot.id)
        .reduce((sum, bid) => sum + bid.remaining, 0);
      const available =
        studyUnits(this.room.config, "posted") - used - reserved;
      if (
        available > 0 &&
        (!studySingleUnitOrders(this.room.config) || reserved === 0)
      )
        this.sendBot(bot, {
          type: "posted-bid",
          price: unitLimits(this.room, bot)[used + reserved] - 12,
          quantity: 1,
        });
      return;
    }
    const limit = unitLimits(this.room, bot)[used];
    const offer = marketFor(this.room, bot)
      .offers.filter((o) => o.remaining > 0 && o.price <= limit)
      .sort((a, b) => a.price - b.price)[0];
    if (!offer) {
      if (!market.posted) this.sendBot(bot, { type: "posted-pass" });
      return;
    }
    const quantity = studySingleUnitOrders(this.room.config)
      ? 1
      : Math.min(
          offer.remaining,
          unitLimits(this.room, bot)
            .slice(used)
            .filter((value) => offer.price <= value).length,
        );
    this.sendBot(bot, { type: "posted-buy", offerId: offer.id, quantity });
  }

  private runBots() {
    if (this.room.phase !== "running") return;
    this.submitSealedBots();
    const botsByMarket = new Map<number, Participant[]>();
    for (const bot of this.bots) {
      const id = studyMarketId(this.room.config, bot.seat);
      const bots = botsByMarket.get(id);
      if (bots) bots.push(bot);
      else botsByMarket.set(id, [bot]);
    }
    for (const market of this.room.study!.markets) {
      const id = market.id;
      if (!this.botClocks.has(id))
        this.botClocks.set(id, {
          nextAt: this.now,
          round: 0,
          indices: { buyer: 0, seller: 0 },
        });
      const clock = this.botClocks.get(id)!;
      const round = marketRound(this.room, market);
      if (clock.round !== round) {
        clock.round = round;
        clock.indices = { buyer: 0, seller: 0 };
        clock.nextAt =
          market.stage === "cda"
            ? market.periods.at(-1)!.startedAt + CDA_THINKING_MS
            : this.now;
      }
      if (this.now < clock.nextAt) continue;
      clock.nextAt = this.now + BOT_INTERVAL_MS;
      const bots = botsByMarket.get(id) ?? [];
      if (market.stage === "purchase") {
        if (market.posted) {
          for (const bot of bots.filter((p) => p.role === "buyer"))
            this.buyAsBot(bot);
          continue;
        }
        const bot = bots.find(
          (p) => p.id === market.buyerOrder[market.buyerIndex],
        );
        if (bot) this.buyAsBot(bot);
      } else if (market.stage === "cda") {
        // Start with patient limits so both sides can rest on the book, then
        // reduce the requested margin over time using only each bot's own limit.
        const quotingMs =
          this.now - market.periods.at(-1)!.startedAt - CDA_THINKING_MS;
        const margin = Math.max(
          12,
          72 - Math.floor(quotingMs / BOT_INTERVAL_MS) * 4,
        );
        for (const side of ["buyer", "seller"] as const) {
          const sideBots = bots.filter((p) => p.role === side);
          for (let i = 0; i < sideBots.length; i++) {
            const bot = sideBots[clock.indices[side]++ % sideBots.length];
            const used = unitsUsed(this.room, bot);
            if (used >= studyUnits(this.room.config)) continue;
            const limit = unitLimits(this.room, bot)[used];
            const price = side === "buyer" ? limit - margin : limit + margin;
            if (
              market.orders.some(
                (o) => o.participantId === bot.id && o.price === price,
              )
            )
              continue;
            this.sendBot(bot, {
              type: "study-quote",
              price,
            });
            break;
          }
        }
      }
    }
  }
}
