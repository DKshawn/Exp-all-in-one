# Exp-all-in-one

[日本語](README.md) · [中文](README.zh-CN.md) · [English](README.en.md)

A classroom experiment platform with one entry point for Double Auction, EMH, and Judgement under Uncertainty. The interface opens in Japanese by default.

Student waiting screens share a consistent card design while retaining experiment-specific information.

[Teacher entry](https://exp-all-in-one.vercel.app/teacher) · [Student entry](https://exp-all-in-one.vercel.app) (the teacher entry has a separate URL)

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

In Double Auction, the teacher's student allocation panel collapses after the experiment starts and can be reopened at any time; the demo behaves the same way. Demo settings use the yellow theme, and the demo controls sit below the header.

Enter the teacher key once at the teacher entry. The same browser stays signed in for eight hours across reloads, experiment changes, room creation and management. Sign in again after logout, expiry or a key change; each room keeps its separate teacher password.

[Illustrated instructions, re-entry, and room management](docs/guide/en/classroom.md) · [Using Demo Model](docs/guide/en/demo.md)

Signed-in teachers can use **Demo Model** to try each experiment. Teacher sign-in is also required when opening a demo or screen-size preview directly.

Judgement teacher pages and the demo share task cards, the selection list and controls, with Japanese, Chinese and English switching and settings locked during a run.

## Experiments

| Experiment                  | Scope                                                                                                                              | Guide                                             | Demo                                                          |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------- |
| Double Auction              | Compare CDA, Call Market, and Posted Offer; allocate markets and roles using actual attendance                                     | [Flow and rules](docs/guide/en/double-auction.md) | [Demo Model](https://exp-all-in-one.vercel.app/demo)          |
| EMH                         | Trade securities and observe how dividends and information affect prices (Experiments 1 and 2)                                     | [Flow and rules](docs/guide/en/emh.md)            | [Demo Model](https://exp-all-in-one.vercel.app/emh/demo)      |
| Judgement under Uncertainty | 14 judgment and cognitive bias tasks, condition assignment, task and option ordering, timing, and Japanese/Chinese/English display | [Flow and data](docs/guide/en/judgment.md)        | [Demo Model](https://exp-all-in-one.vercel.app/judgment/demo) |

## Standalone AI student program

The [EMH Experiment 2 AI student program](ai-emh/README.en.md) joins as a configurable number of students and makes decisions using a local model or the OpenAI API. It does not substitute rule-based robots when a model does not respond.

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
