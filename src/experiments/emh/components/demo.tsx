"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  RotateCcw,
  Play,
  Pause,
  SkipForward,
  UserRound,
  GraduationCap,
} from "lucide-react";
import { createPortal } from "react-dom";
import {
  act,
  assignParticipants,
  advanceClock,
  phaseKey,
  unitKey,
  view,
} from "../engine";
import type { Action, Actor, Room } from "../types";
import {
  advanceDemoTime,
  demoTraderValue,
  makeDemo,
  PRACTICE_EXP2_OPTIONS,
} from "../demo-model";
import {
  DEFAULT_SETTINGS,
  settingsSchema,
  type EmhSettings,
} from "../settings";
import { Shell } from "./shell";
import { RoomDashboard } from "./room-dashboard";
import { EmhCreateForm } from "./create-form";
import { SettingsFields } from "./settings-fields";
import { SettingsSummary } from "./settings-summary";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Header } from "@/components/shell";
import { StudentWaitingCard } from "@/components/student-waiting-card";
import { DemoSelectionLink } from "@/components/demo-selection-link";
import { DEMO_TEACHER_HREFS } from "@/lib/demo-navigation";

function bot(room: Room, now: number) {
  if (room.status !== "trading" || room.pausedAt !== null) return;
  const p =
    room.participants[
      1 + Math.floor(Math.random() * (room.participants.length - 1))
    ]!;
  const value = Math.round(demoTraderValue(room, p));
  const actor: Actor = { role: "student", participantId: p.id };
  const key = unitKey(room);
  try {
    if (room.ask && room.ask.participantId !== p.id && room.ask.price <= value)
      act(
        room,
        actor,
        { kind: "accept", side: "ask", quoteId: room.ask.id, unitKey: key },
        now,
      );
    else if (
      p.holdings &&
      room.bid &&
      room.bid.participantId !== p.id &&
      room.bid.price >= value * 0.88
    )
      act(
        room,
        actor,
        { kind: "accept", side: "bid", quoteId: room.bid.id, unitKey: key },
        now,
      );
    else {
      const side = p.holdings && Math.random() > 0.5 ? "ask" : "bid";
      const price =
        side === "bid"
          ? Math.min(
              value,
              (room.bid?.price ?? Math.floor(value * 0.82)) +
                Math.ceil(Math.random() * 8),
            )
          : Math.max(
              Math.floor(value * 0.88),
              (room.ask?.price ?? Math.ceil(value * 1.05)) -
                Math.ceil(Math.random() * 8),
            );
      act(room, actor, { kind: "quote", side, price, unitKey: key }, now);
    }
  } catch {
    /* A changing quote or one's own best quote can legitimately reject a bot action. */
  }
}
type Setup = {
  title: string;
  settings: EmhSettings;
  experiment: "exp1" | "exp2";
};

export function Demo() {
  const [setup, setSetup] = useState<Setup>({
    title: "資産市場実験 · デモ",
    settings: structuredClone(DEFAULT_SETTINGS),
    experiment: "exp1",
  });
  const [running, setRunning] = useState(false);
  if (running)
    return (
      <DemoRoom
        initial={setup}
        onConfigure={(next) => {
          setSetup(next);
          setRunning(false);
        }}
      />
    );
  return (
    <>
      <Header
        homeHref="/emh/demo"
        demoLabel="DEMOモード"
        demoExitHref={DEMO_TEACHER_HREFS.emh}
        leading={<DemoSelectionLink />}
      >
        <Link
          className="button secondary small-button"
          href="/emh/demo/preview"
          target="_blank"
          rel="noopener noreferrer"
        >
          画面サイズ別プレビュー
        </Link>
      </Header>
      <main className="narrow-main teacher-setup-main">
        <div className="teacher-hub-main teacher-entry-content">
          <EmhCreateForm
            status={{ mode: "local", ready: true, keyRequired: false }}
            initialTitle={setup.title}
            initialSettings={setup.settings}
            initialExperiment={setup.experiment}
            exp2Defaults={PRACTICE_EXP2_OPTIONS}
            onCreateDemo={(title, settings, experiment) => {
              setSetup({ title, settings, experiment });
              setRunning(true);
            }}
          />
        </div>
      </main>
    </>
  );
}

