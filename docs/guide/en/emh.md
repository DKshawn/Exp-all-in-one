# EMH asset market experiment

[日本語](../ja/emh.md) · [中文](../zh-CN/emh.md) · [English](../en/emh.md)

Confirm **実験を終了** in the teacher controls to end all markets, including paused markets. Each trading market cancels open orders and settles its current period at current holdings. The export records `teacher-finish`. If Experiment 1 ends in period A, the round includes A dividends and trading cash flow through the stop. Ending during the countdown or a break adds no period or payout.

Student waiting screens share a consistent card design while retaining experiment-specific information.

In the formal teacher view, **参加リンクをコピー** copies the student entry during admission and the student room address after the market starts.

The [standalone AI student program](../../../ai-emh/README.en.md) accepts room links and hidden token input, adds `/v1` to local model server roots, and joins Experiment 2 with a configurable participant count and a local model or OpenAI. It never substitutes rule-based robots for missing model responses. The AI action log also records model request duration and reasons for skipped actions. The default output limit is 2048 tokens per model request. When an AI waits, the program monitors its student market view and requests a new decision after a market change.

An optional LM Studio fast mode disables extended reasoning; complete fenced JSON blocks are also supported.

The implementation is in `src/experiments/emh/`, the rules page is `/emh/guide`, and signed-in teachers use `/emh/demo` for practice with configurable group size and conditions. The source is Experiment 1 in [Session5-1（Exp1解説あり）.pdf](../../../material/emh/Session5-1（Exp1解説あり）.pdf). See the [protocol-to-source mapping (Japanese)](../../experiments/emh.md). Experiment 2 follows [Session6-1](../../../material/emh/Session6-1（Exp2解説あり）.pdf).

The interface labels prices, dividends, trading balances and profits in yen.

Formal setup uses **戻る** in the header to return to experiment selection. EMH demo setup and the demo room use **戻る** to return to the demo list and **DEMOモードを終了** to return to teacher setup.

Starting the session shows a five-second preparation countdown directly above the personal conditions panel in its trading-screen position, highlighted with an arrow and border. The page scrolls to reveal it if needed. Trading and the period clock start when the countdown ends; pausing also freezes it. This applies to both experiments and the demo. The highlighted round indicator shares one compact area with the trading clocks.

Both experiments place the limit and market buttons side by side for buying and for selling. Draft bid and ask prices stay in their fields when another trade clears or a trading unit times out. Submitted limits are matched against the current book. Both fields start empty in a new period or round.

The conditions panel groups each student’s private dividends with their trading controls. The shared CDA book opens in list view (一覧) and can switch to a bar chart (棒グラフ). Both teachers and students see two columns per side, price and quantity. The teacher’s trade records and CSV export identify the buyer and seller for each trade. Your resting limits are identified by a highlighted row and あなた含む in the list, or a dot and outlined bar at that price in the chart. The book shows a cancel button for each side where you have a resting limit. Holdings, trading balance, and the current round profit appear as three cards in one row in the same panel.

Completed rounds and periods are bright green. The current round and period are gold in demos and purple in formal rooms. For long schedules, the round strip scrolls the active round into view on a round change.

## Experiment 1

1. After authenticating at the teacher entry, alongside the title and room teacher password, set initial securities per participant per round (1–20, default 2), target market size (3–12, default 9), three type weights (integers 1–100 each, default 1:1:1), and the shared A/B period duration (1–30 minutes, default 4, rounded to whole seconds). While admission is open, these settings can still be edited and applied with **設定を保存**.
2. With at least three participants, review the allocation preview and choose **分け方を確定して受付終了**. Everyone is randomly allocated into markets of 3–12, differing in size by at most one. The market count is attendance divided by the target size, rounded and adjusted for these limits. Reserve at least one seat per type, then assign remaining seats to the largest deficit from its proportional quota; ties reduce imbalance across markets. Defaults split 28 into 10/9/9; eight participants with 2:1:1 weights become 4/2/2. Rounded counts may differ from the requested ratio. Registration is capped at 999.
3. Confirmation persists and locks conditions, markets and individual types. Refreshing or starting does not redraw assignments. Before starting, **割り当てを解除** opens a confirmation to release assignments and reopen admission and editing; confirming allocation again redraws assignments. After **全市場で実験を開始**, neither release nor settings edits are allowed. Market selection, pause/resume of all markets and ending the selected period remain available.
4. Each round issues the configured initial units. Total supply Q is actual market attendance times initial units. Holdings carry from A to B and expire at the end of B. Each new round resets holdings and trading cash while preserving cumulative profits. Baseline dividends equal initial units times the sum of each actual type count multiplied by its period dividend; maximum dividends equal Q times the highest period dividend. Allocation efficiency is actual/max dividends; gain efficiency is (actual−baseline)/(max−baseline), blank for a zero denominator.
5. Configure 1–12 rounds and trade-attempt and break durations of 1–1800 seconds each (defaults: 6 rounds, 30 seconds and 60 seconds); A/B periods use the configured shared duration. Two consecutive unsuccessful attempts can end a period early. Type A/B dividends in yen remain 216/105, 200/110 and 257/83. With all three types present and no cash or holdings cap, the displayed theoretical references in yen remain 340/367 for A and 110 for B. Demo Model uses the same settings, confirmation workflow and engine, with separate practice dividends; see the [demo guide](demo.md).
6. The teacher releases the explanation after the experiment. Other types’ dividends, other participants’ results and theoretical prices remain private until then. Teacher JSON includes requested ratios, locked conditions and timestamp, actual counts and individual assignments. Results CSV also includes actual attendance, initial units, total supply and period seconds, per market or combined. Student CSV contains only their own history. Older rooms without the new settings retain the original defaults; saved historical settlements are not recalculated.

