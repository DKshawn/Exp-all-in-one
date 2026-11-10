Avoid unnecessary secondary labels and descriptions. Let the layout do the explaining.

User acceptance is a required release gate. Complete implementation and local verification on a review branch, then wait for the user to explicitly accept the current changes before merging into `main` or deploying. Passing tests, a finished implementation, or earlier general permission to commit/push/deploy does not count as acceptance of a new change. Do not push an unaccepted change when that push triggers a Vercel preview or production deployment. Keep unaccepted work local and preserve it for review. Only an explicit user instruction for the specific release or rollback can authorize that operation.

Give navigation and action text a visible button shape using the shared button styles. Preserve link semantics for navigation and button semantics for actions; do not rely on text color alone to signal that a control is clickable.

Keep interface labels and control text, including card titles, on one line. Adjust sizing and responsive layouts so the full text remains visible without wrapping, truncation, or overlap; verify at supported screen sizes.

When changing a shared feature or control, check every experiment and its demo and formal screens, and apply the same labels, colors, styles, accessibility, and behavior wherever the feature is shared. Prefer shared components and tokens, and verify the affected screens; preserve experiment-specific behavior where it differs.

Whenever a formal experiment interface changes, update the corresponding demo interfaces at the same time, and vice versa. Check all affected experiments, teacher and student views, and previews; verify each corresponding screen while preserving intentional demo-specific behavior.

Do not add meaningless arrows. Use arrows only when they communicate a clear direction, relationship, or action.

Keep the color palette consistent with DoubleAuction: blue-purple primary, cool gray backgrounds, teal for buying, and warm orange for selling. Reuse the shared color tokens in `src/app/globals.css`.

The maintained platform checkout is `Exp-all-in-one`, matching `DKshawn/Exp-all-in-one`. Run development and release commands from this repository root and use repository-relative paths in scripts. `DoubleAuction` names an experiment module. EMH course materials are in `material/emh`, current protocol notes are in `docs/experiments/emh.md`, and original documents and hashes are in `docs/upstream/emh`. Historical local source, data and migration backups are under ignored `work/archives/emh-legacy-20261101`; do not use them as a second maintained app or commit private data. The former sibling `EMH` directory is a retained legacy copy with redirect instructions; platform development must not depend on it.

For this Windows checkout, the canonical source folder and command working directory are `C:\Users\dksha\Documents\project\Exp-all-in-one`. Configure it as the sole Source folders entry and Make primary in Codex. Existing chats may retain an old working directory: explicitly set the working directory and verify `git rev-parse --show-toplevel` before edits or Git operations. `Judgment_under_Uncertainty/Exp-all-in-one` is the retired standalone app; do not develop or release from it. Later teacher UI provenance is recorded under `docs/upstream/judgment/teacher-management-20261102`.

Keep released experiments together on `main`, in `src/experiments/double-auction`, `src/experiments/emh`, and `src/experiments/judgment`. Shared entry, room management, sessions, UI tokens, and database connections belong to the platform layer. Develop on short-lived feature branches and merge after validation; do not maintain a permanent branch per experiment. Preserve migration provenance and existing experiment data.

Whenever functionality is added, changed, or removed, update the Japanese `README.md`, Chinese `README.zh-CN.md`, English `README.en.md`, and the corresponding guides in `docs/guide/ja`, `docs/guide/zh-CN`, and `docs/guide/en` together in the same pull request. Keep feature descriptions, defaults, rules, examples, commands, and navigation links consistent across all three languages. Before merging, verify that the affected language versions describe the same behavior and that relative links and language-switch links resolve. Preserve archived source documents under `docs/upstream`; maintain current instructions in the guides instead.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
