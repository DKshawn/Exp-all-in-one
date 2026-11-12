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
import type { Settings } from "../settings";
import { label, type Lang } from "../locale";
import { EvolutionLanguage, useLanguage } from "./language";
import { SetupForm, useSetupDraft } from "./setup";
import { Panels } from "./panels";

function DemoToolbar({
  lang,
  teacher,
  onSwitch,
  canSwitch = true,
  bots,
  children,
}: {
  lang: Lang;
  teacher: boolean;
  onSwitch: () => void;
  canSwitch?: boolean;
  bots?: number;
  children?: ReactNode;
}) {
  return (
    <section
      className="demo-panel ev-demo-bar"
      lang={lang}
      aria-label={label(lang, "demoView")}
    >
      <div className="demo-controls">
        <div className="demo-options">
          <span className={`role-tag ${teacher ? "teacher" : "student"}`}>
            {label(lang, teacher ? "teacher" : "student")}
          </span>
          <button
            type="button"
            className="button secondary"
            disabled={!canSwitch}
            onClick={onSwitch}
          >
            {teacher ? <UserRound size={16} /> : <GraduationCap size={16} />}
            {label(lang, teacher ? "toStudent" : "toTeacher")}
          </button>
          {bots !== undefined && (
            <span>
              {label(lang, "bots")} <b>{bots}</b>
            </span>
          )}
        </div>
        {children && <div className="demo-actions">{children}</div>}
      </div>
    </section>
  );
}

export function EvolutionDemo() {
  const lang = useLanguage();
  const draft = useSetupDraft();
  const [room, setRoom] = useState<{
    demo: EvolutionPractice;
    preview: boolean;
  } | null>(null);
  function open(title: string, s: Settings, n: number, preview = false) {
    setRoom({ demo: new EvolutionPractice(title, s, n, Date.now()), preview });
  }
  return (
    <div className="demo-theme">
      <Header
        demoLabel="DEMOモード"
        demoExitHref={DEMO_TEACHER_HREFS.evolution}
        leading={<DemoSelectionLink />}
      >
        <EvolutionLanguage />
      </Header>
      {room ? (
        <DemoRoom {...room} lang={lang} onSetup={() => setRoom(null)} />
      ) : (
        <>
          <DemoToolbar
            lang={lang}
            teacher
            canSwitch={draft.validDemo}
            onSwitch={() => {
              if (draft.parsed.success && draft.validDemo)
                open(
                  draft.title.trim() || label(lang, "title"),
                  draft.parsed.data,
                  draft.n,
                  true,
                );
            }}
          />
          <main className="teacher-hub-main">
            <SetupForm draft={draft} onDemo={open} />
          </main>
        </>
      )}
    </div>
  );
}

function DemoRoom({
  demo,
  preview,
  lang,
  onSetup,
}: {
  demo: EvolutionPractice;
  preview: boolean;
  lang: Lang;
  onSetup: () => void;
}) {
  const [teacher, setTeacher] = useState(!preview),
    [{ now }, setClock] = useState({ now: demo.createdAt }),
    [err, setError] = useState("");
  const refresh = () => setClock({ now: demo.time(Date.now()) });
  const finished = demo.game.phase === "finished";
  const paused = demo.game.pausedAt != null;
  useEffect(() => {
    if (preview || finished || paused) return;
    const timer = setInterval(() => {
      const at = demo.time(Date.now());
      demo.advanceTo(at);
      const entry = demo.game.round?.entries[demo.human];
      if (
        !teacher &&
        entry &&
        demo.game.phase === "playing" &&
        demo.game.pausedAt == null
      )
        entry.seenAt ??= at;
      setClock({ now: at });
    }, 250);
    return () => clearInterval(timer);
  }, [demo, teacher, finished, paused, preview]);
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
        : responsesCsv(rows.map((row) => ({ ...row, heartbeatGap: null })));
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
  const view = teacher
    ? teacherView(demo.game, base, demo.history)
    : studentView(
        demo.game,
        base,
        demo.human,
        demo.archive.map((r) => personal(r, demo.human)),
      );
  const active = view.phase === "playing" || view.phase === "feedback";
  return (
    <>
      <DemoToolbar
        lang={lang}
        teacher={teacher}
        onSwitch={preview ? onSetup : () => setTeacher(!teacher)}
        bots={preview ? undefined : demo.game.seats.length - 1}
      >
        {!preview && (
          <>
            <button
              className="button primary"
              disabled={!active}
              onClick={() => act({ kind: "playback", paused: !paused })}
            >
              {paused ? <Play size={16} /> : <Pause size={16} />}
              {label(lang, paused ? "resume" : "pause")}
            </button>
            <button
              className="button secondary"
              disabled={!active || paused}
              onClick={() => {
                demo.fastForward(Date.now());
                refresh();
              }}
            >
              <SkipForward size={16} />
              {label(lang, "fast")}
            </button>
            <button className="button secondary" onClick={onSetup}>
              <RotateCcw size={16} />
              {label(lang, "reset")}
            </button>
          </>
        )}
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
