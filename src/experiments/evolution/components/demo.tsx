"use client";
import { useEffect, useState, type ReactNode } from "react";
import {
  GraduationCap,
  UserRound,
  Pause,
  Play,
  SkipForward,
  RotateCcw,
} from "lucide-react";
import { Header } from "@/components/shell";
import { DemoSelectionLink } from "@/components/demo-selection-link";
import { DEMO_TEACHER_HREFS } from "@/lib/demo-navigation";
import { responsesCsv } from "../export";
import { EvolutionPractice, type PracticeAction } from "../practice";
import {
  baseView,
  personal,
  rawRows,
  studentView,
  summaries,
  teacherView,
} from "../views";
import {
  continuous,
  HISTORY_ROUNDS,
  isMemo,
  MEMO_PARTICIPANTS,
  type Settings,
} from "../settings";
import { label, type Lang } from "../locale";
import { useLanguage } from "./language";
import { SetupForm, useSetupDraft } from "./setup";
import { Panels } from "./panels";

function DemoToolbar({
  lang,
  teacher,
  onSwitch,
  bots,
  compact,
  children,
}: {
  lang: Lang;
  teacher: boolean;
  onSwitch: () => void;
  bots: number;
  compact: boolean;
  children: ReactNode;
}) {
  const switchLabel = label(lang, teacher ? "toStudent" : "toTeacher");
  return (
    <section
      className={`demo-panel ev-demo-bar${compact ? " ev-memo-demo-bar" : ""}`}
      lang={lang}
      aria-label={label(lang, "demoView")}
    >
      <div className="demo-controls">
        <div className="demo-options">
          <span
            className={`ev-demo-meta role-tag ${teacher ? "teacher" : "student"}`}
          >
            {label(lang, teacher ? "teacher" : "student")}
          </span>
          <button
            type="button"
            className="button secondary"
            aria-label={compact ? switchLabel : undefined}
            onClick={onSwitch}
          >
            {teacher ? <UserRound size={16} /> : <GraduationCap size={16} />}
            <span className="ev-demo-full-label">{switchLabel}</span>
            {compact && (
              <span className="ev-demo-short-label">
                {label(lang, teacher ? "memoToStudent" : "memoToTeacher")}
              </span>
            )}
          </button>
          <span className="ev-demo-meta">
            {label(lang, "bots")} <b>{bots}</b>
          </span>
        </div>
        <div className="demo-actions">{children}</div>
      </div>
    </section>
  );
}

export function EvolutionDemo() {
  const lang = useLanguage();
  const draft = useSetupDraft();
  const [room, setRoom] = useState<EvolutionPractice | null>(null);
  function create(title: string, s: Settings, n: number) {
    setRoom(new EvolutionPractice(title, s, n, Date.now()));
  }
  return (
    <div className="demo-theme">
      <Header
        demoLabel="DEMOモード"
        demoExitHref={DEMO_TEACHER_HREFS.evolution}
        leading={<DemoSelectionLink />}
      />
      {room ? (
        <DemoRoom demo={room} lang={lang} onSetup={() => setRoom(null)} />
      ) : (
        <main className="teacher-hub-main">
          <SetupForm draft={draft} onDemo={create} />
        </main>
      )}
    </div>
  );
}

