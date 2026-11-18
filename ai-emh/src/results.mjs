const columns = [
  "roomCode",
  "experiment",
  "variant",
  "runId",
  "student",
  "round",
  "market",
  "group",
  "period",
  "unit",
  "role",
  "provider",
  "model",
  "responseModel",
  "lmstudioFast",
  "modelRequestedAt",
  "at",
  "modelDurationMs",
  "inputTokens",
  "outputTokens",
  "totalTokens",
  "status",
  "action",
  "choice",
  "selectedOption",
  "price",
  "reason",
  "command",
  "skipReason",
  "errorStage",
  "error",
];

function cell(value) {
  if (value == null) return "";
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const safe = /^\s*[=+\-@＝＋－＠]|^[\t\r\n]/u.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function resultsCsv(log, fallbackRoom) {
  let run;
  const rows = [columns.join(",")];
  for (const [index, line] of log.split("\n").entries()) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch (error) {
      throw new Error(`记录文件第 ${index + 1} 行不是有效 JSON`, {
        cause: error,
      });
    }
    if (!event || typeof event !== "object" || typeof event.type !== "string") {
      throw new Error(`记录文件第 ${index + 1} 行缺少事件类型`);
    }
    if (event.type === "run_started") {
      run = event;
      continue;
    }
    if (!event.student || !Number.isFinite(event.modelDurationMs)) continue;
    const { decision, usage } = event;
    const row = {
      ...event,
      roomCode: event.roomCode ?? run?.roomCode ?? fallbackRoom,
      experiment: event.experiment ?? run?.experiment,
      runId: event.runId ?? run?.runId ?? run?.at,
      provider: event.provider ?? run?.provider,
      model: event.model ?? run?.model,
      lmstudioFast: event.lmstudioFast ?? run?.lmstudioFast,
      status: event.type,
      inputTokens: usage?.prompt_tokens ?? usage?.input_tokens,
      outputTokens: usage?.completion_tokens ?? usage?.output_tokens,
      totalTokens: usage?.total_tokens,
      action: decision?.action,
      choice: decision?.choice,
      price: decision?.price,
      reason: decision?.reason,
    };
    rows.push(columns.map((name) => cell(row[name])).join(","));
  }
  return `\uFEFF${rows.join("\r\n")}\r\n`;
}
