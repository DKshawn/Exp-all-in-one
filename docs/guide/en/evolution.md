# Stochastic Evolutionary Games

[日本語](../ja/evolution.md) · [中文](../zh-CN/evolution.md) · [English](../en/evolution.md)

## Run a classroom session

1. At `/teacher`, select **Stochastic Evolutionary Games**. Choose the game, name the room, check the payoff preview and set a room password. Game, payoff and round settings lock on creation. Teachers and students each choose Japanese, Chinese or English in the page header. This preference is saved in their own browser.
2. Share the room code and student entry `/`. Students join with a nickname and four-digit PIN. They can open **Rules** in the waiting card to check the rules and payoffs for this room.
3. Check actual enrollment and projected group sizes, then close admission. Closing randomly assigns the roster to fixed, balanced groups. Each group needs at least two people. In the demand game each group also receives fixed, nearly equal A/B sides. In an odd group a random draw determines which side has the extra person. Check the allocation and confirm start.
4. Each round, choose privately and confirm once. A submitted choice survives reload and re-entry. Both players see their own and their partner’s choice and payoff as soon as the pair settles, plus their own cumulative payoff. Personal round history stays available. Teachers see the group tables and can download data during or after the session.

Group count remains editable during admission. Close manually or start the 5–3600 second admission timer (default 60). Pause, resume or reset it as needed. When time expires, admission closes if every group can pair at least two people. Otherwise it stays open. Reopen before starting to admit more participants and draw a new allocation at the next cutoff.

The round strip uses a solid purple double ring for the current round, teal for completed rounds and a dashed outline for upcoming rounds. Both views also show the countdown and its progress bar. Teachers can pause/resume decisions or feedback, shorten the current phase by 30 seconds (up to its boundary), close decisions early for feedback (or finish on the final round), advance from feedback to the next round, or confirm early termination. Settled payoffs stand. Incomplete pairs are marked `interrupted`, retaining submitted choices with null payoff. Research JSON records teacher interventions with time and round in `controls`. Personal history scrolls inside its own table, newest first.

## Parameters and payoff rules

| Setting                | Default    | Range |
| ---------------------- | ---------- | ----- |
| Independent groups     | 1          | 1–32  |
| Rounds                 | 10         | 1–100 |
| Decision time          | 30 seconds | 5–600 |
| Between-round feedback | 8 seconds  | 3–120 |

- **Coordination.** Two editable strategy names and four editable ordered pairs. Rows and columns default to Stag, Hare. The cells in row order are (4,4), (0,3), (3,0), (2,2). Positions are redrawn with each match. A player sees their row or column position, which matters for an asymmetric matrix.
- **Nash demand.** Both sides use the same total and the same 2–12 distinct demands from zero to the total. Defaults are 1 and {1/3, 1/2, 2/3}. At or below the total each earns their demand. Above it both earn zero. Integers, decimals and fractions with a positive denominator use exact rational arithmetic. For example, 0.1 and 0.2 both succeed against a total of 0.3.

## Matching, deadlines and absence

Matches stay inside the group. In demand games A always meets B. Each round is a fresh draw and consecutive rematches are possible. In odd groups one person sits out. Among eligible people (the larger side for demand games), the fewest previous byes take priority, with random ties. A bye has no decision or round payoff.

A round closes when all paired decisions are in or the server deadline expires. After the feedback interval the next round opens on the next authenticated room update. If everyone closes the page, resuming the room applies the old deadline and opens a fresh decision window when due. The last round goes directly to final results. When either decision is missing neither player has a round payoff. The submitted decision is retained, separately from the partner’s timeout. A genuine zero payoff remains a numeric zero.

Closing the page leaves the seat in the draw. There is no permanent withdrawal or seat replacement in this version. Re-enter using the original nickname and PIN. No new enrollment after cutoff. A gap over 15 seconds between server observations is a possible disconnect or backgrounded tab. The gap runs from last contact + 15 seconds to renewed contact or the export/experiment end. Gaps and timeouts are separate observations.

## Read and export results

The teacher table shows one group over rounds. Choice shares count all submitted decisions, including those without a partner response. A/B shares have separate denominators. Pair frequencies use row/column order (A/B in demand games). Coordination rate is the fraction of settled pairs with equal choices, even for a custom matrix. Breakdown rate is the fraction of settled pairs whose demands exceeded the total. An empty denominator displays a dash.

**Research JSON** contains the full settings, room code, anonymous fixed roster, group/side assignments, heartbeat gaps, group-by-round totals and participant-by-round raw records. **Responses CSV** contains one row per assigned person per round, including byes. Join with JSON using room, group, round and anonymous ID. Choice indices start at zero in the configured order. Times are Unix milliseconds. `seenAt` is the first server observation of a decision-window visit, and `submittedAt` is server receipt. Counts distinguish assigned, paired, seen and submitted. `pay` and `total` are exact numbers encoded as strings. Missing fields are null in JSON and blank in CSV. Timestamps and status distinguish `bye`, `timeout`, `unmatched` (partner timed out), and `settled`. The nickname, PIN and access credentials are excluded.

## Research interpretation

[Session 3-2, pp. 16–21](../../../material/Session3-2.pdf) introduces risk dominance and the Nash bargaining solution. The [KMR supplement, pp. 3–7 and 17–18](../../../material/Session3-2KMR補足.pdf) uses average payoffs, adaptation and rare mutations, with an illustrative population of 12 per side for the demand example. Here people observe a single private match per round. The experiment supplies neither best responses nor artificial mistakes. Risk-dominant coordination and equal division in the symmetric demand example are hypotheses to test. Custom parameters can change those predictions. Feedback, stable sides, attendance, timing, how to handle missing pairs and the analysis of convergence should be confirmed with the professor before data collection.

[Classroom entry](classroom.md) · [Demo: create a room and switch views](demo.md) · [Local setup](development.md)
