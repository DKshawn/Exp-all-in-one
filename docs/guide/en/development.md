# Development, deployment and verification

[日本語](../ja/development.md) · [中文](../zh-CN/development.md) · [English](../en/development.md)

Browser compatibility and mobile trading checks run in Chromium, Firefox and WebKit. `npx playwright install chromium firefox webkit` · `npm run test:e2e -- classroom-compat.spec.ts shared-order-book.spec.ts`

Stochastic games use the shared migrator and four `evolution_` tables. Run `npx tsx --test tests/evolution.test.ts` for engine and PGlite checks, and `npx playwright test evolution.spec.ts` for both classroom flows and the demo. [Rules and data](evolution.md)

## Local setup

In Codex **Edit project**, keep only `C:\Users\dksha\Documents\project\Exp-all-in-one` under **Source folders** and choose **Make primary**. Do not attach the old `EMH` or `Judgment_under_Uncertainty` copies for development. Existing chats may retain their recorded working directory, so verify the command directory and `git rev-parse --show-toplevel` before work. The old teacher branch is documented in the [port record](../../upstream/judgment/teacher-management-20261102/README.md); make subsequent changes only in the unified repository.

The local project folder is `Exp-all-in-one`. Run all commands from that repository root.

Use Node.js 24.x, matching `.nvmrc`, CI, and Vercel. `package.json` also pins `engines.node` to `24.x` to prevent automatic changes to future major versions.

```sh
npm ci
npm run dev
```

On Windows, `pwsh -NoProfile -File scripts/dev-local.ps1` starts an isolated local verification environment on port 3200, using `.data/platform-verification`. The old EMH folder is no longer needed; see the [consolidation record](../../releases/emh-folder-consolidation.md).

The ordinary development server's teacher entry is `http://localhost:3000/teacher`; open it directly using its separate URL. With a key configured, authentication is required before experiment selection. Without Neon configured, the app uses embedded PostgreSQL through PGlite at `.data/auction`. Do not open the same data directory from multiple servers. Production uses Neon.

Set `TEACHER_ACCESS_KEY` in the Git-ignored `.env.local` and restart the server to use teacher demos locally. With no key, local classroom development remains available and the demo login stays disabled.

Teacher entry and room pages with `?entry=teacher` validate authentication on the server. `POST /api/teacher/session` validates the key and issues an eight-hour signed HttpOnly, SameSite=Lax cookie, with Secure on HTTPS. The key itself is never stored in the cookie or browser storage. `DELETE` logs out; key rotation invalidates existing sessions. Creation, management, deletion and Judgment teacher-preview APIs validate the session while retaining `accessKey` support for existing authenticated scripts. No new environment variable or database migration is required.

Screen-size previews allow same-origin embedding only for `/demo` and `/emh/demo`; teacher and formal-room pages remain protected against embedding.

## Vercel + Neon

