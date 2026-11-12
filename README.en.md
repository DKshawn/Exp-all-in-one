# Exp-all-in-one

[日本語](README.md) · [中文](README.zh-CN.md) · [English](README.en.md)

A classroom experiment platform for Double Auction, EMH, Judgement under Uncertainty and Stochastic Evolutionary Games. The interface opens in Japanese by default.

Student waiting screens share a consistent card design while retaining experiment-specific information. Select an experiment by clicking its card. In all four experiments, teachers can end the current run with the red **End experiment** button and a confirmation.

[Teacher entry](https://exp-all-in-one.vercel.app/teacher) · [Student entry](https://exp-all-in-one.vercel.app) (the teacher entry has a separate URL)

The EMH order book shows price and quantity and marks your resting orders in both the list and bar chart. Teachers can find buyer and seller numbers in the trade records and CSV export. On each side, the limit and market buttons sit side by side. Experiment 2 shows each state’s dividend multiplied by its public probability and highlights the realized state on its card at round end. Unfilled limits queue by price, then arrival time, until period end. You can amend or cancel them. Draft bid and ask prices also stay in their fields throughout the period.

Stochastic games support manual or timed admission, pause/resume, phase advance and early termination. Students can review personal rounds beside their decisions. The demo defaults to one manual seat and five simulated participants. Once you create the demo room, its toolbar lets you switch between teacher and student views. From either view you can pause to read feedback, resume or advance 30 seconds. Each person chooses their display language in the page header.

## Get started

```mermaid
---
config:
  theme: base
  look: classic
  layout: dagre
  htmlLabels: true
  flowchart:
    rankSpacing: 24
    wrappingWidth: 180
---
flowchart LR
    accTitle: Classroom workflow
    accDescr: The teacher creates a room and shares the entry and code. Students join with their nickname or student ID and PIN. The teacher starts the experiment, students participate, and the teacher downloads results.
    A["1 · Teacher<br/>Sign in and select<br/>Create and share room"]
    B["2 · Students<br/>Code, nickname/ID, PIN<br/>Join and wait"]
    C["3 · Session<br/>Teacher starts<br/>Students participate"]
    D["4 · Teacher<br/>Download results<br/>Discuss in class"]
    A --> B --> C --> D
    classDef teacher fill:#eeeefd,stroke:#5456c7,color:#22283d
    classDef shared fill:#f6f7fb,stroke:#6a7287,color:#22283d
    class A,D teacher
    class B,C shared
```

The teacher creates and shares a room, and students join with its code, using a nickname or student ID as instructed by the teacher. The teacher chooses the experiment, explains the rules, and downloads the results after the session.

In Double Auction, the teacher's student allocation panel collapses after the experiment starts and can be reopened at any time; the demo behaves the same way.

Enter the teacher key once at the teacher entry. The same browser stays signed in for eight hours across reloads, experiment changes, room creation and management. Sign in again after logout, expiry or a key change; each room keeps its separate teacher password.

EMH labels prices, dividends, trading balances and profits in yen.

After the teacher starts EMH, a five-second countdown appears directly above the personal conditions panel in its trading-screen position, highlighted with an arrow and border; trading opens when it ends. The round strip beside the clock is shared with Stochastic Evolutionary Games. Completed rounds are bright green. The current round is gold in demos and purple in formal rooms.

EMH Demo Model supports both experiments. Experiment 2 defaults to a 12-person market and uses separate practice dividends and states. Students see their state-contingent dividends and probabilities. In both experiments, students see buy and sell controls in separate columns, market prices, and personal records together; teachers can expand or collapse conditions during play. Open `/emh/demo/preview` to view the demo at different screen sizes.

The standalone [EMH Experiment 2 AI student program](ai-emh/README.en.md) joins through student interfaces with a configurable participant count, accepts room links and hidden token input, adds `/v1` to local model server roots, and uses a local model or OpenAI for decisions. It does not substitute rule-based robots when a model does not respond. The AI action log also records model request duration and reasons for skipped actions. The default output limit is 2048 tokens per model request. When an AI waits, the program monitors its student market view and requests a new decision after a market change.

An optional LM Studio fast mode disables extended reasoning; complete fenced JSON blocks are also supported.

Everyone can quote in EMH. Accepting an opposing price or submitting a crossing quote immediately trades one unit. Students see anonymous trade records and their own resting orders highlighted in the book; Experiment 1 profits are marked provisional until period B ends. Holdings, trading balance, and the current round profit appear as three cards in one row in the student’s conditions panel.

Experiment 2 configures initial securities, the unsuccessful-attempt limit, insider start round and number per type, state probabilities, dividends, market count, target size and type ratios. At start, each round’s state is drawn independently from the configured probabilities and saved; markets in the same room share the draw and Clues show the corresponding state. Market count may be automatic or specified; actual attendance is split into markets of 3–999. Defaults are a target of 12, two securities, two unsuccessful attempts and up to two insiders per type from round 3.

The EMH demo control panel switches between teacher and student views, pauses, advances 30 seconds or to the next period, restarts, and returns to settings. Fast-forward processes virtual trades and deadlines in order; it is disabled during the countdown and while paused. **やり直す** keeps the settings and resets allocation and progress. The screen-size preview places the control panel outside the frame.

[Illustrated instructions, re-entry, and room management](docs/guide/en/classroom.md) · [Using Demo Model](docs/guide/en/demo.md)

Teachers sign in once to open **Demo Model**, including direct links to a demo or its screen-size preview. The demo list and screens use a yellow theme, with a gold demo-mode label beside the site name. Select **市場実験室** or **戻る** to return to the demo experiment list. The blue-purple **DEMOモードを終了** button returns to the corresponding teacher setup, or to teacher experiment selection from the demo list.

Judgement teacher pages and the demo share task cards, the selection list and controls, with Japanese, Chinese and English switching and settings locked during a run.

## Experiments

| Experiment                    | Scope                                                                                                                                             | Guide                                             | Demo                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------- |
| Double Auction                | Compare CDA, Call Market, and Posted Offer; allocate markets and roles using actual attendance                                                    | [Flow and rules](docs/guide/en/double-auction.md) | [Demo Model](https://exp-all-in-one.vercel.app/demo)          |
| EMH                           | Configure round count, round, trade and break durations in both experiments; Experiment 2 also configures participants, information and dividends | [Flow and rules](docs/guide/en/emh.md)            | [Demo Model](https://exp-all-in-one.vercel.app/emh/demo)      |
| Judgement under Uncertainty   | 14 judgment and cognitive bias tasks, condition assignment, task and option ordering, timing, and Japanese/Chinese/English display                | [Flow and data](docs/guide/en/judgment.md)        | [Demo Model](https://exp-all-in-one.vercel.app/judgment/demo) |
| Stochastic Evolutionary Games | Coordination or Nash demand, private random matches, group trends and raw exports                                                                 | [Rules and data](docs/guide/en/evolution.md)      | `/evolution/demo`                                             |

## Development and materials

Built with Next.js / React / TypeScript, deployed on Vercel + Neon PostgreSQL, and run with Node.js 24.x. Released experiments are independent modules maintained together on `main`.

The **Documentation sync** PR check warns about missing Japanese, Chinese, or English updates to READMEs and related guides.

- [Local setup, environment variables, deployment, and verification](docs/guide/en/development.md)
- [Architecture and development policy](docs/architecture.md)
- [Experiment materials index (Japanese and original materials)](material/README.md)
- [EMH source materials and protocol mapping (Japanese)](docs/experiments/emh.md)
- [Judgment sources, implementation scope, and limitations](docs/upstream/judgment/README.en.md)
- [Migration and verification record](docs/releases/unified-platform-migration.md)

[GitHub and issue tracker](https://github.com/DKshawn/Exp-all-in-one/issues) · [Vercel project](https://vercel.com/dkshawns-projects/exp-all-in-one)
