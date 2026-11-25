"use client";
import { useTeacherLanguage, teacherText } from "./teacher-language";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ServerStatus } from "@/lib/server/config";
import { api, errorMessage } from "@/lib/client";
import type { Settings, Study } from "../types";
import { SettingsFields } from "./settings-fields";
import { JUDGMENT_NAME } from "../constants";
export function JudgmentCreateForm({
  status,
  studies,
}: {
  status: ServerStatus;
  studies: Study[];
}) {
  const language = useTeacherLanguage();
  const t = (text: string, values: Record<string, string | number> = {}) =>
    teacherText(text, language, values);
  const router = useRouter();
  const [settings, setSettings] = useState<Settings>({
    studyIds: [],
    randomizeExperiments: false,
    randomizeChoices: false,
  });
  const [title, setTitle] = useState(JUDGMENT_NAME),
    [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function create(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ code: string }>("/api/judgment/rooms", {
        title,
        password,
        settings,
      });
      router.push(`/room/${result.code}?entry=teacher`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <>
      <form
        className="judgment-create"
        onSubmit={create}
        lang={language === "zh" ? "zh-CN" : language}
      >
        <div className="judgment-section-heading">
          <h1>{JUDGMENT_NAME}</h1>
        </div>
        <SettingsFields
          settings={settings}
          studies={studies}
          onChange={setSettings}
          disabled={busy}
          language={language}
        >
          <div className="judgment-room-fields">
            <label className="field">
              {t("実験名")}
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={60}
                required
              />
            </label>
            <label className="field">
              {t("教員パスワード")}
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("8文字以上で設定")}
                minLength={8}
                maxLength={128}
                required
                autoComplete="new-password"
              />
              <span className="field-help">
                {t("再入室に使います。学生には共有しないでください。")}
              </span>
            </label>
          </div>
          {!status.ready && (
            <p className="error-message" role="alert">
              {t("管理者が接続設定を完了してから作成してください。")}
            </p>
          )}
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <button
            className="button primary"
            disabled={busy || !status.ready || !settings.studyIds.length}
          >
            {t(busy ? "処理中…" : "ルームを作成")}
          </button>
        </SettingsFields>
      </form>
    </>
  );
}