| Environment variable | Purpose                                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`       | Neon pooled PostgreSQL connection string; required on Vercel                                                     |
| `TEACHER_ACCESS_KEY` | Shared key for teacher-entry authentication and session signing; required on Vercel and not shared with students |
| `PGLITE_DATA_DIR`    | Optional local data directory                                                                                    |

Deploy from GitHub to Vercel. The function region in `vercel.json` is `sin1`, matching Neon Singapore. Tables initialize on first connection, or manually with `npm run db:migrate`. Production does not fall back to a local database.

Keep `.env*`, `.data`, `work`, and test artifacts out of Git. Use a separate Neon branch for preview environments.

## Synchronization and consistency

SSE streams order and trade changes, normally sending only authorized view deltas. Initial connections and reconnects receive a current snapshot. Double Auction students see history for the configured periods of the current institution; cumulative profits and all teacher records are retained. Reconnection and low-frequency HTTP reads recover from interrupted streams. One participant disconnecting does not automatically pause other participants or the experiment clock. Teachers control all-market pauses. Order deadlines still use database time.

Experiment 1 stores trading state, deduplication IDs, and audit records by market. Student orders lock only their market row; teacher pause/resume operations coordinate all markets through the shared-settings lock. State and audit records commit in one transaction. Deadlines advance on connected servers; if everyone disconnects, the next access catches up from the recorded timestamps.

Local PostgreSQL uses LISTEN/NOTIFY to notify other application processes. Direct notifications online require `REALTIME_DATABASE_URL`, a direct connection that supports LISTEN. Without it, the server polls a small per-room version list and streams deltas. Local measurements cannot guarantee cloud capacity or cost.

Authentication tokens use HttpOnly cookies; the database stores hashes only. Passwords and PINs use salted scrypt. Teacher data requires authentication. Students are not sent others' values or costs, or other markets' orders. Call order books publish only their market's prices and remaining quantities. Audit CSVs distinguish shared operations from market operations.

See [local PostgreSQL setup and the 192-participant load check (Japanese)](../../local-capacity-testing.md). `LOCAL_ONLY=1` and `LOCAL_DATABASE_URL` keep verification away from cloud connections. Distinguish single-process PGlite checks from concurrent checks using actual PostgreSQL.

## Verification and development policy

```sh
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
```

Automated tests cover the three institutions, marginal values and per-unit orders for 1–5 units, balanced institution-order allocation, database admission for 96 participants across six markets, concurrent requests, deadlines, pauses, convergence metrics, private information, exports, and compatibility with saved rooms. Module-specific HTTP verification is documented under [EMH](emh.md) and [Judgement](judgment.md).

`tests/e2e` contains Playwright browser tests. `npm run test:e2e` uses a dedicated local database and a temporary teacher key. For a separate local test server, supply its key in `VERIFY_TEACHER_KEY_FILE`. Do not point `E2E_BASE_URL`, which selects an existing environment, at production. The suite includes regression checks for legacy 12-person CDA rooms and the teacher form for creating Experiment 1.

Keep all released experiments together on `main`. Use short-lived feature branches, validate, merge, and delete the branch. The platform owns entry points, rooms, sessions, and database connections; modules own experiment rules and data. See the [architecture and development policy](../../architecture.md).

Key Double Auction files are `src/experiments/double-auction/lib/study-core.ts` for rules, `study-view.ts` and `study-export.ts` in the same directory for views/statistics and exports, and `src/experiments/double-auction/components/study-room.tsx` and `study-settings.tsx` for the interface and settings. Photo credits are in [public/fruits/CREDITS.md](../../../public/fruits/CREDITS.md).

## Documentation synchronization

The **Documentation sync** PR check compares all committed changes in the PR from the common branch point, not only the latest commit. It checks READMEs and related guides for missing Japanese, Chinese, or English updates. Check annotations and the run summary list unchanged or missing language files and the changes that triggered the reminder. Documentation warnings do not automatically block merging. A Git comparison failure fails the check instead of reporting an inspection that did not run.

| Change                                                                     | Guides checked                                                    |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Experiment modules, or routes/styles with an experiment name in their path | The corresponding `double-auction.md`, `emh.md`, or `judgment.md` |
| Demo code                                                                  | `demo.md` and the relevant experiment or shared guide             |
| Shared UI, entry, and room code                                            | `classroom.md`                                                    |
| Shared server code                                                         | `classroom.md` and `development.md`                               |
| Scripts, Actions workflows, dependencies, and runtime configuration        | `development.md`                                                  |

These changes also check all three READMEs. Editing one language of a README or a guide under `docs/guide/{ja,zh-CN,en}/` checks the other versions of that same document, including newly added guide topics. Deleting or renaming only one language warns; retiring or renaming all three guide versions together is allowed for documentation-only changes. Test-only changes, `AGENTS.md`, and archived source materials under `docs/upstream` are not treated as feature changes.

Run the same comparison locally after committing. Uncommitted edits are not included:

```sh
npm run docs:check -- --base origin/main --head HEAD
```

This is a changed-file reminder. It cannot assess translation meaning or accuracy, or determine whether a refactor needs documentation. Review the corresponding versions and links, and include necessary updates in the same PR. If no update is needed, explain why during review rather than making meaningless edits to silence the warning.

---

[Home](../../../README.en.md) · [Classroom guide](classroom.md) · [Double Auction](double-auction.md) · [Demo Model](demo.md) · [EMH asset market experiment](emh.md) · [Judgement under Uncertainty](judgment.md)
