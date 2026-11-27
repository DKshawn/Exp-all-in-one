# Stochastic Evolutionary Games

The language selected using the globe icon at the top right carries over to other experiments in the same browser.

[日本語](../ja/evolution.md) · [中文](../zh-CN/evolution.md) · [English](../en/evolution.md)

If the browser blocks preference storage, language changes apply to the open page. On narrow screens, edit each payoff directly and scroll inside the input to inspect long values.

Each formal room accepts up to 5,000 registrations. **Demo participants** accepts 2 to 5,000 including the seat you control, with a default of six.

## Stag Hunt v3 (new room only)

Select Stag Hunt v3 at room creation. Classic coordination remains the default and existing rooms are unchanged. Close formal admission at exactly 150 participants. The same cohort completes three blocks, with group sizes of 10, 30, and 150 in small-first or large-first order. The teacher chooses the order; allocation is shuffled for each block and the student-visible history starts fresh. The research export retains all blocks.

In both formal rooms and demos, enter **Decision time (s)** when creating the room. It defaults to 5 seconds and accepts positive values such as 7 or 1.5 seconds that can be represented in whole milliseconds. Empty, nonnumeric, nonpositive or unrepresentable values show an error. The setting locks at creation. Formal rooms keep it on reload and re-entry, and older rooms without the setting use 5 seconds. In the same tab, reloading a v3 demo restores its configuration in the lobby and resets practice progress.

Each block has 120 rounds. In formal rooms, the server sets a shared deadline and settles at that deadline even if everyone has already submitted. Feedback has a separate, fixed 1-second duration. Browser polling and network latency can reduce the time the choice buttons are available before the server cutoff.

For the first 10 rounds, groups are locked to all stag or all hare. In size-10 groups, eight start stag and seven start hare. In size-30 groups, three use the chosen starting choice and two use the other. The single size-150 group uses the chosen starting choice. From round 11, a uniform random 20% of each group (2, 6, or 30 people) may revise each round. Others and eligible timeouts retain their prior choice.

Each player has one choice per round. The system scores that choice against each other member of your group. If you chose Hare, you get 3 points against either choice. If you chose Stag, you get 4 against Stag and 0 against Hare. Your score for the round is the average of those points.

In both formal rooms and demos, the choice card combines the revision status, the Stag and Hare buttons, and a one-opponent payoff table. Highlighted buttons are available for one-click submission, including keeping the same choice. A lock and muted buttons indicate a choice that is unavailable. During rounds 1–10, the card identifies the group's fixed choice. The previous round shows your group's hare share as a percentage and a bar, your own choice and score, and a full-width trend for up to 20 rounds in this block. The axes label rounds and 0%, 50%, and 100%. The full rules are displayed in the demo only. During feedback, the current payoff appears in the round progress panel. Payoffs are rounded to the nearest integer for display. Settlement, totals and research exports use exact values.

The teacher's results show eligible players out of the selected group, actual submissions, timeouts, settled players, strategy shares and total payoffs. Strategy shares appear after settlement.

The effective decision duration in seconds is recorded as `settings.memoAnswerSeconds` in JSON and as `memoAnswerSeconds` on each response row in JSON and CSV. Exports also include block and group, initial choice, revision eligibility, timeout, carried choice, prior feedback data and the timestamp at which the server prepared the response. This timestamp records server preparation. Demo mode simulates the remaining 149 seats.

## Run a classroom session

1. At `/teacher`, select **Stochastic Evolutionary Games**. Choose the game, name the room, set the payoffs and enter a room password. Game, payoff and round settings lock on creation. Teachers and students each choose Japanese, Chinese or English in the page header. This preference is saved in their own browser.
2. Click **Copy join link** beside the participant allocation heading and share the link. It opens the student entry with the room code filled in. Students join with a nickname and four-digit PIN. In classic coordination and Nash demand, they can open **Rules** in the waiting card to check the rules and payoffs.
3. Check actual enrollment and projected group sizes, then close admission. Closing randomly assigns the roster to fixed, balanced groups. Each group needs at least two people. In the demand game each group also receives fixed, nearly equal A/B sides. In an odd group a random draw determines which side has the extra person. Check the allocation and confirm start.
4. Click a coordination choice once to submit. For Nash demand, each round starts without a selected value. Click or tap the slider track or use the arrow keys to choose. The thumb and selected amount appear after selection. Submit early with Enter or the button. At the cutoff, the last saved value submits automatically. A round without a selection is recorded as a timeout. Both decisions are private until the pair settles. The full history stays in the teacher’s export.

Group count remains editable during admission. Close manually or start the 5–3600 second admission timer (default 60). Pause, resume or reset it as needed. When time expires, admission closes if every group can pair at least two people. Otherwise it stays open. Reopen before starting to admit more participants and draw a new allocation at the next cutoff.

Completed rounds are bright green. The current round has a double ring and is gold in demos or purple in formal rooms. Upcoming rounds have a dashed gray outline. Both views also show the countdown and its progress bar. Teachers can pause/resume decisions or feedback, shorten the current phase by 30 seconds (up to its boundary), close decisions early for feedback (or finish on the final round), advance from feedback to the next round, or confirm early termination. Settled payoffs stand. Incomplete pairs are marked `interrupted`, retaining submitted choices with null payoff. Research JSON records teacher interventions with time and round in `controls`. Personal history scrolls inside its own table, newest first.

