import { randomInt } from "@/experiments/double-auction/lib/random";
import {
  choose,
  newGame,
  newSeat,
  phaseDeadline,
  teacherAction,
  tick,
  type Action,
  type Round,
} from "./engine";
import { summaries, type Summary } from "./views";
import { choices, type Settings } from "./settings";

export class EvolutionPractice {
  readonly human = "1";
  readonly game;
  readonly archive: Round[] = [];
  readonly history: Summary[] = [];
  private keepRound(round: Round | null) {
    if (round && round !== this.game.round) {
      this.archive.push(round);
      this.history.push(...summaries(this.game, round));
    }
  }
  private plannedRound = 0;
  private pending: { id: string; at: number; choice: number }[] = [];
  private offset = 0;
  constructor(
    readonly title: string,
    settings: Settings,
    count: number,
    readonly createdAt: number,
  ) {
    this.game = newGame(settings);
    this.game.seats = Array.from({ length: count }, (_, i) =>
      newSeat(String(i + 1)),
    );
  }
  time(real: number) {
    return real + this.offset;
  }
  private planBots(round: Round) {
    this.plannedRound = round.number;
    const window = Math.min(5000, (round.deadline - round.openedAt) / 2);
    this.pending = Object.entries(round.entries)
      .filter(([id, e]) => id !== this.human && e.status === "choosing")
      .map(([id]) => ({
        id,
        at: round.openedAt + 800 + randomInt(Math.floor(window)),
        choice: randomInt(choices(this.game.settings).length),
      }))
      .sort((a, b) => a.at - b.at);
  }
  advanceTo(now: number) {
    const g = this.game;
    while (g.pausedAt == null) {
      const deadline = phaseDeadline(g);
      if (deadline === null) break;
      const r = g.round;
      if (r && g.phase === "playing") {
        if (this.plannedRound !== r.number) this.planBots(r);
        const bot = this.pending[0];
        if (bot && bot.at < deadline && bot.at <= now) {
          this.pending.shift();
          choose(g, bot.id, r.number, bot.choice, bot.at);
          continue;
        }
      }
      if (deadline > now) break;
      tick(g, deadline);
      this.keepRound(r);
    }
  }
  fastForward(real: number) {
    if (
      this.game.pausedAt == null &&
      (this.game.phase === "playing" || this.game.phase === "feedback")
    ) {
      this.offset += 30000;
      this.advanceTo(this.time(real));
    }
  }
  act(action: Action, real: number) {
    const now = this.time(real),
      g = this.game;
    this.advanceTo(now);
    const previous = g.round,
      pausedAt = g.pausedAt;
    if (action.kind === "choose")
      choose(g, this.human, action.round, action.choice, now);
    else teacherAction(g, action, now);
    if (action.kind === "resume" && pausedAt != null)
      for (const bot of this.pending) bot.at += now - pausedAt;
    this.keepRound(previous);
    this.advanceTo(now);
  }
}
