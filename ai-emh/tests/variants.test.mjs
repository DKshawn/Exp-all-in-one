import assert from "node:assert/strict";
import test from "node:test";
import { auctionAdapter } from "../src/auction.mjs";
import { emhAdapter } from "../src/decision.mjs";
import { evolutionAdapter } from "../src/evolution.mjs";

const choose = (choice, price = null) => ({
  action: "choose",
  choice,
  price,
  reason: "test",
});

function auction(stage = "cda", role = "buyer") {
  return {
    phase: "running",
    serverTime: 1000,
    config: { rounds: 2, studyUnitCounts: { cda: 2 } },
    me: { role, id: "self", alias: "Self", profit: 0, roundProfit: 0 },
    study: {
      unitLimits: [100, 90],
      unitsUsed: 0,
      market: {
        id: 1,
        round: 1,
        stage,
        stageKey: `1:${stage}:1`,
        deadline: 31500,
        institution: stage === "call" || stage === "cda" ? stage : "posted",
        orders: [],
        myOrders: [],
        offers: [],
        trades: [],
        clearings: [],
        submitted: false,
      },
    },
  };
}

test("EMH Experiment 1 uses its own fixed A/B dividends and the existing EMH student action", () => {
  const state = {
    role: "student",
    marketId: 1,
    serverNow: 1000,
    market: {
      status: "trading",
      year: 2,
      period: "B",
      rounds: 6,
      unitKey: "2:B:1",
      unitEndsAt: 31000,
      periodEndsAt: 240000,
      me: {
        id: "self",
        holdings: 2,
        cash: -50,
        dividend: 30,
        dividends: { a: 15, b: 5, hidden: "do not send" },
      },
      ownQuotes: { bid: {}, ask: {} },
      trades: [],
      results: [
        {
          year: 2,
          period: "A",
          payouts: [
            { participantId: "self", dividend: 30 },
            { participantId: "another-student", dividend: 999 },
          ],
        },
      ],
    },
  };
  assert.ok(emhAdapter.isActive(state));
  const { observation } = emhAdapter.request(state).prompt;
  assert.deepEqual(observation.dividends, { a: 15, b: 5 });
  assert.equal(observation.period, "B");
  assert.equal(observation.pastResults[0].own.dividend, 30);
  assert.doesNotMatch(
    JSON.stringify(observation),
    /another-student|clue|hidden/,
  );
  assert.deepEqual(
    emhAdapter.classify(
      { action: "bid", price: 4, reason: "test" },
      state,
      state,
    ).action,
    { kind: "quote", side: "bid", price: 4, unitKey: "2:B:1" },
  );
});

test("Double Auction CDA follows price/time priority and rejects a replaced order or stage", () => {
  const state = auction();
  state.study.market.orders = [
    {
      id: "later",
      price: 80,
      side: "seller",
      sequence: 3,
      participantId: "hidden-id",
    },
    {
      id: "first",
      price: 80,
      side: "seller",
      sequence: 1,
      participantId: "hidden-id",
    },
  ];
  const { observation } = auctionAdapter.request(state).prompt;
  assert.doesNotMatch(
    JSON.stringify(observation),
    /hidden-id|participantId|first/,
  );
  const accept = choose(1);
  assert.deepEqual(auctionAdapter.classify(accept, state, state).action, {
    type: "study-accept",
    orderId: "first",
  });
  const current = structuredClone(state);
  current.study.market.orders.pop();
  assert.equal(
    auctionAdapter.classify(accept, state, current).skipReason,
    "choice_changed",
  );
  current.study.market.stageKey = "1:cda:2";
  assert.equal(
    auctionAdapter.classify(accept, state, current).skipReason,
    "market_changed",
  );
  current.phase = "paused";
  assert.equal(
    auctionAdapter.classify(accept, state, current).skipReason,
    "market_inactive",
  );
});

test("Call Market keeps other sealed orders out of prompts and submits one price per call", () => {
  const state = auction("call");
  state.study.market.orders.push({
    id: "sealed-order",
    price: 54321,
    side: "seller",
  });
  assert.doesNotMatch(
    JSON.stringify(auctionAdapter.request(state).prompt.observation),
    /sealed-order|54321/,
  );
  assert.deepEqual(
    auctionAdapter.classify(choose(0, 90), state, state).action,
    {
      type: "call-submit",
      prices: [90],
    },
  );
  state.study.market.submitted = true;
  assert.equal(auctionAdapter.isActive(state), false);
});

