"use client";
import {
  TeacherLanguage,
  useTeacherLanguage,
  teacherText,
} from "./teacher-language";
import { JUDGMENT_NAME } from "../constants";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Header } from "@/components/shell";
import { EndExperimentButton } from "@/components/end-experiment-button";
import { api, ApiError, errorMessage } from "@/lib/client";
import type {
  Language,
  PreviewProtocol,
  Settings,
  Study,
  TeacherView,
} from "../types";
import type { Command } from "../server/validation";
import { SettingsFields } from "./settings-fields";
import { JudgmentPreview } from "./preview";
const statuses = { active: "回答中", completed: "完了", withdrawn: "終了" };
export function JudgmentTeacherRoom({
  code,
  studies,
}: {
  code: string;
  studies: Study[];
}) {
  const [language, setLanguage] = useTeacherLanguage();
  const t = (text: string, values: Record<string, string | number> = {}) =>
    teacherText(text, language, values);
  const [data, setData] = useState<TeacherView | null>(null),
    [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState(""),
    [connectionError, setConnectionError] = useState(""),
    [busy, setBusy] = useState(false),
    [needsLogin, setNeedsLogin] = useState(false);
  const [preview, setPreview] = useState<PreviewProtocol[] | null>(null),
    [ending, setEnding] = useState(false);
  const commandPending = useRef<Command | null>(null),
    busyRef = useRef(false);
  const base = `/api/rooms/${code}/judgment`;
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const view = await api<TeacherView>(
          base + "?session=teacher",
          undefined,
          controller.signal,
        );
        if (!controller.signal.aborted && !busyRef.current) {
          setData(view);
          setSettings((previous) => previous ?? view.settings);
          setConnectionError("");
          setNeedsLogin(false);
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          setConnectionError(errorMessage(e));
          if (e instanceof ApiError && e.status === 401) setNeedsLogin(true);
        }
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, 2000);
      }
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [base]);
  async function command(kind: "start" | "end") {
    if (!data || !settings || busyRef.current) return;
    const payload =
      (commandPending.current?.kind === kind ? commandPending.current : null) ??
      (kind === "start"
        ? {
            kind,
            settings,
            requestId: crypto.randomUUID(),
            expectedRevision: data.revision,
          }
        : {
            kind,
            lessonId: data.lesson!.id,
            requestId: crypto.randomUUID(),
            expectedRevision: data.revision,
          });
    commandPending.current = payload;
    setBusy(true);
    busyRef.current = true;
    setError("");
    try {
      const view = await api<TeacherView>(base + "?session=teacher", payload);
      setData(view);
      setSettings(view.settings);
      commandPending.current = null;
      setEnding(false);
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof ApiError && e.status < 500)
        commandPending.current = null;
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }
  async function showPreview() {
    if (!settings || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ protocols: PreviewProtocol[] }>(
        base + "/preview?session=teacher",
        data?.lesson?.status === "active" ? data.lesson.settings : settings,
      );
      setPreview(result.protocols);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }
  const running = data?.lesson?.status === "active",
    completed =
      data?.students.filter((s) => s.status === "completed").length ?? 0;
  return (
    <>
      <Header homeHref="/teacher">
        <Link className="button secondary small-button" href="/teacher">
          {t("ルーム管理")}
        </Link>
      </Header>
      <main
        className="judgment-teacher"
        lang={language === "zh" ? "zh-CN" : language}
      >
        <div className="judgment-section-heading">
          <h1>{data?.title ?? JUDGMENT_NAME}</h1>
          <div className="judgment-actions">
            <span className="judgment-room-code">{code}</span>
            <TeacherLanguage language={language} onChange={setLanguage} />
          </div>
        </div>
        {connectionError && (
          <p role="alert" className="error-message">
            {connectionError}
          </p>
        )}
        {needsLogin && (
          <Link className="button primary" href={`/teacher?code=${code}`}>
            {t("教員として再入室")}
          </Link>
        )}
        {!data && !connectionError && <p role="status">{t("読み込み中…")}</p>}
        {data && settings && (
          <>
            <div className="judgment-overview">
              <span>
                {running
                  ? t("第{number}回 実施中", { number: data.lesson!.number })
                  : data.lesson
                    ? t("実施終了")
                    : t("開始前")}
              </span>
              <span>
                {t("参加者 {count} 人", { count: data.students.length })}
              </span>
              <span>{t("回答完了 {count} 人", { count: completed })}</span>
              <Link
                className="button secondary small-button"
                href={`/?code=${code}`}
                target="_blank"
              >
                {t("学生の入室画面")}
              </Link>
            </div>
            <section className="judgment-selection-panel">
              <SettingsFields
                studies={studies}
                settings={running ? data.lesson!.settings : settings}
                disabled={busy || running}
                language={language}
                onChange={(value) => {
                  commandPending.current = null;
                  setSettings(value);
                }}
              >
                <div className="judgment-actions">
                  <button
                    className="button secondary"
                    disabled={busy || !settings.studyIds.length}
                    onClick={() => void showPreview()}
                  >
                    {t("学生画面をプレビュー")}
                  </button>
                  {running ? (
                    <EndExperimentButton
                      label={t("実験を終了")}
                      disabled={busy}
                      onClick={() => setEnding(true)}
                    />
                  ) : (
                    <button
                      className="button primary"
                      disabled={busy || !settings.studyIds.length}
                      onClick={() => void command("start")}
                    >
                      {t(
                        busy
                          ? "開始中…"
                          : data.lesson
                            ? "次の実施を開始"
                            : "実施を開始",
                      )}
                    </button>
                  )}
                </div>
                {error && (
                  <p role="alert" className="error-message">
                    {error}
                  </p>
                )}
              </SettingsFields>
            </section>
            <section className="judgment-panel">
              <div className="judgment-section-heading">
                <h2>{t("参加状況")}</h2>
                <div className="judgment-actions">
                  <a
                    className="button secondary small-button"
                    href={base + "/export?format=csv&session=teacher"}
                  >
                    CSV
                  </a>
                  <a
                    className="button secondary small-button"
                    href={base + "/export?format=json&session=teacher"}
                  >
                    {t("全記録 JSON")}
                  </a>
                </div>
              </div>
              {data.students.length ? (
                <div className="judgment-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">{t("学生証番号")}</th>
                        <th scope="col">{t("状態")}</th>
                        <th scope="col">{t("回答ページ")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.students.map((s) => (
                        <tr key={s.studentId}>
                          <td>{s.studentId}</td>
                          <td>{t(s.status ? statuses[s.status] : "待機中")}</td>
                          <td>
                            {s.totalTrials
                              ? `${s.answered} / ${s.totalTrials}`
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">{t("学生の入室を待っています。")}</p>
              )}
            </section>
            {data.history.length > 0 && (
              <section className="judgment-panel">
                <h2>{t("実施履歴")}</h2>
                <ol className="judgment-history">
                  {data.history.map((lesson) => (
                    <li key={lesson.id}>
                      <strong>
                        {t("第{number}回", { number: lesson.number })}
                      </strong>
                      <span>
                        {t("{count}課題", {
                          count: lesson.settings.studyIds.length,
                        })}{" "}
                        · {t(lesson.status === "active" ? "実施中" : "終了")}
                      </span>
                      <time>
                        {new Date(lesson.createdAt).toLocaleString(
                          language === "zh" ? "zh-CN" : language,
                          {
                            timeZone: "Asia/Tokyo",
                          },
                        )}
                      </time>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </>
        )}
      </main>
      {preview && (
        <JudgmentPreview
          language={language}
          protocols={preview}
          onClose={() => setPreview(null)}
        />
      )}
      {ending && (
        <EndDialog
          language={language}
          busy={busy}
          error={error}
          onCancel={() => setEnding(false)}
          onConfirm={() => void command("end")}
        />
      )}
    </>
  );
}
function EndDialog({
  language,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  language: Language;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = (text: string) => teacherText(text, language);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="confirm-dialog"
      lang={language === "zh" ? "zh-CN" : language}
      aria-labelledby="judgment-end-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <h2 id="judgment-end-title">{t("今回の実施を終了しますか？")}</h2>
      <p>{t("回答中の学生も終了します。保存済みの回答は残ります。")}</p>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <button className="button secondary" disabled={busy} onClick={onCancel}>
          {t("戻る")}
        </button>
        <button className="button danger" disabled={busy} onClick={onConfirm}>
          {t(busy ? "終了中…" : "終了する")}
        </button>
      </div>
    </dialog>
  );
}
