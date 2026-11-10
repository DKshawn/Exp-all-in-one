export const SYSTEM_PROMPT = `You are one student in an experimental asset market. Your goal is to make trading decisions for your own score. All monetary values are yen. Each trade is for one unit. You may buy, sell, place a bid or ask, cancel your own standing bid or ask, or wait. A bid is a price you offer to pay; an ask is a price you offer to accept. You can sell only if you own units. Your tradeCash is net trading income, not a cash budget: it can be negative, and buying does not require a positive balance. Market orders buy the best ask or sell to the best bid. A bid at or above the best ask, or an ask at or below the best bid, may execute immediately. Your dividend per held unit depends on the state at the end of the round. The dividends and probabilities arrays correspond to states 1, 2 and 3 in that order. A non-null clue identifies the state that will occur in this round; it is private information. Your historical trades and outcomes are supplied if available. Think independently using only the information supplied. No other participant's private information is available. Return a JSON object with action, price and reason. action is one of wait, bid, ask, buy, sell, cancel_bid, cancel_ask. For bid or ask set price to an integer between 1 and 100000; otherwise set price to null. reason is a short explanation.`;

export const DECISION_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "emh_student_decision",
    strict: true,
    schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "wait",
            "bid",
            "ask",
            "buy",
            "sell",
            "cancel_bid",
            "cancel_ask",
          ],
        },
        price: { type: ["integer", "null"] },
        reason: { type: "string" },
      },
      required: ["action", "price", "reason"],
      additionalProperties: false,
    },
  },
};

// Construct a fresh allowlist for each participant; never pass the session or
// room object wholesale to a model, even when a teacher later reveals data.
export function observation(state) {
  const market = state.market;
  const me = market.me;
  const levels = (side) =>
    (market.orderBook?.[side] ?? [])
      .slice(0, 10)
      .map(({ price, quantity, ownQuantity }) => ({
        price,
        quantity,
        ownQuantity,
      }));
  return {
    round: market.year,
    rounds: market.rounds,
    secondsRemaining: Math.max(
      0,
      Math.floor((market.periodEndsAt - state.serverNow) / 1000),
    ),
    holdings: me.holdings,
    tradeCash: me.cash,
    totalProfit: me.totalProfit,
    dividends: market.exp2.dividends,
    probabilities: market.exp2.prior,
    clue: market.exp2.clue,
    bestBid: market.bid
      ? { price: market.bid.price, isOwn: market.bid.participantId === me.id }
      : null,
    bestAsk: market.ask
      ? { price: market.ask.price, isOwn: market.ask.participantId === me.id }
      : null,
    orderBook: { bid: levels("bid"), ask: levels("ask") },
    ownOrders: {
      bid: {
        status: market.ownQuotes.bid.status,
        price: market.ownQuotes.bid.price,
      },
      ask: {
        status: market.ownQuotes.ask.status,
        price: market.ownQuotes.ask.price,
      },
    },
    recentTrades: market.trades.slice(-20).map((trade) => ({
      round: trade.year,
      price: trade.price,
      ownSide:
        trade.buyerId === me.id
          ? "buy"
          : trade.sellerId === me.id
            ? "sell"
            : null,
    })),
    pastResults: market.results
      .filter((result) => result.year < market.year)
      .map((result) => ({
        round: result.year,
        state: result.state ?? null,
        own:
          result.payouts?.find((payout) => payout.participantId === me.id) ??
          null,
      })),
  };
}

// Exclude the ticking clock and empty unit rollover: neither changes what the
// student can trade. Keep quote identities and trade count so repeated prices
// and replacements are still recognised as market changes.
export function marketObservationKey(state) {
  const visible = observation(state);
  delete visible.secondsRemaining;
  return JSON.stringify({
    marketId: state.marketId,
    visible,
    tradeCount: state.market.trades.length,
    bestBidId: state.market.bid?.id ?? null,
    bestAskId: state.market.ask?.id ?? null,
    ownBidId: state.market.ownQuotes.bid.quoteId ?? null,
    ownAskId: state.market.ownQuotes.ask.quoteId ?? null,
  });
}

export function isActive(state) {
  const market = state?.market;
  return (
    state?.experiment === "exp2" &&
    state?.role === "student" &&
    Number.isInteger(state?.marketId) &&
    market?.experiment === "exp2" &&
    market.status === "trading" &&
    market.pausedAt == null &&
    market.me &&
    market.exp2?.dividends &&
    market.unitKey &&
    market.unitEndsAt > state.serverNow &&
    market.periodEndsAt > state.serverNow
  );
}

// Validate the model output and map it to an existing student command. Never
// invent or substitute a trading action when a response is invalid or late.
export function actionFor(decision, original, current) {
  return classifyAction(decision, original, current).action;
}

export function classifyAction(decision, original, current) {
  const skip = (skipReason) => ({ action: null, skipReason });
  const execute = (action) => ({ action, skipReason: null });
  if (!isActive(current)) return skip("market_inactive");
  if (current.marketId !== original.marketId) return skip("market_changed");
  if (current.market.unitKey !== original.market.unitKey)
    return skip("unit_changed");
  if (
    !decision ||
    typeof decision !== "object" ||
    typeof decision.reason !== "string"
  )
    return skip("invalid_decision");
  const market = current.market;
  const action = decision.action;
  if (action === "wait") return skip("model_wait");
  if (action === "bid" || action === "ask") {
    if (
      !Number.isInteger(decision.price) ||
      decision.price < 1 ||
      decision.price > 100000
    )
      return skip("invalid_price");
    if (action === "ask" && market.me.holdings <= 0)
      return skip("insufficient_holdings");
    return execute({
      kind: "quote",
      side: action,
      price: decision.price,
      unitKey: market.unitKey,
    });
  }
  if (decision.price !== null) return skip("invalid_price");
  if (action === "buy" || action === "sell") {
    const side = action === "buy" ? "ask" : "bid";
    const quote = market[side];
    const oldQuote = original.market[side];
    if (!quote) return skip("no_opposing_quote");
    if (quote.id !== oldQuote?.id) return skip("quote_changed");
    if (quote.participantId === market.me.id) return skip("own_quote");
    if (action === "sell" && market.me.holdings <= 0)
      return skip("insufficient_holdings");
    return execute({
      kind: "accept",
      side,
      quoteId: quote.id,
      unitKey: market.unitKey,
    });
  }
  if (action === "cancel_bid" || action === "cancel_ask") {
    const side = action === "cancel_bid" ? "bid" : "ask";
    const quote = market.ownQuotes[side];
    if (quote.status !== "active" || !quote.quoteId)
      return skip("no_active_order");
    if (quote.quoteId !== original.market.ownQuotes[side].quoteId)
      return skip("own_order_changed");
    return execute({
      kind: "cancel",
      side,
      quoteId: quote.quoteId,
      unitKey: market.unitKey,
    });
  }
  return skip("invalid_decision");
}
