"use client";
import { useState } from "react";
import { Pause, Play, SkipForward, Square } from "lucide-react";
import { RoundStrip, clockText } from "@/components/round-strip";
import { AdmissionTimer } from "@/components/admission-timer";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { label, type Key, type Lang } from "../locale";
import type { Action, RunControl } from "../engine";
import type { View } from "../views";
type Teacher = Extract<View, { role: "teacher" }>;
type Act = (action: Action) => void | Promise<void>;

export function SessionOverview({
  view: v,
  lang,
  now,
  busy,
  act,
}: {
  view: View;
  lang: Lang;
  now: number;
  busy: boolean;
  act: Act;
}) {
  const t = (k: Key) => label(lang, k);
  const [confirm, setConfirm] = useState<RunControl | null>(null);
  const paused = v.pausedAt !== null;
  const remaining = Math.max(
    0,
    Math.ceil(((v.deadline ?? now) - (v.pausedAt ?? now)) / 1000),
  );
  function control(kind: RunControl["kind"]) {
    if (
      v.role !== "teacher" ||
      (v.phase !== "playing" && v.phase !== "feedback")
    )
      return;
    const a = { kind, round: v.round, phase: v.phase, revision: v.revision };
    if (
      kind === "end" ||
      ((kind === "advance" || kind === "shorten") && v.phase === "playing")
    )
      setConfirm(a);
    else void act(a);
  }
  const confirmLabel =
    confirm?.kind === "end"
      ? "end"
      : confirm?.kind === "shorten"
        ? "fast"
        : "skip";
  return (
    <div className="emh-app ev-overview">
      <div className="wide">
        <div className="session-overview">
          <RoundStrip
            rounds={v.settings.rounds}
            current={v.round}
            finished={v.phase === "finished"}
            label={t("round")}
            roundLabel={(n) => t("round") + " " + n}
          />
          <div className="session-bar">
            <div className="session-phase">
              <strong>
                {t("round")} {v.round}/{v.settings.rounds}
              </strong>
              <h2>{t(paused ? "paused" : v.phase)}</h2>
            </div>
            {v.deadline !== null && (
              <div className="timers">
                <div className={remaining <= 5 ? "urgent" : ""}>
                  <span>{t(v.phase === "feedback" ? "next" : "timeLeft")}</span>
                  <strong className="timer" role="timer">
                    {clockText(remaining)}
                  </strong>
                  <progress
                    aria-label={t("timeLeft")}
                    max={
                      v.phase === "feedback"
                        ? v.settings.feedbackSeconds
                        : v.settings.seconds
                    }
                    value={remaining}
                  />
                </div>
              </div>
            )}
            {v.role === "teacher" && v.phase !== "finished" && (
              <div className="control-buttons">
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => control(paused ? "resume" : "pause")}
                >
                  {paused ? <Play size={16} /> : <Pause size={16} />}{" "}
                  {t(paused ? "resume" : "pause")}
                </button>
                {v.code !== "DEMO" && (
                  <button
                    className="button secondary"
                    disabled={busy || paused}
                    onClick={() => control("shorten")}
                  >
                    <SkipForward size={16} />
                    {t("fast")}
                  </button>
                )}
                <button
                  className="button secondary"
                  disabled={busy || paused}
                  onClick={() => control("advance")}
                >
                  <SkipForward size={16} />
                  {t(v.phase === "feedback" ? "nextRound" : "skip")}
                </button>
                <button
                  className="button secondary danger-text"
                  disabled={busy}
                  onClick={() => control("end")}
                >
                  <Square size={15} />
                  {t("end")}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {confirm && (
        <ConfirmDialog
          title={t(confirmLabel)}
          message={t(
            confirm.kind === "end"
              ? "endPrompt"
              : confirm.kind === "shorten"
                ? "shortenPrompt"
                : "skipPrompt",
          )}
          cancelLabel={t("back")}
          pendingLabel={t("processing")}
          confirmLabel={t(confirmLabel)}
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            try {
              await act(confirm);
            } finally {
              setConfirm(null);
            }
          }}
        />
      )}
    </div>
  );
}
export function Admission({
  view: v,
  lang,
  now,
  busy,
  act,
}: {
  view: Teacher;
  lang: Lang;
  now: number;
  busy: boolean;
  act: Act;
}) {
  const t = (k: Key) => label(lang, k),
    [draft, setDraft] = useState<string | null>(null);
  const a = v.admission,
    seconds = draft ?? String(a.seconds),
    running = a.deadline !== null,
    paused = a.remaining !== null;
  const revision = v.revision;
  return (
    <section className="study-admission" aria-label={t("open")}>
      <div className="study-admission-controls">
        <label className="field">
          {t("groups")}
          <select
            disabled={busy || v.phase !== "open"}
            value={v.settings.groups}
            onChange={(e) =>
              act({
                kind: "setGroups",
                groups: Number(e.target.value),
                revision,
              })
            }
          >
            {Array.from({ length: 32 }, (_, i) => (
              <option key={i} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
        {v.phase === "open" ? (
          <>
            <AdmissionTimer
              seconds={seconds}
              onSeconds={setDraft}
              running={running}
              paused={paused}
              remaining={Math.max(
                0,
                Math.ceil(
                  (a.deadline === null
                    ? (a.remaining ?? 0)
                    : a.deadline - now) / 1000,
                ),
              )}
              disabled={busy}
              canStart={
                Number.isInteger(Number(seconds)) &&
                Number(seconds) >= 5 &&
                Number(seconds) <= 3600
              }
              labels={{
                field: t("timer"),
                counter: t("timer"),
                paused: t("paused"),
                start: t("timerStart"),
                resume: t("timerResume"),
                pause: t("timerPause"),
                reset: t("timerReset"),
              }}
              onStart={() =>
                act(
                  paused
                    ? { kind: "timerResume", revision }
                    : {
                        kind: "timerStart",
                        seconds: Number(seconds),
                        revision,
                      },
                )
              }
              onPause={() => act({ kind: "timerPause", revision })}
              onReset={() => {
                setDraft(null);
                act({ kind: "timerReset", revision });
              }}
            />
            <button
              className="button primary"
              disabled={busy || v.sizes.some((n) => n < 2)}
              onClick={() => act({ kind: "close", revision })}
            >
              {t("close")}
            </button>
          </>
        ) : (
          <>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => act({ kind: "reopen", revision })}
            >
              {t("reopen")}
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => act({ kind: "start", revision })}
            >
              <Play size={16} />
              {t("start")}
            </button>
          </>
        )}
      </div>
      {v.sizes.some((n) => n < 2) && (
        <p className="field-help" role="status">
          {a.insufficient ? t("expiredShort") + " " : ""}
          {t("tooFew")}
        </p>
      )}
    </section>
  );
}
