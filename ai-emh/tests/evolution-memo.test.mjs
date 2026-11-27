import assert from "node:assert/strict";
import { test } from "node:test";
import { evolutionAdapter as adapter } from "../src/evolution.mjs";

function state(overrides = {}) {
  return {
    role: "student",
    phase: "playing",
    round: 11,
    group: 1,
    now: 100,
    deadline: 1600,
    settings: {
      mode: "coordination",
      memoProtocol: "stag-hunt-memo-v3",
      names: ["Stag", "Hare"],
    },
    current: {
      round: 11,
      status: "choosing",
      position: null,
      choice: null,
      memo: {
        block: 1,
        blockRound: 11,
        groupSize: 10,
        eligible: true,
        carriedChoice: 0,
        feedback: [{ round: 10, hare: 0, size: 10 }],
        priorPay: "4",
        privateLiveChoices: [0, 1, 0],
        ...overrides,
      },
    },
  };
}

test("memo runner requests only during eligible windows and rejects stale decisions", () => {
  const open = state();
  const choice = { action: "choose", choice: 0, reason: "stay" };
  assert.equal(adapter.isActive(open), true);
  assert.equal(
    adapter.isActive(state({ eligible: false, blockRound: 10 })),
    false,
  );
  assert.equal(adapter.isActive(state({ eligible: false })), false);
  assert.deepEqual(adapter.classify(choice, open, { ...open, now: 1600 }), {
    action: null,
    skipReason: "game_inactive",
  });
  assert.deepEqual(adapter.classify(choice, open, state({ block: 2 })), {
    action: null,
    skipReason: "round_changed",
  });
  assert.deepEqual(adapter.classify(choice, open, open), {
    action: { kind: "choose", round: 11, choice: 0 },
    skipReason: null,
  });
  assert.equal(
    adapter.classify({ ...choice, choice: 2 }, open, open).skipReason,
    "invalid_decision",
  );
  assert.deepEqual(
    adapter.request(open).prompt.observation.previousGroupTrend,
    [{ round: 10, hare: 0, size: 10 }],
  );
  assert.doesNotMatch(
    JSON.stringify(adapter.request(open)),
    /privateLiveChoices/,
  );
});

test("H5 model observation has previous neighbors but no group trend or payoff", () => {
  const neighborState = state({
    neighborhood: { seat: 142, previous: [0, 1] },
  });
  neighborState.settings.memoProtocol = "stag-hunt-neighbors-h5";
  const { observation } = adapter.request(neighborState).prompt;
  assert.equal(observation.variant, "neighbors-h5");
  assert.deepEqual(observation.previousNeighborChoices, [0, 1]);
  assert.equal(observation.previousGroupTrend, undefined);
  assert.equal(observation.priorPayoff, undefined);
  assert.doesNotMatch(JSON.stringify(observation), /142|privateLiveChoices/);
});
