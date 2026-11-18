# Judgement under Uncertainty

[日本語](../ja/judgment.md) · [中文](../zh-CN/judgment.md) · [English](../en/judgment.md)

To rank an item, drag it or select the item and then its rank. Static questions record elapsed time on response without continually redrawing the form.

The demo highlights the current item number in gold. Confirming **End experiment** in the demo returns you to task selection with your choices preserved.

Student waiting screens share a consistent card design while retaining experiment-specific information.

This module comes from the former standalone Judgment application, previously named `DKshawn/Exp-all-in-one`. Its implementation is in `src/experiments/judgment/`. See the [pinned source and change record](../../../src/experiments/judgment/UPSTREAM.md).

The teacher setup header has **戻る** to return to experiment selection. The demo task-selection header has **戻る** to return to the demo list and **DEMOモードを終了** to return to teacher setup.

Select tasks using cards with descriptions. The right panel groups the selected count, task list, randomization and create/start/end/preview controls, staying visible while scrolling on desktop and moving above the cards on narrow screens. Teacher pages support Japanese, Chinese and English and remember the language in this browser. Switching language does not change task selection or randomization. The preview opens in the teacher's selected language and also allows switching within the student view. Settings are locked during an active run, while the circular **i** buttons and preview remain usable. After ending, configure the next run in the same room.

1. Select from 14 available tasks and configure task-order and option-order randomization separately. The circular **i** button shows the description, estimated duration, and implementation conditions without changing the selection. Tasks are not automatically selected in advance. Teachers use their signed-in session to open the demo and request preview questions. The student preview does not save answers and pauses time limits.
2. After authenticating at the teacher entry, set a room teacher password with at least eight characters and create a room, and share its code. Students join with a seven-digit student ID, preserving leading zeros, and a four-digit PIN, then wait for the teacher to start.
3. Starting assigns a condition to each student. Students answer at their own pace, and late entry is allowed. Conditions and ordering are saved and remain unchanged on re-entry. The student interface supports Japanese, Chinese, and English.
4. The five-second multiplication task starts timing when the task starts. Late input is rejected; interruptions such as reloads and missing responses are recorded. The conversation task matches reciprocal answers within the same run using the actual partner's student ID.
5. Teachers monitor progress and select the red **End experiment** button to end the current run after confirmation. They can then select tasks again and start another run in the same room. Completed answers are retained separately by run.
6. CSV contains one row per answer. The full JSON includes conditions, random seeds, complete task text, language history, measurements, run history, and conversation-pair analysis. Selecting all 14 tasks produces 86 pages.

The original SQLite server is not started. The module uses `judgment_*` tables through the shared PostgreSQL connection and registers codes in the platform room registry. It shares the Vercel + Neon configuration; the old application's SQLite data is not automatically imported.

Run the module checks with `npx tsx --test tests/judgment-platform.test.ts`. For the complete HTTP flow, run `npx tsx scripts/verify-judgment-http.ts` against an isolated local server. It defaults to `http://127.0.0.1:3200`; override it with `JUDGMENT_TEST_ORIGIN`. The script creates test rooms and must not run against a cloud database.

---

[Home](../../../README.en.md) · [Classroom guide](classroom.md) · [Double Auction](double-auction.md) · [Demo Model](demo.md) · [EMH asset market experiment](emh.md) · [Development, deployment and verification](development.md)
