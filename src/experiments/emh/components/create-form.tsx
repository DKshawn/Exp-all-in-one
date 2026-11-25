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
import {
  SetupLanguage,
  useExperimentLanguage,
} from "@/components/experiment-language";
import { translator } from "@/lib/ui-language";

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
  const language = useExperimentLanguage();
  const t = translator(language);
  const [titleDraft, setTitle] = useState(initialTitle);
  const title =
    titleDraft ??
    (onCreateDemo
      ? t(
          "資産市場実験 · デモ",
          "资产市场实验 · 演示",
          "Asset market experiment · Demo",
        )
      : t("資産市場実験", "资产市场实验", "Asset market experiment"));
  const [settings, setSettings] = useState<EmhSettings>(() =>
    structuredClone(initialSettings ?? DEFAULT_SETTINGS),
  );
  const [password, setPassword] = useState("");
  const [experiment, setExperiment] = useState<"exp1" | "exp2">(
    initialExperiment ?? "exp1",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
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
    <SetupLanguage.Provider value={language}>
      <form
        className="emh-create localized-room-setup"
        lang={language}
        onSubmit={submit}
      >
        <h1>
          {t(
            "EMH · 資産市場実験",
            "EMH · 资产市场实验",
            "EMH · Asset market experiment",
          )}
        </h1>
        <label className="field">
          {t("実験名", "实验名称", "Room title")}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={60}
          />
        </label>
        <label className="field">
          {t("実験", "实验", "Experiment")}
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
            <option value="exp1">
              {t(
                EMH_EXPERIMENT_LABELS.exp1,
                "实验 1（固定股息）",
                "Experiment 1 (Fixed dividends)",
              )}
            </option>
            <option value="exp2">
              {t(
                EMH_EXPERIMENT_LABELS.exp2,
                "实验 2（随机股息）",
                "Experiment 2 (Random dividends)",
              )}
            </option>
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
            {t("教員パスワード", "教师房间密码", "Room password")}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t(
                "8文字以上で設定",
                "至少 8 个字符",
                "At least 8 characters",
              )}
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              required
            />
            <TeacherPasswordHelp language={language} />
          </label>
        )}
        {!onCreateDemo && !status.ready && (
          <p role="alert" className="error-message">
            {t(
              "管理者が接続設定を完了してから作成してください。",
              "请等管理员完成连接配置后再创建房间。",
              "Wait for the administrator to finish connection setup before creating a room.",
            )}
          </p>
        )}
        {error && (
          <p role="alert" className="error-message">
            {t(
              error,
              "无法创建房间。请检查实验设置、密码和连接后重试。",
              "Could not create the room. Check the experiment settings, password, and connection.",
            )}
          </p>
        )}
        <button
          className="button primary full"
          disabled={busy || (!onCreateDemo && !status.ready)}
        >
          {busy
            ? t("作成中…", "正在创建…", "Creating…")
            : onCreateDemo
              ? t("デモルームを作成", "创建演示房间", "Create demo room")
              : t("ルームを作成", "创建房间", "Create room")}
        </button>
      </form>
    </SetupLanguage.Provider>
  );
}
