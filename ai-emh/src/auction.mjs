import {
  isChoice,
  isWait,
  selectionSchema,
  skip,
  submit,
} from "./selection.mjs";

const SYSTEM_PROMPT = `You are a student in a classroom double auction. Use your own values if buying and your own costs if selling. Your payoff is value minus price when buying or price minus cost when selling, plus any per-unit commission. Prices are in yen. Each available action affects one unit. CDA limit orders may immediately trade at the best opposing price. Call orders are sealed and settle at the clearing price. In Posted Offer, you may set your selling price or buy from a published offer as available to your role. Choose independently from the observed choices. Return action "choose", the zero-based choice index, an integer price from 1 to 99999 only when the choice requires a price (otherwise null), and a short reason. Return "wait" with choice and price null to take no action.`;
const SCHEMA = selectionSchema("auction_student_decision", true);
const MAX_PRICE = 99999;

function action(command, details = {}, guard = null) {
  return {
    command,
    visible: { action: command.type, ...details },
    guard,
  };
}

function bestOpposing(orders, role) {
  return orders
    .filter((order) => order.side !== role)
    .sort(
      (a, b) =>
        (role === "buyer" ? a.price - b.price : b.price - a.price) ||
        a.sequence - b.sequence,
    )[0];
}

function withinLimit(role, price, limit) {
  return role === "buyer" ? price <= limit : price >= limit;
}

function legacyChoices({ me, quotes }) {
  return Object.entries(me.limits ?? {}).flatMap(([good, limit]) => {
    if (me.used.includes(good)) return [];
    const book = quotes.filter((quote) => quote.good === good);
    const own = book.find((quote) => quote.participantId === me.id);
    const best = bestOpposing(book, me.role);
    const choices = [
      action({ type: "quote", good }, { good, limit, requiresPrice: true }),
    ];
    if (best && withinLimit(me.role, best.price, limit))
      choices.push(
        action(
          { type: "accept", quoteId: best.id },
          { good, price: best.price },
        ),
      );
    if (own)
      choices.push(
        action({ type: "cancel", good }, { good, price: own.price }, own.id),
      );
    return choices;
  });
}

function studyChoices({ config, me, study }) {
  const { market, unitLimits, unitsUsed } = study;
  const remaining = (unitLimits?.length ?? 0) - unitsUsed;
  if (remaining <= 0) return [];
  const priced = { requiresPrice: true };
  if (market.stage === "cda") {
    const choices = [action({ type: "study-quote" }, priced)];
    const best = bestOpposing(market.orders, me.role);
    const own = market.myOrders[0];
    if (best)
      choices.push(
        action(
          { type: "study-accept", orderId: best.id },
          { price: best.price },
        ),
      );
    if (own)
      choices.push(
        action({ type: "study-cancel" }, { price: own.price }, own.id),
      );
    return choices;
  }
  if (market.stage === "call")
    return market.submitted ? [] : [action({ type: "call-submit" }, priced)];
  if (me.role === "seller") {
    const nextOffer =
      market.stage === "purchase" && config.studyUnitCounts && unitsUsed > 0;
    return !market.submitted && (market.stage === "offer" || nextOffer)
      ? [action({ type: "posted-offer", quantity: 1 }, priced)]
      : [];
  }
  if (market.stage !== "purchase") return [];
  if (config.studyPostedMechanism === "batch-bids-v1") {
    const reserved = (market.posted?.bids ?? [])
      .filter((bid) => bid.participantId === me.id)
      .reduce((sum, bid) => sum + bid.remaining, 0);
    if (
      !market.posted ||
      reserved >= remaining ||
      (reserved && config.studyUnitCounts)
    )
      return [];
    return [action({ type: "posted-bid", quantity: 1 }, priced)];
  }
  const direct = config.studyPostedMechanism === "direct-purchase-v1";
  if (direct ? !market.posted : market.activeBuyer !== me.alias) return [];
  const choices = market.offers
    .filter((offer) => offer.remaining > 0)
    .sort((a, b) => a.price - b.price)
    .map((offer) =>
      action(
        { type: "posted-buy", offerId: offer.id, quantity: 1 },
        { price: offer.price, inStock: offer.remaining },
      ),
    );
  if (!direct) choices.push(action({ type: "posted-pass" }));
  return choices;
}

function choicesFor(state) {
  return state.study ? studyChoices(state) : legacyChoices(state);
}