On the teacher home page, **ルーム管理** labels SEG rooms as **協調ゲーム** (Coordination game) or **ナッシュ要求ゲーム** (Nash demand game). Select either game under **実験** to filter the list.
Drafts stay private and return when you rejoin. A teacher's manual early closure or termination discards pending drafts. Nash demand JSON and CSV use `submissionSource` to record `manual` for confirmed answers and `deadline` for automatic submission at the cutoff.

## Parameters and payoff rules

Formal and demo setup show an **Input range** hint below each field that accepts whole numbers. Leaving the field or attempting to create a room shows missing, out-of-range, or non-integer errors under the affected field. Demo attendance accepts 2–5,000. The payoff matrix shows accepted number formats.

| Setting                | Default    | Range    |
| ---------------------- | ---------- | -------- |
| Independent groups     | 1          | 1–32     |
| Rounds                 | 10         | 1–10,000 |
| Decision time          | 30 seconds | 5–600    |
| Between-round feedback | 8 seconds  | 3–120    |

- **Coordination.** In formal and demo setup, changing a strategy name updates both the row and column headings. Enter the two payoffs directly in each cell, with the row player's payoff on the left and the column player's payoff on the right. Rows and columns default to Stag, Hare. The cells in row order are (4,4), (0,3), (3,0), (2,2). Positions are redrawn with each match. A player sees their row or column position, which matters for an asymmetric matrix.
  The coordination buttons stay visible and lock after submission. The same matrix marks the realized row, column and cell when both players submit, with labels for each payoff.

- **Nash demand.** Both sides use a 0–1 slider and a total of 1. Choose a step of 0.1 (default), 0.01, 0.005 or 0.001 when creating the room. The step is fixed for the session and saved in Research JSON as `settings.demandStep`. If combined demands are at most 1, each receives their demand; otherwise both get zero. Integer thousandths make 0.3 + 0.7 settle exactly. Existing sliders without a saved step use 0.001; existing discrete rooms keep their configured choices.

Above 32 configured rounds, the round display uses a compact progress bar. The student history and teacher results on the live page cover the most recent 20 rounds and the current round. Choose **Older rounds** to page through earlier rounds or **Back to latest** to return.

## Matching, deadlines and absence

Matches stay inside the group. In demand games A always meets B. Each round is a fresh draw and consecutive rematches are possible. In odd groups one person sits out. Among eligible people (the larger side for demand games), the fewest previous byes take priority, with random ties. A bye has no decision or round payoff.

A round closes when all paired decisions are in or the server deadline expires. After the feedback interval the next round opens on the next authenticated room update. If everyone closes the page, resuming the room applies the old deadline and opens a fresh decision window when due. The last round goes directly to final results. When either decision is missing neither player has a round payoff. The submitted decision is retained, separately from the partner’s timeout. A genuine zero payoff remains a numeric zero.

Settled pairs see **Waiting for other pairs** while room-wide decisions remain open. **Next round in** counts down once feedback starts for the whole room. The pair can already see its result during the first state. The countdown in that state shows the decision cutoff. Once decisions close, the whole room starts the feedback countdown and moves to the next round together. The countdown stays in place as the status changes.

Closing the page leaves the seat in the draw. There is no permanent withdrawal or seat replacement in this version. Re-enter using the original nickname and PIN. No new enrollment after cutoff. A gap over 15 seconds between server observations is a possible disconnect or backgrounded tab. The gap runs from last contact + 15 seconds to renewed contact or the export/experiment end. Gaps and timeouts are separate observations.

## Read and export results

The teacher table shows one group over rounds. Choice shares count all submitted decisions, including those without a partner response. A/B shares have separate denominators. Pair frequencies use row/column order (A/B in demand games). Coordination rate is the fraction of settled pairs with equal choices, even for a custom matrix. Breakdown rate is the fraction of settled pairs whose demands exceeded the total. An empty denominator displays a dash.

In continuous Nash demand, the teacher sees separate A/B distributions in ten bands and the breakdown rate. Precise choices and paired outcomes are in the raw export.

**Research JSON** contains the full settings, room code, anonymous fixed roster, group/side assignments, heartbeat gaps, group-by-round totals and participant-by-round raw records. **Responses CSV** contains one row per assigned person per round, including byes. Join with JSON using room, group, round and anonymous ID. Times are Unix milliseconds. `seenAt` is the first server observation of a decision-window visit, and `submittedAt` is server receipt. Counts distinguish assigned, paired, seen and submitted. `pay` and `total` are exact numbers encoded as strings. Missing fields are null in JSON and blank in CSV. Timestamps and status distinguish `bye`, `timeout`, `unmatched` (partner timed out), and `settled`. The nickname, PIN and access credentials are excluded.

For new Nash demand rooms, `demand` and `opponentDemand` are the exact displayed values. The corresponding `choice` fields encode integer thousandths. Discrete rooms continue to use zero-based option indices.

## Research interpretation

[Session 3-2, pp. 16–21](../../../material/Session3-2.pdf) introduces risk dominance and the Nash bargaining solution. The [KMR supplement, pp. 3–7 and 17–18](../../../material/Session3-2KMR補足.pdf) uses average payoffs, adaptation and rare mutations, with an illustrative population of 12 per side for the demand example. Here people observe a single private match per round. The experiment supplies neither best responses nor artificial mistakes. Risk-dominant coordination and equal division in the symmetric demand example are hypotheses to test. Custom parameters can change those predictions. Feedback, stable sides, attendance, timing, how to handle missing pairs and the analysis of convergence should be confirmed with the professor before data collection.

[Classroom entry](classroom.md) · [Demo: create a room and switch views](demo.md) · [Local setup](development.md)