test("Posted Offer supports seller quotes and published purchases without buying expired stock", () => {
  const seller = auction("offer", "seller");
  seller.config.studyPostedMechanism = "direct-purchase-v1";
  assert.deepEqual(
    auctionAdapter.classify(choose(0, 90), seller, seller).action,
    {
      type: "posted-offer",
      price: 90,
      quantity: 1,
    },
  );
  const buyer = auction("purchase");
  buyer.config.studyPostedMechanism = "direct-purchase-v1";
  buyer.study.market.posted = { bids: [] };
  buyer.study.market.offers = [
    { id: "published-offer", price: 90, remaining: 1 },
    { id: "other-offer", price: 95, remaining: 1 },
  ];
  assert.deepEqual(auctionAdapter.classify(choose(0), buyer, buyer).action, {
    type: "posted-buy",
    offerId: "published-offer",
    quantity: 1,
  });
  const sold = structuredClone(buyer);
  sold.study.market.offers[0].remaining = 0;
  assert.equal(
    auctionAdapter.classify(choose(0), buyer, sold).skipReason,
    "choice_changed",
  );
  buyer.config.studyPostedMechanism = "batch-bids-v1";
  assert.deepEqual(
    auctionAdapter.classify(choose(0, 95), buyer, buyer).action,
    {
      type: "posted-bid",
      price: 95,
      quantity: 1,
    },
  );
});

test("old three-good CDA rooms use their private per-good limits", () => {
  const state = {
    ...auction(),
    study: undefined,
    round: 2,
    deadline: 30000,
    me: {
      id: "self",
      role: "buyer",
      limits: { apple: 100, orange: 90 },
      used: ["orange"],
    },
    quotes: [],
    trades: [],
  };
  assert.deepEqual(
    auctionAdapter.classify(choose(0, 80), state, state).action,
    {
      type: "quote",
      good: "apple",
      price: 80,
    },
  );
  assert.equal(
    auctionAdapter.classify(choose(0, 101), state, state).skipReason,
    "invalid_price",
  );
});

for (const mode of ["coordination", "demand"]) {
  test(`SEG ${mode} exposes the choice rules and accepts one in-range response for the current round`, () => {
    const state = {
      role: "student",
      phase: "playing",
      round: 2,
      group: 1,
      now: 1000,
      deadline: 12000,
      settings: {
        mode,
        rounds: 10,
        names: ["Stag", "Hare"],
        matrix: [
          [
            ["4", "4"],
            ["0", "3"],
          ],
          [
            ["3", "0"],
            ["2", "2"],
          ],
        ],
        total: "1",
        options: ["1/3", "1/2", "2/3"],
      },
      current: {
        status: "choosing",
        round: 2,
        position: "column",
        choice: null,
        otherChoice: "PRIVATE",
      },
      history: [],
    };
    const { observation } = evolutionAdapter.request(state).prompt;
    assert.equal(observation.mode, mode);
    assert.equal(observation.position, "column");
    assert.doesNotMatch(JSON.stringify(observation), /PRIVATE/);
    assert.deepEqual(
      evolutionAdapter.classify(choose(1), state, state).action,
      {
        kind: "choose",
        round: 2,
        choice: 1,
      },
    );
    assert.equal(
      evolutionAdapter.classify(choose(4), state, state).skipReason,
      "invalid_decision",
    );
    const next = {
      ...state,
      round: 3,
      current: { ...state.current, round: 3 },
    };
    assert.equal(
      evolutionAdapter.classify(choose(1), state, next).skipReason,
      "round_changed",
    );
    state.current.choice = 1;
    assert.equal(evolutionAdapter.isActive(state), false);
  });
}

test("SEG continuous demand uses thousandths and rejects off-step answers", () => {
  const state = {
    role: "student",
    phase: "playing",
    round: 1,
    group: 1,
    now: 1000,
    deadline: 12000,
    settings: { mode: "demand", total: "1", demandStep: "0.1", rounds: 1 },
    current: { status: "choosing", round: 1, position: "row", choice: null },
    history: [],
  };
  const { observation } = evolutionAdapter.request(state).prompt;
  assert.equal(observation.choiceFormat, "thousandths");
  assert.equal(observation.choiceStep, 100);
  assert.deepEqual(
    evolutionAdapter.classify(choose(500), state, state).action,
    { kind: "choose", round: 1, choice: 500 },
  );
  assert.equal(evolutionAdapter.selectedOption(state, 500), "0.5");
  assert.equal(
    evolutionAdapter.classify(choose(501), state, state).skipReason,
    "invalid_decision",
  );
  assert.equal(
    evolutionAdapter.classify(choose(1100), state, state).skipReason,
    "invalid_decision",
  );
  delete state.settings.demandStep;
  assert.equal(
    evolutionAdapter.classify(choose(501), state, state).action.choice,
    501,
  );
});
