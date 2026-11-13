# Double Auction

[日本語](../ja/double-auction.md) · [中文](../zh-CN/double-auction.md) · [English](../en/double-auction.md)

Student waiting screens share a consistent card design while retaining experiment-specific information.

In a formal room, **参加リンクをコピー** copies the student entry with the room code filled in. [Student entry instructions](classroom.md)

[Demo Model](https://exp-all-in-one.vercel.app/demo) · [Demo controls](demo.md)

Open the screen-size demo at `/demo/preview`. On narrow screens, choose a size from the dropdown; demo progress is retained.

Authenticate once with the key at the teacher entry, then set a teacher password of at least eight characters for each room. The creation form does not request the key again.

The setup header contains **戻る** and, when opened from an existing room, **ルーム … に戻る**. Demo setup offers **戻る** to return to the demo list and **DEMOモードを終了** to return to teacher setup.

CDA and EMH share an order book with list and bar-chart views. Both mark your active orders. CDA price/time priority, depth, quantities and cancellation rules are unchanged.

Stochastic games use the same admission timer controls. See the [stochastic games guide](evolution.md) for their grouping and bye rules.

## Allocate using actual attendance

Create a room first and configure it while students join. Set the desired number of markets, then use **締切タイマーを開始** (5–3600 seconds) or **入室を締め切って割り当て** to close admission. The saved server deadline applies even if the browser closes: the next join or reconnect rejects new arrivals after it. Closing admission does not itself start the experiment.

After the experiment starts, **学生の割り当て** collapses by default. Select **割り当てを表示** to inspect it and collapse it again when finished. The demo behaves the same way.

With a requested market count, the app creates the smaller of that count and `floor(N / 2)`, where N is attendance at closure. Market sizes differ by at most one. Automatic mode fills markets with 16 participants in sequence; a final market containing only one person waits for another participant. Odd attendance still allows everyone to participate, with registration capped at 999. The condition template rounds the largest market size up to an even number, so a single market with 999 participants uses a 1,000-person template. Before starting, **入室を再開** reopens admission and allocation with the same room code.

Template prices and generation parameters remain unchanged. Conditions are sampled evenly or duplicated to match each market's actual buyer and seller counts. Equilibrium, maximum surplus, and efficiency use actual values and costs. Different attendance can produce different curves; compare `config.studyLayout`, `markets[].schedules`, and `marketEquilibria` in the conditions JSON. The same attendance, entry order, requested markets, and seed produce the same seats and roles. The seed also determines which side gets the extra person in an odd-sized market. Institution order is randomized separately.

Teachers can confirm withdrawal with **参加終了** in the roster. Before starting, withdrawn students are excluded from allocation; if allocation already occurred, admission reopens, and an active admission deadline continues. After starting, withdrawal cancels outstanding orders, buy orders, and remaining posted inventory while retaining completed trades, profits, roles, and the starting equilibrium benchmark. Others continue. Brief disconnections and reconnects do not count as withdrawal. Undoing withdrawal and admitting new participants after starting are not currently supported.

`admission-updated`, `admission-closed`, and `participant-withdrawn` record admission settings, deadlines, actual attendance, final allocations, withdrawals, and cancellations. Unstarted legacy fixed-attendance rooms can switch with **人数を確定せず入室を受け付ける**. Running and completed rooms retain their market composition. These records extend existing JSON storage without changing authentication or requiring a production data migration.

## Experiment structure

- Nicknames have at most seven characters. The waiting screen shows selected institutions, their period counts, and the total. Each market spends eight seconds reviewing the final period's results before changing institution; the experiment ends after the last institution's results. Older rooms without saved counts retain five periods per institution.
- The standard condition template has eight buyers and eight sellers. Custom templates use even counts without limiting actual attendance. Each institution independently supports 1–5 units per participant, defaulting to two. Students see only the current unit's value or cost and advance after a trade. Choose 1–3 institutions and 1–20 periods each, defaulting to five; these remain editable before starting.
- Roles, markets, and per-unit values and costs stay fixed across periods. Available quantities reset at each period's start. After a CDA trade, the next unit appears with an empty price field and input focus preserved.
- Pre-creation attendance presets determine the condition template and requested markets, and the initial virtual attendance in demos. Production rooms do not require fixed attendance, allow market-count changes during admission, and do not fill shortages with virtual participants.
- Across multiple markets, all permutations of selected institutions are assigned randomly with counts differing by at most one. A single market follows CDA, Call, then Posted Offer, omitting unselected institutions. Period counts accumulate in each market's assigned order.
- New arrivals appear in entry order until admission closes, when the roster groups by market. Before starting, allocation can be randomized again, keeping buyer and seller counts within one per market. There is no need to wait for a fixed expected attendance.
- **実験を開始** displays a common five-second countdown in all markets. Period 1 begins when it ends. Students cannot see provisional conditions while waiting or trade during the countdown. Markets then advance independently. Pause, resume and early period closure apply across markets. The red **実験を終了** button asks for confirmation before ending all markets. Saved legacy rooms keep their previous admission and start behavior.
- Conditions JSON stores entry times, entry order, and final allocation. Fixed-attendance reshuffles use `participants-randomized`; open-admission closure and reallocation use `admission-closed`. Planned starts use `start-countdown`, and actual per-market starts use `period-started`.
- The teacher's **全市場の結果** places each market's current period and green remaining-time label in one column. In the demo, teachers and students see the current period highlighted in gold. Statistics default to the current period. Selecting a past period changes quantities, prices, metrics, and the summarized institution, while progress, clocks, and status remain live.
- The system manages matching, clocks, clearing, purchase order, and records. There are no student market moderators.
- Students see their own conditions and their market's prices, orders, and personal trades for all configured periods of the current institution. Recent prices and trade details use the same range. Changing institution switches this history range; cumulative profit still covers all completed periods. Teachers retain all records and can compare price charts across the whole experiment or each institution. Theoretical equilibrium and everyone's conditions are teacher-only. This display policy is recorded in `rules.studentHistoryDisplay` and `rules.teacherHistoryDisplay`.
- CDA books show active bids and asks plus the latest trade price, with eight rows per side in the standard 16-person market. **注文履歴・歩み値** occupies a separate center column; conditions and order entry sit below the book. History combines closed orders and trades from all periods of the current institution into one reverse-chronological table, ordered by time and event sequence. Bids, asks, and trades are distinguished; filled orders merge into their trade rows to avoid duplicates. Students see **あなた** on their own records and no participant numbers; teachers retain numbers. New rows and counts flash pale green twice over 2.4 seconds; initial and unchanged history does not flash. Reduced-motion settings use a temporary green background instead. History scrolls within the table, with **最新** returning to the top, without pagination or tabs. Historical entries cannot be traded and do not affect best prices, matching, or spreads. CDA input limit prices that trade immediately are not published in history. Call displays active orders during admission and keeps clearing results in history. Closed orders also appear as `order-closed` audit events and market-level `orderHistory` in `settings.json`; publication rules are recorded in `rules.cdaOrderHistory`. Legacy rooms record orders that close after the update.

This implementation follows the revised Experiment 1 in `大規模実験メモ.pptx`, rather than the old oral experiment's nine-person, moderator, and fee setup. Operational choices not uniquely specified in that material are documented here, in the teacher interface, and in conditions JSON. The source presentation is not distributed in the repository.

## Trading rules

Teachers can independently set the CDA period, Call admission window, Posted seller-posting window, and shared buyer-trading window under **実験時間の設定**, each as an integer from 1 to 3600 seconds. Before starting, these remain editable under **実験設定を変更**. Call normally has four windows per period, or five when configured for five units. A window may be five seconds; existing rooms are not all changed to that duration. If a shared buyer window is absent, the legacy `buyerSeconds × number of buyers in the market` applies. Values are stored in `config.studyTiming` and the conditions JSON's `rules`; changes use `study-timing` audit records.

| Institution  | Default timing                                                                   | Orders and prices                                                                                                                                                                                       |
| ------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CDA          | 180 seconds per period                                                           | One active order per person for the current unit; price priority, then time priority. Crossing orders trade at the resting order's price. Replacement loses time priority                               |
| Call Market  | Four 30-second windows per period; five for five units                           | One public current-unit order per window, cleared only at the deadline. Descending bids and ascending asks maximize feasible volume; all trades clear at the midpoint of the final matched bid/ask pair |
| Posted Offer | 60 seconds posting plus 80 seconds shared trading in a standard 16-person market | First-unit asks stay private until the deadline. Sellers may post the next unit after a sale. Buyers accept a seller's posted price with the purchase button and trade immediately                      |

- **Loss-making trades are allowed**, with expected profits displayed. Commission is an experimental reward paid to both sides for each traded unit, defaulting to one yen each; zero disables it. Sort values descending and costs ascending. If g is the first negative-surplus unit's cost-minus-value gap, require `2 × Commission < g`; the integer maximum is `ceil(g / 2) − 1`, capped at 999. With no negative-surplus units, the maximum is 999. Default conditions and the candidate `p=80, K=8, L=4, d=4` allow at most three. Excess amounts are rejected, not clamped; attendance, generated-condition, and manual-condition changes use the same check. Edit the reward with supply/demand settings before starting; afterward it is fixed. It appears in waiting and condition views and contributes to expected profit, trade notifications, personal history, period profit, and cumulative profit. Unfilled, cancelled, or merely posted orders earn no reward. Missing settings in old rooms or trades remain zero. Each trade records its reward, so later configuration does not recalculate past profit. Prices, values, costs, and profits use experimental yen (JPY); no real payments occur.
- Wide creation screens use three columns for experiment settings, supply/demand conditions, and all unit values. At 1100px or less, experiment settings move above. If the conditions/table area is at least 800px wide, the unit table sits in a separate right panel; otherwise it sits below. The right table stays visible while scrolling and scrolls internally for many units. Previews show equilibrium prices and quantities both without and with rewards, updating on amount changes. Reward-inclusive equilibrium uses `D+c` and `S−c`; the curves, maximum surplus, and efficiency benchmark still use original values and costs. Conditions and rewards can be saved together before starting.
- Submitted prices are integers from 1 to 99999 yen. Call clearing prices may use half-yen increments.
- Call allows one current-unit order per participant per window. Ties follow a new randomized participant priority at each clearing, recorded in the audit log. Successful traders move to their next unit; others can offer the same unit again.
- Unfilled Call orders expire after each clearing and remaining units can be resubmitted. **Clearing does not restore already traded units.**
- Call has no quantity selector. Missing a submission leaves that window without an order and does not change remaining quantity or profit. Typing alone does not submit; the next window allows another order. Records cannot distinguish reasons for non-submission. Old `call-pass` events remain historical audit data.
- New Posted rooms use `studyPostedMechanism: direct-purchase-v1`. Buyers do not enter prices; they choose a seller from ascending posted offers. `posted-buy` sends only an offer ID and quantity. The server checks the posted price and remaining inventory, then trades immediately. Competing requests follow server receipt order. Duplicate purchases, inventory overruns, and excess quantities are rejected; retries do not duplicate trades. There are no buyer quotes or once-per-second auction clearings.
- Legacy `batch-bids-v1` rooms retain their once-per-second bid-price priority with random ties. Earlier unflagged rooms retain randomized sequential purchasing. Existing experiments do not switch mechanism midway; create a new room for the new rules. Conditions JSON records mechanisms and priority rules.
- New Posted rooms trade one current unit at a time on both sides. After a sale, sellers can post the next unit during the shared trading window, and the new price is public immediately. Buyers see the next unit's value after purchasing. Temporary zero inventory while waiting for a new ask does not end the period. Unconfirmed asks at the deadline remain unposted for that period. Old multi-unit or zero-unit offers are retained as historical records.
- Early ending cancels outstanding orders and marks an active period `interrupted`. Uncleared Call orders do not trade; already completed periods remain `complete`.
- In the standard 16-person market, default equilibrium is 80 yen, positive-surplus quantity is 10, the upper quantity including zero surplus is 11, and maximum total surplus is 440 yen. Quantity ratios, efficiency, and price-deviation benchmarks use actual attendance, values, and costs.

## Initial conditions

The standard 16-person market uses the same conditions in each market, in yen.

| Group | Buyer unit 1 | Buyer unit 2 | Seller unit 1 | Seller unit 2 |
| ----- | ------------ | ------------ | ------------- | ------------- |
| 1     | 120          | 104          | 40            | 56            |
| 2     | 116          | 100          | 44            | 60            |
| 3     | 112          | 96           | 48            | 64            |
| 4     | 108          | 92           | 52            | 68            |
| 5     | 88           | 72           | 72            | 88            |
| 6     | 84           | 68           | 76            | 92            |
| 7     | 80           | 64           | 80            | 96            |
| 8     | 76           | 60           | 84            | 100           |

For n participants on a side, zero-based row i takes row `floor((i + 0.5) × 8 / n)` from this table, sampling or duplicating evenly across the range. At 16 participants and two units each, it matches exactly. When Default unit counts change, original marginal values/costs are sorted, evenly sampled or duplicated to side-attendance times units, and distributed at side-attendance intervals. This is an implementation default, not an additional condition specified by the professor. Review the preview after changing units before adopting it. Conditions remain editable before starting, but participant allocations need checking again. Unit counts and conditions are saved per institution; changes after starting are rejected.

Changing template attendance affects supply/demand quantities and Posted's default shared window, which is template buyers times ten seconds. Actual-attendance allocation alone does not change saved timing. New rooms use `config.studyLayout`; legacy fixed-attendance rooms use `config.marketSize` and `rules.tradersPerMarket`, defaulting to 16 if `marketSize` was not saved.

## Custom stepped supply and demand

Before creation, detailed settings use step 2 for attendance and markets and step 3, **供需プリセット**, for units, Commission, and conditions. Default evenly samples or duplicates existing presentation conditions for attendance and units. Custom settings generate a separate stepped schedule from p, K, L, and d. Teacher demos use the same form but have practice-specific Default conditions. The custom preview updates with input, and **設定を保存して閉じる** saves once before the admission-closing step.

Before starting an existing room, use **市場・取引条件** under **実験の準備**. For either Default or custom conditions, one click on **確定して次へ** saves and advances. The API receives generation parameters; the server regenerates, validates, and saves them. Student-facing general room settings omit generation parameters, seeds, and allocation tables.

The initial custom candidate is `p=80, K=8, L=4, d=4`. Switching from Default restores this candidate; reopening saved custom settings restores saved values. Attendance or unit changes do not automatically adjust prices, K, or L. Unit k's value/cost are respectively:

- For k≤K: `p±d(K+1−k)`.
- For K<k≤K+L: p.
- Thereafter: `p∓d(k−K−L)`.

K and L must be integers of at least one, K+L cannot exceed total units on a side, and d must be positive. Generated amounts must be integers from 1 to 99999 yen. Invalid candidates block saving; values are neither rounded nor truncated.

The production Default at 16 people and two units each matches `p=80, K=10, L=1, d=4` only in its sorted curves; individual two-unit combinations differ. Scaling Default to 100 people creates repeated-price steps outside the equilibrium price, so the current fixed positive d cannot reproduce it exactly. Demo Default also lacks a constant price step. The generator has not replaced Default.

Input updates the stepped graph, full unit table, equilibrium price and quantity bounds, positive/zero-surplus unit counts, maximum surplus, and candidate participant allocation. Unit k's horizontal segment spans quantity k−1 to k. With 16 units on each side, the initial candidate has equilibrium price 80 yen, quantity 8–12, and maximum surplus 288 yen. L values of 1, 4, and 6 give upper quantities of 9, 12, and 14 without changing price, positive-surplus quantity, or maximum surplus.

The graph centers on the original equilibrium price and the midpoint of its quantity interval, initially showing nearby values. **拡大** and **縮小** preserve the center and linear axes; **全体** shows all units and **初期表示** restores the initial range. Regions below zero or above total quantity use a different background with no curves. The right unit table scrolls independently within the screen height and supports PageDown and End when focused.

With N participants per side and U units each, assign sorted units i, i+N, …, i+(U−1)N to the same role. Equal-sized markets share role-specific schedules; differently sized markets evenly sample or duplicate the template. The same parameters generate each institution's configured units, and all price ranges and Commission limits are checked. Counts are saved in `config.studyUnitCounts`, schedules in `conditionsByInstitution`. This format uses per-unit orders. Older rooms retain their former quantity/order behavior until supply/demand settings are saved before starting.

Mulberry32 and Fisher–Yates shuffle all fixed market seats, then assign students in entry order. The same attendance, entry order, and integer seed from 0 to 4294967295 reproduce the allocation. The candidate seed defaults to 123456; saved room seeds are not changed automatically.

Room conditions stay unchanged until **確定して次へ**. The server regenerates and verifies the schedules, saves them in existing value/cost fields, then admission can close and actual-attendance allocation be checked. Legacy fixed-attendance rooms use **ランダムに割り当て**. The same seed gives the same allocation; for a new draw, change the seed, preview, and save before starting. The settings JSON's `generation` contains candidate parameters, seed, applied/confirmed times, and final participant ID, name, market, seat, role, units, values, and costs. Starting fixes conditions and allocations across periods and institutions. Manual edits or restoring presentation conditions clear generation metadata.

Equilibrium quantity is an interval. Zero-surplus trades that produce `Q/K>1` are not automatically labeled excessive or inefficient. Maximum surplus is the sum of positive sorted value-minus-cost differences; realized efficiency divides actual surplus by that maximum. Inefficient trades have value below cost. Teachers decide which L to adopt and whether to reuse seeds.

## Convergence metrics and exports

Prices are not forced toward equilibrium. Teachers can view and export by market, institution, and period:

- Mean price and mean absolute distance to the equilibrium-price interval.
- `α = sqrt(mean((price − p*)²)) / p*`, where p* is the interval midpoint. It is a ratio, not a percentage. Call includes individual trades from all clearings, weighted by quantity.
- The OLS slope of α over configured periods within each institution, using only normally completed periods with trades and recording the number included. This is descriptive, not a significance test or automatic convergence verdict.
- Traded quantity and `Q / Qpositive-surplus`; zero-surplus trades can make the ratio exceed one.
- Realized total surplus, efficiency relative to maximum surplus, and the count of trades with value below cost.
- CDA's time-weighted best-ask-minus-best-bid spread, measured only while both sides have orders and excluding pauses. Observation duration is exported too.

Price statistics without trades, ratios with zero denominators, and spreads without observation time are `null`, shown as **—** in the interface and blank in CSV. Surplus is value minus cost, excluding Commission; losses are not clamped to zero. Equilibrium, maximum-surplus, and efficiency benchmarks remain unchanged. Total Commission payments and aggregate participant profit including rewards are exported separately.

Trade CSV includes market, institution, overall period, institution-local period, clearing number, both unit indices, values, costs, profits with and without rewards, and per-side per-unit Commission. Summary CSV, audit CSV, and conditions JSON are also available. Exported timestamps use UTC; screens use Japan time. Conditions JSON includes institution order by market, conditions, rules, completion status, clearings, and metrics. Authentication information is not exported.

## Legacy rooms

Old three-good CDA rooms continue and support re-entry with their original rules. New rooms default to Experiment 1. To explicitly create the legacy format, use `/teacher?legacy=1`; its guide is `/guide?legacy=1`.

---

[Home](../../../README.en.md) · [Classroom guide](classroom.md) · [Demo Model](demo.md) · [EMH asset market experiment](emh.md) · [Judgement under Uncertainty](judgment.md) · [Development, deployment and verification](development.md) · [Stochastic Evolutionary Games](evolution.md)
