"use client";
import { useEffect, useReducer, useState } from "react";
import { Header } from "@/components/shell";
import { DemoSelectionLink } from "@/components/demo-selection-link";
import { DEMO_TEACHER_HREFS } from "@/lib/demo-navigation";
import { responsesCsv } from "../export";
import {
  choose,
  closeAdmission,
  newGame,
  newSeat,
  start,
  tick,
  type Action,
  type Game,
  type Round,
} from "../engine";
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
type Demo = { g: Game; archive: Round[]; title: string; createdAt: number };
function advance(d: Demo, now: number) {
  const old = d.g.round;
  tick(d.g, now);
  if (old && old !== d.g.round) d.archive.push(old);
}
export function EvolutionDemo() {
  const lang = useLanguage(),
    [demo, setDemo] = useState<Demo | null>(null),
    [role, setRole] = useState("teacher"),
    [now, setNow] = useState(0),
    [err, setError] = useState(""),
    [, refresh] = useReducer((n) => n + 1, 0);
  useEffect(() => {
    if (!demo) return;
    const timer = setInterval(() => {
      const at = Date.now();
      advance(demo, at);
      setNow(at);
    }, 250);
    return () => clearInterval(timer);
  }, [demo]);
  function create(title: string, s: Settings, n: number) {
    const g = newGame(s);
    g.seats = Array.from({ length: n }, (_, i) => newSeat(String(i + 1)));
    const at = Date.now();
    setNow(at);
    setRole("teacher");
    setError("");
    setDemo({ g, archive: [], title, createdAt: at });
  }
  function act(a: Action) {
    if (!demo) return;
    const at = Date.now(),
      g = demo.g;
    advance(demo, at);
    try {
      if (a.kind === "close") closeAdmission(g, at);
      if (a.kind === "start") start(g, at);
      if (a.kind === "choose") choose(g, role, a.round, a.choice, at);
      setError("");
    } catch (e) {
      setError(String(e));
    }
    setNow(at);
    refresh();
  }
  function download(format: "csv" | "json") {
    if (!demo) return;
    const g = demo.g,
      rounds = g.round ? [...demo.archive, g.round] : demo.archive;
    const rows = rounds.flatMap((r) => rawRows(g, r, "DEMO"));
    const body =
      format === "json"
        ? JSON.stringify(
            {
              demo: true,
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
  const base = demo && baseView(demo.g, "DEMO", demo.title, now);
  const view =
    demo &&
    base &&
    (role === "teacher"
      ? teacherView(
          demo.g,
          base,
          demo.archive.flatMap((r) => summaries(demo.g, r)),
        )
      : studentView(
          demo.g,
          base,
          role,
          demo.archive.map((r) => personal(r, role)),
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
          <div className="ev ev-demo-bar">
            <label className="field">
              {label(lang, "demoView")}
              <select
                value={role}
                onChange={(e) => {
                  const id = e.target.value;
                  setRole(id);
                  setError("");
                  const entry = demo.g.round?.entries[id];
                  if (entry && demo.g.phase === "playing")
                    entry.seenAt ??= Date.now();
                }}
              >
                <option value="teacher">{label(lang, "teacher")}</option>
                {demo.g.seats.map((p) => (
                  <option key={p.id} value={p.id}>
                    {label(lang, "student")} {p.id}
                  </option>
                ))}
              </select>
            </label>
            <button className="button secondary" onClick={() => setDemo(null)}>
              {label(lang, "reset")}
            </button>
          </div>
          {err && (
            <p role="alert" className="error-message">
              {err}
            </p>
          )}
          <Panels
            key={role}
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
