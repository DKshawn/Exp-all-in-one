"use client";

import { useId, useState, type FormEvent } from "react";
import type { AiRun } from "@/lib/ai-console";
import { api, ApiError, errorMessage } from "@/lib/client";

const copy = {
  ja: {
    target: "AI の目標人数",
    submit: "AI を補充",
    closed: "入室受付が終了しました。",
    capacity: "空き枠が足りません。目標人数を減らしてください。",
    failed: "AI を補充できませんでした。",
  },
  "zh-CN": {
    target: "AI 目标人数",
    submit: "补齐 AI",
    closed: "入室报名已截止。",
    capacity: "剩余名额不足，请降低目标人数。",
    failed: "无法补齐 AI。",
  },
  en: {
    target: "AI target count",
    submit: "Top up AI",
    closed: "Admission has closed.",
    capacity: "There are too few seats left. Lower the target count.",
    failed: "Could not top up AI.",
  },
};

export function AiTopUpForm({
  run,
  max,
  disabled = false,
  language = "ja",
  onUpdate,
}: {
  run: AiRun;
  max: number;
  disabled?: boolean;
  language?: keyof typeof copy;
  onUpdate: (run: AiRun) => void;
}) {
  const inputId = useId();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState("");
  const min = run.joined === run.count ? run.count + 1 : run.count;
  const labels = copy[language];
  if (min > max) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || disabled) return;
    const count = Number(new FormData(event.currentTarget).get("count"));
    setFailure("");
    setPending(true);
    try {
      onUpdate(
        await api<AiRun>("/api/teacher/ai", {
          action: "top-up",
          id: run.id,
          count,
        }),
      );
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "";
      const feedback =
        code === "AI_ADMISSION_CLOSED"
          ? labels.closed
          : code === "AI_ADMISSION_CAPACITY"
            ? labels.capacity
            : labels.failed;
      setFailure(language === "ja" ? errorMessage(error) : feedback);
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="ai-top-up" method="post" lang={language} onSubmit={submit}>
      <div className="field">
        <label htmlFor={inputId}>{labels.target}</label>
        <input
          id={inputId}
          name="count"
          type="number"
          min={min}
          max={max}
          step={1}
          defaultValue={min}
          required
          disabled={pending || disabled}
        />
      </div>
      <button
        type="submit"
        className="button primary"
        disabled={pending || disabled}
      >
        {labels.submit}
      </button>
      {failure && (
        <p className="error-message" role="alert">
          {failure}
        </p>
      )}
    </form>
  );
}
