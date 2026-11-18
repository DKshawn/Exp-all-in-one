"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ServerStatus } from "@/lib/server/config";
import { api, errorMessage } from "@/lib/client";
import { TeacherPasswordHelp } from "@/components/teacher-password-help";
import {
  DEFAULT_SETTINGS,
  EXP2_SETTINGS,
  settingsForExperiment,
  settingsSchema,
  type EmhSettings,
  type Exp2Options,
} from "../settings";
import { SettingsFields } from "./settings-fields";
import { EMH_EXPERIMENT_LABELS } from "../types";

export function EmhCreateForm({
  status,
  initialTitle,
  initialSettings,
  initialExperiment,
  onCreateDemo,
  exp2Defaults,
}: {
  status: ServerStatus;
  initialTitle?: string;
  initialSettings?: EmhSettings;
  initialExperiment?: "exp1" | "exp2";
  onCreateDemo?: (
    title: string,
    settings: EmhSettings,
    experiment: "exp1" | "exp2",
  ) => void;
  exp2Defaults?: Exp2Options;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle ?? "資産市場実験");
  const [settings, setSettings] = useState<EmhSettings>(() =>
    structuredClone(initialSettings ?? DEFAULT_SETTINGS),
  );
  const [password, setPassword] = useState("");
  const [experiment, setExperiment] = useState<"exp1" | "exp2">(
    initialExperiment ?? "exp1",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const validation = settingsSchema.safeParse(settings);
      if (!validation.success)
        throw new Error(
          validation.error.issues[0]?.message ?? "実験条件を確認してください。",
        );
      if (onCreateDemo) {
        const parsed = settingsForExperiment(settings, experiment);
        if (!title.trim() || title.trim().length > 60)
          throw new Error(
            "実験名・人数・比率・証券数・時間を確認してください。",
          );
        onCreateDemo(title.trim(), parsed, experiment);
        return;
      }
      const result = await api<{ code: string }>("/api/emh/rooms", {
        title,
        password,
        settings,
        experiment,
      });
      router.push(`/room/${result.code}?entry=teacher`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <form className="emh-create" onSubmit={submit}>
      <h1>EMH · 資産市場実験</h1>
      <label className="field">
        実験名
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={60}
        />
      </label>
      <label className="field">
        実験
        <select
          value={experiment}
          onChange={(event) => {
            const next = event.target.value as "exp1" | "exp2";
            setExperiment(next);
            setSettings(
              structuredClone(
                next === "exp2"
                  ? { ...EXP2_SETTINGS, exp2: exp2Defaults }
                  : DEFAULT_SETTINGS,
              ),
            );
          }}
        >
          <option value="exp1">{EMH_EXPERIMENT_LABELS.exp1}</option>
          <option value="exp2">{EMH_EXPERIMENT_LABELS.exp2}</option>
        </select>
      </label>
      <SettingsFields
        settings={settings}
        onChange={setSettings}
        disabled={busy}
        experiment={experiment}
        demo={Boolean(onCreateDemo)}
      />
      {!onCreateDemo && (
        <label className="field">
          教員パスワード
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="8文字以上で設定"
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            required
          />
          <TeacherPasswordHelp />
        </label>
      )}
      {!onCreateDemo && !status.ready && (
        <p role="alert" className="error-message">
          管理者が接続設定を完了してから作成してください。
        </p>
      )}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      <button
        className="button primary full"
        disabled={busy || (!onCreateDemo && !status.ready)}
      >
        {busy ? "作成中…" : onCreateDemo ? "デモルームを作成" : "ルームを作成"}
      </button>
    </form>
  );
}
