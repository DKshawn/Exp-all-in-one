import { randomBytes, randomInt } from "node:crypto";
import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  StudentClient,
  checkRoom,
  requestModel,
} from "./client.mjs";
import { createPrompts } from "./prompts.mjs";
import {
  classifyAction,
  DECISION_SCHEMA,
  isActive,
  marketObservationKey,
  observation,
  SYSTEM_PROMPT,
} from "./decision.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HELP = `独立 EMH 实验 2 AI 学生客户端（Node.js 22+）

  node run.mjs [--url http://localhost:3000] [--room ABCD23] [--count 90]
               [--provider local|openai] [--model MODEL]
               [--local-url http://127.0.0.1:11434/v1]
               [--interval 10] [--timeout 20] [--parallel 8] [--max-output-tokens ${DEFAULT_MAX_OUTPUT_TOKENS}]
               [--resume PATH] [--lmstudio-fast]

平台地址也可以填写包含房间代码的学生参加链接或教师房间链接。
未提供的连接信息会交互式询问，Token 输入不会显示。也可以分别通过
OPENAI_API_KEY 或 LOCAL_MODEL_API_KEY 环境变量提供 OpenAI 或本地模型的密钥。
本地模式使用 OpenAI 兼容的 /v1/chat/completions 接口。
--lmstudio-fast 使用 LM Studio Responses 接口并关闭模型长思考。
实验由教师创建、分配并启动；Ctrl+C 停止 AI。--resume 使用已有学生身份重新入室。
`;

function parseArgs(args) {
  const valid = new Set([
    "url",
    "room",
    "count",
    "provider",
    "model",
    "local-url",
    "interval",
    "timeout",
    "parallel",
    "max-output-tokens",
    "resume",
  ]);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--help" || args[i] === "-h") return { help: true };
    if (args[i] === "--lmstudio-fast") {
      options["lmstudio-fast"] = true;
      continue;
    }
    const name = args[i].startsWith("--") ? args[i].slice(2) : "";
    if (
      !valid.has(name) ||
      i + 1 === args.length ||
      args[i + 1].startsWith("--")
    )
      throw new Error(`未知参数或缺少参数值：${args[i]}`);
    options[name] = args[++i];
  }
  return options;
}

function url(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label}必须是完整的 http 或 https URL`);
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  )
    throw new Error(
      `${label}必须是无账号密码、查询参数和片段的 http 或 https URL`,
    );
  return parsed.href.replace(/\/$/, "");
}

export function localModelAddress(value) {
  const baseUrl = url(value, "本地模型地址");
  const parsed = new URL(baseUrl);
  if (parsed.pathname === "/") return `${parsed.origin}/v1`;
  if (parsed.pathname.endsWith("/chat/completions"))
    return baseUrl.slice(0, -"/chat/completions".length);
  return baseUrl;
}

export function platformAddress(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("实验平台地址必须是完整的 http 或 https URL");
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.hash
  )
    throw new Error("实验平台地址必须是无账号密码和片段的 http 或 https URL");
  const params = [...parsed.searchParams.entries()];
  if (
    parsed.pathname === "/" &&
    params.length === 1 &&
    params[0][0] === "code"
  ) {
    const code = params[0][1].toUpperCase();
    if (!/^[A-Z2-9]{6}$/.test(code))
      throw new Error("参加链接中的房间代码无效");
    return { baseUrl: parsed.origin, roomCode: code };
  }
  const match = parsed.pathname.match(/^\/room\/([A-Z2-9]{6})\/?$/i);
  if (
    match &&
    (params.length === 0 ||
      (params.length === 1 &&
        params[0][0] === "entry" &&
        ["student", "teacher"].includes(params[0][1])))
  )
    return { baseUrl: parsed.origin, roomCode: match[1].toUpperCase() };
  if (parsed.search)
    throw new Error("请填写平台地址或带有有效房间代码的参加链接");
  return { baseUrl: parsed.href.replace(/\/$/, ""), roomCode: null };
}

export function resolveRoomCode(explicit, extracted) {
  const code = (explicit || extracted || "").toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(code))
    throw new Error("房间代码必须是 6 个字母或数字 2～9");
  if (explicit && extracted && code !== extracted)
    throw new Error("指定的房间代码与链接中的代码不一致");
  return code;
}

function positive(value, label, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > max)
    throw new Error(`${label}必须是 1～${max} 的整数`);
  return number;
}

