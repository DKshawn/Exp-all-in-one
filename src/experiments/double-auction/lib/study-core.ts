import { randomInt, randomUUID } from "./random";
import { z } from "zod";
import { isValidPrice, MAX_PRICE } from "./price";
import type {
  Institution,
  StudySettings,
  StudyStage,
  StudyOrder,
  StudyOrderHistory,
  PostedOffer,
  PostedOfferHistory,
  PostedBatchState,
  StudyTrade,
  Clearing,
  StudyLobby,
  StudyGeneration,
  StudyGeneratorConfig,
  StudyConditions,
  StudyUnitCounts,
  StudySchedules,
} from "./study-types";
import { generatedStudySettings, seededStudySeats } from "./study-generator";
import {
  studyAllocationPlan,
  studyRoomAllocation,
  studyAllocationConditions,
  studyAllocationConditionError,
  studyAllocationWaitingMessage,
} from "./study-allocation";
import { STUDY_FEEDBACK_SECONDS, STUDY_START_SECONDS } from "./study-types";
import {
  MAX_STAGE_SECONDS,
  postedPurchaseSeconds,
  studyTiming,
} from "./study-timing";
import { POSTED_BATCH_MS, postedBatchPlan } from "./posted-auction";
import {
  studyCommission,
  studyCommissionError,
  studyTradeProfit,
} from "./study-commission";
import {
  MAX_STUDY_PROFILES,
  DEFAULT_STUDY_INSTITUTIONS,
  studyInstitutionOrders,
  studyMarketId,
  studyMarketSize,
  studyTemplateSideCount,
  studyMarketCounts,
  studyProfileIndex,
  studyMarketSettings,
  MAX_STUDY_MARKETS,
  studyUnits,
  studySingleUnitOrders,
  studyCallsPerPeriod,
  studyUnitCounts,
  studyUnitsPerSide,
  studyUnitsError,
  studyInstitutions,
  MAX_STUDY_UNITS,
  studyRoleIndex,
  studyRole,
  MAX_INSTITUTION_PERIODS,
  studyPeriodAt,
  studyTotalRounds,
  studyPeriodCount,
  resizeStudySettings,
} from "./study-config";
import { presetStudyConditions } from "./study-conditions";
import {
  AuctionError,
  emit,
  type Room,
  type Participant,
  type AuditEvent,
} from "./auction-model";
import type { CommandRequest } from "./types";

export type StudyMarket = {
  id: number;
  // Older saved rooms derive their period from the existing period records.
  round?: number;
  order: Institution[];
  stage: StudyStage;
  epoch: number;
  deadline: number | null;
  remainingMs: number;
  call: number;
  orders: StudyOrder[];
  // Optional for rooms saved before public CDA order history was introduced.
  orderHistory?: StudyOrderHistory[];
  offers: PostedOffer[];
  posted?: PostedBatchState;
  // Added only when prices become public; optional for older saved rooms.
  offerHistory?: PostedOfferHistory[];
  submitted: string[];
  buyerOrder: string[];
  buyerIndex: number;
  trades: StudyTrade[];
  clearings: Clearing[];
  periods: {
    round: number;
    institution: Institution;
    completion: "running" | "complete" | "interrupted";
    startedAt: number;
    endedAt: number | null;
    spreadArea: number;
    spreadMs: number;
  }[];
  spreadAt: number;
  spreadValue: number | null;
};
export type Study = {
  protocol: "institutions-v1";
  // Absent in existing rooms, which retain their independent admission flow.
  lobby?: StudyLobby;
  settings: StudySettings;
  // When CDA's unit count changes, Call and Posted keep their two-unit conditions.
  otherSettings?: StudySettings;
  conditionsByInstitution?: StudyConditions;
  // Preserve the source schedule so changing market counts never resamples an
  // already reduced template and loses the original marginal schedule.
  conditionBasis?: { settings: StudySettings; otherSettings?: StudySettings };
  otherGeneration?: StudyGeneratorConfig;
  generation?: StudyGeneration;
  revision: number;
  markets: StudyMarket[];
};

const unitValues = z
  .array(z.number().int().min(1).max(MAX_PRICE))
  .min(1)
  .max(MAX_STUDY_UNITS);
const stageSeconds = z.number().int().min(1).max(MAX_STAGE_SECONDS);
export const studyInstitutionsSchema = z
  .array(z.enum(["cda", "call", "posted"]))
  .min(1, "実施する制度を1つ以上選択してください。")
  .max(3)
  .refine(
    (items) => new Set(items).size === items.length,
    "制度を重複して選択できません。",
  );
export const studyTimingSchema = z
  .object({
    cdaSeconds: stageSeconds,
    callSeconds: stageSeconds,
    offerSeconds: stageSeconds,
    buyerSeconds: stageSeconds,
    purchaseSeconds: stageSeconds.optional(),
  })
  .strict();
const institutionPeriods = z.number().int().min(1).max(MAX_INSTITUTION_PERIODS);
export const studyPeriodsSchema = z
  .object({
    cda: institutionPeriods.optional(),
    call: institutionPeriods.optional(),
    posted: institutionPeriods.optional(),
  })
  .strict();
export const studyUnitCountsSchema = z
  .object({
    cda: z.number().int().min(1).max(MAX_STUDY_UNITS),
    call: z.number().int().min(1).max(MAX_STUDY_UNITS),
    posted: z.number().int().min(1).max(MAX_STUDY_UNITS),
  })
  .strict();
export const studySettingsSchema = z
  .object({
    values: z
      .array(
        unitValues.refine(
          (values) => values.every((v, i) => i === 0 || v <= values[i - 1]),
          "評価値は2単位目以降で増やせません。",
        ),
      )
      .min(1)
      .max(MAX_STUDY_PROFILES),
    costs: z
      .array(
        unitValues.refine(
          (values) => values.every((v, i) => i === 0 || v >= values[i - 1]),
          "費用は2単位目以降で減らせません。",
        ),
      )
      .min(1)
      .max(MAX_STUDY_PROFILES),
  })
  .strict()
  .refine(
    (s) => s.values.length === s.costs.length,
    "買い手と売り手の人数をそろえてください。",
  )
  .refine(
    (s) =>
      [...s.values, ...s.costs].every(
        (values) => values.length === s.values[0]?.length,
      ),
    "全員の単位数をそろえてください。",
  );

export function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function assignStudySeats(room: Room) {
  if (room.study?.lobby?.admission?.status === "open") return;
  for (const [i, person] of room.participants
    .filter((p) => !p.withdrawnAt)
    .entries()) {
    person.seat = room.seats[i];
    person.role = studyRole(room.config, person.seat);
    person.alias = `${person.role === "buyer" ? "買" : "売"}${String(studyRoleIndex(room.config, person.seat) + 1).padStart(2, "0")}`;
    person.limits = {
      apple: unitLimits(room, person)[0] ?? 0,
      banana: 0,
      orange: 0,
    };
  }
}

export function recordStudyGeneratedAssignments(room: Room) {
  const generation = room.study?.generation;
  if (!generation) return;
  const perSide = studyTemplateSideCount(room.config);
  const institution = room.study?.conditionsByInstitution
    ? studyInstitutions(room.config)[0]
    : "cda";
  generation.assignments = room.participants
    .filter((p) => p.seat >= 0)
    .map((p) => {
      const index = studyProfileIndex(room.config, p.seat, perSide);
      return {
        participantId: p.id,
        nickname: p.nickname,
        market: studyMarketId(room.config, p.seat),
        seat: p.seat,
        alias: p.alias,
        role: p.role,
        sortedUnits: Array.from(
          { length: studyUnits(room.config, institution) },
          (_, unit) => index + 1 + unit * perSide,
        ),
        limits: [...unitLimits(room, p, institution)],
      };
    });
}

