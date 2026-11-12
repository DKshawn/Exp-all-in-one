# Demo Model

The demo list and screens use a yellow theme, with a demo-mode text label beside the site name. The blue-purple **DEMOモードを終了** button returns to the corresponding teacher setup, or to teacher experiment selection from the demo list.

[日本語](../ja/demo.md) · [中文](../zh-CN/demo.md) · [English](../en/demo.md)

At `/evolution/demo`, use the toolbar above the setup form to preview the student waiting screen. Return to the teacher view to continue editing your draft. Select **Create demo**, close admission and confirm the start. By default you control one seat and five simulated participants choose independently at random. During decisions and feedback, the same toolbar offers **Pause**, **Resume** and **Advance 30 s** in either view. Pause freezes the clock and simulated participants so you can read both payoffs in the student view. Switching views keeps the demo paused. Only teachers can pause a formal session. The language selector in the header affects only your browser. Reloading clears practice; demo downloads contain practice data only. [Rules and data](evolution.md)

Sign in at the teacher entry and open **Demo Model** to choose an experiment at `/demo/select`. Opening a demo or screen-size preview directly first takes you to teacher login, then returns you to that page. A student room session grants access only to the classroom experiment.

Select **市場実験室** or **戻る** in the demo header to return to the demo experiment list.

## Double Auction

