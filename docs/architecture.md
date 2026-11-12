# Unified experiment platform

Maintained repository: https://github.com/DKshawn/Exp-all-in-one

All released experiments live on `main`. Develop on short-lived feature branches,
run the checks below, review the diff, then merge and delete the feature branch.
Do not maintain a permanent branch per experiment.

| Layer         | Location                               | Responsibility                                                                                                       |
| ------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Platform      | `src/app`, `src/components`, `src/lib` | Routing, teacher entry, room registry/management, student entry, scoped sessions, shared UI and database connections |
| DoubleAuction | `src/experiments/double-auction`       | Settings, market allocation, institutions, trading, settlement and exports                                           |
| EMH           | `src/experiments/emh`                  | Default six rounds, A/B periods, automatic groups, trading, dividends and exports                                    |
| Judgment      | `src/experiments/judgment`             | Question catalog, random conditions/order, timing, answers, multilingual rendering, analysis and exports             |

Next.js API routes are thin adapters. Module services enforce authorization,
validation, transactional updates and module-specific room state. Shared auth
primitives and HttpOnly role cookies remain compatible with existing rooms.

One Vercel project uses the shared Neon/PostgreSQL connection. Table prefixes
`auction_`, `emh_` and `judgment_` isolate each experiment. `lab_room_registry`
claims room codes across modules. Each module owns its schema; the shared
migrator applies them in one transaction under an advisory lock. Existing auction
tables and persisted room formats are retained. Local development uses PGlite
unless a loopback PostgreSQL URL is supplied.

Stochastic Evolutionary Games lives in `src/experiments/evolution`. Its
`evolution_` tables keep room state, credentials and presence, login attempts,
and completed rounds. The room lock serializes cutoff, matching, decisions and
deadline transitions across server instances. Role-specific projections exclude
other seats from student responses. The practice demo runs the same engine in
browser memory. See the [protocol and export guide](guide/en/evolution.md).

## Checks

```sh
npm ci
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
```

For a second local server use `LOCAL_NEXT_DIST_DIR` and a separate
`PGLITE_DATA_DIR`. Never point local verification at production data. HTTP flow
scripts create clearly named test rooms. Production verification must use a
confirmed deployment origin and the teacher key, and must only alter rooms it
created. Preserve existing classroom rooms.

Judgment migration provenance and protocol differences are in
`src/experiments/judgment/UPSTREAM.md`; original methods, citations and notices
are in `docs/upstream/judgment`.

EMH course materials are in `material/emh`; protocol notes and original-document
provenance are in `docs/experiments/emh.md` and `docs/upstream/emh`. Local-only
legacy files and database backups are under ignored `work/archives`; current
verification data are in `.data/platform-verification`. The standalone sibling
EMH app is retired.