// Creation and later teacher edits save the same canonical conditions and seed.
export function applyStudyGenerator(
  room: Room,
  generator: StudyGeneratorConfig,
  now: number,
) {
  if (!room.study || room.phase !== "waiting" || room.round > 0)
    throw new AuctionError("条件は実験開始前のみ変更できます。", 409);
  let settings: StudySettings;
  try {
    if (room.study.conditionsByInstitution) {
      const conditions = presetStudyConditions(
        room.config,
        room.study.conditionBasis?.settings ?? room.study.settings,
        generator,
      );
      room.study.conditionsByInstitution = conditions;
      settings = conditions[studyInstitutions(room.config)[0]]!.settings;
    } else
      settings = generatedStudySettings(
        generator,
        studyUnitsPerSide(room.config),
        studyUnits(room.config),
      );
  } catch (error) {
    throw new AuctionError(
      error instanceof Error ? error.message : "生成条件を確認してください。",
    );
  }
  room.study.settings = settings;
  if (room.study.otherSettings && !room.study.otherGeneration)
    room.study.otherGeneration = structuredClone(generator);
  room.study.generation = {
    ...structuredClone(generator),
    appliedAt: now,
    assignmentConfirmedAt: null,
    assignments: [],
  };
  room.seats = seededStudySeats(room.config.capacity, generator.seed);
  assignStudySeats(room);
  if (room.study.lobby) {
    room.study.lobby.revision++;
    room.study.lobby.randomizedAt = null;
  }
  recordStudyGeneratedAssignments(room);
}
export const ORDERS = studyInstitutionOrders(DEFAULT_STUDY_INSTITUTIONS);
export function createStudy(
  count: number,
  settings: StudySettings,
  institutions: readonly Institution[] = DEFAULT_STUDY_INSTITUTIONS,
  otherSettings?: StudySettings,
): Study {
  if (!studyInstitutionsSchema.safeParse(institutions).success)
    throw new AuctionError("実施する制度を重複せず1つ以上選択してください。");
  const selected = DEFAULT_STUDY_INSTITUTIONS.filter((i) =>
    institutions.includes(i),
  );
  // A single market uses the default selected order. Multiple markets balance
  // every permutation of the selected institutions as evenly as possible.
  const candidates =
    count === 1 ? [selected] : shuffled(studyInstitutionOrders(selected));
  const orders = shuffled(
    Array.from({ length: count }, (_, i) => candidates[i % candidates.length]),
  );
  return {
    protocol: "institutions-v1",
    revision: 0,
    settings: structuredClone(settings),
    conditionBasis: {
      settings: structuredClone(settings),
      ...(otherSettings
        ? { otherSettings: structuredClone(otherSettings) }
        : {}),
    },
    ...(otherSettings ? { otherSettings: structuredClone(otherSettings) } : {}),
    markets: orders.map((order, i) => ({
      id: i + 1,
      round: 0,
      order: [...order],
      stage: "waiting",
      epoch: 0,
      deadline: null,
      remainingMs: 0,
      call: 0,
      orders: [],
      orderHistory: [],
      offers: [],
      offerHistory: [],
      submitted: [],
      buyerOrder: [],
      buyerIndex: 0,
      trades: [],
      clearings: [],
      periods: [],
      spreadAt: 0,
      spreadValue: null,
    })),
  };
}
export const marketFor = (room: Room, p: Participant) => {
  const markets = room.study!.markets;
  if (p.seat < 0) return markets[0];
  const id = studyMarketId(room.config, p.seat);
  return markets[id - 1]?.id === id
    ? markets[id - 1]
    : markets.find((m) => m.id === id)!;
};
export const marketRound = (room: Room, market: StudyMarket) =>
  market.round ?? market.periods.at(-1)?.round ?? room.round;
export const institutionFor = (room: Room, market: StudyMarket) =>
  studyPeriodAt(room.config, market.order, marketRound(room, market))
    .institution;
export const settingsForInstitution = (
  room: Room,
  institution: Institution,
  market?: number,
) => {
  const settings =
    room.study!.conditionsByInstitution?.[institution]?.settings ??
    (institution === "cda"
      ? room.study!.settings
      : (room.study!.otherSettings ?? room.study!.settings));
  return market ? studyMarketSettings(room.config, settings, market) : settings;
};
export const unitLimits = (
  room: Room,
  p: Participant,
  institution = institutionFor(room, marketFor(room, p)),
) => {
  if (p.seat < 0) return [];
  const profiles = settingsForInstitution(room, institution)[
    p.role === "buyer" ? "values" : "costs"
  ];
  return profiles[studyProfileIndex(room.config, p.seat, profiles.length)];
};
function roomCommissionError(room: Room, commission: number, market?: number) {
  return (
    studyInstitutions(room.config)
      .map((institution) =>
        studyCommissionError(
          commission,
          settingsForInstitution(room, institution, market),
        ),
      )
      .find(Boolean) ?? ""
  );
}
export const unitsUsed = (room: Room, p: Participant) =>
  marketFor(room, p).trades.filter(
    (t) =>
      t.round === marketRound(room, marketFor(room, p)) &&
      (t.buyerId === p.id || t.sellerId === p.id),
  ).length;
export const stageKey = (room: Room, m: StudyMarket) =>
  `${marketRound(room, m)}:${m.epoch}`;
export const studyProfit = (room: Room, p: Participant, round?: number) =>
  marketFor(room, p)
    .trades.filter(
      (t) =>
        (round === undefined || t.round === round) &&
        (t.buyerId === p.id || t.sellerId === p.id),
    )
    .reduce(
      (sum, t) =>
        sum + studyTradeProfit(t, t.buyerId === p.id ? "buyer" : "seller"),
      0,
    );

