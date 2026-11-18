import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const languages = ["ja", "zh-CN", "en"];
const readmes = ["README.md", "README.zh-CN.md", "README.en.md"];
const moduleNames = ["double-auction", "emh", "judgment", "evolution"];

/** @param {string} path */
function featureTopics(path) {
  const topics = new Set();
  if (
    /\.(?:md|mdx|txt)$/.test(path) ||
    /\.(?:test|spec|d)\.[cm]?[jt]sx?$/.test(path)
  ) {
    return topics;
  }
  if (path.startsWith("src/") || path.startsWith("public/")) {
    const experiment = /^(?:src\/app\/(?:demo|guide)\/)/.test(path)
      ? "double-auction"
      : moduleNames.find((name) =>
          new RegExp(`(?:^|/)${name}(?:/|\\.)`).test(path),
        );
    topics.add(experiment ?? "classroom");
    if (/(?:^|[/.-])demo(?:[/.-]|$)/.test(path)) topics.add("demo");
    if (path.startsWith("src/lib/server/")) topics.add("development");
  } else if (
    path.startsWith("scripts/") ||
    path.startsWith(".github/workflows/") ||
    /^(?:package(?:-lock)?\.json|\.nvmrc|\.env\.example|vercel\.json|next\.config\.[cm]?[jt]s|tsconfig\.json|eslint\.config\.[cm]?[jt]s|playwright(?:\.[\w-]+)?\.config\.[cm]?[jt]s)$/.test(
      path,
    )
  ) {
    topics.add("development");
  }
  return topics;
}

/**
 * Inspect changed files, not translation meaning. Warnings require human review.
 * @param {{ changedPaths: string[], headFiles: string[] }} comparison
 */
export function checkDocumentationSync({ changedPaths, headFiles }) {
  const changed = new Set(changedPaths);
  const existing = new Set(headFiles);
  /** @type {Map<string, { key: string, paths: string[], reasons: Set<string>, requiredByCode: boolean }>} */
  const groups = new Map();
  /** @param {string} key @param {string} reason @param {boolean} [requiredByCode] */
  function requireGroup(key, reason, requiredByCode = false) {
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        paths:
          key === "README"
            ? readmes
            : languages.map((lang) => `docs/guide/${lang}/${key}`),
        reasons: new Set(),
        requiredByCode: false,
      };
      groups.set(key, group);
    }
    group.reasons.add(reason);
    group.requiredByCode ||= requiredByCode;
  }
  for (const path of changed) {
    if (readmes.includes(path)) requireGroup("README", path);
    const guide = /^docs\/guide\/(?:ja|zh-CN|en)\/(.+\.md)$/s.exec(path);
    if (guide) requireGroup(guide[1], path);
    const topics = featureTopics(path);
    if (topics.size) {
      requireGroup("README", path, true);
      for (const topic of topics) requireGroup(`${topic}.md`, path, true);
    }
  }
  const warnings = [];
  for (const group of groups.values()) {
    // Removing all translations together is a synchronized retirement.
    if (
      group.key !== "README" &&
      !group.requiredByCode &&
      group.paths.every((path) => !existing.has(path))
    )
      continue;
    const missing = group.paths.flatMap((path, index) => {
      if (!existing.has(path))
        return [{ language: languages[index], path, state: "missing" }];
      if (!changed.has(path))
        return [{ language: languages[index], path, state: "unchanged" }];
      return [];
    });
    if (missing.length) {
      warnings.push({
        group: group.key,
        missing,
        triggers: [...group.reasons].sort(),
      });
    }
  }
  return warnings.sort((a, b) => a.group.localeCompare(b.group));
}