function DemoRoom({
  initial,
  onConfigure,
}: {
  initial: Setup;
  onConfigure: (setup: Setup) => void;
}) {
  const [room, setRoom] = useState(() =>
    makeDemo(initial.title, initial.settings, Date.now(), initial.experiment),
  );
  const current = useRef(room);
  const [settings, setSettings] = useState(initial.settings);
  const [draft, setDraft] = useState<EmhSettings | null>(null);
  const [assigned, setAssigned] = useState(false);
  const [reopen, setReopen] = useState(false);
  const [conditionsOpen, setConditionsOpen] = useState(false);
  const [role, setRole] = useState<Actor["role"]>("teacher");
  const [error, setError] = useState("");
  const [now, setNow] = useState(room.createdAt);
  const offset = useRef(0);
  const lastBot = useRef(room.createdAt);
  const [controlsTarget] = useState<HTMLElement | null>(() => {
    if (typeof window === "undefined") return null;
    const id = window.frameElement?.getAttribute("data-demo-controls");
    return id ? window.parent.document.getElementById(id) : null;
  });
  const hiddenAt = useRef<number | null>(null);
  const dirty =
    draft !== null && JSON.stringify(draft) !== JSON.stringify(settings);
  const locked = assigned || room.status !== "lobby";
  function replace(next: Room, at = Date.now()) {
    current.current = next;
    setRoom(next);
    setNow(at);
    setError("");
  }
  const simulationRunning =
    room.status !== "lobby" && room.status !== "completed";
  useEffect(() => {
    if (!simulationRunning) return;
    const timer = setInterval(() => {
      const stored = current.current;
      if (stored.status === "lobby" || stored.status === "completed") return;
      const at = Date.now() + offset.current;
      if (document.hidden) {
        hiddenAt.current ??= at;
        return;
      }
      const next = structuredClone(stored);
      if (hiddenAt.current !== null) {
        const delta = at - hiddenAt.current;
        if (next.pausedAt === null) {
          if (next.countdownEndsAt != null) next.countdownEndsAt += delta;
          if (next.periodEndsAt !== null) next.periodEndsAt += delta;
          if (next.unitEndsAt !== null) next.unitEndsAt += delta;
          if (next.breakEndsAt !== null) next.breakEndsAt += delta;
        }
        hiddenAt.current = null;
      }
      advanceClock(next, at);
      if (at - lastBot.current >= 1800) {
        bot(next, at);
        lastBot.current = at;
      }
      current.current = next;
      setRoom(next);
      setNow(at);
    }, 500);
    return () => clearInterval(timer);
  }, [simulationRunning]);
  async function run(action: Action, as?: Actor) {
    const next = structuredClone(current.current);
    const at = Date.now() + offset.current;
    try {
      if (action.kind === "start" && !assigned)
        throw new Error("分け方を確定してください。");
      act(
        next,
        as ??
          (role === "teacher"
            ? { role: "teacher" }
            : { role: "student", participantId: "demo-0" }),
        action,
        at,
      );
      replace(next, at);
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作できませんでした。");
    }
  }
  function advance(mode: "30-seconds" | "next-period") {
    const next = structuredClone(current.current);
    const at = Date.now() + offset.current;
    const result = advanceDemoTime(next, at, lastBot.current, bot, mode);
    offset.current += result.now - at;
    lastBot.current = result.lastBotAt;
    replace(next, result.now);
  }
  function resetDemo() {
    const at = Date.now();
    offset.current = 0;
    lastBot.current = at;
    hiddenAt.current = null;
    setAssigned(false);
    setDraft(null);
    setConditionsOpen(false);
    replace(makeDemo(room.config.title, settings, at, initial.experiment), at);
  }
  const active = room.status === "trading" || room.status === "break";
  const teacher = role === "teacher";
  const toolbar = (
    <section
      className="demo-panel emh-demo-panel"
      aria-label="ひとりデモの操作"
    >
      <div className="demo-controls emh-demo-controls">
        <div className="demo-options">
          <div className="demo-status">
            <span className={`role-tag ${teacher ? "teacher" : "student"}`}>
              {teacher ? "教員" : "学生"}
            </span>
          </div>
          <button
            className="button secondary"
            onClick={() => setRole(teacher ? "student" : "teacher")}
          >
            {teacher ? <UserRound size={16} /> : <GraduationCap size={16} />}
            {teacher ? "学生画面を見る" : "教員画面を見る"}
          </button>
        </div>
        <div className="demo-actions">
          <button
            className="button primary"
            disabled={!active && room.status !== "countdown"}
            onClick={() =>
              run(
                {
                  kind: room.pausedAt === null ? "pause" : "resume",
                  expectedPhase: phaseKey(room),
                },
                { role: "teacher" },
              )
            }
          >
            {room.pausedAt === null ? <Pause size={16} /> : <Play size={16} />}
            {room.pausedAt === null ? "一時停止" : "再開"}
          </button>
          <button
            className="button secondary"
            disabled={!active || room.pausedAt !== null}
            onClick={() => advance("next-period")}
          >
            <SkipForward size={16} />
            次の期へ
          </button>
          <button
            className="button secondary"
            disabled={!active || room.pausedAt !== null}
            onClick={() => advance("30-seconds")}
          >
            <SkipForward size={16} />
            30秒進める
          </button>
          {teacher && room.status !== "lobby" && (
            <button
              className="button secondary"
              aria-expanded={conditionsOpen}
              aria-controls="demo-conditions"
              onClick={() => setConditionsOpen(!conditionsOpen)}
            >
              実験条件
            </button>
          )}
          <button className="button secondary" onClick={resetDemo}>
            <RotateCcw size={14} />
            やり直す
          </button>
          <button
            className="button secondary"
            onClick={() =>
              onConfigure({
                title: room.config.title,
                settings,
                experiment: initial.experiment,
              })
            }
          >
            設定を見直す
          </button>
        </div>
      </div>
      <div className="demo-caption">
        <span className="demo-count">
          1市場・あなた1人 ＋ 仮想参加者{room.participants.length - 1}人
        </span>
      </div>
    </section>
  );
  return (
    <Shell wide room demo leading={<DemoSelectionLink />}>
      <div
        className={
          initial.experiment === "exp2" && room.status !== "lobby"
            ? "emh-demo-exp2-active"
            : ""
        }
      >
        {controlsTarget ? createPortal(toolbar, controlsTarget) : toolbar}
        {error && (
          <p className="notice warning" role="alert">
            {error}
          </p>
        )}
        {role === "teacher" && (room.status === "lobby" || conditionsOpen) && (
          <section id="demo-conditions" className="panel emh-session-settings">
            {locked ? (
              <SettingsSummary
                settings={settings}
                experiment={initial.experiment}
              />
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!draft || locked) return;
                  const parsed = settingsSchema.safeParse(draft);
                  if (!parsed.success) {
                    setError(
                      parsed.error.issues[0]?.message ??
                        "実験条件を確認してください。",
                    );
                    return;
                  }
                  setSettings(parsed.data);
                  setDraft(null);
                  replace(
                    makeDemo(
                      room.config.title,
                      parsed.data,
                      Date.now(),
                      initial.experiment,
                    ),
                  );
                }}
              >
                <SettingsFields
                  experiment={initial.experiment}
                  demo
                  settings={draft ?? settings}
                  onChange={setDraft}
                />
                <button className="button secondary" disabled={!dirty}>
                  設定を保存
                </button>
                {draft && (
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setDraft(null)}
                  >
                    変更を取り消す
                  </button>
                )}
                {dirty && (
                  <p className="field-help">
                    設定を保存すると、下の分け方に反映されます。
                  </p>
                )}
              </form>
            )}
          </section>
        )}
        {room.status === "lobby" ? (
          role === "student" ? (
            <StudentWaitingCard assigned={assigned}>
              <p className="student-waiting-eyebrow">入室が完了しました</p>
              <h1>教員が開始するまでお待ちください</h1>
              <p className="student-waiting-context">
                {room.config.title} · ルーム <b>{room.code}</b>
              </p>
              <p>
                {assigned
                  ? "市場 1 に参加します。開始後に自分の配当を確認してください。"
                  : "教員が受付を終了するまで、この画面を開いたままお待ちください。"}
              </p>
              <div className="student-waiting-count">
                参加者 <b>{room.participants.length}</b>人
              </div>
            </StudentWaitingCard>
          ) : (
            <>
              <div className="room-heading">
                <h1>{room.config.title}</h1>
                <span className="status">
                  {assigned ? "開始待ち" : "参加者を受付中"}
                </span>
              </div>
              <section className="panel emh-waiting">
                <h2>{room.participants.length}人が入室</h2>
                {role === "teacher" ? (
                  <div className="emh-actions">
                    {assigned ? (
                      <>
                        <button
                          className="button secondary"
                          onClick={() => setReopen(true)}
                        >
                          割り当てを解除
                        </button>
                        <button
                          className="button primary"
                          onClick={() =>
                            run({
                              kind: "start",
                              expectedPhase: phaseKey(room),
                            })
                          }
                        >
                          全市場で実験を開始
                        </button>
                      </>
                    ) : (
                      <button
                        className="button primary"
                        disabled={dirty}
                        onClick={() => {
                          if (dirty) return;
                          const next = structuredClone(current.current);
                          assignParticipants(next);
                          replace(next);
                          setAssigned(true);
                        }}
                      >
                        分け方を確定して受付終了
                      </button>
                    )}
                  </div>
                ) : (
                  <p>教員が実験を開始するまで、この画面でお待ちください。</p>
                )}
              </section>
              {role === "teacher" && (
                <section className="panel emh-allocation">
                  <h2>
                    {assigned ? "市場の割り当て" : "現在の人数での分け方"}
                  </h2>
                  <div className="emh-allocation-grid">
                    <article>
                      <h3>
                        市場 1 <span>{room.participants.length}人</span>
                      </h3>
                      <p>タイプ別人数 {room.typeCounts!.join(" / ")}</p>
                      {initial.experiment === "exp2" && settings.exp2 && (
                        <p>
                          内部情報の人数{" "}
                          {room
                            .typeCounts!.map((count) =>
                              Math.min(
                                count,
                                settings.exp2!.insiderCountPerType,
                              ),
                            )
                            .join(" / ")}
                        </p>
                      )}
                      <p>
                        総証券数{" "}
                        {room.participants.length * settings.initialUnits}
                        単位
                      </p>
                    </article>
                  </div>
                </section>
              )}
            </>
          )
        ) : (
          <RoomDashboard
            room={view(
              room,
              role === "teacher"
                ? { role: "teacher" }
                : { role: "student", participantId: "demo-0" },
              now,
            )}
            act={run}
            demo
          />
        )}
        {reopen && (
          <ConfirmDialog
            title="割り当てを解除"
            message={
              initial.experiment === "exp2"
                ? "市場とタイプの割り当てを解除します。再確定すると参加者を割り当て直します。"
                : "市場とタイプの割り当てを解除し、受付と条件の編集を再開します。再確定すると参加者を割り当て直します。"
            }
            confirmLabel="解除して受付再開"
            onCancel={() => setReopen(false)}
            onConfirm={async () => {
              if (current.current.status !== "lobby") return;
              replace(
                makeDemo(
                  room.config.title,
                  settings,
                  Date.now(),
                  initial.experiment,
                ),
              );
              setAssigned(false);
              setDraft(null);
              setReopen(false);
            }}
          />
        )}
      </div>
    </Shell>
  );
}