function log(
  room: Room,
  m: StudyMarket,
  events: AuditEvent[],
  at: number,
  type: string,
  actor: string,
  detail: Record<string, unknown> = {},
) {
  return emit(
    room,
    events,
    at,
    type,
    actor,
    {
      market: m.id,
      institution: institutionFor(room, m),
      stage: m.stage,
      call: m.call || null,
      ...detail,
    },
    marketRound(room, m),
  );
}
function spreadAccumulate(m: StudyMarket, at: number) {
  const period = m.periods.at(-1);
  if (period && m.stage === "cda" && m.spreadValue !== null) {
    const dt = Math.max(0, at - m.spreadAt);
    period.spreadArea += m.spreadValue * dt;
    period.spreadMs += dt;
  }
  m.spreadAt = at;
}
function archiveOrders(
  room: Room,
  m: StudyMarket,
  orders: StudyOrder[],
  status: StudyOrderHistory["status"],
  events: AuditEvent[],
  at: number,
) {
  // Only orders that actually rested on the public CDA book enter this history.
  // Only ended CDA resting orders enter this history. Call results are stored in clearings.
  for (const order of orders) {
    const closedSequence = log(
      room,
      m,
      events,
      at,
      "order-closed",
      order.participantId,
      {
        orderId: order.id,
        price: order.price,
        side: order.side,
        unit: order.unit,
        postedAt: order.at,
        status,
      },
    );
    (m.orderHistory ??= []).push({
      ...order,
      round: marketRound(room, m),
      status,
      closedAt: at,
      closedSequence,
    });
  }
}
function spreadUpdate(
  room: Room,
  m: StudyMarket,
  events: AuditEvent[],
  at: number,
) {
  spreadAccumulate(m, at);
  const bids = m.orders.filter((o) => o.side === "buyer").map((o) => o.price);
  const asks = m.orders.filter((o) => o.side === "seller").map((o) => o.price);
  const bid = bids.length ? Math.max(...bids) : null,
    ask = asks.length ? Math.min(...asks) : null;
  m.spreadValue = bid !== null && ask !== null ? ask - bid : null;
  log(room, m, events, at, "book", "system", {
    bid,
    ask,
    spread: m.spreadValue,
  });
}
function schedule(
  m: StudyMarket,
  stage: StudyStage,
  at: number,
  seconds: number,
) {
  m.stage = stage;
  m.epoch++;
  m.remainingMs = seconds * 1000;
  m.deadline = at + m.remainingMs;
}
function sync(room: Room) {
  room.round = Math.max(
    ...room.study!.markets.map((m) => marketRound(room, m)),
  );
  const active = room.study!.markets.filter((m) => m.deadline !== null);
  room.deadline = active.length
    ? Math.min(...active.map((m) => m.deadline!))
    : null;
  if (
    ["running", "paused"].includes(room.phase) &&
    room.study!.markets.every(
      (m) => m.stage === "done" && marketRound(room, m) === room.config.rounds,
    )
  )
    room.phase = "finished";
}
function startMarket(
  room: Room,
  m: StudyMarket,
  events: AuditEvent[],
  at: number,
) {
  m.round = marketRound(room, m) + 1;
  m.orders = [];
  m.offers = [];
  m.submitted = [];
  m.buyerOrder = [];
  m.buyerIndex = 0;
  m.call = 0;
  delete m.posted;
  m.spreadAt = at;
  m.spreadValue = null;
  const institution = institutionFor(room, m);
  m.periods.push({
    round: m.round,
    institution,
    completion: "running",
    startedAt: at,
    endedAt: null,
    spreadArea: 0,
    spreadMs: 0,
  });
  const timing = studyTiming(room.config);
  if (institution === "cda") schedule(m, "cda", at, timing.cdaSeconds);
  else if (institution === "call") {
    m.call = 1;
    schedule(m, "call", at, timing.callSeconds);
  } else {
    if (room.config.studyPostedMechanism)
      m.posted = { bids: [], batch: 0, endsAt: null, remainingMs: 0 };
    schedule(m, "offer", at, timing.offerSeconds);
  }
  log(room, m, events, at, "period-started", "system");
}
function finishMarket(
  room: Room,
  m: StudyMarket,
  events: AuditEvent[],
  at: number,
  completion: "complete" | "interrupted",
  showFeedback = true,
) {
  spreadAccumulate(m, at);
  if (m.stage === "cda")
    archiveOrders(
      room,
      m,
      m.orders,
      completion === "complete" ? "expired" : "interrupted",
      events,
      at,
    );
  const period = m.periods.at(-1);
  if (
    period &&
    period.round === marketRound(room, m) &&
    period.completion === "running"
  ) {
    period.endedAt = at;
    period.completion = completion;
  }
  log(room, m, events, at, "period-ended", "system", {
    completion,
    cancelledOrders: [
      ...m.orders.map((o) => o.id),
      ...(m.posted?.bids
        .filter((bid) => bid.remaining > 0)
        .map((bid) => bid.id) ?? []),
    ],
  });
  if (m.posted) {
    m.posted.bids = [];
    m.posted.endsAt = null;
    m.posted.remainingMs = 0;
  }
  m.orders = [];
  m.stage = "done";
  m.epoch++;
  m.deadline = null;
  m.remainingMs = 0;
  m.spreadValue = null;
  if (showFeedback) {
    // Preserve the eight-second result display for CDA and institution endings.
    // Other periods use five seconds to review the upcoming conditions. This
    // shared server deadline never consumes the next period's trading time.
    const seconds =
      institutionFor(room, m) === "cda" ||
      marketRound(room, m) ===
        studyPeriodAt(room.config, m.order, marketRound(room, m)).last
        ? STUDY_FEEDBACK_SECONDS
        : STUDY_START_SECONDS;
    schedule(m, "feedback", at, seconds);
    log(room, m, events, at, "feedback-started", "system", {
      seconds,
    });
  } else if (
    completion === "complete" &&
    marketRound(room, m) < room.config.rounds
  )
    startMarket(room, m, events, at);
}
function checkPrice(price: number) {
  if (!isValidPrice(price))
    throw new AuctionError(
      `注文価格は1〜${MAX_PRICE}円の整数で入力してください。`,
      400,
      "INVALID_PRICE",
    );
}
function trade(
  room: Room,
  m: StudyMarket,
  buyer: Participant,
  seller: Participant,
  price: number,
  events: AuditEvent[],
  at: number,
  call: number | null = null,
) {
  const buyerUnit = unitsUsed(room, buyer) + 1,
    sellerUnit = unitsUsed(room, seller) + 1;
  const maximumUnits = studyUnits(room.config, institutionFor(room, m));
  if (buyerUnit > maximumUnits || sellerUnit > maximumUnits)
    throw new AuctionError("今期の取引可能数を超えています。", 409);
  const value = unitLimits(room, buyer)[buyerUnit - 1],
    cost = unitLimits(room, seller)[sellerUnit - 1];
  const entry: StudyTrade = {
    id: randomUUID(),
    sequence: room.sequence + 1,
    at,
    round: marketRound(room, m),
    market: m.id,
    institution: institutionFor(room, m),
    call,
    price,
    buyerId: buyer.id,
    sellerId: seller.id,
    buyerAlias: buyer.alias,
    sellerAlias: seller.alias,
    buyerUnit,
    sellerUnit,
    value,
    cost,
    commission: studyCommission(room.config),
  };
  entry.sequence = log(room, m, events, at, "trade", "system", { ...entry });
  m.trades.push(entry);
}
function clearCall(
  room: Room,
  m: StudyMarket,
  events: AuditEvent[],
  at: number,
) {
  const priority = shuffled(
    room.participants
      .filter((p) => marketFor(room, p).id === m.id)
      .map((p) => p.id),
  );
  const rank = (o: StudyOrder) => priority.indexOf(o.participantId);
  const sorted = (side: "buyer" | "seller") =>
    m.orders
      .filter((o) => o.side === side)
      .sort(
        (a, b) =>
          (side === "buyer" ? b.price - a.price : a.price - b.price) ||
          rank(a) - rank(b) ||
          a.unit - b.unit,
      );
  const bids = sorted("buyer"),
    asks = sorted("seller");
  let q = 0;
  while (
    q < Math.min(bids.length, asks.length) &&
    bids[q].price >= asks[q].price
  )
    q++;
  const price = q ? (bids[q - 1].price + asks[q - 1].price) / 2 : null;
  const result = {
    round: marketRound(room, m),
    call: m.call,
    at,
    price,
    quantity: q,
  };
  m.clearings.push(result);
  log(room, m, events, at, "call-cleared", "system", {
    ...result,
    tiePriority: priority,
    orders: m.orders,
  });
  for (let i = 0; i < q; i++)
    trade(
      room,
      m,
      room.participants.find((p) => p.id === bids[i].participantId)!,
      room.participants.find((p) => p.id === asks[i].participantId)!,
      price!,
      events,
      at,
      m.call,
    );
  m.orders = [];
  m.submitted = [];
}
function nextBuyer(
  room: Room,
  m: StudyMarket,
  events: AuditEvent[],
  at: number,
) {
  m.buyerIndex++;
  while (
    m.buyerIndex < m.buyerOrder.length &&
    room.participants.find((p) => p.id === m.buyerOrder[m.buyerIndex])
      ?.withdrawnAt
  )
    m.buyerIndex++;
  if (m.buyerIndex >= m.buyerOrder.length)
    finishMarket(room, m, events, at, "complete");
  else {
    schedule(m, "purchase", at, studyTiming(room.config).buyerSeconds);
    log(room, m, events, at, "buyer-turn", "system", {
      participantId: m.buyerOrder[m.buyerIndex],
    });
  }
}
function postedSupplyExhausted(room: Room, m: StudyMarket) {
  return studySingleUnitOrders(room.config)
    ? !room.participants.some(
        (p) =>
          !p.withdrawnAt &&
          p.role === "seller" &&
          marketFor(room, p).id === m.id &&
          m.submitted.includes(p.id) &&
          unitsUsed(room, p) < studyUnits(room.config, "posted"),
      )
    : m.offers.every((offer) => offer.remaining === 0);
}

function clearPosted(
  room: Room,
  m: StudyMarket,
  events: AuditEvent[],
  at: number,
) {
  const posted = m.posted!;
  const plan = postedBatchPlan(posted.bids, m.offers, at);
  posted.batch++;
  // Persist the exact eligible cohort and random priority before applying fills.
  log(room, m, events, at, "posted-batch-cleared", "system", {
    batch: posted.batch,
    ...plan,
  });
  for (const match of plan.matches) {
    const bid = posted.bids.find((bid) => bid.id === match.bidId)!;
    const offer = m.offers.find((offer) => offer.id === match.offerId)!;
    const buyer = room.participants.find((p) => p.id === bid.participantId)!;
    const seller = room.participants.find((p) => p.id === offer.participantId)!;
    if (match.quantity > bid.remaining || match.quantity > offer.remaining)
      throw new AuctionError("在庫または注文残数量が更新されています。", 409);
    for (let unit = 0; unit < match.quantity; unit++)
      trade(room, m, buyer, seller, match.price, events, at);
    bid.remaining -= match.quantity;
    offer.remaining -= match.quantity;
  }
  if (at >= posted.endsAt! || postedSupplyExhausted(room, m)) {
    log(room, m, events, at, "posted-bids-expired", "system", {
      bids: posted.bids
        .filter((bid) => bid.remaining > 0)
        .map((bid) => ({ ...bid })),
    });
    posted.bids = [];
    finishMarket(room, m, events, at, "complete");
  } else {
    m.deadline = Math.min(at + POSTED_BATCH_MS, posted.endsAt!);
    m.remainingMs = m.deadline - at;
    // A batch boundary does not change the submission stage or invalidate forms.
  }
}
// Admission is a room-wide transaction. No seats or private conditions are
// assigned until the teacher closes admission or the persisted deadline passes.
function reopenAdmission(room: Room) {
  const study = room.study!,
    lobby = study.lobby!;
  room.config.studyAdmission = "flexible";
  const targetMarkets =
    lobby.admission?.targetMarkets ?? room.config.markets ?? 1;
  lobby.admission = {
    status: "open",
    closesAt: null,
    closedAt: null,
    targetMarkets,
    timerSeconds: lobby.admission?.timerSeconds ?? 60,
  };
  lobby.randomizedAt = null;
  delete room.config.studyLayout;
  for (const p of room.participants) {
    p.seat = -1;
    p.alias = "未割当";
    p.limits = { apple: 0, banana: 0, orange: 0 };
  }
  recordStudyGeneratedAssignments(room);
}

