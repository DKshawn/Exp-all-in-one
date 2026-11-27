import { randomUUID } from "node:crypto";
import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { service } from "@/experiments/double-auction/server/service";
import { emhService } from "@/experiments/emh/server/service";
import { evolutionService } from "@/experiments/evolution/server/service";
import { checkRoom, type StudentClient } from "../../../ai-emh/src/client.mjs";
import {
  extendManifest,
  joinStudents,
  localModelAddress,
  makeManifest,
  ModelSlots,
  runStudent,
} from "../../../ai-emh/src/main.mjs";
import { resultsCsv } from "../../../ai-emh/src/results.mjs";
import {
  AI_ADMISSION_DEFAULTS,
  aiParticipantLimit,
  aiRunActive,
  isAiExperiment,
  type AiAdmission,
  type AiConsoleView,
  type AiExperiment,
  type AiProvider,
  type AiRecord,
  type AiRun,
  type AiSetup,
} from "../ai-console";
import { AuctionError } from "./errors";

const limit = 120;
const root = () => path.join(process.cwd(), "ai-emh", ".local", "console");
const file = (id: string, name: string) => path.join(root(), id, name);
const loopbackNames = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function aiConsoleEnabled() {
  return process.env.AI_EXPERIMENTS_ENABLED === "1" && !process.env.VERCEL;
}

export function aiSetup(): AiSetup | undefined {
  if (aiConsoleEnabled())
    return {
      localModel: process.env.AI_EXPERIMENTS_LOCAL_MODEL ?? "",
      openaiAvailable: Boolean(process.env.OPENAI_API_KEY?.trim()),
    };
}

export function aiConsoleOrigin(request: NextRequest) {
  if (!aiConsoleEnabled())
    throw new AuctionError("AI 実験台は利用できません。", 404);
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const url = new URL(`${request.nextUrl.protocol}//${host}`);
  if (!loopbackNames.has(url.hostname))
    throw new AuctionError("ローカルホストで開いてください。", 403);
  return url.origin;
}

type ActiveRun = {
  run: AiRun;
  controller: AbortController;
  records: AiRecord[];
  topUp?: (count: number, accessKey: string) => Promise<void>;
};
const shared = globalThis as typeof globalThis & {
  aiExperimentRuns?: Map<string, ActiveRun>;
};
const active = (shared.aiExperimentRuns ??= new Map<string, ActiveRun>());

function message(error: unknown, apiKey?: string) {
  if (error instanceof TypeError && error.message === "fetch failed")
    return "接続できませんでした。プラットフォームとモデルサーバーを確認してください。";
  const text =
    error instanceof Error ? error.message : "AI の実行に失敗しました。";
  return (apiKey ? text.replaceAll(apiKey, "[redacted]") : text).slice(0, 800);
}

function missing(error: unknown) {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

async function readText(filename: string) {
  try {
    return await readFile(filename, "utf8");
  } catch (error) {
    if (!missing(error)) throw error;
    return "";
  }
}

async function fromDisk(id: string): Promise<AiRun | null> {
  const text = await readText(file(id, "run.json"));
  if (!text) return null;
  const run = JSON.parse(text) as AiRun;
  if (aiRunActive(run.phase)) {
    run.phase = "interrupted";
    for (const entry of parseRecords(
      await readText(file(id, "decisions.jsonl")),
    ))
      updateCounts(run, entry);
    run.joined = Math.max(
      run.joined,
      ...String(await readText(file(id, "admission.txt")))
        .trim()
        .split("\n")
        .map(Number),
    );
  }
  return run;
}

function parseRecords(text: string) {
  // A process interruption can leave a final partial line on disk.
  return text
    .split("\n")
    .slice(0, -1)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as AiRecord);
}

function updateCounts(run: AiRun, record: AiRecord) {
  if (record.type === "submitted") run.submitted++;
  if (record.modelDurationMs !== undefined) run.decisions++;
}