function isActive(state) {
  const market = state?.study?.market;
  return (
    state?.phase === "running" &&
    ["buyer", "seller"].includes(state.me?.role) &&
    !state.me.withdrawnAt &&
    (market?.deadline ?? state.deadline) > state.serverTime &&
    (!market || ["cda", "call", "offer", "purchase"].includes(market.stage)) &&
    choicesFor(state).length > 0
  );
}

function position(state) {
  return {
    round: state.study?.market.round ?? state.round,
    market: state.study?.market.id ?? null,
  };
}

function observation(state, choices) {
  const { me, study } = state;
  const market = study?.market;
  // The HTTP view can include sealed Call orders. Only use the book in CDA.
  const book = market
    ? market.stage === "cda"
      ? market.orders
      : []
    : state.quotes;
  const trades = market?.trades ?? state.trades;
  return {
    role: me.role,
    ...position(state),
    institution: market?.institution ?? "legacy-cda",
    stage: market?.stage ?? "cda",
    ...(market?.stage === "call" ? { call: market.call } : {}),
    ...(study
      ? { ownUnitLimits: study.unitLimits, unitsUsed: study.unitsUsed }
      : { ownLimits: me.limits, usedGoods: me.used }),
    commission: study ? (state.config.studyCommission ?? 0) : 0,
    roundProfit: me.roundProfit,
    totalProfit: me.profit,
    book: book.map(({ side, price, good, participantId }) => ({
      side,
      price,
      ...(good ? { good } : {}),
      own: participantId === me.id,
    })),
    recentTrades: trades
      .slice(-20)
      .map(({ round, price, good, buyerId, sellerId }) => ({
        round,
        price,
        ...(good ? { good } : {}),
        own: buyerId === me.id || sellerId === me.id,
      })),
    recentClearings: (market?.clearings ?? [])
      .slice(-10)
      .map(({ round, call, price, quantity }) => ({
        round,
        call,
        price,
        quantity,
      })),
    choices: choices.map((choice) => choice.visible),
  };
}

function choiceIdentity(choice) {
  return JSON.stringify([choice.command, choice.guard]);
}

export const auctionAdapter = {
  isActive,
  isComplete: (state) =>
    state.phase === "finished" ||
    Boolean(state.me?.withdrawnAt) ||
    (state.study?.market.stage === "done" &&
      state.study.market.round >= state.config.rounds),
  position,
  target: (state) => ({
    expectedRound: position(state).round,
    expectedStage: state.study?.market.stageKey,
  }),
  key(state) {
    const choices = choicesFor(state);
    return JSON.stringify([
      state.study?.market.stageKey,
      observation(state, choices),
      choices.map(choiceIdentity),
      (state.study?.market.trades ?? state.trades).length,
    ]);
  },
  request(state) {
    const choices = choicesFor(state);
    return {
      schema: SCHEMA,
      prompt: {
        system: SYSTEM_PROMPT,
        observation: {
          ...observation(state, choices),
          secondsRemaining: Math.floor(
            ((state.study?.market.deadline ?? state.deadline) -
              state.serverTime) /
              1000,
          ),
        },
      },
    };
  },
  classify(decision, original, current) {
    if (!isActive(current)) return skip("market_inactive");
    if (
      position(current).round !== position(original).round ||
      position(current).market !== position(original).market ||
      current.study?.market.stageKey !== original.study?.market.stageKey ||
      current.study?.unitsUsed !== original.study?.unitsUsed
    )
      return skip("market_changed");
    if (isWait(decision)) return skip("model_wait");
    const choices = choicesFor(original);
    if (!isChoice(decision, choices.length)) return skip("invalid_decision");
    const selected = choices[decision.choice];
    if (
      !choicesFor(current).some(
        (choice) => choiceIdentity(choice) === choiceIdentity(selected),
      )
    )
      return skip("choice_changed");
    const { command, visible } = selected;
    if (!visible.requiresPrice)
      return decision.price === null ? submit(command) : skip("invalid_price");
    if (
      !Number.isInteger(decision.price) ||
      decision.price < 1 ||
      decision.price > MAX_PRICE ||
      (visible.limit != null &&
        !withinLimit(current.me.role, decision.price, visible.limit))
    )
      return skip("invalid_price");
    return submit(
      command.type === "call-submit"
        ? { ...command, prices: [decision.price] }
        : { ...command, price: decision.price },
    );
  },
};