function closeAdmission(
  room: Room,
  at: number,
  events: AuditEvent[],
  automatic = false,
) {
  const study = room.study!,
    lobby = study.lobby!,
    admission = lobby.admission!;
  const active = room.participants.filter((p) => !p.withdrawnAt);
  admission.status = "closed";
  admission.closesAt = null;
  admission.closedAt = at;
  delete admission.pausedRemainingMs;
  delete admission.error;
  lobby.randomizedAt = null;
  lobby.revision++;
  const plan = studyAllocationPlan(
    active.length,
    admission.targetMarkets,
    room.config.studyMarketMode,
    study.generation ? study.generation.seed % 2 === 0 : randomInt(2) === 0,
  );
  const waitingMessage = studyAllocationWaitingMessage(plan);
  if (waitingMessage) {
    admission.status = "open";
    admission.closedAt = null;
    delete room.config.studyLayout;
    for (const person of active) {
      person.seat = -1;
      person.alias = "未割当";
      person.limits = { apple: 0, banana: 0, orange: 0 };
    }
    if (study.generation) study.generation.assignmentConfirmedAt = null;
    recordStudyGeneratedAssignments(room);
    emit(
      room,
      events,
      at,
      "admission-waiting",
      automatic ? "system" : "teacher",
      {
        trigger: automatic ? "deadline" : "manual",
        count: active.length,
        templateSize: plan.templateSize,
        error: waitingMessage,
      },
    );
    return;
  }
  if (active.length < 2) {
    admission.error = "参加者が2人以上必要です。入室を再開してください。";
    emit(
      room,
      events,
      at,
      "admission-closed",
      automatic ? "system" : "teacher",
      {
        trigger: automatic ? "deadline" : "manual",
        count: active.length,
        error: admission.error,
      },
    );
    return;
  }
  let conditions: ReturnType<typeof studyAllocationConditions>;
  try {
    conditions = studyAllocationConditions(
      room.config,
      study,
      plan.templateSize,
    );
    const error = studyAllocationConditionError(room.config, conditions, plan);
    if (error) throw new Error(error);
  } catch (error) {
    admission.error = `${active.length}人・${plan.layout.length}市場、最大市場${Math.max(...plan.layout.map((m) => m.buyers + m.sellers))}人 → ${plan.templateSize}人の供需テンプレート：${error instanceof Error ? error.message : "条件を確認してください。"}「市場・取引条件」でパラメータを再設定してください。`;
    delete room.config.studyLayout;
    for (const person of active) {
      person.seat = -1;
      person.alias = "未割当";
      person.limits = { apple: 0, banana: 0, orange: 0 };
    }
    recordStudyGeneratedAssignments(room);
    emit(
      room,
      events,
      at,
      "admission-closed",
      automatic ? "system" : "teacher",
      {
        trigger: automatic ? "deadline" : "manual",
        count: active.length,
        error: admission.error,
        templateSize: plan.templateSize,
      },
    );
    return;
  }
  const count = plan.layout.length;
  study.conditionBasis ??= {
    settings: structuredClone(study.settings),
    ...(study.otherSettings
      ? { otherSettings: structuredClone(study.otherSettings) }
      : {}),
  };
  study.settings = conditions.settings;
  if (conditions.conditionsByInstitution)
    study.conditionsByInstitution = conditions.conditionsByInstitution;
  if (conditions.otherSettings) study.otherSettings = conditions.otherSettings;
  room.config.marketSize = plan.templateSize;
  room.config.studyLayout = plan.layout;
  room.config.markets = count;
  room.config.capacity = active.length;
  if (study.markets.length !== count)
    study.markets = createStudy(
      count,
      study.settings,
      studyInstitutions(room.config),
    ).markets;
  room.seats = study.generation
    ? seededStudySeats(active.length, study.generation.seed)
    : shuffled(Array.from({ length: active.length }, (_, i) => i));
  assignStudySeats(room);
  lobby.randomizedAt = at;
  if (study.generation) study.generation.assignmentConfirmedAt = at;
  recordStudyGeneratedAssignments(room);
  study.revision++;
  emit(room, events, at, "admission-closed", automatic ? "system" : "teacher", {
    trigger: automatic ? "deadline" : "manual",
    requestedMarkets: admission.targetMarkets,
    layout: room.config.studyLayout,
    orders: study.markets.map((m) => ({ market: m.id, order: m.order })),
    revision: lobby.revision,
    assignments: active.map((p) => ({
      id: p.id,
      market: studyMarketId(room.config, p.seat),
      seat: p.seat,
      role: p.role,
      alias: p.alias,
      unitLimits: unitLimits(room, p),
    })),
  });
}

export function settleStudy(room: Room, now: number, events: AuditEvent[]) {
  const admission = room.study!.lobby?.admission;
  if (
    room.phase === "waiting" &&
    admission?.status === "open" &&
    admission.closesAt !== null &&
    now >= admission.closesAt
  ) {
    closeAdmission(room, admission.closesAt, events, true);
    return true;
  }
  if (room.phase !== "running") return false;
  let changed = false;
  for (const m of room.study!.markets) {
    if (
      ["waiting", "done"].includes(m.stage) &&
      marketRound(room, m) < room.config.rounds &&
      room.participants.filter((p) => marketFor(room, p).id === m.id).length ===
        studyMarketCounts(room.config, m.id).buyers +
          studyMarketCounts(room.config, m.id).sellers
    ) {
      startMarket(room, m, events, now);
      changed = true;
    }
    while (m.deadline !== null && now >= m.deadline) {
      changed = true;
      const at = m.deadline;
      if (m.stage === "countdown") startMarket(room, m, events, at);
      else if (m.stage === "feedback") {
        log(room, m, events, at, "feedback-ended", "system");
        if (marketRound(room, m) < room.config.rounds)
          startMarket(room, m, events, at);
        else {
          m.stage = "done";
          m.epoch++;
          m.deadline = null;
          m.remainingMs = 0;
        }
      } else if (m.stage === "cda")
        finishMarket(room, m, events, at, "complete");
      else if (m.stage === "call") {
        clearCall(room, m, events, at);
        if (m.call === studyCallsPerPeriod(room.config))
          finishMarket(room, m, events, at, "complete");
        else {
          m.call++;
          schedule(m, "call", at, studyTiming(room.config).callSeconds);
        }
      } else if (m.stage === "offer") {
        m.buyerOrder = m.posted
          ? []
          : shuffled(
              room.participants
                .filter(
                  (p) =>
                    !p.withdrawnAt &&
                    marketFor(room, p).id === m.id &&
                    p.role === "buyer",
                )
                .map((p) => p.id),
            );
        m.buyerIndex = 0;
        schedule(
          m,
          "purchase",
          at,
          m.posted
            ? room.config.studyPostedMechanism === "direct-purchase-v1"
              ? postedPurchaseSeconds(room.config)
              : POSTED_BATCH_MS / 1000
            : studyTiming(room.config).buyerSeconds,
        );
        if (m.posted) {
          m.posted.endsAt = at + postedPurchaseSeconds(room.config) * 1000;
          m.posted.remainingMs = m.posted.endsAt - at;
          m.deadline = Math.min(m.deadline!, m.posted.endsAt);
        }
        const sequence = log(
          room,
          m,
          events,
          at,
          "offers-published",
          "system",
          {
            offers: m.offers,
            ...(m.posted
              ? {
                  mechanism: room.config.studyPostedMechanism,
                  ...(room.config.studyPostedMechanism === "batch-bids-v1"
                    ? { batchMs: POSTED_BATCH_MS }
                    : {}),
                  endsAt: m.posted.endsAt,
                }
              : { buyerOrder: m.buyerOrder }),
          },
        );
        (m.offerHistory ??= []).push(
          ...m.offers.map((offer) => ({
            id: offer.id,
            participantId: offer.participantId,
            alias: offer.alias,
            price: offer.price,
            quantity: offer.quantity,
            round: marketRound(room, m),
            at,
            sequence,
          })),
        );
        if (
          (!m.posted && m.buyerOrder.length === 0) ||
          (room.config.studyPostedMechanism === "direct-purchase-v1" &&
            postedSupplyExhausted(room, m))
        )
          finishMarket(room, m, events, at, "complete");
      } else if (m.stage === "purchase") {
        if (room.config.studyPostedMechanism === "direct-purchase-v1")
          finishMarket(room, m, events, at, "complete");
        else if (m.posted) clearPosted(room, m, events, at);
        else {
          log(room, m, events, at, "buyer-timeout", m.buyerOrder[m.buyerIndex]);
          nextBuyer(room, m, events, at);
        }
      } else break;
    }
  }
  sync(room);
  return changed;
}

