import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { resultsCsv } from "./src/results.mjs";

async function main([input, output, ...extra]) {
  if (
    !input ||
    input === "--help" ||
    !input.endsWith(".jsonl") ||
    extra.length
  ) {
    console.log(
      "用法：node ai-emh/export-results.mjs 记录文件.jsonl [结果文件.csv]",
    );
    if (input !== "--help") process.exitCode = 1;
    return;
  }
  const room = path.basename(input).match(/^([A-Z2-9]{6})-/)?.[1];
  const destination =
    output ?? `${input.slice(0, -".jsonl".length)}.results.csv`;
  const csv = resultsCsv(await readFile(input, "utf8"), room);
  try {
    await writeFile(destination, csv, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    throw new Error(`结果文件已存在，请指定其他保存路径：${destination}`, {
      cause: error,
    });
  }
  console.log(`结果文件：${path.resolve(destination)}`);
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