class ModelSlots {
  constructor(limit) {
    this.limit = limit;
    this.active = 0;
  }
  acquire() {
    if (this.active >= this.limit) return false;
    this.active++;
    return true;
  }
  release() {
    this.active--;
  }
}

async function wait(seconds, signal) {
  try {
    await sleep(seconds * 1000, undefined, { signal });
  } catch (error) {
    if (error.name !== "AbortError") throw error;
  }
}

export async function runStudent(client, config, slots, signal, report) {
  let nextDecisionAt = 0;
  let nextCapacityLogAt = 0;
  let waitingOn = null;
  const endWaiting = (reason) => {
    if (!waitingOn) return;
    report({
      student: client.identity.nickname,
      type: "waiting_ended",
      round: waitingOn.round,
      market: waitingOn.market,
      waitDurationMs: Math.max(0, Date.now() - waitingOn.startedAt),
      reason,
    });
    waitingOn = null;
  };
  await wait(Math.random() * config.pollSeconds, signal);
  while (!signal.aborted) {
    let stage = "state";
    let modelStartedAt;
    let modelDurationMs;
    try {
      const state = await client.state();
      if (state.experiment !== "exp2") throw new Error("此房间不是 EMH 实验 2");
      if (
        state.status === "completed" ||
        state.market?.status === "completed"
      ) {
        endWaiting("experiment_completed");
        report({ student: client.identity.nickname, type: "completed" });
        return;
      }
      const active = isActive(state);
      if (waitingOn && !active) endWaiting("market_inactive");
      if (waitingOn && active && marketObservationKey(state) !== waitingOn.key)
        endWaiting("market_changed");
      const shouldDecide = active && !waitingOn && Date.now() >= nextDecisionAt;
      if (shouldDecide && !slots.acquire()) {
        if (Date.now() >= nextCapacityLogAt) {
          report({
            student: client.identity.nickname,
            type: "deferred",
            round: state.market.year,
            market: state.marketId,
            skipReason: "model_capacity",
          });
          nextCapacityLogAt = Date.now() + config.interval * 1000;
        }
      } else if (shouldDecide) {
        nextDecisionAt = Date.now() + config.interval * 1000;
        let result;
        try {
          stage = "model";
          modelStartedAt = performance.now();
          result = await requestModel({
            baseUrl: config.modelUrl,
            apiKey: config.apiKey,
            model: config.model,
            timeoutMs: config.timeout * 1000,
            maxOutputTokens: config.maxOutputTokens,
            prompt: { system: SYSTEM_PROMPT, observation: observation(state) },
            schema: DECISION_SCHEMA,
            provider: config.provider,
            lmstudioFast: config.lmstudioFast,
          });
        } finally {
          if (modelStartedAt !== undefined)
            modelDurationMs = Math.round(performance.now() - modelStartedAt);
          slots.release();
        }
        if (signal.aborted) {
          report({
            student: client.identity.nickname,
            type: "skipped",
            round: state.market.year,
            market: state.marketId,
            decision: result.decision,
            usage: result.usage,
            modelDurationMs,
            skipReason: "run_stopped",
          });
          break;
        }
        stage = "refresh";
        const latest = await client.state();
        if (
          result.decision?.action === "wait" &&
          typeof result.decision.reason === "string" &&
          isActive(latest) &&
          latest.marketId === state.marketId &&
          latest.market.year === state.market.year
        ) {
          waitingOn = {
            key: marketObservationKey(state),
            startedAt: Date.now(),
            round: state.market.year,
            market: state.marketId,
          };
          report({
            student: client.identity.nickname,
            type: "waiting_started",
            round: state.market.year,
            market: state.marketId,
            decision: result.decision,
            usage: result.usage,
            modelDurationMs,
          });
          if (marketObservationKey(latest) !== waitingOn.key)
            endWaiting("market_changed");
          await wait(config.pollSeconds, signal);
          continue;
        }
        const { action, skipReason } = classifyAction(
          result.decision,
          state,
          latest,
        );
        if (action) {
          stage = "submit";
          await client.act(latest.marketId, action);
        }
        report({
          student: client.identity.nickname,
          type: action ? "submitted" : "skipped",
          round: state.market.year,
          market: state.marketId,
          decision: result.decision,
          usage: result.usage,
          modelDurationMs,
          ...(skipReason ? { skipReason } : {}),
        });
      }
    } catch (error) {
      report({
        student: client.identity.nickname,
        type: "error",
        errorStage: stage,
        skipReason: `${stage}_${error.name === "TimeoutError" || error.name === "AbortError" ? "timeout" : "error"}`,
        ...(modelDurationMs !== undefined ? { modelDurationMs } : {}),
        error:
          error.name === "TimeoutError" || error.name === "AbortError"
            ? "请求超时，本次不交易"
            : error.message,
      });
      nextDecisionAt = Date.now() + config.interval * 1000;
    }
    await wait(config.pollSeconds, signal);
  }
  endWaiting("run_stopped");
}