function keep(entry: AiRecord) {
  return (
    entry.type === "submitted" ||
    entry.type === "skipped" ||
    entry.type === "error" ||
    entry.type === "waiting_started"
  );
}

async function save(run: AiRun) {
  await writeFile(file(run.id, "run.tmp"), JSON.stringify(run), {
    mode: 0o600,
  });
  await rename(file(run.id, "run.tmp"), file(run.id, "run.json"));
}

async function knownRuns() {
  let ids: string[];
  try {
    ids = await readdir(root());
  } catch (error) {
    if (!missing(error)) throw error;
    ids = [];
  }
  const live = Array.from(active.values(), ({ run }) => ({ ...run }));
  const liveIds = new Set(live.map(({ id }) => id));
  const previous = await Promise.all(
    ids
      .filter((id) => /^[0-9a-f-]{36}$/.test(id) && !liveIds.has(id))
      .map(fromDisk),
  );
  return [...live, ...previous.filter((run) => run !== null)].sort((a, b) =>
    b.startedAt.localeCompare(a.startedAt),
  );
}

export async function aiRoomRun(code: string) {
  const matches = (await knownRuns()).filter((run) => run.code === code);
  return matches.find((run) => aiRunActive(run.phase)) ?? matches[0] ?? null;
}

export async function aiRunStatus(id: string) {
  const run = active.get(id)?.run ?? (await fromDisk(id));
  if (!run) throw new AuctionError("実行記録が見つかりません。", 404);
  return { ...run };
}

export async function aiConsoleView(id?: string): Promise<AiConsoleView> {
  const runs = await knownRuns();
  const selected =
    id ?? (runs.find((run) => aiRunActive(run.phase)) ?? runs[0])?.id ?? null;
  if (selected && !runs.some((run) => run.id === selected))
    throw new AuctionError("実行記録が見つかりません。", 404);
  const records = selected
    ? (active.get(selected)?.records ??
      parseRecords(await readText(file(selected, "decisions.jsonl")))
        .filter(keep)
        .slice(-limit))
    : [];
  return { runs, records: records.slice().reverse(), selected };
}

export async function aiConsoleCsv(id: string) {
  const run = active.get(id)?.run ?? (await fromDisk(id));
  if (!run) throw new AuctionError("実行記録が見つかりません。", 404);
  const log = await readText(file(id, "decisions.jsonl"));
  return {
    name: `${run.code}-${run.id}.csv`,
    content: resultsCsv(log.slice(0, log.lastIndexOf("\n") + 1), run.code),
  };
}

type Input = Pick<AiRun, "code" | "provider" | "model" | "count"> & {
  parallel: number;
  timeout: number;
  interval: number;
  maxOutputTokens: number;
};

function modelConnection(provider: AiProvider) {
  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) throw new AuctionError("OPENAI_API_KEY を設定してください。");
    return { modelUrl: "https://api.openai.com/v1", apiKey };
  }
  const modelUrl = localModelAddress(
    process.env.AI_EXPERIMENTS_LOCAL_URL || "http://127.0.0.1:11434/v1",
  );
  if (!loopbackNames.has(new URL(modelUrl).hostname))
    throw new AuctionError(
      "AI_EXPERIMENTS_LOCAL_URL にローカルホストを指定してください。",
    );
  return { modelUrl, apiKey: process.env.LOCAL_MODEL_API_KEY };
}

async function roomAdmissionRemaining(run: AiRun, accessKey: string) {
  const rooms = {
    institutions: service,
    emh: emhService,
    evolution: evolutionService,
  };
  const [room] = await (
    await rooms[run.experiment]()
  ).listRooms(accessKey, run.code);
  if (room?.admissionRemaining === undefined)
    throw new AuctionError(
      "入室受付が終了しました。",
      409,
      "AI_ADMISSION_CLOSED",
    );
  return room.admissionRemaining;
}

