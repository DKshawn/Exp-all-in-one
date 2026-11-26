import { equilibrium } from "./equilibrium";
import { studyAllocationPreview } from "./study-allocation";
import type { Institution, StudyMarketView, StudyMetric } from "./study-types";
import type { RoomView } from "./types";
import type { Participant, Room } from "./auction-model";
import {
  studyPeriodAt,
  studyMarketId,
  studyInstitutions,
} from "./study-config";
import { studyTradeProfit } from "./study-commission";
import { postedBookOrders } from "./posted-auction";
import {
  institutionFor,
  marketFor,
  marketRound,
  stageKey,
  studyProfit,
  unitLimits,
  settingsForInstitution,
  unitsUsed,
  type StudyMarket,
} from "./study-core";

export const studyEquilibrium = (
  room: Room,
  institution: Institution = "cda",
  market?: number,
) => {
  const settings = settingsForInstitution(room, institution, market);
  return equilibrium(settings.values.flat(), settings.costs.flat());
};
export function studyMetrics(room: Room, now: number): StudyMetric[] {
  return room.study!.markets.flatMap((m) =>
    m.periods.map((p) => {
      const eq = studyEquilibrium(room, p.institution, m.id),
        benchmark = (eq.low + eq.high) / 2;
      const trades = m.trades.filter((t) => t.round === p.round),
        n = trades.length;
      const surplus = trades.reduce((sum, t) => sum + t.value - t.cost, 0);
      const dt =
        room.phase === "running" &&
        m.stage === "cda" &&
        p.completion === "running" &&
        m.spreadValue !== null
          ? Math.max(0, Math.min(now, m.deadline!) - m.spreadAt)
          : 0;
      const spreadMs = p.spreadMs + dt,
        spreadArea = p.spreadArea + dt * (m.spreadValue ?? 0);
      return {
        market: m.id,
        round: p.round,
        institution: p.institution,
        institutionPeriod: studyPeriodAt(room.config, m.order, p.round).period,
        completion: p.completion,
        quantity: n,
        quantityRatio: eq.quantity ? n / eq.quantity : null,
        mean: n ? trades.reduce((s, t) => s + t.price, 0) / n : null,
        deviation: n
          ? trades.reduce(
              (s, t) => s + Math.max(eq.low - t.price, 0, t.price - eq.high),
              0,
            ) / n
          : null,
        alpha: n
          ? Math.sqrt(
              trades.reduce((s, t) => s + (t.price - benchmark) ** 2, 0) / n,
            ) / benchmark
          : null,
        surplus,
        commissionPaid: trades.reduce(
          (sum, t) => sum + 2 * (t.commission ?? 0),
          0,
        ),
        efficiency: eq.surplus ? (100 * surplus) / eq.surplus : null,
        inefficientTrades: trades.filter((t) => t.value < t.cost).length,
        spread: spreadMs ? spreadArea / spreadMs : null,
        spreadObservedMs: spreadMs,
      };
    }),
  );
}
export function convergenceSlopes(metrics: StudyMetric[]) {
  const keys = [...new Set(metrics.map((m) => `${m.market}:${m.institution}`))];
  return keys.map((key) => {
    const [marketString, institutionString] = key.split(":"),
      market = Number(marketString),
      institution = institutionString as Institution;
    const rows = metrics.filter(
      (m) =>
        m.market === market &&
        m.institution === institution &&
        m.completion === "complete" &&
        m.alpha !== null,
    );
    const n = rows.length,
      x = n ? rows.reduce((s, m) => s + m.institutionPeriod, 0) / n : 0,
      y = n ? rows.reduce((s, m) => s + m.alpha!, 0) / n : 0;
    const denominator = rows.reduce(
      (s, m) => s + (m.institutionPeriod - x) ** 2,
      0,
    );
    return {
      market,
      institution,
      n,
      slope:
        n > 1 && denominator
          ? rows.reduce(
              (s, m) => s + (m.institutionPeriod - x) * (m.alpha! - y),
              0,
            ) / denominator
          : null,
    };
  });
}
type PublicMarket = Omit<StudyMarketView, "myOrders" | "submitted" | "myOffer">;
// One cache per feed. Public projections never contain a student's private fields.
export class StudyViewCache {
  markets = new Map<string, PublicMarket>();
  orders = new WeakMap<object, StudyMarketView["orderHistory"][number]>();
  trades = new WeakMap<object, StudyMarketView["trades"][number]>();
  legacyTrades = new WeakMap<object, RoomView["trades"]>();
  begin() {
    this.markets.clear();
  }
}
function publicMarket(
  room: Room,
  m: StudyMarket,
  actor: Participant | "teacher",
  now: number,
  participantCount: number,
  cache?: StudyViewCache,
): StudyMarketView {
  const isTeacher = actor === "teacher",
    id = isTeacher ? "teacher" : actor.id;
  const period = studyPeriodAt(room.config, m.order, marketRound(room, m));
  const firstPeriod = period.first;
  const visible = (round: number) =>
    isTeacher || (round >= firstPeriod && round <= period.last);
  const key = `${m.id}:${isTeacher ? "all" : firstPeriod}:${room.version}:${now}`;
  const postedPurchase = m.stage === "purchase" && m.posted;
  const deadline = postedPurchase ? postedPurchase.endsAt : m.deadline;
  const common: PublicMarket = cache?.markets.get(key) ?? {
    id: m.id,
    round: marketRound(room, m),
    periodStartedAt: m.periods.find(
      (period) => period.round === marketRound(room, m),
    )?.startedAt,
    order: m.order,
    institution: institutionFor(room, m),
    institutionPeriod: period.period,
    stage: m.stage,
    stageKey: stageKey(room, m),
    deadline,
    remainingMs:
      room.phase === "running" && deadline !== null
        ? Math.max(0, deadline - now)
        : postedPurchase
          ? postedPurchase.remainingMs
          : m.remainingMs,
    call: m.call,
    participantCount,
    activeBuyer:
      m.stage === "purchase" && !m.posted
        ? (room.participants.find((p) => p.id === m.buyerOrder[m.buyerIndex])
            ?.alias ?? null)
        : null,
    // Stable transport order avoids moving every row when one trader requotes.
    // The matching engine and displayed book still use price/time priority.
    orders:
      m.stage === "cda" || m.stage === "call"
        ? m.orders
            .map(
              ({
                id,
                participantId,
                alias,
                side,
                price,
                unit,
                sequence,
                at,
              }) => ({
                id,
                participantId,
                alias,
                side,
                price,
                unit,
                sequence,
                at,
              }),
            )
            .sort(
              (a, b) =>
                a.participantId.localeCompare(b.participantId) ||
                a.unit - b.unit,
            )
        : postedPurchase
          ? postedBookOrders(postedPurchase.bids, m.offers)
          : [],
    ...(m.posted
      ? {
          posted: {
            batch: m.posted.batch,
            bids: m.posted.bids
              .filter((bid) => bid.remaining > 0)
              .map(
                ({
                  id,
                  participantId,
                  alias,
                  price,
                  quantity,
                  remaining,
                  sequence,
                  at,
                }) => ({
                  id,
                  participantId,
                  alias,
                  price,
                  quantity,
                  remaining,
                  sequence,
                  at,
                }),
              ),
          },
        }
      : {}),
    orderHistory: (m.orderHistory ?? [])
      .filter((o) => visible(o.round))
      .map((o) => {
        const cached = cache?.orders.get(o);
        if (cached) return cached;
        const value = {
          id: o.id,
          participantId: o.participantId,
          alias: o.alias,
          side: o.side,
          price: o.price,
          unit: o.unit,
          sequence: o.sequence,
          at: o.at,
          round: o.round,
          status: o.status,
          closedAt: o.closedAt,
          closedSequence: o.closedSequence,
        };
        cache?.orders.set(o, value);
        return value;
      }),
    // Keep one published card per seller while the next unit is being repriced.
    // Purchase validation still uses the exact offer ID and its remaining stock.
    offers: ["purchase", "done"].includes(m.stage)
      ? room.config.studyPostedMechanism === "direct-purchase-v1"
        ? [
            ...new Map(
              m.offers.map((offer) => [offer.participantId, offer]),
            ).values(),
          ]
        : m.offers.filter((o) => o.remaining > 0)
      : [],
    offerHistory: (m.offerHistory ?? [])
      .filter((offer) => visible(offer.round))
      .map((offer) => ({
        id: offer.id,
        participantId: offer.participantId,
        alias: offer.alias,
        price: offer.price,
        quantity: offer.quantity,
        round: offer.round,
        at: offer.at,
        sequence: offer.sequence,
      })),
    clearings: m.clearings.filter((c) => visible(c.round)),
    // Explicit projection: other participants' values and costs never enter a student response.
    trades: m.trades
      .filter((t) => visible(t.round))
      .map((t) => {
        const cached = cache?.trades.get(t);
        if (cached) return cached;
        const value = {
          id: t.id,
          sequence: t.sequence,
          at: t.at,
          round: t.round,
          market: t.market,
          institution: t.institution,
          call: t.call,
          price: t.price,
          buyerId: t.buyerId,
          sellerId: t.sellerId,
          buyerAlias: t.buyerAlias,
          sellerAlias: t.sellerAlias,
          buyerUnit: t.buyerUnit,
          sellerUnit: t.sellerUnit,
          commission: t.commission ?? 0,
        };
        cache?.trades.set(t, value);
        return value;
      }),
  };
  cache?.markets.set(key, common);
  return {
    ...common,
    myOrders: isTeacher
      ? []
      : (m.posted ? common.orders : m.orders).filter(
          (o) => o.participantId === id,
        ),
    submitted:
      institutionFor(room, m) === "posted" && room.config.studyUnitCounts
        ? m.offers.some(
            (offer) => offer.participantId === id && offer.remaining > 0,
          )
        : m.submitted.includes(id),
    myOffer: m.offers.findLast((o) => o.participantId === id) ?? null,
  };
}
export function studyView(
  room: Room,
  actor: Participant | "teacher",
  now: number,
  mode: "local" | "online",
  cache?: StudyViewCache,
): RoomView {
  const study = room.study!,
    teacher = actor === "teacher",
    market = teacher ? study.markets[0] : marketFor(room, actor);
  const counts = new Map<number, number>();
  for (const participant of room.participants) {
    if (participant.withdrawnAt) continue;
    const id = studyMarketId(room.config, participant.seat);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const publicState = publicMarket(
    room,
    market,
    actor,
    now,
    counts.get(market.id) ?? 0,
    cache,
  );
  const myTradeNotifications = teacher
    ? []
    : market.trades
        .filter((t) => t.buyerId === actor.id || t.sellerId === actor.id)
        .map((t) => ({
          id: t.id,
          round: t.round,
          institution: t.institution,
          price: t.price,
          unit: t.buyerId === actor.id ? t.buyerUnit : t.sellerUnit,
          profit: studyTradeProfit(
            t,
            t.buyerId === actor.id ? "buyer" : "seller",
          ),
          commission: t.commission ?? 0,
        }));
  let legacyTrades = cache?.legacyTrades.get(publicState.trades);
  if (!legacyTrades) {
    legacyTrades = publicState.trades.map((t) => ({ ...t, good: "apple" }));
    cache?.legacyTrades.set(publicState.trades, legacyTrades);
  }
  const view: RoomView = {
    code: room.code,
    config: room.config,
    phase: room.phase,
    round: teacher
      ? Math.max(...study.markets.map((m) => marketRound(room, m)))
      : publicState.round,
    version: room.version,
    deadline: teacher ? room.deadline : publicState.deadline,
    remainingMs: teacher ? room.remainingMs : publicState.remainingMs,
    serverTime: now,
    participantCount:
      room.participantCount ??
      room.participants.filter((p) => !p.withdrawnAt).length,
    quotes: [],
    trades: legacyTrades,
    mode,
    me: teacher
      ? {
          id: "teacher",
          alias: "教員",
          nickname: "教員",
          role: "teacher",
          limits: null,
          used: [],
          profit: 0,
          roundProfit: 0,
        }
      : {
          id: actor.id,
          alias: actor.alias,
          nickname: actor.nickname,
          ...(actor.withdrawnAt ? { withdrawnAt: actor.withdrawnAt } : {}),
          role: actor.role,
          limits: null,
          used: [],
          profit: studyProfit(room, actor),
          roundProfit: studyProfit(room, actor, publicState.round),
        },
    study: {
      protocol: study.protocol,
      ...(study.lobby
        ? {
            lobby: {
              ...study.lobby,
              ...(study.lobby.admission
                ? {
                    admission: {
                      ...study.lobby.admission,
                      ...(!teacher && study.lobby.admission.error
                        ? { error: "教員による条件の確認をお待ちください。" }
                        : {}),
                    },
                  }
                : {}),
            },
          }
        : {}),
      marketCount: room.config.markets ?? study.markets.length,
      settingsRevision: study.revision,
      market: publicState,
      unitLimits:
        teacher || (study.lobby && room.phase === "waiting")
          ? null
          : unitLimits(room, actor),
      ...(!teacher &&
      market.stage === "feedback" &&
      publicState.round < room.config.rounds
        ? {
            nextConditions: {
              institution: studyPeriodAt(
                room.config,
                market.order,
                publicState.round + 1,
              ).institution,
              unitLimits: unitLimits(
                room,
                actor,
                studyPeriodAt(room.config, market.order, publicState.round + 1)
                  .institution,
              ),
            },
          }
        : {}),
      unitsUsed: teacher ? 0 : unitsUsed(room, actor),
      myTrades: myTradeNotifications.filter(
        (t) => t.institution === publicState.institution,
      ),
      myTradeNotifications,
    },
  };
  if (teacher) {
    const allocation =
      room.phase === "waiting" && room.round === 0
        ? studyAllocationPreview(room)
        : null;
    if (allocation && view.study!.lobby?.admission)
      view.study!.lobby.admission.targetMarkets = allocation.requestedMarkets;
    const metrics = studyMetrics(room, now);
    view.study!.teacher = {
      ...(allocation ? { allocation } : {}),
      settings: study.settings,
      ...(study.otherSettings ? { otherSettings: study.otherSettings } : {}),
      ...(study.conditionsByInstitution
        ? {
            settingsByInstitution: Object.fromEntries(
              studyInstitutions(room.config).map((i) => [
                i,
                settingsForInstitution(room, i),
              ]),
            ),
          }
        : {}),
      ...(study.generation ? { generation: study.generation } : {}),
      markets: study.markets.map((m) =>
        publicMarket(room, m, actor, now, counts.get(m.id) ?? 0, cache),
      ),
      participants: room.participants.map((p, i) => ({
        id: p.id,
        market: studyMarketId(room.config, p.seat),
        nickname: p.nickname,
        alias: p.alias,
        role: p.role,
        limits: unitLimits(room, p),
        profit: studyProfit(room, p),
        joinOrder: i + 1,
        joinedAt: p.joinedAt,
        ...(p.withdrawnAt ? { withdrawnAt: p.withdrawnAt } : {}),
      })),
      metrics,
      slopes: convergenceSlopes(metrics),
      equilibrium: studyEquilibrium(room),
      marketEquilibria: Object.fromEntries(
        study.markets.map((m) => [
          m.id,
          {
            cda: studyEquilibrium(room, "cda", m.id),
            call: studyEquilibrium(room, "call", m.id),
            posted: studyEquilibrium(room, "posted", m.id),
          },
        ]),
      ),
      equilibria: {
        cda: studyEquilibrium(room, "cda"),
        call: studyEquilibrium(room, "call"),
        posted: studyEquilibrium(room, "posted"),
      },
    };
  }
  return view;
}