async function makeManifest(code, count, baseUrl) {
  const prefix = `A${randomBytes(3).readUIntBE(0, 3).toString(36).padStart(5, "0").slice(-3).toUpperCase()}`;
  return {
    version: 1,
    code,
    baseUrl,
    createdAt: new Date().toISOString(),
    students: Array.from({ length: count }, (_, index) => ({
      nickname: `${prefix}${String(index + 1).padStart(3, "0")}`,
      pin: String(randomInt(10000)).padStart(4, "0"),
    })),
  };
}

function validateManifest(manifest) {
  if (
    manifest?.version !== 1 ||
    !/^[A-Z2-9]{6}$/.test(manifest.code) ||
    !Array.isArray(manifest.students) ||
    manifest.students.length < 1 ||
    manifest.students.length > 999 ||
    new Set(manifest.students.map((student) => student.nickname)).size !==
      manifest.students.length ||
    manifest.students.some(
      (student) =>
        !/^A[A-Z0-9]{3}\d{3}$/.test(student.nickname) ||
        !/^\d{4}$/.test(student.pin),
    )
  )
    throw new Error("恢复文件格式不正确");
  manifest.baseUrl = url(manifest.baseUrl, "实验平台地址");
  return manifest;
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  if (options.help) {
    console.log(HELP);
    return;
  }
  const prompts = createPrompts();
  const ask = prompts.ask;
  let config;
  let manifest;
  try {
    if (options.resume) {
      manifest = validateManifest(
        JSON.parse(await readFile(options.resume, "utf8")),
      );
      if (options.room || options.count || options.url)
        throw new Error(
          "恢复时房间、地址和人数由恢复文件确定，请勿同时指定 --room、--url 或 --count",
        );
    } else {
      const { baseUrl, roomCode } = platformAddress(
        options.url ||
          (await ask("实验平台地址或参加链接", "http://localhost:3000")),
      );
      const code = resolveRoomCode(
        options.room || roomCode || (await ask("EMH 实验 2 房间代码")),
        roomCode,
      );
      if (roomCode) console.log(`已从链接识别房间代码：${code}`);
      const count = positive(
        options.count || (await ask("AI 学生人数", "10")),
        "AI 学生人数",
        999,
      );
      manifest = await makeManifest(code, count, baseUrl);
    }
    const provider = (
      options.provider || (await ask("模型来源（local / openai）", "local"))
    ).toLowerCase();
    if (!["local", "openai"].includes(provider))
      throw new Error("模型来源必须为 local 或 openai");
    if (provider !== "local" && options["lmstudio-fast"])
      throw new Error("--lmstudio-fast 仅适用于本地 LM Studio");
    const model =
      options.model ||
      (await ask(
        "模型名称",
        provider === "openai" ? "gpt-5.4-mini" : undefined,
      ));
    if (!model) throw new Error("请填写模型名称");
    const modelUrl =
      provider === "openai"
        ? "https://api.openai.com/v1"
        : localModelAddress(
            options["local-url"] ||
              (await ask("本地模型 API 地址", "http://127.0.0.1:11434/v1")),
          );
    if (provider === "openai" && options["local-url"])
      throw new Error("--local-url 仅适用于本地模型");
    let apiKey =
      provider === "openai"
        ? process.env.OPENAI_API_KEY
        : process.env.LOCAL_MODEL_API_KEY;
    if (!apiKey && process.stdin.isTTY) {
      apiKey = await prompts.secret(
        provider === "openai"
          ? "OpenAI API 密钥（输入不会显示）"
          : "本地模型 API Token（输入不会显示；不需要则直接回车）",
      );
    }
    if (provider === "openai" && !apiKey)
      throw new Error("请输入 OpenAI API 密钥，或设置 OPENAI_API_KEY 环境变量");
    config = {
      provider,
      model,
      modelUrl,
      apiKey,
      interval: positive(options.interval ?? "10", "决策间隔（秒）", 3600),
      timeout: positive(options.timeout ?? "20", "模型超时（秒）", 300),
      parallel: positive(options.parallel ?? "8", "模型最大并发数", 999),
      maxOutputTokens: positive(
        options["max-output-tokens"] ?? DEFAULT_MAX_OUTPUT_TOKENS,
        "模型输出上限（tokens）",
        32768,
      ),
      pollSeconds: 2,
      lmstudioFast: Boolean(options["lmstudio-fast"]),
    };
  } finally {
    prompts.close();
  }

  await checkRoom(manifest.baseUrl, manifest.code);
  await mkdir(path.join(root, ".local", "runs"), { recursive: true });
  const manifestPath = options.resume
    ? path.resolve(options.resume)
    : path.join(
        root,
        ".local",
        "runs",
        `${manifest.code}-${Date.now()}-${randomBytes(3).toString("hex")}.json`,
      );
  if (!options.resume)
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
  const logPath = `${manifestPath}.jsonl`;
  console.log(
    `模型：${config.provider} / ${config.model}；房间：${manifest.code}；AI 学生：${manifest.students.length} 人`,
  );
  console.log(`模型接口：${config.modelUrl}`);
  if (config.lmstudioFast)
    console.log("LM Studio 快速模式：关闭长思考，由模型直接决定。");
  console.log(`身份恢复文件：${manifestPath}\n记录文件：${logPath}`);
  console.log("恢复文件包含学生 PIN，请妥善保存。正在入室……");

  // Join the first identity before the rest to verify the room's experiment.
  const clients = manifest.students.map(
    (student) => new StudentClient(manifest.baseUrl, manifest.code, student),
  );
  await clients[0].join();
  const first = await clients[0].state();
  if (first.experiment !== "exp2")
    throw new Error(
      `房间不是 EMH 实验 2；已入室的 ${clients[0].identity.nickname} 不会交易`,
    );
  for (let index = 1; index < clients.length; index++) {
    await clients[index].join();
    if ((index + 1) % 10 === 0 || index + 1 === clients.length)
      console.log(`已入室 ${index + 1}/${clients.length}`);
  }
  const roomMessage =
    first.status === "open"
      ? "请在实验平台教师页面分配市场并开始实验。"
      : first.status === "assigned"
        ? "市场已分配，请在教师页面开始实验。"
        : "已连接已有实验；如果实验已暂停，请在教师页面恢复。";
  console.log(
    `全部 ${clients.length} 人已入室。${roomMessage}按 Ctrl+C 停止。`,
  );
  const controller = new AbortController();
  const stop = () => {
    console.log("\n正在停止；未完成的 AI 决策不会提交。 ");
    controller.abort();
  };
  process.once("SIGINT", stop);
  const slots = new ModelSlots(config.parallel);
  let logging = Promise.resolve();
  const report = (entry) => {
    const record = { at: new Date().toISOString(), ...entry };
    logging = logging
      .then(() => appendFile(logPath, `${JSON.stringify(record)}\n`))
      .catch((error) => console.error(`记录写入失败：${error.message}`));
    if (entry.type === "error")
      console.error(`${entry.student}：${entry.error}`);
    else if (entry.type === "submitted")
      console.log(
        `${entry.student} 市場 ${entry.market} 第 ${entry.round} 轮：${entry.decision.action}${entry.decision.price == null ? "" : ` ${entry.decision.price}円`}`,
      );
    else if (entry.type === "waiting_started")
      console.log(
        `${entry.student} 市場 ${entry.market} 第 ${entry.round} 轮：AI 进入等待状态`,
      );
    else if (entry.type === "skipped")
      console.log(
        `${entry.student} 市場 ${entry.market} 第 ${entry.round} 轮：${entry.decision.action === "wait" ? "AI 决定等待" : "决定已过期或不符合交易条件，本次未执行"}`,
      );
    else if (entry.type === "completed")
      console.log(`${entry.student}：实验结束`);
  };
  report({
    type: "run_started",
    provider: config.provider,
    model: config.model,
    count: clients.length,
    intervalSeconds: config.interval,
    timeoutSeconds: config.timeout,
    maxConcurrency: config.parallel,
    maxOutputTokens: config.maxOutputTokens,
    lmstudioFast: config.lmstudioFast,
  });
  try {
    await Promise.all(
      clients.map((client) =>
        runStudent(client, config, slots, controller.signal, report),
      ),
    );
  } finally {
    process.removeListener("SIGINT", stop);
    await logging;
  }
  console.log("AI 学生已停止。");
}