async function execute(
  current: ActiveRun,
  input: Input,
  origin: string,
  connection: ReturnType<typeof modelConnection>,
) {
  const { run, controller, records } = current;
  const { signal } = controller;
  let manifest = makeManifest(input.code, input.count, origin);
  let decisionStarted = false;
  const config = {
    ...input,
    ...connection,
    pollSeconds: 1,
    lmstudioFast: false,
    onDecisionStart: () => {
      decisionStarted = true;
      if (run.phase === "ready") run.phase = "running";
    },
  };
  let writes = Promise.resolve();
  let storageError: unknown;
  const enqueue = (write: () => Promise<void>) => {
    writes = writes
      .then(async () => {
        if (!storageError) await write();
      })
      .catch((error) => {
        storageError = error;
        controller.abort();
      });
  };

  function report(record: Omit<AiRecord, "at">) {
    if (!keep(record as AiRecord)) return;
    const entry: AiRecord = {
      ...record,
      at: new Date().toISOString(),
      ...(record.error
        ? { error: message(new Error(record.error), connection.apiKey) }
        : {}),
    };
    updateCounts(run, entry);
    records.push(entry);
    if (records.length > limit) records.shift();
    enqueue(() =>
      appendFile(
        file(run.id, "decisions.jsonl"),
        `${JSON.stringify({ ...entry, runId: run.id, roomCode: run.code, experiment: run.experiment, provider: run.provider, model: run.model })}\n`,
        { mode: 0o600 },
      ),
    );
  }

  const slots = new ModelSlots(input.parallel);
  const workers: Promise<void>[] = [];
  let workerFailure: unknown;
  let failed = false;
  let admitting = Promise.resolve();
  function startWorker(client: StudentClient) {
    workers.push(
      runStudent(client, config, slots, signal, report).catch(
        (error: unknown) => {
          if (!signal.aborted) workerFailure ??= error;
        },
      ),
    );
  }

  async function admitRemaining(startAsAdmitted: boolean) {
    const offset = run.joined;
    return joinStudents(
      { ...manifest, students: manifest.students.slice(offset) },
      run.experiment,
      signal,
      (joined: number, client: StudentClient) => {
        const total = offset + joined;
        run.joined = total;
        enqueue(() =>
          appendFile(file(run.id, "admission.txt"), `${total}\n`, {
            mode: 0o600,
          }),
        );
        if (startAsAdmitted) startWorker(client);
      },
    );
  }

  current.topUp = async (count, accessKey) => {
    if (count < run.count)
      throw new AuctionError(
        `AI の目標人数は ${run.count} 人以上にしてください。`,
        409,
      );
    if (
      count === run.count &&
      (run.joined === count || run.phase === "joining")
    )
      return;
    if (run.phase !== "ready")
      throw new AuctionError(
        "入室受付中に、現在の AI の入室が終わってから補充してください。",
        409,
      );
    run.phase = "joining";
    const prepare = (async () => {
      const remaining = await roomAdmissionRemaining(run, accessKey);
      signal.throwIfAborted();
      if (count - run.joined > remaining)
        throw new AuctionError(
          `入室できる残り人数は ${remaining} 人です。`,
          409,
          "AI_ADMISSION_CAPACITY",
        );
      if (count > run.count) {
        const next = extendManifest(manifest, count);
        const temporary = file(run.id, "participants.tmp");
        await writeFile(
          temporary,
          JSON.stringify({ ...next, experiment: run.experiment }),
          { mode: 0o600 },
        );
        signal.throwIfAborted();
        await rename(temporary, file(run.id, "participants.json"));
        manifest = next;
        run.count = count;
        // Recovery counts all events in the log for an interrupted run.
        await save({ ...run, submitted: 0, decisions: 0 });
      }
      run.error = undefined;
    })();
    admitting = prepare
      .then(async () => {
        try {
          await admitRemaining(true);
        } catch (error) {
          if (!signal.aborted) run.error = message(error, connection.apiKey);
        }
      })
      .catch(() => {
        // The caller receives preflight errors without stopping the enrolled AI.
      })
      .finally(() => {
        if (!signal.aborted) run.phase = decisionStarted ? "running" : "ready";
      });
    try {
      await prepare;
    } catch (error) {
      await admitting;
      throw error;
    }
  };

  try {
    await writeFile(
      file(run.id, "participants.json"),
      JSON.stringify({ ...manifest, experiment: run.experiment }),
      { mode: 0o600, flag: "wx" },
    );
    const clients = await admitRemaining(false);
    signal.throwIfAborted();
    run.phase = "ready";
    clients.forEach(startWorker);
    let waited = 0;
    while (waited < workers.length) {
      const batch = workers.slice(waited);
      waited = workers.length;
      await Promise.all(batch);
      await admitting;
    }
    if (workerFailure) throw workerFailure;
  } catch (error) {
    if (!signal.aborted) {
      failed = true;
      run.error = message(error, connection.apiKey);
    }
    controller.abort();
    await admitting;
    await Promise.all(workers);
  } finally {
    await writes;
    if (storageError) run.error = "実行記録を保存できませんでした。";
    run.phase =
      failed || storageError
        ? "failed"
        : signal.aborted
          ? "stopped"
          : "finished";
    try {
      await save(run);
    } catch {
      run.phase = "failed";
      run.error = "実行記録を保存できませんでした。";
      return;
    }
    active.delete(run.id);
  }
}

