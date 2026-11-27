import { randomUUID } from "node:crypto";
import { isValidPrice, MAX_PRICE } from "../lib/price";
import { GOODS, type GoodId } from "../lib/catalog";
import type { CommandRequest, LegacyCommand, RoomView } from "../lib/types";
import { executeStudy, settleStudy } from "./study";
import { studyView, type StudyViewCache } from "./study-view";
import {
  defaultMarketSettings,
  equilibrium,
  limitsForSeat,
  schedules,
} from "./experiment";
import { marketSettingsSchema } from "./market-settings";
import {
  AuctionError,
  emit,
  type AuditEvent,
  type Participant,
  type Room,
} from "./model";

export function settleDeadline(room: Room, now: number, events: AuditEvent[]) {
  if (room.study) return settleStudy(room, now, events);
  if (
    room.phase === "running" &&
    room.deadline !== null &&
    now >= room.deadline
  ) {
    endRound(room, room.deadline, events, "timer");
    return true;
  }
  return false;
}

function clearQuotes(
  room: Room,
  now: number,
  events: AuditEvent[],
  reason: string,
) {
  for (const q of room.quotes)
    emit(room, events, now, "cancel", q.participantId, {
      quoteId: q.id,
      good: q.good,
      price: q.price,
      reason,
    });
  room.quotes = [];
}

function endRound(
  room: Room,
  now: number,
  events: AuditEvent[],
  actor: string,
) {
  clearQuotes(room, now, events, "round-ended");
  room.phase = room.round >= room.config.rounds ? "finished" : "review";
  room.deadline = null;
  room.remainingMs = 0;
  emit(room, events, now, "round-ended", actor);
}

export function usedGoods(room: Room, id: string) {
  return room.trades
    .filter(
      (t) => t.round === room.round && (t.buyerId === id || t.sellerId === id),
    )
    .map((t) => t.good);
}

export function profit(room: Room, p: Participant, round?: number) {
  return room.trades
    .filter(
      (t) =>
        (round === undefined || t.round === round) &&
        (t.buyerId === p.id || t.sellerId === p.id),
    )
    .reduce(
      (sum, t) =>
        sum +
        (p.role === "buyer"
          ? p.limits[t.good] - t.price
          : t.price - p.limits[t.good]),
      0,
    );
}

function verifyPrice(p: Participant, good: GoodId, price: number) {
  if (!isValidPrice(price))
    throw new AuctionError(`価格は 1〜${MAX_PRICE} の整数で入力してください。`);
  if (
    (p.role === "buyer" && price > p.limits[good]) ||
    (p.role === "seller" && price < p.limits[good])
  ) {
    throw new AuctionError(
      p.role === "buyer"
        ? "自分の価値を超える価格では買えません。"
        : "自分の費用を下回る価格では売れません。",
    );
  }
}