function applyInstitutionSettings(
  room: Room,
  cmd: {
    unitsByInstitution: StudyUnitCounts;
    settingsByInstitution?: StudySchedules;
    generator?: StudyGeneratorConfig;
    commission?: number;
  },
  now: number,
  events: AuditEvent[],
) {
  const counts = studyUnitCountsSchema.safeParse(cmd.unitsByInstitution);
  if (!counts.success) throw new AuctionError(studyUnitsError(NaN));
  const study = room.study!;
  const institutions = studyInstitutions(room.config);
  const allocation = studyRoomAllocation(room);
  const templateSize = allocation?.templateSize ?? studyMarketSize(room.config);
  const people = studyTemplateSideCount({ marketSize: templateSize });
  const conditions: StudyConditions = { ...study.conditionsByInstitution };
  for (const institution of institutions) {
    const units = counts.data[institution];
    const parsed = studySettingsSchema.safeParse(
      cmd.settingsByInstitution?.[institution],
    );
    if (
      !parsed.success ||
      parsed.data.values.length !== people ||
      parsed.data.values[0].length !== units
    )
      throw new AuctionError(
        `${institution}：${people}人×${units}単位の供需条件を再度プレビューしてください。`,
      );
    if (cmd.generator) {
      const generated = generatedStudySettings(
        cmd.generator,
        people * units,
        units,
      );
      if (JSON.stringify(generated) !== JSON.stringify(parsed.data))
        throw new AuctionError(
          "生成条件と価値・費用が一致しません。再度プレビューしてください。",
        );
    }
    const previousBasis =
      conditions[institution]?.basis ??
      study.conditionBasis?.settings ??
      settingsForInstitution(room, institution);
    const basis =
      JSON.stringify(
        resizeStudySettings(previousBasis, templateSize, units),
      ) === JSON.stringify(parsed.data)
        ? previousBasis
        : parsed.data;
    conditions[institution] = {
      settings: parsed.data,
      basis: structuredClone(basis),
      ...(cmd.generator ? { generator: structuredClone(cmd.generator) } : {}),
    };
  }
  const commission = cmd.commission ?? studyCommission(room.config);
  const nextConfig = {
    ...room.config,
    marketSize: templateSize,
    studyUnitCounts: counts.data,
    studyCdaUnits: counts.data.cda,
    studyCommission: commission,
  };
  const settings = conditions[institutions[0]]!.settings;
  const error = studyAllocationConditionError(
    nextConfig,
    { settings, conditionsByInstitution: conditions },
    allocation ?? {
      layout: [],
      attendance: 0,
      templateSize,
      requestedMarkets: 1,
    },
  );
  if (error) throw new AuctionError(error);
  const changed =
    JSON.stringify(studyUnitCounts(room.config)) !==
      JSON.stringify(counts.data) ||
    institutions.some(
      (i) =>
        JSON.stringify(settingsForInstitution(room, i)) !==
        JSON.stringify(conditions[i]!.settings),
    );
  study.conditionsByInstitution = conditions;
  study.settings = settings;
  room.config = nextConfig;
  if (
    allocation?.layout.length &&
    study.lobby?.admission?.status === "closed"
  ) {
    room.config.studyLayout = allocation.layout;
    room.config.markets = allocation.layout.length;
    if (study.markets.length !== allocation.layout.length)
      study.markets = createStudy(
        allocation.layout.length,
        settings,
        institutions,
      ).markets;
  }
  if (cmd.generator) applyStudyGenerator(room, cmd.generator, now);
  else {
    delete study.generation;
    for (const participant of room.participants)
      participant.limits.apple = unitLimits(room, participant)[0] ?? 0;
    if (changed && study.lobby) {
      study.lobby.revision++;
      study.lobby.randomizedAt = null;
    }
  }
  study.revision++;
  if (study.lobby?.admission) delete study.lobby.admission.error;
  emit(room, events, now, "study-settings", "teacher", {
    settings,
    conditionsByInstitution: conditions,
    unitsByInstitution: counts.data,
    commission,
    ...(study.generation
      ? { generation: structuredClone(study.generation) }
      : {}),
    revision: study.revision,
  });
}