function DemoRoom({
  demo,
  lang,
  onSetup,
}: {
  demo: EvolutionPractice;
  lang: Lang;
  onSetup: () => void;
}) {
  const [teacher, setTeacher] = useState(true),
    [{ now }, setClock] = useState({ now: demo.createdAt }),
    [err, setError] = useState("");
  const refresh = () => setClock({ now: demo.time(Date.now()) });
  const finished = demo.game.phase === "finished";
  const paused = demo.game.pausedAt != null;
  useEffect(() => {
    if (finished || paused) return;
    const timer = setInterval(() => {
      const at = demo.time(Date.now());
      demo.advanceTo(at);
      const entry = demo.game.round?.entries[demo.human];
      if (
        !teacher &&
        entry &&
        demo.game.phase === "playing" &&
        demo.game.pausedAt == null
      ) {
        entry.seenAt ??= at;
        if (entry.memo) entry.memo.feedbackServedAt ??= at;
      }
      setClock({ now: at });
    }, 250);
    return () => clearInterval(timer);
  }, [demo, teacher, finished, paused]);
  function act(a: PracticeAction) {
    try {
      demo.act(a, Date.now());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    refresh();
  }
  function download(format: "csv" | "json") {
    const g = demo.game,
      rounds = g.round ? [...demo.archive, g.round] : demo.archive;
    const rows = rounds.flatMap((r) => rawRows(g, r, "DEMO"));
    const body =
      format === "json"
        ? JSON.stringify(
            {
              demo: true,
              humanSeat: demo.human,
              simulatedSeats: g.seats
                .filter((p) => p.id !== demo.human)
                .map((p) => p.id),
              controls: g.controls ?? [],
              title: demo.title,
              createdAt: demo.createdAt,
              admissionClosedAt: g.closedAt,
              phase: g.phase,
              settings: g.settings,
              participants: g.seats,
              rounds: rounds.flatMap((r) => summaries(g, r)),
              rows,
            },
            null,
            2,
          )
        : responsesCsv(
            rows.map((row) => ({ ...row, heartbeatGap: null })),
            true,
            continuous(g.settings),
            isMemo(g.settings),
          );
    const url = URL.createObjectURL(
      new Blob([body], {
        type: format === "csv" ? "text/csv;charset=utf-8" : "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "evolution-demo." + format;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const base = baseView(demo.game, "DEMO", demo.title, now);
  const groupSize = demo.game.round?.memo?.groupSize;
  const groups = groupSize
    ? MEMO_PARTICIPANTS / groupSize
    : demo.game.settings.groups;
  const view = teacher
    ? teacherView(demo.game, base, demo.history.slice(-HISTORY_ROUNDS * groups))
    : studentView(
        demo.game,
        base,
        demo.human,
        demo.archive.slice(-HISTORY_ROUNDS).map((r) => personal(r, demo.human)),
      );
  const active = view.phase === "playing" || view.phase === "feedback";
  const memo = isMemo(view.settings);
  return (
    <>
      <DemoToolbar
        lang={lang}
        teacher={teacher}
        onSwitch={() => setTeacher(!teacher)}
        bots={demo.game.seats.length - 1}
        compact={memo}
      >
        <button
          type="button"
          className="button primary"
          disabled={!active}
          onClick={() => act({ kind: "playback", paused: !paused })}
        >
          {paused ? <Play size={16} /> : <Pause size={16} />}
          {label(lang, paused ? "resume" : "pause")}
        </button>
        <button
          type="button"
          className="button secondary ev-demo-fast"
          aria-label={memo ? label(lang, "fast") : undefined}
          disabled={!active || paused}
          onClick={() => {
            demo.fastForward(Date.now());
            refresh();
          }}
        >
          <SkipForward size={16} />
          <span className="ev-demo-full-label">{label(lang, "fast")}</span>
          {memo && (
            <span className="ev-demo-short-label">
              {label(lang, "memoAdvance")}
            </span>
          )}
        </button>
        <button
          type="button"
          className="button secondary"
          aria-label={memo ? label(lang, "reset") : undefined}
          onClick={onSetup}
        >
          <RotateCcw size={16} />
          <span className="ev-demo-full-label">{label(lang, "reset")}</span>
          {memo && (
            <span className="ev-demo-short-label">
              {label(lang, "memoSetup")}
            </span>
          )}
        </button>
      </DemoToolbar>
      {err && (
        <p role="alert" className="error-message">
          {err}
        </p>
      )}
      <Panels
        key={teacher ? "teacher" : "student"}
        view={view}
        lang={lang}
        busy={false}
        now={now}
        act={act}
        loadHistory={async (before) =>
          teacher
            ? teacherView(
                demo.game,
                base,
                demo.history.filter(
                  (x) => x.round >= before - HISTORY_ROUNDS && x.round < before,
                ),
              )
            : studentView(
                demo.game,
                base,
                demo.human,
                demo.archive
                  .slice(Math.max(0, before - HISTORY_ROUNDS - 1), before - 1)
                  .map((r) => personal(r, demo.human)),
              )
        }
        downloads={(["json", "csv"] as const).map((f) => (
          <button
            key={f}
            className="button secondary"
            onClick={() => download(f)}
          >
            {label(lang, f === "json" ? "exportJson" : "exportCsv")}
          </button>
        ))}
      />
    </>
  );
}
