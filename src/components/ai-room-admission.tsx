"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import {
  AI_ADMISSION_DEFAULTS,
  AI_ADMISSION_LIMIT,
  aiRunActive,
  type AiAdmission,
  type AiPhase,
  type AiProvider,
  type AiRun,
  type AiSetup,
} from "@/lib/ai-console";
import { api, errorMessage } from "@/lib/client";
import { AiExperimentDialog } from "./ai-experiment-dialog";

const labels = {
  enable: ["AI を参加させる", "让 AI 参与", "Include AI participants"],
  count: ["AI 人数", "AI 人数", "AI participants"],
  provider: ["接続先", "模型来源", "Provider"],
  local: ["ローカル", "本地", "Local"],
  model: ["モデル名", "模型名称", "Model"],
  admission: ["AI 入室", "AI 入室", "AI admission"],
  start: ["AI を入室させる", "让 AI 入室", "Admit AI"],
  console: ["AI 実験台", "AI 实验台", "AI console"],
  close: ["閉じる", "关闭", "Close"],
  startFailed: [
    "AI の入室を開始できませんでした。",
    "AI 入室未能启动。",
    "AI admission could not start.",
  ],
  runFailed: [
    "AI の実行中に問題が発生しました。",
    "AI 运行过程中出现问题。",
    "There was a problem with the AI run.",
  ],
  disconnected: [
    "AI の状況を更新できません。",
    "无法更新 AI 状态。",
    "Could not refresh AI status.",
  ],
  joining: ["入室中", "入室中", "Joining"],
  ready: ["開始待ち", "等待开始", "Ready"],
  running: ["実行中", "运行中", "Running"],
  stopping: ["停止中", "停止中", "Stopping"],
  finished: ["実験終了", "实验结束", "Finished"],
  stopped: ["停止済み", "已停止", "Stopped"],
  failed: ["実行失敗", "运行失败", "Failed"],
  interrupted: ["中断", "已中断", "Interrupted"],
} satisfies Record<AiPhase, [string, string, string]> &
  Record<string, [string, string, string]>;

type Language = "ja" | "zh-CN" | "en";
const text = (language: Language, key: keyof typeof labels) =>
  labels[key][language === "ja" ? 0 : language === "zh-CN" ? 1 : 2];

export function readAiAdmission(fields: FormData): AiAdmission | undefined {
  if (!fields.has("aiEnabled")) return;
  return {
    provider: fields.get("aiProvider") as AiProvider,
    model: String(fields.get("aiModel") ?? "").trim(),
    count: Number(fields.get("aiCount")),
  };
}

export function AiAdmissionFields({
  config,
  capacity = AI_ADMISSION_LIMIT,
  disabled,
  language = "ja",
  submitLabel,
}: {
  config: AiSetup;
  capacity?: number;
  disabled: boolean;
  language?: Language;
  submitLabel?: string;
}) {
  const id = useId();
  const [enabled, setEnabled] = useState(false);
  const [provider, setProvider] = useState<AiProvider>("local");
  const [model, setModel] = useState(config.localModel);
  const max = Math.max(1, capacity);
  return (
    <fieldset className="ai-admission-setup" disabled={disabled}>
      <legend>{text(language, "admission")}</legend>
      <label className="ai-admission-toggle" htmlFor={`${id}-enabled`}>
        <input
          id={`${id}-enabled`}
          type="checkbox"
          name="aiEnabled"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        {text(language, "enable")}
      </label>
      {enabled && (
        <div className="ai-admission-fields">
          <div className="field">
            <label htmlFor={`${id}-provider`}>
              {text(language, "provider")}
            </label>
            <select
              id={`${id}-provider`}
              name="aiProvider"
              value={provider}
              onChange={(event) => {
                const value = event.target.value as AiProvider;
                setProvider(value);
                setModel(value === "local" ? config.localModel : "");
              }}
            >
              <option value="local">{text(language, "local")}</option>
              {config.openaiAvailable && <option value="openai">OpenAI</option>}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${id}-count`}>{text(language, "count")}</label>
            <input
              id={`${id}-count`}
              name="aiCount"
              type="number"
              required
              min={1}
              max={max}
              defaultValue={Math.min(AI_ADMISSION_DEFAULTS.count, max)}
            />
          </div>
          <div className="field ai-admission-model">
            <label htmlFor={`${id}-model`}>{text(language, "model")}</label>
            <input
              id={`${id}-model`}
              name="aiModel"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              required
              pattern=".*\S.*"
              maxLength={200}
              autoComplete="off"
            />
          </div>
          {submitLabel && (
            <button
              type="submit"
              className="button primary ai-admission-submit"
            >
              {submitLabel}
            </button>
          )}
        </div>
      )}
    </fieldset>
  );
}

export function AiRoomAdmissionForm({
  code,
  config,
  capacity,
  disabled,
  language = "ja",
  onStart,
}: {
  code: string;
  config: AiSetup;
  capacity: number;
  disabled: boolean;
  language?: Language;
  onStart: (run: AiRun) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || disabled) return;
    const admission = readAiAdmission(new FormData(event.currentTarget));
    if (!admission) return;
    setError("");
    setPending(true);
    try {
      onStart(await api<AiRun>(`/api/rooms/${code}/ai`, admission));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      method="post"
      aria-label={text(language, "admission")}
      lang={language}
      onSubmit={submit}
    >
      <AiAdmissionFields
        config={config}
        capacity={capacity}
        disabled={pending || disabled}
        language={language}
        submitLabel={text(language, "start")}
      />
      {error && (
        <p role="alert" className="error-message">
          {language === "ja" ? error : text(language, "startFailed")}
        </p>
      )}
    </form>
  );
}

export function AiRoomAdmission({
  code,
  status,
  config,
  language = "ja",
  onUpdate,
}: {
  code: string;
  status: AiRun | null;
  config: AiSetup;
  language?: Language;
  onUpdate?: (run: AiRun) => void;
}) {
  const [run, setRun] = useState(status);
  const [disconnected, setDisconnected] = useState(false);
  const id = run?.id;
  const live = Boolean(run && aiRunActive(run.phase));
  useEffect(() => {
    if (!id || !live) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const next = await api<AiRun>(
          `/api/teacher/ai?status=${id}`,
          undefined,
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setRun(next);
          onUpdate?.(next);
          setDisconnected(false);
        }
      } catch {
        if (!controller.signal.aborted) setDisconnected(true);
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(refresh, 1000);
      }
    }
    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [id, live, onUpdate]);
  return (
    <aside
      className="ai-admission-status"
      aria-label={text(language, "admission")}
    >
      <div role="status" className="ai-admission-status-text">
        {run ? (
          <>
            <strong>
              {text(language, "admission")} {run.joined} / {run.count}
            </strong>
            <span>
              {text(language, disconnected ? "disconnected" : run.phase)}
            </span>
          </>
        ) : (
          <span>{text(language, "startFailed")}</span>
        )}
      </div>
      <AiExperimentDialog
        config={config}
        label={text(language, "console")}
        closeLabel={text(language, "close")}
        initialRoom={code}
        initialRun={run?.id}
      />
      {run?.error && (
        <p role="alert" className="error-message ai-admission-error">
          {language === "ja" ? run.error : text(language, "runFailed")}
        </p>
      )}
    </aside>
  );
}
