"use client";
import { useEffect, useRef, useState } from "react";
import { teacherText } from "./teacher-language";
import { Header } from "@/components/shell";
import { EndExperimentButton } from "@/components/end-experiment-button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DEMO_TEACHER_HREFS } from "@/lib/demo-navigation";
import type { Language, PreviewProtocol } from "../types";
import {
  StudentApp,
  type AppHandle,
  type PreviewProgress,
} from "./student-app";
export function JudgmentPreview({
  protocols,
  onClose,
  demo = false,
  language = "ja",
}: {
  protocols: PreviewProtocol[];
  onClose: () => void;
  demo?: boolean;
  language?: Language;
}) {
  const t = (text: string) => teacherText(text, language);
  const [ending, setEnding] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    handle = useRef<AppHandle | null>(null);
  const [progress, setProgress] = useState<PreviewProgress>({
    index: 0,
    total: 0,
    status: "active",
  });
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="judgment-preview"
      aria-label={t(demo ? "DEMOモード" : "学生画面のプレビュー")}
      lang={language === "zh" ? "zh-CN" : language}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {demo && (
        <Header
          homeHref="/judgment/demo"
          demoLabel={t("DEMOモード")}
          demoExitLabel={t("DEMOモードを終了")}
          demoExitHref={DEMO_TEACHER_HREFS.judgment}
        />
      )}
      <div className="judgment-preview-toolbar">
        {!demo && <strong>{t("プレビュー")}</strong>}
        <span>{t("回答は保存されません。制限時間は停止しています。")}</span>
        <div>
          <button
            className="button secondary"
            disabled={progress.index === 0}
            onClick={() => handle.current?.move(-1)}
          >
            {t("前のページ")}
          </button>
          <button
            className="button secondary"
            disabled={progress.index >= progress.total}
            onClick={() => handle.current?.move(1, true)}
          >
            {t("スキップ")}
          </button>
          {demo ? (
            <EndExperimentButton
              label={t("実験を終了")}
              onClick={() => setEnding(true)}
            />
          ) : (
            <button className="button primary" onClick={onClose}>
              {t("閉じる")}
            </button>
          )}
        </div>
      </div>
      <StudentApp
        initialLanguage={language}
        protocols={protocols}
        handle={handle}
        onProgress={setProgress}
      />
      {ending && (
        <ConfirmDialog
          danger
          title={t("実験を終了")}
          message={t("デモを終了して実験設定に戻ります。")}
          confirmLabel={t("終了する")}
          cancelLabel={t("戻る")}
          pendingLabel={t("処理中…")}
          onCancel={() => setEnding(false)}
          onConfirm={async () => onClose()}
        />
      )}
    </dialog>
  );
}