export function execute(
  room: Room,
  actor: Participant | "teacher",
  request: CommandRequest,
  now: number,
  events: AuditEvent[],
) {
  if (room.study) return executeStudy(room, actor, request, now, events);
  const actorId = actor === "teacher" ? "teacher" : actor.id;
  // Retries return the current authorized snapshot, without replaying the mutation.
  if (
    room.receipts.some(
      (r) => r.actor === actorId && r.requestId === request.requestId,
    )
  )
    return;
  if (request.expectedRound !== room.round)
    throw new AuctionError(
      "ラウンドが切り替わりました。画面を確認して操作し直してください。",
      409,
    );
  if (
    ![
      "quote",
      "cancel",
      "accept",
      "update-markets",
      "start",
      "pause",
      "resume",
      "end-round",
      "finish",
    ].includes(request.command.type)
  )
    throw new AuctionError("この実験では利用できない操作です。");
  const cmd = request.command as LegacyCommand;
  if (cmd.type === "update-markets") {
    if (actor !== "teacher")
      throw new AuctionError("この操作は教員のみ利用できます。", 403);
    if (room.phase !== "waiting" || room.round !== 0)
      throw new AuctionError(
        "価値と費用を変更できるのは、実験開始前だけです。",
        409,
      );
    if (cmd.expectedRevision !== (room.settingsRevision ?? 0))
      throw new AuctionError(
        "別の画面で設定が更新されました。最新の設定を確認して編集し直してください。",
        409,
      );
    const parsed = marketSettingsSchema.safeParse(cmd.settings);
    if (!parsed.success)
      throw new AuctionError(
        `各商品の価値と費用を6つずつ、1〜${MAX_PRICE}の整数で設定してください。`,
      );
    room.marketSettings = parsed.data;
    room.settingsRevision = (room.settingsRevision ?? 0) + 1;
    for (const participant of room.participants)
      participant.limits = limitsForSeat(
        participant.seat,
        room.config.capacity,
        room.marketSettings,
      );
    emit(room, events, now, "market-settings-updated", actorId, {
      marketSettings: room.marketSettings,
      settingsRevision: room.settingsRevision,
    });
  } else if (
    ["start", "pause", "resume", "end-round", "finish"].includes(cmd.type)
  ) {
    if (actor !== "teacher")
      throw new AuctionError("この操作は教員のみ利用できます。", 403);
    if (cmd.type === "start") {
      if (
        !["waiting", "review"].includes(room.phase) ||
        room.round >= room.config.rounds
      )
        throw new AuctionError("今は次のラウンドを開始できません。", 409);
      if (room.participants.length !== room.config.capacity)
        throw new AuctionError(
          `参加者が ${room.config.capacity} 人そろうと開始できます。`,
          409,
        );
      room.round++;
      room.phase = "running";
      room.remainingMs = room.config.duration * 1000;
      room.deadline = now + room.remainingMs;
      emit(room, events, now, "round-started", actorId);
    } else if (cmd.type === "pause") {
      if (room.phase !== "running")
        throw new AuctionError("取引中のラウンドのみ一時停止できます。", 409);
      room.remainingMs = Math.max(0, room.deadline! - now);
      room.deadline = null;
      room.phase = "paused";
      emit(room, events, now, "paused", actorId);
    } else if (cmd.type === "resume") {
      if (room.phase !== "paused")
        throw new AuctionError("現在、一時停止していません。", 409);
      room.phase = "running";
      room.deadline = now + room.remainingMs;
      emit(room, events, now, "resumed", actorId);
    } else if (cmd.type === "end-round") {
      if (!["running", "paused"].includes(room.phase))
        throw new AuctionError("進行中のラウンドがありません。", 409);
      endRound(room, now, events, actorId);
    } else if (cmd.type === "finish") {
      if (room.phase === "finished")
        throw new AuctionError("実験はすでに終了しています。", 409);
      clearQuotes(room, now, events, "experiment-ended");
      room.phase = "finished";
      room.deadline = null;
      room.remainingMs = 0;
      emit(room, events, now, "experiment-ended", actorId);
    }
  } else {
    if (actor === "teacher")
      throw new AuctionError("教員は取引できません。", 403);
    if (room.phase !== "running")
      throw new AuctionError("現在は取引時間外です。", 409);
    if (cmd.type === "cancel") {
      const old = room.quotes.find(
        (q) => q.participantId === actor.id && q.good === cmd.good,
      );
      if (old) {
        room.quotes = room.quotes.filter((q) => q.id !== old.id);
        emit(room, events, now, "cancel", actor.id, {
          quoteId: old.id,
          good: old.good,
          price: old.price,
          reason: "participant",
        });
      }
    } else {
      const standing =
        cmd.type === "accept"
          ? room.quotes.find((q) => q.id === cmd.quoteId)
          : undefined;
      if (cmd.type === "accept" && (!standing || standing.side === actor.role))
        throw new AuctionError(
          "その注文はすでに取り消されたか、約定済みです。",
          409,
        );
      const good = cmd.type === "quote" ? cmd.good : standing!.good;
      const price = cmd.type === "quote" ? cmd.price : standing!.price;
      if (usedGoods(room, actor.id).includes(good))
        throw new AuctionError(
          "この商品の今ラウンドの取引は完了しています。",
          409,
        );
      verifyPrice(actor, good, price);
      const opposite = room.quotes
        .filter((q) => q.good === good && q.side !== actor.role)
        .sort(
          (a, b) =>
            (actor.role === "buyer" ? a.price - b.price : b.price - a.price) ||
            a.sequence - b.sequence,
        )[0];
      // A stale accept never falls through to a new limit order or a worse price.
      if (cmd.type === "accept" && opposite?.id !== standing?.id)
        throw new AuctionError(
          "最良気配が更新されました。価格を確認して操作し直してください。",
          409,
        );
      const old = room.quotes.find(
        (q) => q.participantId === actor.id && q.good === good,
      );
      if (old) {
        room.quotes = room.quotes.filter((q) => q.id !== old.id);
        emit(room, events, now, "cancel", actor.id, {
          quoteId: old.id,
          good,
          price: old.price,
          reason: "replace",
        });
      }
      const id = randomUUID();
      const sequence = emit(room, events, now, cmd.type, actor.id, {
        quoteId: id,
        good,
        side: actor.role,
        price,
        targetQuoteId: standing?.id ?? null,
      });
      const crosses =
        opposite &&
        (actor.role === "buyer"
          ? price >= opposite.price
          : price <= opposite.price);
      if (crosses) {
        const counterparty = room.participants.find(
          (p) => p.id === opposite.participantId,
        )!;
        if (usedGoods(room, counterparty.id).includes(good))
          throw new Error("Invariant: filled participant has a standing quote");
        verifyPrice(counterparty, good, opposite.price);
        const buyer = actor.role === "buyer" ? actor : counterparty;
        const seller = actor.role === "seller" ? actor : counterparty;
        room.quotes = room.quotes.filter((q) => q.id !== opposite.id);
        const tradeId = randomUUID();
        const tradeSequence = emit(room, events, now, "trade", actor.id, {
          tradeId,
          good,
          price: opposite.price,
          buyerId: buyer.id,
          sellerId: seller.id,
          restingQuoteId: opposite.id,
          incomingQuoteId: id,
        });
        room.trades.push({
          id: tradeId,
          sequence: tradeSequence,
          good,
          price: opposite.price,
          buyerId: buyer.id,
          sellerId: seller.id,
          buyerAlias: buyer.alias,
          sellerAlias: seller.alias,
          round: room.round,
          at: now,
        });
      } else {
        room.quotes.push({
          id,
          sequence,
          participantId: actor.id,
          alias: actor.alias,
          side: actor.role,
          good,
          price,
          at: now,
          round: room.round,
        });
      }
    }
  }
  room.receipts.push({ actor: actorId, requestId: request.requestId });
  // Retain every receipt so delayed retries from earlier rounds remain idempotent.
}

