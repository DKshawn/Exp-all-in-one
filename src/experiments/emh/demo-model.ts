import { addParticipant, advanceClock, newRoom } from "./engine";
import { allocationPlan } from "./allocation";
import {
  settingsForExperiment,
  type EmhSettings,
  type Exp2Options,
} from "./settings";
import type { Participant, Room } from "./types";

export const PRACTICE_EXP2_OPTIONS: Exp2Options = {
  emptyUnitsLimit: 2,
  insiderStartRound: 3,
  insiderCountPerType: 2,
  marketCount: null,
  states: {
    prior: [0.35, 0.42, 0.23],
    dividends: [
      [80, 110, 170],
      [60, 180, 100],
      [140, 120, 90],
    ],
  },
};

export function makeDemo(
  title: string,
  input: EmhSettings,
  now: number,
  experiment: "exp1" | "exp2" = "exp1",
): Room {
  return makeDemoMarkets(title, input, now, experiment)[0];
}

export function makeDemoMarkets(
  title: string,
  input: EmhSettings,
  now: number,
  experiment: "exp1" | "exp2",
  attendance = input.targetMarketSize,
): Room[] {
  const settings = settingsForExperiment(input, experiment);
  const options = settings.exp2 ?? PRACTICE_EXP2_OPTIONS;
  const allocation = allocationPlan(attendance, {
    ...settings,
    exp2: experiment === "exp2" ? { ...options, marketCount: null } : undefined,
  });
  return allocation.map(({ size, typeCounts }) => {
    const room = newRoom(
      "DEMO23",
      {
        title,
        initialUnits: settings.initialUnits,
        rounds: settings.rounds,
        periodSeconds: settings.periodSeconds,
        unitSeconds: settings.unitSeconds,
        breakSeconds: settings.breakSeconds,
        ...(experiment === "exp2"
          ? {
              experiment: "exp2" as const,
              states: { ...structuredClone(options.states), outcomes: [] },
              emptyUnitsLimit: options.emptyUnitsLimit,
              insiderStartRound: options.insiderStartRound,
              insiderCountPerType: options.insiderCountPerType,
            }
          : {}),
        // Practice dividends stay separate from the private classroom protocol.
        dividends:
          experiment === "exp2"
            ? []
            : [
                { a: 120, b: 40 },
                { a: 100, b: 60 },
                { a: 150, b: 30 },
              ],
      },
      now,
    );
    room.typeCounts = typeCounts;
    for (let i = 0; i < size; i++)
      addParticipant(
        room,
        {
          id: `demo-${i}`,
          name: i === 0 ? "あなた" : `参加者 ${i + 1}`,
          studentId: `demo${i + 1}`,
          pinHash: "",
          tokenHash: "",
        },
        now,
      );
    return room;
  });
}

/** Virtual traders only use their own information, just like a participant. */
export function demoTraderValue(room: Room, participant: Participant) {
  if (room.config.experiment === "exp2") {
    const states = room.config.states!;
    const values = states.dividends[participant.type! - 1]!;
    if (
      participant.insider &&
      room.year >= (room.config.insiderStartRound ?? 3)
    )
      return values[states.outcomes[room.year - 1]! - 1]!;
    return values.reduce((sum, value, i) => sum + value * states.prior[i]!, 0);
  }
  const dividend = room.config.dividends[participant.type! - 1]!;
  return room.period === "A" ? dividend.a + dividend.b : dividend.b;
}

/** Advance only the demo clock, applying deadlines and virtual trades in order. */
export function advanceDemoTime(
  room: Room,
  now: number,
  lastBotAt: number,
  bot: (room: Room, at: number) => void,
  mode: "30-seconds" | "next-period" | number,
) {
  if (
    room.pausedAt !== null ||
    (room.status !== "trading" &&
      room.status !== "break" &&
      !(typeof mode === "number" && room.status === "countdown"))
  )
    return { now, lastBotAt };
  const initialYear = room.year;
  const initialPeriod = room.period;
  const end =
    typeof mode === "number"
      ? mode
      : now +
        (mode === "30-seconds"
          ? 30_000
          : (room.config.periodSeconds + room.config.breakSeconds + 1) * 1000);
  while (now < end) {
    const deadlines = [
      room.countdownEndsAt,
      room.unitEndsAt,
      room.periodEndsAt,
      room.breakEndsAt,
    ].filter((value): value is number => value != null && value > now);
    now = Math.min(end, now + 500, ...deadlines);
    advanceClock(room, now);
    const status: Room["status"] = (room as Room).status;
    if (
      status === "completed" ||
      (mode === "next-period" &&
        (room.year !== initialYear || room.period !== initialPeriod))
    )
      break;
    if (now - lastBotAt >= 1800) {
      bot(room, now);
      lastBotAt = now;
    }
  }
  return { now, lastBotAt };
}