Open [`/demo`](https://exp-all-in-one.vercel.app/demo) directly or choose Double Auction from the demo list. It starts with the same settings form used for production experiments. The defaults are one market and 16 participants; institutions, periods per institution, markets, participants, and timing are configurable using the same validation rules as room creation.

1. **デモルームを作成** opens a teacher view containing you and virtual participants. Use **作成前に詳細を設定** for detailed configuration before creation. Before starting, **実験設定を変更** can change institutions, periods, timing, values, and costs.
2. Close admission with **入室を締め切って割り当て** or the admission timer to allocate actual participants to markets and buyer/seller roles. **実験を開始** begins a five-second countdown before trading. **学生画面を見る** shows the transition from waiting to trading.
3. Each selected institution runs for its configured number of periods. CDA trades through the order book; Call clears public orders together at the deadline; Posted lets all buyers purchase directly at sellers' published prices.
4. **教員画面を見る** shows all-market results and both sides' orders, conditions, and profits for the selected market. The teacher view always displays both sides; roles cannot be switched there.
5. **一時停止** stops every market clock and virtual participant. **30秒進める** advances time while processing clearings and purchases. The last period of each institution has an eight-second results view before advancing, and the demo ends after the configured total periods. Switching to the teacher view does not place orders or make purchases on your behalf.
6. **実験設定に戻る** returns to the settings form with the previous institutions, periods, participant count, and timing preserved, ready to adjust and create a new demo.

The demo uses production matching, clearing, inventory, and profit calculations, but has demo-specific initial values and costs. Changing attendance samples or duplicates conditions using the production method. In CDA, the first three seconds of each period allow time to think; virtual buyers and sellers then submit orders every two seconds, initially leaving a larger profit margin and gradually reducing it. Call and Posted use fixed margins. These behaviors do not model human learning or price convergence.

State exists only in browser memory, with no writes to APIs, cookies, or Neon. Reloading returns to the initial settings screen. Changing roles or selecting **やり直す** resets progress with the configured composition. Progress pauses in background tabs.

### Screen-size preview

Open [`/demo/preview`](https://exp-all-in-one.vercel.app/demo/preview), or the link under **デモについて**, for an interactive laptop-size preview. Seven presets cover 1366×768 at 100%, 1920×1080 at 125%, 150%, and 100%, a 14-inch MacBook Pro at 1512×982 with Retina 2×, and 11- and 13-inch iPad Pro displays. Optionally subtract 120 CSS px for browser and operating-system bars.

The MacBook Pro preset converts 3024×1964 physical pixels to logical dimensions at 2×, giving 1512×862 CSS px after the reserved height. Actual browser and system overhead varies. A single fixed-size iframe displays `/demo`, so changing dimensions does not reload the demo or discard trading or teacher-view state. **全体に合わせる** scales only the outer display; **原寸** displays at 100%. The viewport dimensions and preview scale are both shown. Only same-origin `/demo` and `/emh/demo` embedding is allowed; teacher and production experiment pages remain protected against embedding.

The preview also starts with the teacher settings form. After creation, start, pause, reset, role selection, and return-to-settings controls sit outside the frame, preserving the experiment's display height. A same-origin React Portal controls the same demo session. Ordinary `/demo` keeps its control panel inside the page.

## EMH

The interface labels prices, dividends, trading balances and scores in yen.

After starting, a five-second countdown appears directly above the personal conditions panel in its trading-screen position, highlighted with an arrow and border. The page scrolls to reveal it if needed. Pausing also freezes the countdown.

[EMH Demo Model](https://exp-all-in-one.vercel.app/emh/demo) offers Experiment 1 and Experiment 2. Experiment 1 uses the same settings form, validation limits and defaults as the formal experiment. Set initial securities, target size, type ratios and A/B period duration, then choose **デモルームを作成**. It creates one market of 3–12 participants; everyone except you is virtual, with eight virtual participants by default.

Saving settings during admission, confirming and locking allocation, and explicitly releasing it before starting follow the formal workflow. Starting does not redraw confirmed types. Rounds, trade-attempt duration and break duration are configurable (defaults: 6 rounds, 30 seconds and 60 seconds). Securities, timing, payouts and efficiency use the shared engine. Practice A/B dividends in yen for types 1–3 are 120/40, 100/60 and 150/30; private classroom dividends are not used.

Experiment 2 uses one market of 3–999 people, with you and 11 virtual participants by default. Configure initial securities, target size, type ratios, the consecutive unsuccessful-attempt limit, insider start round and number per type, state probabilities and dividends. At start, each round’s state is drawn independently from those probabilities and reflected in Clues. The demo always simulates one market. Default practice dividends in yen are 80/110/170, 60/180/100 and 140/120/90, which differ from formal defaults. Virtual participants trade using their own information.

Both EMH experiments share the formal conditions panel: the buy and sell sides each place the limit and market buttons side by side. The order book lists price and quantity for both teachers and students. Students can see their own resting limits marked in the list and bar chart. Those limits stay active through other quotes, trades and individual timeouts until period end, unless filled, amended or cancelled. Experiment 2 groups state dividends, probabilities, expected dividend and the Clue, highlights the realized state card at round end, and shows trade and personal round records. Teachers can expand or collapse conditions with **実験条件**.

The EMH demo control panel switches between teacher and student views, pauses, advances 30 seconds or to the next period, restarts, and returns to settings. Fast-forward processes virtual trades and deadlines in order; it is disabled during the countdown and while paused. **やり直す** keeps the settings and resets allocation and progress. The screen-size preview places the control panel outside the frame.

Open the EMH screen-size preview at `/emh/demo/preview` or with **画面サイズ別プレビュー** on the demo setup page. Choose desktop, iPad or phone dimensions; the experiment screen and progress remain intact when switching sizes. You can reserve 120px for browser and system bars and choose fit-to-window or actual size.

**設定を見直す** restores the currently saved settings to the form and resets progress when another demo room is created. Reloading returns to the default settings page. State remains in browser memory, with no production room or Neon writes. See the [formal experiment conditions](emh.md).

## Judgement under Uncertainty

Task cards, selected count/list and randomization settings are shared with formal experiments. Use **デモを開始** in the right control panel; on narrow screens the panel moves above the cards. Setup supports Japanese, Chinese and English, and closing the preview retains the current selection. The preview opens in the teacher's selected language and also allows switching within the student view.

[Judgement Demo Model](https://exp-all-in-one.vercel.app/judgment/demo) previews the student screens after task selection. Circular **i** buttons open task details. The preview does not save answers and pauses time limits. Use the isolated local verification flow to check production timing and answer persistence.

Everyone can quote in EMH. Accepting an opposing price or submitting a crossing quote immediately trades one unit. Students see anonymous trade records and their own resting orders highlighted in the book; Experiment 1 scores are marked provisional until period B ends.

---

[Home](../../../README.en.md) · [Classroom guide](classroom.md) · [Double Auction](double-auction.md) · [EMH asset market experiment](emh.md) · [Judgement under Uncertainty](judgment.md) · [Development, deployment and verification](development.md)