/** @param {string} value */
function escapeCommand(value) {
  return value
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
}
/** @param {string} value */
function escapeProperty(value) {
  return escapeCommand(value).replaceAll(":", "%3A").replaceAll(",", "%2C");
}
/** @param {ReturnType<typeof checkDocumentationSync>[number]} warning */
export function warningAnnotation(warning) {
  const files = warning.missing
    .map(
      ({ language, path, state }) =>
        `${language}: ${path} (${state === "missing" ? "file missing" : "not updated in this PR"})`,
    )
    .join("; ");
  return `::warning file=${escapeProperty(warning.missing[0].path)},line=1,title=Documentation sync::${escapeCommand(`${warning.group}: ${files}. Review and synchronize Japanese, Chinese, and English documentation in this PR.`)}`;
}
/** @param {string} value */
function codeCell(value) {
  const escaped = value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("|", "&#124;")
    .replaceAll("`", "&#96;")
    .replaceAll("\r", "&#13;")
    .replaceAll("\n", "&#10;");
  return `<code>${escaped}</code>`;
}
/** @param {ReturnType<typeof checkDocumentationSync>} warnings */
export function summaryMarkdown(warnings) {
  const lines = ["## Documentation sync", ""];
  if (!warnings.length) {
    lines.push(
      "No missing language updates detected in the changed documentation groups.",
    );
  } else {
    lines.push(
      "Review the following Japanese / Chinese / English documentation updates:",
      "",
      "| Document group | Missing updates | Changed files that triggered the check |",
      "| --- | --- | --- |",
    );
    for (const warning of warnings) {
      const missing = warning.missing
        .map(
          ({ language, path, state }) =>
            `${language}: ${codeCell(path)} (${state === "missing" ? "file missing" : "not updated"})`,
        )
        .join("<br>");
      const triggers = warning.triggers.slice(0, 5).map(codeCell).join("<br>");
      const remaining =
        warning.triggers.length > 5
          ? `<br>and ${warning.triggers.length - 5} more`
          : "";
      lines.push(
        `| ${codeCell(warning.group)} | ${missing} | ${triggers}${remaining} |`,
      );
    }
  }
  lines.push(
    "",
    "This is a non-blocking, changed-file reminder. It cannot verify translation accuracy or determine whether a refactor needs documentation. Review the listed versions; do not add meaningless edits just to silence a warning.",
    "",
  );
  return lines.join("\n");
}

/** @param {string[]} args @param {string} cwd */
function git(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}
/** @param {{ base: string, head: string, cwd?: string }} options */
export function compareCommits({ base, head, cwd = process.cwd() }) {
  // Resolve refs as commits without shell interpolation or option injection.
  const baseSha = git(
    ["rev-parse", "--verify", "--end-of-options", `${base}^{commit}`],
    cwd,
  ).trim();
  const headSha = git(
    ["rev-parse", "--verify", "--end-of-options", `${head}^{commit}`],
    cwd,
  ).trim();
  const mergeBase = git(["merge-base", baseSha, headSha], cwd).trim();
  const changedPaths = git(
    ["diff", "--name-only", "--no-renames", "-z", mergeBase, headSha, "--"],
    cwd,
  )
    .split("\0")
    .filter(Boolean);
  const headFiles = git(["ls-tree", "-r", "--name-only", "-z", headSha], cwd)
    .split("\0")
    .filter(Boolean);
  return { changedPaths, headFiles };
}
/** @param {string[]} args */
function optionsFromArgs(args) {
  const options = {
    base: process.env.DOCS_BASE_SHA || "origin/main",
    head: process.env.DOCS_HEAD_SHA || "HEAD",
  };
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    if ((key !== "--base" && key !== "--head") || !value)
      throw new Error("Usage: npm run docs:check -- --base <ref> --head <ref>");
    options[key === "--base" ? "base" : "head"] = value;
  }
  return options;
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    const warnings = checkDocumentationSync(
      compareCommits(optionsFromArgs(process.argv.slice(2))),
    );
    for (const warning of warnings) {
      if (process.env.GITHUB_ACTIONS === "true")
        console.log(warningAnnotation(warning));
    }
    const summary = summaryMarkdown(warnings);
    console.log(summary);
    if (process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      process.env.GITHUB_ACTIONS === "true"
        ? `::error title=Documentation sync could not run::${escapeCommand(message)}`
        : message,
    );
    process.exitCode = 1;
  }
}
