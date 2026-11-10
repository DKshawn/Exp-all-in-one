import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

export function createPrompts(input = process.stdin, output = process.stdout) {
  let hidden = false;
  const display = new Writable({
    write(chunk, encoding, done) {
      if (!hidden) output.write(chunk, encoding);
      done();
    },
  });
  const readline = createInterface({
    input,
    output: display,
    terminal: Boolean(input.isTTY),
  });
  return {
    async ask(label, fallback) {
      if (!input.isTTY)
        throw new Error(
          `缺少 ${label}；非交互模式请使用命令行参数。使用 --help 查看说明。`,
        );
      const answer = (
        await readline.question(`${label}${fallback ? ` [${fallback}]` : ""}: `)
      ).trim();
      return answer || fallback || "";
    },
    async secret(label) {
      if (!input.isTTY) return "";
      // The prompt is rendered before echo is disabled; typed characters and
      // readline's redisplay are suppressed until the answer is complete.
      const answer = readline.question(`${label}: `);
      hidden = true;
      try {
        return (await answer).trim();
      } finally {
        hidden = false;
        output.write("\n");
      }
    },
    close() {
      readline.close();
    },
  };
}
