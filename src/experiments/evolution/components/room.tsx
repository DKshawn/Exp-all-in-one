"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Header } from "@/components/shell";
import { api, errorMessage } from "@/lib/client";
import type { Action } from "../engine";
import type { View } from "../views";
import { label } from "../locale";
import { Panels } from "./panels";
import { EvolutionLanguage, useLanguage } from "./language";
export function EvolutionRoom({
  code,
  role,
}: {
  code: string;
  role: "teacher" | "student";
}) {
  const lang = useLanguage(),
    [v, setView] = useState<View | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [now, setNow] = useState(0);
  const clock = useRef({ now: 0, at: 0 }),
    serial = useRef(0),
    inAction = useRef(false);
  const url = "/api/rooms/" + code + "/evolution?session=" + role;
  const finished = v?.phase === "finished";
  const update = useCallback(
    async (action?: Action, signal?: AbortSignal) => {
      const request = ++serial.current;
      try {
        const result = await api<View>(url, action, signal);
        if (request !== serial.current || signal?.aborted) return;
        clock.current = { now: result.now, at: performance.now() };
        setNow(result.now);
        setView(result);
        setError("");
      } catch (e) {
        if (request === serial.current && !signal?.aborted)
          setError(errorMessage(e));
      }
    },
    [url],
  );
  useEffect(() => {
    if (finished) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (!inAction.current) await update(undefined, controller.signal);
      if (!controller.signal.aborted) timer = setTimeout(poll, 1500);
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [update, finished]);
  // Polls and heartbeats continue even when no countdown is on screen.
  const deadline =
    v && v.pausedAt === null && !finished
      ? (v.admission.deadline ?? v.deadline)
      : null;
  useEffect(() => {
    if (deadline == null) return;
    let timer: ReturnType<typeof setTimeout>;
    function tick() {
      const time = clock.current.now + performance.now() - clock.current.at;
      setNow(time);
      const remaining = deadline! - time;
      if (remaining > 0)
        timer = setTimeout(tick, Math.ceil(remaining % 1000 || 1000));
    }
    tick();
    return () => clearTimeout(timer);
  }, [deadline, v?.now]);
  async function act(a: Action) {
    if (inAction.current) return;
    inAction.current = true;
    setBusy(true);
    try {
      await update(a);
    } finally {
      inAction.current = false;
      setBusy(false);
    }
  }
  const href = role === "teacher" ? "/teacher?code=" + code : "/?code=" + code;
  return (
    <>
      <Header homeHref={role === "teacher" ? "/teacher" : "/"}>
        <EvolutionLanguage />
      </Header>
      {error && (
        <div role="alert" className="ev ev-error error-message">
          {error}{" "}
          <Link className="button secondary" href={href}>
            {label(lang, "returnRoom")}
          </Link>
        </div>
      )}
      {v ? (
        <Panels
          view={v}
          lang={lang}
          now={now}
          busy={busy}
          act={act}
          downloads={["json", "csv"].map((f) => (
            <a
              key={f}
              className="button secondary"
              href={"/api/rooms/" + code + "/evolution/export?format=" + f}
              download
            >
              {label(lang, f === "json" ? "exportJson" : "exportCsv")}
            </a>
          ))}
        />
      ) : (
        <p className="ev ev-room">{label(lang, "loading")}</p>
      )}
    </>
  );
}
