"use client";
import { useEffect, useState } from "react";
import { GraduationCap, UserRound, SkipForward, RotateCcw } from "lucide-react";
import { Header } from "@/components/shell";
import { DemoSelectionLink } from "@/components/demo-selection-link";
import { DEMO_TEACHER_HREFS } from "@/lib/demo-navigation";
import { responsesCsv } from "../export";
import type { Action } from "../engine";
import { EvolutionPractice } from "../practice";
import {
  baseView,
  personal,
  rawRows,
  studentView,
  summaries,
  teacherView,
} from "../views";
import type { Settings } from "../settings";
import { label } from "../locale";
import { useLanguage } from "./rules";
import { EvolutionSetup } from "./setup";
import { Panels } from "./panels";

export function EvolutionDemo() {
  const lang = useLanguage(),
    [demo, setDemo] = useState<EvolutionPractice | null>(null),
    [teacher, setTeacher] = useState(true),
    [now, setNow] = useState(0),
    [err, setError] = useState("");
  const refresh = () => setNow(demo?.time(Date.now()) ?? Date.now());
  const finished = demo?.game.phase === "finished";
  useEffect(() => {
    if (!demo || finished) return;
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
      setNow(at);
    }, 250);
    return () => clearInterval(timer);
  }, [demo, teacher, finished]);
  function create(title: string, s: Settings, n: number, student: boolean) {
    const at = Date.now();
    setNow(at);
    setDemo(new EvolutionPractice(title, s, n, at));
    setTeacher(!student);
    setError("");
  }
  function act(a: Action) {
    if (!demo) return;
    try {
      demo.act(a, Date.now());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    refresh();
  }
  function download(format: "csv" | "json") {
    if (!demo) return;
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
  const base = demo && baseView(demo.game, "DEMO", demo.title, now);
  const view =
    demo &&
    base &&
    (teacher
      ? teacherView(demo.game, base, demo.history)
      : studentView(
          demo.game,
          base,
          demo.human,
          demo.archive.map((r) => personal(r, demo.human)),
        ));
  return (
    <div className="demo-theme">
      <Header
        demoLabel="DEMOモード"
        demoExitHref={DEMO_TEACHER_HREFS.evolution}
        leading={<DemoSelectionLink />}
      />
      {!demo || !view ? (
        <main className="teacher-hub-main">
          <EvolutionSetup onDemo={create} />
        </main>
      ) : (
        <>
          <section
            className="demo-panel ev-demo-bar"
            aria-label={label(lang, "demoView")}
          >
            <div className="demo-controls">
              <div className="demo-options">
                <span className="role-tag">
                  {label(lang, teacher ? "teacher" : "student")}
                </span>
                <button
                  className="button secondary"
                  onClick={() => setTeacher(!teacher)}
                >
                  {teacher ? (
                    <UserRound size={16} />
                  ) : (
                    <GraduationCap size={16} />
                  )}{" "}
                  {label(lang, teacher ? "toStudent" : "toTeacher")}
                </button>
                <span>
                  {label(lang, "bots")} <b>{demo.game.seats.length - 1}</b>
                </span>
              </div>
              <div className="demo-actions">
                <button
                  className="button secondary"
                  disabled={
                    !(view.phase === "playing" || view.phase === "feedback") ||
                    view.pausedAt !== null
                  }
                  onClick={() => {
                    demo.fastForward(Date.now());
                    refresh();
                  }}
                >
                  <SkipForward size={16} />
                  {label(lang, "fast")}
                </button>
                <button
                  className="button secondary"
                  onClick={() => setDemo(null)}
                >
                  <RotateCcw size={16} />
                  {label(lang, "reset")}
                </button>
              </div>
            </div>
          </section>
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
      )}
    </div>
  );
}