export async function startAiRun(input: Input, origin: string) {
  const connection = modelConnection(input.provider);
  let experiment: string;
  try {
    experiment = await checkRoom(origin, input.code);
  } catch (error) {
    throw new AuctionError(message(error), 400);
  }
  if (!isAiExperiment(experiment))
    throw new AuctionError("この実験には対応していません。");
  return enqueueAiRun(input, origin, experiment, connection);
}

export function prepareAiAdmission(
  input: AiAdmission,
  origin: string,
  experiment: AiExperiment,
) {
  const connection = modelConnection(input.provider);
  return (code: string) =>
    enqueueAiRun(
      { ...AI_ADMISSION_DEFAULTS, ...input, code },
      origin,
      experiment,
      connection,
    );
}

async function enqueueAiRun(
  input: Input,
  origin: string,
  experiment: AiExperiment,
  connection: ReturnType<typeof modelConnection>,
) {
  if (
    Array.from(active.values()).some(
      ({ run }) => run.code === input.code && aiRunActive(run.phase),
    )
  ) {
    throw new AuctionError("このルームでは AI が実行中です。", 409);
  }
  const run: AiRun = {
    id: randomUUID(),
    code: input.code,
    experiment,
    provider: input.provider,
    model: input.model,
    count: input.count,
    joined: 0,
    submitted: 0,
    decisions: 0,
    phase: "joining",
    startedAt: new Date().toISOString(),
  };
  const current: ActiveRun = {
    run,
    controller: new AbortController(),
    records: [],
  };
  active.set(run.id, current);
  try {
    await mkdir(path.dirname(file(run.id, "run.json")), {
      recursive: true,
      mode: 0o700,
    });
    await save(run);
  } catch (error) {
    active.delete(run.id);
    throw error;
  }
  void execute(current, input, origin, connection);
  return { ...run };
}

export function stopAiRun(id: string) {
  const current = active.get(id);
  if (!current || !aiRunActive(current.run.phase))
    throw new AuctionError("この実行は終了しています。", 409);
  current.run.phase = "stopping";
  current.controller.abort();
}

export async function topUpAiRun(id: string, count: number, accessKey: string) {
  const current = active.get(id);
  if (!current?.topUp || current.controller.signal.aborted)
    throw new AuctionError("補充できる AI 実行が見つかりません。", 409);
  if (count > aiParticipantLimit(current.run.experiment))
    throw new AuctionError("AI の目標人数が上限を超えています。", 409);
  await current.topUp(count, accessKey);
  return { ...current.run };
}
