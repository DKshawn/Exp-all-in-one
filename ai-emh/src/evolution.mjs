import {
  isChoice,
  isWait,
  selectionSchema,
  skip,
  submit,
} from "./selection.mjs";

const SYSTEM_PROMPT = `You are a student playing one of the Stochastic Evolutionary Games. Maximize your own payoff. Each round draws a partner from within your group. You can make one private choice in a round. For listed options, use a zero-based option index. In coordination, matrix[row choice][column choice] gives [row payoff, column payoff]; use your assigned position. In Nash demand, you get the amount you request if the two amounts sum to at most the total, and zero otherwise. Listed amounts may be exact fractions. When choiceFormat is "thousandths", return the demand as an integer between 0 and 1000 divisible by choiceStep, for example 500 for 0.5. Your previous choices and your partners' previous choices use the same format. You are given your own previous results, never your current opponent's choice. Return action "choose" with a valid choice, or "wait" with choice null if intentionally making no choice this round. Give a short reason.`;
const SCHEMA = selectionSchema("seg_student_decision");
const DEMAND_SCALE = 1000;

function isActive(state) {
  return (
    state?.role === "student" &&
    state.phase === "playing" &&
    state.pausedAt == null &&
    state.deadline > state.now &&
    state.current?.status === "choosing" &&
    state.current.round === state.round &&
    state.current.choice === null
  );
}

function rules(settings) {
  if (settings.mode === "coordination") {
    return {
      mode: "coordination",
      options: settings.names,
      matrix: settings.matrix,
    };
  }
  const { mode, options, total } = settings;
  return options
    ? { mode, options, total }
    : {
        mode,
        total,
        choiceFormat: "thousandths",
        choiceStep: Math.round(
          Number(settings.demandStep ?? "0.001") * DEMAND_SCALE,
        ),
      };
}

function observation(state) {
  return {
    ...rules(state.settings),
    round: state.round,
    rounds: state.settings.rounds,
    position: state.current.position,
    side: state.side,
    totalPayoff: state.total,
    pastResults: state.history
      .slice(-20)
      .map(
        ({ round, position, status, choice, pay, otherChoice, otherPay }) => ({
          round,
          position,
          status,
          choice,
          payoff: pay,
          otherChoice,
          otherPayoff: otherPay,
        }),
      ),
  };
}

export const evolutionAdapter = {
  isActive,
  isComplete: (state) => state.phase === "finished",
  position: (state) => ({ round: state.round, group: state.group }),
  key: (state) => JSON.stringify([state.round, state.current.position]),
  target: () => null,
  selectedOption: (state, choice) => {
    const parameters = rules(state.settings);
    return (
      parameters.options?.[choice] ??
      (parameters.choiceFormat &&
      Number.isInteger(choice) &&
      choice >= 0 &&
      choice <= DEMAND_SCALE &&
      choice % parameters.choiceStep === 0
        ? String(choice / DEMAND_SCALE)
        : undefined)
    );
  },
  request: (state) => ({
    schema: SCHEMA,
    prompt: {
      system: SYSTEM_PROMPT,
      observation: {
        ...observation(state),
        secondsRemaining: Math.floor((state.deadline - state.now) / 1000),
      },
    },
  }),
  classify(decision, original, current) {
    if (!isActive(current)) return skip("game_inactive");
    if (
      original.round !== current.round ||
      original.group !== current.group ||
      original.current.position !== current.current.position ||
      original.settings.mode !== current.settings.mode
    )
      return skip("round_changed");
    if (isWait(decision)) return skip("model_wait");
    const parameters = rules(current.settings);
    if (
      !isChoice(decision, parameters.options?.length ?? DEMAND_SCALE + 1) ||
      (parameters.choiceFormat && decision.choice % parameters.choiceStep !== 0)
    )
      return skip("invalid_decision");
    return submit({
      kind: "choose",
      round: current.round,
      choice: decision.choice,
    });
  },
};
