"use client";
import { useTeacherLanguage, teacherText } from "./teacher-language";

import { useState, type FormEvent } from "react";
import { Header } from "@/components/shell";
import { api, errorMessage } from "@/lib/client";
import { JUDGMENT_NAME } from "../constants";
import type { PreviewProtocol, Settings, Study } from "../types";
import { JudgmentPreview } from "./preview";
import { SettingsFields } from "./settings-fields";
import { DemoSelectionLink } from "@/components/demo-selection-link";
import { DEMO_TEACHER_HREFS } from "@/lib/demo-navigation";

export function JudgmentDemoEntry({ studies }: { studies: Study[] }) {
  const language = useTeacherLanguage();
  const t = (text: string, values: Record<string, string | number> = {}) =>
    teacherText(text, language, values);
  const [settings, setSettings] = useState<Settings>({
    studyIds: [],
    randomizeExperiments: false,
    randomizeChoices: false,
  });
  const [protocols, setProtocols] = useState<PreviewProtocol[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ protocols: PreviewProtocol[] }>(
        "/api/judgment/demo",
        settings,
      );
      setProtocols(result.protocols);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Header
        homeHref="/judgment/demo"
        demoLabel={t("DEMOモード")}
        demoExitLabel={t("DEMOモードを終了")}
        demoExitHref={DEMO_TEACHER_HREFS.judgment}
        leading={<DemoSelectionLink />}
      />
      <main
        className="judgment-entry-main"
        lang={language === "zh" ? "zh-CN" : language}
      >
        <form className="judgment-create" onSubmit={start}>
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
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            <button
              className="button primary"
              disabled={busy || !settings.studyIds.length}
            >
              {t(busy ? "準備中…" : "デモを開始")}
            </button>
          </SettingsFields>
        </form>
        {protocols && (
          <JudgmentPreview
            demo
            protocols={protocols}
            onClose={() => setProtocols(null)}
          />
        )}
      </main>
    </>
  );
}