## Experiment 2

Select **実験2** when creating a formal room. Configure initial securities per participant (1–20), target market size (3–999), type weights (1–100 each), market count (automatic or 1–333), and the consecutive unsuccessful-attempt limit (1–100). Automatic allocation uses attendance and the target size. A specified market count divides actual attendance evenly and cannot be confirmed unless each market has at least three people. Each market has at least one participant of each type. Defaults are target 12, weights 1:1:1, two securities and two unsuccessful attempts. Configure 1–6 rounds, 1–30 minutes per round, and 1–1800 seconds for each trade attempt and break (defaults: 6 rounds, 5 minutes, 30 seconds and 60 seconds). Securities pay dividends and expire at each round’s end; the profit is sales minus purchases plus dividends. Short selling is prohibited and cash is unconstrained.

Configure state probabilities (total 100%), dividends by type and state (0–100000 yen), insider start round (1–7) and insiders per type (0–999). At the start, each round’s state is drawn independently using the configured probabilities and saved; every market in a room shares the draws. Clues show the corresponding drawn state. Refreshing or pausing does not redraw them, and previously assigned legacy rooms retain their saved states. The actual insider count is capped by each type’s attendance and is shown in the allocation preview. A start round after the final round or a count of zero gives nobody insider information. The same selected participants receive information from that round onward. Formal defaults are probabilities 35/42/23%, dividends in yen 90/95/214, 52/232/115 and 136/140/124, and up to two insiders per type from round 3. States are disclosed at each round’s end; other types’ conditions and equilibrium prices are withheld from students until the teacher releases the explanation. PI, RE and efficiency use the chosen conditions and actual information allocation; conditions and records can be exported. The demo uses one market and different practice dividends. The screen-size preview is `/emh/demo/preview`.

The EMH demo control panel switches between teacher and student views, pauses, advances 30 seconds or to the next period, restarts, and returns to settings. Fast-forward processes virtual trades and deadlines in order; it is disabled during the countdown and while paused. **やり直す** keeps the settings and resets allocation and progress. The screen-size preview places the control panel outside the frame.

`lab_room_registry` keeps room codes unique across experiments. Alongside existing `auction_*` tables, EMH uses `emh_sessions`, `emh_markets`, `emh_command_receipts`, and `emh_login_attempts`. Connection-time migration creates these tables and registers existing codes; no additional connection string is needed. Market row locks, database time, and operation IDs handle retries, and state reads also process expired deadlines. Students receive only their market, while teachers receive the overview and selected market. Production dividend values stay in server-side files.

The integrated version has been checked locally and on Vercel + Neon; see the [migration and verification record](../../releases/unified-platform-migration.md). The old Judgment SQLite data was not imported. For local testing, set `LOCAL_ONLY=1` and a separate `PGLITE_DATA_DIR`, and clear `DATABASE_URL` and `LOCAL_DATABASE_URL`. Do not let multiple servers open the same PGlite database. The 999-person cap is a registration limit, not a guarantee of equivalent cloud concurrency.

With a local server running, use `npx tsx scripts/verify-emh-http.ts`. It defaults to `http://127.0.0.1:3200`; override it with `EMH_TEST_ORIGIN`. Use an isolated local database with no teacher key configured. The script creates test rooms.

`tests/emh-engine.test.ts` and `tests/emh-platform.test.ts` cover allocations across participant counts, parallel markets with 30 participants, private information, re-entry, retries and simultaneous trades, clocks, all six rounds, dividends, explicit explanation release, and shared room codes and management.

`tests/e2e/emh-settings.spec.ts` verifies saving and reloading settings, concurrent editor conflicts, confirmation and release, all six rounds with eight participants, duplicate submissions, privacy and CSV/JSON export through the browser.

## Student trading screen

Everyone can post one bid and one ask at a time, each for one unit. Higher bids and lower asks take priority. Equal prices fill in the order the server received them. Your unfilled limit stays in the book through better quotes, other trades and individual trading-unit timeouts. Changing its price gives it a new place in the queue. Resubmitting the same price retains its place. You can cancel from the book. Remaining orders expire at period end.

A market order or a limit that crosses the best opposing price immediately trades one unit at the resting order’s price. A market order leaves your separate resting limits in place. A resting ask reserves one security. To sell your last reserved unit, amend that ask or cancel it before selling at market. The market rejects self-trades and attempts to accept an order that has already changed or traded.

Experiment 2 shows the student’s dividend per unit and public probability for each state, and their product. Values are displayed to at most four decimal places. These figures use public probabilities even when the student has a Clue.

Students see all historical trade prices as numbers, without trend lines or counterpart identifiers, and can filter their own trades. Other participants' IDs and seat numbers are also removed from student API responses. Teachers retain full records, charts and exports. These rules apply to formal and demo screens in both experiments.

Experiment 1 dividends occupy a private, student-specific area. The current round profit is trading cash flow plus dividends already received; unpaid dividends are excluded. In a full round, period A is provisional and profit becomes final at the end of B. Settlement rows explicitly distinguish provisional and final profits. Experiment 2 has one period and settles at round end. The realized state is highlighted on its card with an animation and an 実現 marker; the page scrolls to the card if it is outside the viewport, and reduced-motion settings suppress the animation.

Each trading interval can execute at most one unit. Separate timers show the interval and the whole period. An interval timeout starts the next interval; the configured consecutive no-trade limit or period deadline ends the period. Controls are disabled during server transitions, pauses and disconnections.

---

[Home](../../../README.en.md) · [Classroom guide](classroom.md) · [Double Auction](double-auction.md) · [Demo Model](demo.md) · [Judgement under Uncertainty](judgment.md) · [Development, deployment and verification](development.md)
