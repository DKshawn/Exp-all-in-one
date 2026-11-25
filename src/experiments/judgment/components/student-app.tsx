"use client";
import { useEffect, useRef } from "react";
import {
  getExperimentLanguage,
  setExperimentLanguage,
} from "@/components/experiment-language";
import type { Language, PreviewProtocol } from "../types";
import { judgmentLanguage, useTeacherLanguage } from "./teacher-language";
export type PreviewProgress = { index: number; total: number; status: string };
export type AppHandle = {
  move: (direction: number, skip?: boolean) => void;
  setLanguage: (language: Language) => void;
  dispose: () => void;
};
type Mount = (
  host: HTMLElement,
  options: {
    code?: string;
    isPreview?: boolean;
    initialLanguage?: Language;
    protocols?: PreviewProtocol[];
    onPreviewState?: (state: PreviewProgress) => void;
    onLanguageChange?: (language: Language) => void;
    onLanguageDisabled?: (disabled: boolean) => void;
  },
) => AppHandle;
export function StudentApp({
  code = "",
  protocols,
  onProgress,
  handle,
  onLanguageDisabled,
}: {
  code?: string;
  protocols?: PreviewProtocol[];
  onProgress?: (state: PreviewProgress) => void;
  handle?: React.RefObject<AppHandle | null>;
  onLanguageDisabled?: (disabled: boolean) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<AppHandle | null>(null);
  const language = useTeacherLanguage();
  useEffect(() => {
    let cancelled = false,
      app: AppHandle | undefined;
    void import("../vendor/public/app.js")
      .then((module) => {
        if (cancelled || !host.current) return;
        app = (module.mountJudgment as Mount)(host.current, {
          code,
          isPreview: Boolean(protocols),
          protocols,
          initialLanguage: judgmentLanguage(getExperimentLanguage()),
          onPreviewState: onProgress,
          onLanguageChange: (next) =>
            setExperimentLanguage(next === "zh" ? "zh-CN" : next),
          onLanguageDisabled,
        });
        instance.current = app;
        if (handle) handle.current = app;
      })
      .catch(() => {
        if (!cancelled && host.current)
          host.current.textContent =
            "読み込めませんでした。再読み込みしてください。";
      });
    return () => {
      cancelled = true;
      app?.dispose();
      instance.current = null;
      if (handle) handle.current = null;
    };
  }, [code, protocols, onProgress, handle, onLanguageDisabled]);
  useEffect(() => {
    instance.current?.setLanguage(language);
  }, [language]);
  return (
    <div ref={host} className="judgment-app" lang="ja">
      <p className="loading" role="status">
        読み込み中…
      </p>
    </div>
  );
}