export function executeStudy(
  room: Room,
  actor: Participant | "teacher",
  request: CommandRequest,
  now: number,
  events: AuditEvent[],
) {
  const actorId = actor === "teacher" ? actor : actor.id;
  if (
    room.receipts.some(
      (r) => r.actor === actorId && r.requestId === request.requestId,
    )
  )
    return;
  if (
    actor !== "teacher" &&
    request.expectedRound !== marketRound(room, marketFor(room, actor))
  )
    throw new AuctionError(
      "期が切り替わりました。最新の画面を確認してください。",
      409,
      "ROUND_CHANGED",
    );
  const cmd = request.command,
    study = room.study!;
  if (cmd.type === "study-admission") {
    if (actor !== "teacher")
      throw new AuctionError("この操作は教員のみ利用できます。", 403);
    if (!study.lobby || room.phase !== "waiting" || room.round !== 0)
      throw new AuctionError("入室設定は実験開始前のみ変更できます。", 409);
    if (cmd.expectedRevision !== study.lobby.revision)
      throw new AuctionError(
        "入室状況が更新されています。最新の画面を確認してください。",
        409,
      );
    if (!study.lobby.admission || cmd.action === "open") reopenAdmission(room);
    const admission = study.lobby.admission!;
    const updateMarkets =
      cmd.action === "configure" ||
      ((cmd.action === "schedule" || cmd.action === "close") &&
        cmd.markets !== undefined);
    if (updateMarkets) {
      if (
        cmd.marketMode !== "auto" &&
        (!Number.isInteger(cmd.markets) ||
          cmd.markets! < 1 ||
          cmd.markets! > MAX_STUDY_MARKETS)
      )
        throw new AuctionError(
          `市場数は1〜${MAX_STUDY_MARKETS}で設定してください。`,
        );
      if (admission.status !== "open")
        throw new AuctionError(
          "市場数を変更する前に入室を再開してください。",
          409,
        );
    }
    if (cmd.action === "schedule") {
      if (admission.status !== "open")
        throw new AuctionError("先に入室を再開してください。", 409);
      if (
        admission.closesAt !== null ||
        admission.pausedRemainingMs !== undefined
      )
        throw new AuctionError(
          "タイマーをリセットしてから開始してください。",
          409,
        );
      if (
        !Number.isInteger(cmd.seconds) ||
        cmd.seconds! < 5 ||
        cmd.seconds! > 3600
      )
        throw new AuctionError("入室受付時間は5〜3600秒で設定してください。");
    }
    if (
      (cmd.action === "pause-timer" ||
        cmd.action === "resume-timer" ||
        cmd.action === "cancel-timer") &&
      admission.status !== "open"
    )
      throw new AuctionError("入室受付は終了しています。", 409);
    if (
      cmd.action === "pause-timer" &&
      (admission.closesAt === null || admission.closesAt <= now)
    )
      throw new AuctionError("動作中のタイマーがありません。", 409);
    if (
      cmd.action === "resume-timer" &&
      (admission.closesAt !== null || !(admission.pausedRemainingMs! > 0))
    )
      throw new AuctionError("一時停止中のタイマーがありません。", 409);
    // Apply the entered count and cutoff together, even before autosave completes.
    if (updateMarkets) {
      if (cmd.markets !== undefined) admission.targetMarkets = cmd.markets;
      room.config.studyMarketMode = cmd.marketMode ?? "manual";
    }
    if (cmd.action === "schedule") {
      admission.timerSeconds = cmd.seconds!;
      admission.closesAt = now + cmd.seconds! * 1000;
    } else if (cmd.action === "pause-timer") {
      admission.pausedRemainingMs = admission.closesAt! - now;
      admission.closesAt = null;
    } else if (cmd.action === "resume-timer") {
      admission.closesAt = now + admission.pausedRemainingMs!;
      delete admission.pausedRemainingMs;
    } else if (cmd.action === "cancel-timer") {
      admission.closesAt = null;
      delete admission.pausedRemainingMs;
    }
    if (cmd.action === "close") closeAdmission(room, now, events);
    else {
      study.lobby.revision++;
      emit(room, events, now, "admission-updated", actorId, {
        ...admission,
        action: cmd.action,
      });
    }
  } else if (cmd.type === "study-withdraw") {
    if (actor !== "teacher")
      throw new AuctionError("この操作は教員のみ利用できます。", 403);
    if (!study.lobby || room.phase === "finished")
      throw new AuctionError("現在は参加終了にできません。", 409);
    if (cmd.expectedRevision !== study.lobby.revision)
      throw new AuctionError("参加状況が更新されています。", 409);
    const p = room.participants.find((p) => p.id === cmd.participantId);
    if (!p) throw new AuctionError("参加者が見つかりません。", 404);
    if (!p.withdrawnAt) {
      p.withdrawnAt = now;
      const m = marketFor(room, p);
      const orders = m.orders.filter((o) => o.participantId === p.id);
      if (m.stage === "cda")
        archiveOrders(room, m, orders, "cancelled", events, now);
      m.orders = m.orders.filter((o) => o.participantId !== p.id);
      const bids = m.posted?.bids.filter((b) => b.participantId === p.id) ?? [];
      if (m.posted)
        m.posted.bids = m.posted.bids.filter((b) => b.participantId !== p.id);
      const offers = m.offers.filter(
        (o) => o.participantId === p.id && o.remaining > 0,
      );
      const cancelledOffers = offers.map((o) => ({
        id: o.id,
        remaining: o.remaining,
      }));
      for (const offer of offers) offer.remaining = 0;
      emit(room, events, now, "participant-withdrawn", actorId, {
        participantId: p.id,
        market: p.seat < 0 ? null : m.id,
        cancelledOrders: orders.map((o) => o.id),
        cancelledBids: bids.map((b) => b.id),
        cancelledOffers,
      });
      if (m.stage === "cda") {
        if (room.phase === "paused") m.spreadAt = now;
        spreadUpdate(room, m, events, now);
      }
      if (room.phase === "waiting") {
        if (study.lobby.admission?.status !== "open") reopenAdmission(room);
      } else if (
        m.stage === "purchase" &&
        !m.posted &&
        m.buyerOrder[m.buyerIndex] === p.id
      ) {
        nextBuyer(room, m, events, now);
        if (room.phase === "paused") m.deadline = null;
      }
      study.lobby.revision++;
    }
  } else if (cmd.type === "study-randomize" && study.lobby?.admission) {
    if (actor !== "teacher")
      throw new AuctionError("この操作は教員のみ利用できます。", 403);
    if (room.phase !== "waiting" || room.round !== 0)
      throw new AuctionError("割り当ては実験開始前のみ変更できます。", 409);
    if (cmd.expectedRevision !== study.lobby.revision)
      throw new AuctionError("割り当てが更新されています。", 409);
    closeAdmission(room, now, events);
  } else if (cmd.type === "study-randomize") {
    if (actor !== "teacher")
      throw new AuctionError("この操作は教員のみ利用できます。", 403);
    if (!study.lobby || room.phase !== "waiting" || room.round !== 0)
      throw new AuctionError("割り当ては実験開始前のみ変更できます。", 409);
    if (room.participants.length !== room.config.capacity)
      throw new AuctionError(
        "全員が入室してからランダムに割り当ててください。",
        409,
      );
    if (cmd.expectedRevision !== study.lobby.revision)
      throw new AuctionError(
        "割り当てが更新されています。最新の画面を確認してください。",
        409,
      );
    const before = room.participants.map((p) => ({
      id: p.id,
      seat: p.seat,
      role: p.role,
    }));
    room.seats = study.generation
      ? seededStudySeats(room.config.capacity, study.generation.seed)
      : shuffled(Array.from({ length: room.config.capacity }, (_, i) => i));
    assignStudySeats(room);
    study.lobby.revision++;
    study.lobby.randomizedAt = now;
    if (study.generation) {
      study.generation.assignmentConfirmedAt = now;
      recordStudyGeneratedAssignments(room);
    }
    emit(room, events, now, "participants-randomized", actorId, {
      revision: study.lobby.revision,
      ...(study.generation ? { seed: study.generation.seed } : {}),
      before,
      assignments: room.participants.map((p) => ({
        id: p.id,
        seat: p.seat,
        market: studyMarketId(room.config, p.seat),
        role: p.role,
        alias: p.alias,
        unitLimits: unitLimits(room, p),
      })),
    });
  } else if (
    cmd.type === "study-program" ||
    cmd.type === "study-settings" ||
    cmd.type === "study-timing" ||
    cmd.type === "study-commission"
  ) {
    if (actor !== "teacher")
      throw new AuctionError("この操作は教員のみ利用できます。", 403);
    if (room.round !== 0 || room.phase !== "waiting")
      throw new AuctionError("条件は実験開始前のみ変更できます。", 409);
    if (cmd.expectedRevision !== study.revision)
      throw new AuctionError(
        "条件が更新されています。再読込してください。",
        409,
      );
    if (cmd.type === "study-program") {
      const selection = studyInstitutionsSchema.safeParse(cmd.institutions);
      const periods = studyPeriodsSchema.safeParse(cmd.periods);
      const timing =
        cmd.timing === undefined
          ? null
          : studyTimingSchema.safeParse(cmd.timing);
      if (!selection.success || !periods.success)
        throw new AuctionError(
          "実施する制度と各制度の期数を確認してください。",
        );
      if (timing && !timing.success)
        throw new AuctionError(
          `各時間は1〜${MAX_STAGE_SECONDS}秒の整数で設定してください。`,
        );
      const institutions = DEFAULT_STUDY_INSTITUTIONS.filter((i) =>
        selection.data.includes(i),
      );
      const otherSettings =
        study.otherSettings ??
        (studyUnits(room.config) !== 2 && institutions.some((i) => i !== "cda")
          ? resizeStudySettings(study.settings, studyMarketSize(room.config), 2)
          : undefined);
      const nextConditions = study.conditionsByInstitution
        ? { ...study.conditionsByInstitution }
        : undefined;
      if (nextConditions) {
        for (const institution of institutions) {
          if (!nextConditions[institution])
            Object.assign(
              nextConditions,
              presetStudyConditions(
                { ...room.config, studyInstitutions: [institution] },
                study.conditionBasis?.settings ?? study.settings,
                study.generation,
              ),
            );
        }
      }
      const error = nextConditions
        ? institutions
            .map((i) =>
              studyCommissionError(
                studyCommission(room.config),
                nextConditions[i]!.settings,
              ),
            )
            .find(Boolean)
        : studyCommissionError(
            studyCommission(room.config),
            study.settings,
            institutions.some((i) => i !== "cda") ? otherSettings : undefined,
          );
      if (error) throw new AuctionError(error);
      const changed =
        institutions.join() !== studyInstitutions(room.config).join();
      const addedPosted =
        institutions.includes("posted") &&
        !studyInstitutions(room.config).includes("posted");
      const selectedPeriods = Object.fromEntries(
        institutions.map((i) => [
          i,
          periods.data[i] ?? studyPeriodCount(room.config, i),
        ]),
      );
      room.config.studyInstitutions = institutions;
      if (nextConditions) {
        study.conditionsByInstitution = nextConditions;
        study.settings = nextConditions[institutions[0]]!.settings;
      }
      room.config.studyPeriods = selectedPeriods;
      if (timing?.success) {
        room.config.studyTiming = timing.data;
        room.config.duration = timing.data.cdaSeconds;
      }
      room.config.rounds = studyTotalRounds(room.config);
      if (otherSettings) study.otherSettings = otherSettings;
      if (addedPosted) room.config.studyPostedMechanism = "direct-purchase-v1";
      if (changed) {
        const next = createStudy(
          study.markets.length,
          study.settings,
          institutions,
        );
        for (const [index, market] of study.markets.entries()) {
          market.order = next.markets[index].order;
          market.epoch++;
        }
      }
      study.revision++;
      emit(room, events, now, "study-program", "teacher", {
        institutions,
        periods: room.config.studyPeriods,
        rounds: room.config.rounds,
        ...(timing?.success ? { timing: timing.data } : {}),
        orders: study.markets.map((m) => ({ market: m.id, order: m.order })),
        revision: study.revision,
      });
    } else if (cmd.type === "study-commission") {
      const error = roomCommissionError(room, cmd.commission);
      if (error) throw new AuctionError(error);
      room.config.studyCommission = cmd.commission;
      study.revision++;
      emit(room, events, now, "study-commission", "teacher", {
        commission: cmd.commission,
        basis: "per-filled-unit-per-participant",
        revision: study.revision,
      });
    } else if (cmd.type === "study-timing") {
      const parsed = studyTimingSchema.safeParse(cmd.timing);
      if (!parsed.success)
        throw new AuctionError(
          `各時間は1〜${MAX_STAGE_SECONDS}秒の整数で設定してください。`,
        );
      room.config.studyTiming = parsed.data;
      room.config.duration = parsed.data.cdaSeconds;
      study.revision++;
      emit(room, events, now, "study-timing", "teacher", {
        timing: parsed.data,
        revision: study.revision,
      });
    } else if (cmd.unitsByInstitution) {
      applyInstitutionSettings(
        room,
        { ...cmd, unitsByInstitution: cmd.unitsByInstitution },
        now,
        events,
      );
    } else {
      if (study.conditionsByInstitution || cmd.settingsByInstitution)
        throw new AuctionError(
          "制度別の単位数と供需条件を確認するため、画面を再読込してください。",
          409,
        );
      const units = cmd.unitsPerParticipant ?? studyUnits(room.config);
      const allocation = studyRoomAllocation(room);
      const templateSize =
        allocation?.templateSize ?? studyMarketSize(room.config);
      const templatePeople = studyTemplateSideCount({
        marketSize: templateSize,
      });
      const unitsError = studyUnitsError(units);
      if (unitsError) throw new AuctionError(unitsError);
      if (
        units !== studyUnits(room.config) &&
        !studyInstitutions(room.config).includes("cda")
      )
        throw new AuctionError(
          "CDAを実施しないルームの単位数は変更できません。",
        );
      const parsed = studySettingsSchema.safeParse(cmd.settings);
      if (
        !parsed.success ||
        parsed.data.values.length !== templatePeople ||
        parsed.data.values[0].length !== units
      )
        throw new AuctionError(
          `現在の人数と市場数に合わせ、買い手・売り手それぞれ${templatePeople}人×${units}単位の条件を再度プレビューしてください。評価値は低下、費用は上昇するように設定します。`,
        );
      // Recompute on the authoritative engine; client metadata cannot mislabel
      // a manually edited schedule as a reproducible generated condition.
      if (cmd.generator) {
        try {
          const generated = generatedStudySettings(
            cmd.generator,
            templatePeople * units,
            units,
          );
          if (JSON.stringify(generated) !== JSON.stringify(parsed.data))
            throw new Error(
              "生成条件と価値・費用が一致しません。再度プレビューしてください。",
            );
        } catch (error) {
          throw new AuctionError(
            error instanceof Error
              ? error.message
              : "生成条件を確認してください。",
          );
        }
      }
      const commission = cmd.commission ?? studyCommission(room.config);
      const nextConfig = {
        ...room.config,
        marketSize: templateSize,
        studyCdaUnits: units,
        studyCommission: commission,
      };
      const otherGeneration =
        allocation && templateSize !== studyMarketSize(room.config)
          ? cmd.generator
          : (study.otherGeneration ??
            (units !== studyUnits(room.config) && studyUnits(room.config) === 2
              ? study.generation
              : undefined));
      const nextStudy: Study = {
        ...study,
        settings: parsed.data,
        conditionBasis: {
          settings: parsed.data,
          otherSettings:
            study.conditionBasis?.otherSettings ??
            study.otherSettings ??
            study.conditionBasis?.settings ??
            study.settings,
        },
        generation: cmd.generator
          ? {
              ...cmd.generator,
              appliedAt: now,
              assignmentConfirmedAt: null,
              assignments: [],
            }
          : undefined,
        otherGeneration,
      };
      let otherSettings = study.otherSettings;
      let error: string;
      try {
        if (allocation)
          otherSettings = studyAllocationConditions(
            nextConfig,
            nextStudy,
            templateSize,
          ).otherSettings;
        error = allocation
          ? studyAllocationConditionError(
              nextConfig,
              { settings: parsed.data, otherSettings },
              allocation,
            )
          : studyCommissionError(
              commission,
              parsed.data,
              studyInstitutions(room.config).some((i) => i !== "cda")
                ? (otherSettings ??
                    (units !== studyUnits(room.config)
                      ? study.settings
                      : undefined))
                : undefined,
            );
      } catch (error) {
        throw new AuctionError(
          `供需条件を再設定してください。${error instanceof Error ? error.message : "パラメータを確認してください。"}`,
        );
      }
      if (error) throw new AuctionError(error);
      const unitsChanged = units !== studyUnits(room.config);
      const basis = study.conditionBasis ?? {
        settings: structuredClone(study.settings),
        otherSettings: study.otherSettings
          ? structuredClone(study.otherSettings)
          : undefined,
      };
      if (
        !cmd.generator &&
        JSON.stringify(
          resizeStudySettings(basis.settings, templateSize, units),
        ) !== JSON.stringify(parsed.data)
      )
        basis.settings = structuredClone(parsed.data);
      study.conditionBasis = basis;
      if (otherGeneration) study.otherGeneration = otherGeneration;
      else if (allocation && templateSize !== studyMarketSize(room.config))
        delete study.otherGeneration;
      if (unitsChanged && !study.otherSettings)
        study.otherSettings = structuredClone(study.settings);
      if (otherSettings) study.otherSettings = otherSettings;
      study.settings = parsed.data;
      if (allocation) room.config.marketSize = templateSize;
      if (
        allocation?.layout.length &&
        study.lobby?.admission?.status === "closed"
      ) {
        room.config.studyLayout = allocation.layout;
        room.config.markets = allocation.layout.length;
        if (study.markets.length !== allocation.layout.length)
          study.markets = createStudy(
            allocation.layout.length,
            study.settings,
            studyInstitutions(room.config),
          ).markets;
      }
      room.config.studyCdaUnits = units;
      room.config.studyCommission = commission;
      if (cmd.generator) {
        applyStudyGenerator(room, cmd.generator, now);
      } else {
        delete study.generation;
        // A manual edit keeps the existing seats and role order, including old
        // rooms and demos without a saved seat permutation.
        for (const participant of room.participants)
          participant.limits.apple = unitLimits(room, participant)[0] ?? 0;
        if (unitsChanged && study.lobby) {
          study.lobby.revision++;
          study.lobby.randomizedAt = null;
        }
      }
      study.revision++;
      if (study.lobby?.admission) delete study.lobby.admission.error;
      emit(room, events, now, "study-settings", "teacher", {
        settings: study.settings,
        ...(study.otherSettings ? { otherSettings: study.otherSettings } : {}),
        commission,
        unitsPerParticipant: units,
        ...(study.generation
          ? { generation: structuredClone(study.generation) }
          : {}),
        revision: study.revision,
      });
    }
  } else if (
    ["start", "pause", "resume", "end-round", "finish"].includes(cmd.type)
  ) {
    if (actor !== "teacher")
      throw new AuctionError("この操作は教員のみ利用できます。", 403);
    if (cmd.type === "start") {
      if (!["waiting", "review"].includes(room.phase))
        throw new AuctionError("今は実験を開始できません。", 409);
      if (room.round === 0) {
        const allocation = studyRoomAllocation(room);
        const waitingMessage =
          allocation && studyAllocationWaitingMessage(allocation);
        if (waitingMessage) throw new AuctionError(waitingMessage, 409);
        if (study.lobby?.admission?.error)
          throw new AuctionError(study.lobby.admission.error, 409);
        const error = roomCommissionError(room, studyCommission(room.config));
        if (error) throw new AuctionError(error);
      }
      if (study.lobby) {
        for (const market of study.markets) {
          const error = roomCommissionError(
            room,
            studyCommission(room.config),
            market.id,
          );
          if (error) throw new AuctionError(`市場${market.id}：${error}`);
        }
        if (
          study.lobby.admission
            ? study.lobby.admission.status !== "closed" ||
              room.participants.filter((p) => !p.withdrawnAt).length < 2
            : room.participants.length !== room.config.capacity
        )
          throw new AuctionError(
            study.lobby.admission
              ? "入室を締め切り、参加者を割り当ててから開始してください。"
              : "全員の入室を待ってから開始してください。",
            409,
          );
        if (study.lobby.randomizedAt === null)
          throw new AuctionError(
            "先に学生をランダムに割り当ててください。",
            409,
          );
        for (const m of study.markets)
          schedule(m, "countdown", now, STUDY_START_SECONDS);
        emit(room, events, now, "start-countdown", actorId, {
          seconds: STUDY_START_SECONDS,
          startsAt: now + STUDY_START_SECONDS * 1000,
          assignmentRevision: study.lobby.revision,
        });
      }
      if (study.generation) {
        study.generation.assignmentConfirmedAt ??= now;
        recordStudyGeneratedAssignments(room);
      }
      room.phase = "running";
      emit(room, events, now, "experiment-started", actorId);
      settleStudy(room, now, events);
    } else if (cmd.type === "pause") {
      if (room.phase !== "running")
        throw new AuctionError("取引中のみ一時停止できます。", 409);
      for (const m of study.markets)
        if (m.deadline !== null) {
          spreadAccumulate(m, now);
          m.remainingMs = Math.max(0, m.deadline - now);
          m.deadline = null;
          if (m.stage === "purchase" && m.posted) {
            m.posted.remainingMs = Math.max(0, m.posted.endsAt! - now);
            m.posted.endsAt = null;
          }
        }
      room.phase = "paused";
      emit(room, events, now, "paused", actorId);
    } else if (cmd.type === "resume") {
      if (room.phase !== "paused")
        throw new AuctionError("現在は一時停止していません。", 409);
      for (const m of study.markets)
        if (!["done", "waiting"].includes(m.stage)) {
          m.deadline = now + m.remainingMs;
          if (m.stage === "purchase" && m.posted)
            m.posted.endsAt = now + m.posted.remainingMs;
          m.spreadAt = now;
        }
      room.phase = "running";
      emit(room, events, now, "resumed", actorId);
      settleStudy(room, now, events);
    } else {
      if (
        cmd.type === "end-round" &&
        (!["running", "paused"].includes(room.phase) ||
          !study.markets.some(
            (m) =>
              !["done", "waiting", "countdown", "feedback"].includes(m.stage),
          ))
      )
        throw new AuctionError("進行中の期がありません。", 409);
      if (room.phase === "finished")
        throw new AuctionError("実験は終了しています。", 409);
      for (const m of study.markets)
        if (!["done", "waiting"].includes(m.stage)) {
          if (m.stage === "feedback" && cmd.type === "end-round") continue;
          if (["countdown", "feedback"].includes(m.stage)) {
            m.stage = "done";
            m.epoch++;
            m.deadline = null;
            m.remainingMs = 0;
            continue;
          }
          if (room.phase === "paused") m.spreadAt = now;
          finishMarket(
            room,
            m,
            events,
            now,
            "interrupted",
            cmd.type !== "finish",
          );
          if (cmd.type === "end-round") {
            if (
              m.stage !== "feedback" &&
              marketRound(room, m) < room.config.rounds
            )
              startMarket(room, m, events, now);
            if (room.phase === "paused") m.deadline = null;
          }
        }
      if (cmd.type === "finish") room.phase = "finished";
      emit(
        room,
        events,
        now,
        cmd.type === "finish" ? "experiment-ended" : "period-interrupted",
        actorId,
      );
    }
  } else {
    if (actor === "teacher")
      throw new AuctionError("教員は取引できません。", 403);
    if (actor.withdrawnAt || actor.seat < 0)
      throw new AuctionError("現在は取引に参加できません。", 409);
    const m = marketFor(room, actor);
    if (
      room.phase !== "running" ||
      ["done", "waiting", "countdown", "feedback"].includes(m.stage)
    )
      throw new AuctionError("現在は取引時間外です。", 409, "OUTSIDE_TRADING");
    if (request.expectedStage !== stageKey(room, m))
      throw new AuctionError(
        "受付時間または取引段階が切り替わりました。最新の画面を確認してください。",
        409,
        "STAGE_CHANGED",
      );
    const maximumUnits = studyUnits(room.config, institutionFor(room, m));
    const remaining = maximumUnits - unitsUsed(room, actor);
    if (
      cmd.type === "study-quote" ||
      cmd.type === "study-accept" ||
      cmd.type === "study-cancel"
    ) {
      if (m.stage !== "cda")
        throw new AuctionError(
          "この操作はCDAの取引時間中のみ利用できます。",
          409,
        );
      if (cmd.type === "study-cancel") {
        const cancelled = m.orders.filter((o) => o.participantId === actor.id);
        archiveOrders(room, m, cancelled, "cancelled", events, now);
        m.orders = m.orders.filter((o) => o.participantId !== actor.id);
        log(room, m, events, now, "cancel", actor.id, {
          orders: cancelled.map((o) => o.id),
        });
      } else {
        if (!remaining)
          throw new AuctionError(
            `今期は${maximumUnits}単位の取引が完了しています。`,
            409,
            "UNITS_EXHAUSTED",
          );
        const opposite = m.orders
          .filter((o) => o.side !== actor.role)
          .sort(
            (a, b) =>
              (actor.role === "buyer"
                ? a.price - b.price
                : b.price - a.price) || a.sequence - b.sequence,
          )[0];
        if (
          cmd.type === "study-accept" &&
          (!opposite || opposite.id !== cmd.orderId)
        )
          throw new AuctionError(
            "最良注文が変更または約定済みです。",
            409,
            "BEST_ORDER_CHANGED",
          );
        const price = cmd.type === "study-quote" ? cmd.price : opposite.price;
        checkPrice(price);
        archiveOrders(
          room,
          m,
          m.orders.filter((o) => o.participantId === actor.id),
          "replaced",
          events,
          now,
        );
        m.orders = m.orders.filter((o) => o.participantId !== actor.id);
        const id = randomUUID(),
          sequence = log(room, m, events, now, "quote", actor.id, {
            id,
            price,
            unit: maximumUnits + 1 - remaining,
            side: actor.role,
          });
        if (
          opposite &&
          (actor.role === "buyer"
            ? price >= opposite.price
            : price <= opposite.price)
        ) {
          const other = room.participants.find(
            (p) => p.id === opposite.participantId,
          )!;
          m.orders = m.orders.filter((o) => o.id !== opposite.id);
          trade(
            room,
            m,
            actor.role === "buyer" ? actor : other,
            actor.role === "seller" ? actor : other,
            opposite.price,
            events,
            now,
          );
          archiveOrders(room, m, [opposite], "filled", events, now);
        } else
          m.orders.push({
            id,
            sequence,
            participantId: actor.id,
            alias: actor.alias,
            side: actor.role,
            price,
            unit: maximumUnits + 1 - remaining,
            at: now,
          });
      }
      spreadUpdate(room, m, events, now);
    } else if (cmd.type === "call-submit") {
      if (studySingleUnitOrders(room.config) && cmd.prices.length !== 1)
        throw new AuctionError(
          "現在の1単位だけ注文できます。約定後、次の単位を注文してください。",
        );
      if (m.stage !== "call" || m.submitted.includes(actor.id))
        throw new AuctionError(
          "この回の注文は受付終了または送信済みです。",
          409,
        );
      if (!cmd.prices.length || cmd.prices.length > remaining)
        throw new AuctionError("残りの取引可能数を確認してください。");
      cmd.prices.forEach(checkPrice);
      const invalidUnit = cmd.prices.findIndex(
        (p, i) =>
          i > 0 &&
          (actor.role === "buyer"
            ? p > cmd.prices[i - 1]
            : p < cmd.prices[i - 1]),
      );
      if (invalidUnit !== -1)
        throw new AuctionError(
          `${maximumUnits + 1 - remaining + invalidUnit}単位目の買値は前の単位以下、売値は前の単位以上にしてください。`,
        );
      for (const [i, price] of cmd.prices.entries()) {
        const id = randomUUID(),
          unit = maximumUnits + 1 - remaining + i;
        const sequence = log(room, m, events, now, "call-order", actor.id, {
          id,
          unit,
          price,
          side: actor.role,
        });
        m.orders.push({
          id,
          unit,
          price,
          sequence,
          participantId: actor.id,
          alias: actor.alias,
          side: actor.role,
          at: now,
        });
      }
      m.submitted.push(actor.id);
    } else if (cmd.type === "posted-offer") {
      const sequential = studySingleUnitOrders(room.config);
      const nextUnit =
        sequential && m.stage === "purchase" && unitsUsed(room, actor) > 0;
      if (
        (m.stage !== "offer" && !nextUnit) ||
        actor.role !== "seller" ||
        (sequential
          ? m.offers.some(
              (offer) =>
                offer.participantId === actor.id && offer.remaining > 0,
            )
          : m.submitted.includes(actor.id))
      )
        throw new AuctionError(
          sequential
            ? "現在の単位の約定後に、次の単位の価格を提示してください。"
            : "売り手は価格提示中に1回だけ送信できます。",
          409,
        );
      checkPrice(cmd.price);
      if (
        !Number.isInteger(cmd.quantity) ||
        (sequential && cmd.quantity !== 1) ||
        cmd.quantity < 1 ||
        cmd.quantity > remaining
      )
        throw new AuctionError(
          sequential
            ? "注文数量は現在の1単位だけにしてください。"
            : `数量は1〜${maximumUnits}単位で、残りの取引可能数以内にしてください。`,
        );
      const offer: PostedOffer = {
        id: randomUUID(),
        participantId: actor.id,
        alias: actor.alias,
        price: cmd.price,
        quantity: cmd.quantity,
        remaining: cmd.quantity,
      };
      if (m.posted) {
        offer.sequence = room.sequence + 1;
        offer.at = now;
      }
      m.offers.push(offer);
      if (!m.submitted.includes(actor.id)) m.submitted.push(actor.id);
      log(room, m, events, now, "posted-offer", actor.id, { ...offer });
      if (nextUnit) {
        const sequence = log(
          room,
          m,
          events,
          now,
          "offers-published",
          "system",
          { offers: [offer] },
        );
        (m.offerHistory ??= []).push({
          id: offer.id,
          participantId: actor.id,
          alias: actor.alias,
          price: offer.price,
          quantity: 1,
          round: marketRound(room, m),
          at: now,
          sequence,
        });
      }
    } else if (cmd.type === "posted-bid") {
      if (
        m.stage !== "purchase" ||
        !m.posted ||
        room.config.studyPostedMechanism !== "batch-bids-v1" ||
        actor.role !== "buyer"
      )
        throw new AuctionError(
          room.config.studyPostedMechanism === "direct-purchase-v1"
            ? "買い手は売り手の提示価格から購入してください。"
            : "買い手は共通の取引時間中に買い注文を送信できます。",
          409,
        );
      checkPrice(cmd.price);
      const reserved = m.posted.bids
        .filter((bid) => bid.participantId === actor.id)
        .reduce((sum, bid) => sum + bid.remaining, 0);
      if (
        !Number.isInteger(cmd.quantity) ||
        (studySingleUnitOrders(room.config) &&
          (cmd.quantity !== 1 || reserved > 0)) ||
        cmd.quantity < 1 ||
        cmd.quantity > remaining - reserved
      )
        throw new AuctionError(
          "注文中の数量を含め、残りの購入可能数を確認してください。",
          409,
        );
      const bid = {
        id: randomUUID(),
        participantId: actor.id,
        alias: actor.alias,
        price: cmd.price,
        quantity: cmd.quantity,
        remaining: cmd.quantity,
        at: now,
        sequence: room.sequence + 1,
      };
      m.posted.bids.push(bid);
      log(room, m, events, now, "posted-bid", actor.id, { ...bid });
    } else if (cmd.type === "posted-buy" || cmd.type === "posted-pass") {
      const direct = room.config.studyPostedMechanism === "direct-purchase-v1";
      if (
        m.stage !== "purchase" ||
        actor.role !== "buyer" ||
        (direct
          ? !m.posted || cmd.type !== "posted-buy"
          : m.posted || m.buyerOrder[m.buyerIndex] !== actor.id)
      )
        throw new AuctionError(
          direct
            ? "現在は提示価格から購入できません。"
            : "現在はあなたの購入時間ではありません。",
          409,
        );
      if (cmd.type === "posted-buy") {
        const offer = m.offers.find((o) => o.id === cmd.offerId);
        if (
          !offer ||
          (studySingleUnitOrders(room.config) && cmd.quantity !== 1) ||
          !Number.isInteger(cmd.quantity) ||
          cmd.quantity < 1 ||
          cmd.quantity > Math.min(remaining, offer.remaining)
        )
          throw new AuctionError(
            "在庫または購入可能数を確認してください。",
            409,
          );
        const seller = room.participants.find(
          (p) => p.id === offer.participantId,
        )!;
        for (let i = 0; i < cmd.quantity; i++)
          trade(room, m, actor, seller, offer.price, events, now);
        offer.remaining -= cmd.quantity;
        if (direct) {
          if (postedSupplyExhausted(room, m))
            finishMarket(room, m, events, now, "complete");
        } else if (unitsUsed(room, actor) === maximumUnits)
          nextBuyer(room, m, events, now);
      } else {
        log(room, m, events, now, "buyer-pass", actor.id);
        nextBuyer(room, m, events, now);
      }
    } else throw new AuctionError("この実験では利用できない操作です。");
  }
  room.receipts.push({ actor: actorId, requestId: request.requestId });
  sync(room);
}