export function toView(
  room: Room,
  actor: Participant | "teacher",
  now: number,
  mode: "local" | "online",
  cache?: StudyViewCache,
): RoomView {
  if (room.study) return studyView(room, actor, now, mode, cache);
  const view: RoomView = {
    code: room.code,
    config: room.config,
    phase: room.phase,
    round: room.round,
    version: room.version,
    deadline: room.deadline,
    remainingMs:
      room.phase === "running"
        ? Math.max(0, room.deadline! - now)
        : room.remainingMs,
    serverTime: now,
    participantCount: room.participants.length,
    quotes: room.quotes,
    trades: room.trades,
    mode,
    me:
      actor === "teacher"
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
            role: actor.role,
            limits: actor.limits,
            used: usedGoods(room, actor.id),
            profit: profit(room, actor),
            roundProfit: profit(room, actor, room.round),
          },
  };
  if (actor === "teacher") {
    const schedule = schedules(room.config.capacity, room.marketSettings);
    const equilibria = Object.fromEntries(
      GOODS.map(({ id }) => [
        id,
        equilibrium(schedule[id].values, schedule[id].costs),
      ]),
    ) as NonNullable<RoomView["teacher"]>["equilibria"];
    const metrics = Object.fromEntries(
      GOODS.map(({ id }) => [
        id,
        Array.from({ length: room.round }, (_, i) => {
          const trades = room.trades.filter(
            (t) => t.good === id && t.round === i + 1,
          );
          const eq = equilibria[id];
          const surplus = trades.reduce(
            (sum, t) =>
              sum +
              room.participants.find((p) => p.id === t.buyerId)!.limits[id] -
              room.participants.find((p) => p.id === t.sellerId)!.limits[id],
            0,
          );
          return {
            round: i + 1,
            quantity: trades.length,
            mean: trades.length
              ? trades.reduce((s, t) => s + t.price, 0) / trades.length
              : null,
            deviation: trades.length
              ? trades.reduce(
                  (s, t) =>
                    s + Math.max(eq.low - t.price, 0, t.price - eq.high),
                  0,
                ) / trades.length
              : null,
            efficiency: eq.surplus ? (surplus / eq.surplus) * 100 : null,
          };
        }),
      ]),
    ) as NonNullable<RoomView["teacher"]>["metrics"];
    view.teacher = {
      marketSettings: room.marketSettings ?? defaultMarketSettings(),
      settingsRevision: room.settingsRevision ?? 0,
      participants: room.participants.map((p) => ({
        id: p.id,
        alias: p.alias,
        nickname: p.nickname,
        role: p.role,
        limits: p.limits,
        profit: profit(room, p),
      })),
      equilibria,
      metrics,
      schedules: schedule,
    };
  }
  return view;
}
