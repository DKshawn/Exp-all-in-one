"use client";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  Pause,
  Play,
  SkipForward,
  Users,
  WifiOff,
  Radio,
  Eye,
} from "lucide-react";
import { RoundStrip, clockText as clock } from "@/components/round-strip";
import { StudentWaitingCard } from "@/components/student-waiting-card";
import { EmhEndExperiment } from "./end-experiment";
import type { RoomView, TeacherAction } from "@/experiments/emh/types";
import {
  ExportPanel,
  HistoryPanel,
  OrderPanel,
  ParticipantsPanel,
  PersonalPanel,
  ResultsPanel,
  Yen,
  type RunAction,
} from "./market-panels";

export function useClock(serverNow: number) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const received = Date.now();
    const timer = setInterval(
      () => setNow(serverNow + Date.now() - received),
      200,
    );
    return () => clearInterval(timer);
  }, [serverNow]);
  return Math.max(serverNow, now);
}
const remaining = (deadline: number | null, now: number) =>
  Math.max(0, Math.ceil(((deadline ?? now) - now) / 1000));
export function RoomDashboard({
  room,
  act,
  busy = false,
  online = true,
  demo = false,
  showReveal = true,
}: {
  room: RoomView;
  act: RunAction;
  busy?: boolean;
  online?: boolean;
  demo?: boolean;
  showReveal?: boolean;
}) {
  const now = useClock(room.serverNow);
  const reference = room.pausedAt ?? now;
  const [tab, setTab] = useState<"market" | "results" | "people">("market");
  const [copied, setCopied] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    kind: "end-period" | "reveal";
    phase: string;
    year: number;
    period: string;
  } | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (confirmation && dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, [confirmation]);
  const teacher = room.role === "teacher";
  const active = room.status === "trading";
  const countdown = room.status === "countdown";
  const paused = room.pausedAt !== null;
  const awaitingClock =
    active &&
    !paused &&
    (reference >= (room.unitEndsAt ?? Infinity) ||
      reference >= (room.periodEndsAt ?? Infinity));
  const disabled = busy || !online || awaitingClock;
  const finalScore = room.results.some(
    (result) =>
      result.year === room.year &&
      (room.exp2 ||
        result.period === "B" ||
        result.reason === "teacher-finish"),
  );
  function periodClass(year: number, period: "A" | "B") {
    if (room.results.some((r) => r.year === year && r.period === period))
      return "done";
    return room.status !== "completed" &&
      room.year === year &&
      room.period === period
      ? "active"
      : "";
  }
  const lastPersonalTrade = room.trades.findLast(
    (trade) =>
      trade.year === room.year &&
      room.me &&
      (trade.buyerId === room.me.id || trade.sellerId === room.me.id),
  );
  const status =
    room.status === "lobby"
      ? "参加者を受付中"
      : room.status === "completed"
        ? "実験終了"
        : paused
          ? "一時停止中"
          : room.status === "break"
            ? "休憩中"
            : countdown
              ? "開始準備中"
              : "取引中";
  const control = (kind: TeacherAction["kind"]) =>
    act({ kind, expectedPhase: room.phaseKey });
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/room/${room.code}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <>
      {!teacher && countdown && (
        <>
          <div className="study-start-countdown" aria-hidden="true" />
          <div
            className="study-trade-feedback"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <div className="panel study-countdown-card emh-countdown-card">
              <span className="eyebrow">
                市場{room.marketId ?? 1} · 被験者 #{room.me?.seat}
              </span>
              <h2>
                {paused
                  ? "開始前に一時停止しています"
                  : "まもなく実験が始まります"}
              </h2>
              <strong>
                {remaining(room.countdownEndsAt, reference) || "開始中"}
              </strong>
              <p>
                {paused
                  ? "教員が再開するまでお待ちください。"
                  : "あなたの条件を確認してください。カウントダウン後に注文できます。"}
              </p>
            </div>
          </div>
        </>
      )}
      <div
        className={
          teacher
            ? "emh-teacher-view"
            : `emh-student-view${countdown ? " emh-countdown-view" : ""}`
        }
      >
        <div className="room-heading">
          <div>
            <div className="room-context">
              {teacher
                ? "教員"
                : room.me?.seat
                  ? `被験者 #${room.me.seat}`
                  : room.me?.name}
              <span className="context-divider" />
              ルーム <strong className="mono">{room.code}</strong>
            </div>
            <h1>{room.title}</h1>
          </div>
          <div className="room-heading-right">
            <span className={`status ${paused ? "amber" : ""}`}>
              {online ? <span className="status-dot" /> : <WifiOff size={14} />}{" "}
              {online ? status : "再接続中"}
            </span>
            {teacher && !demo && (
              <button className="button secondary small" onClick={copy}>
                {copied ? <Check size={15} /> : <Copy size={15} />}参加リンク
              </button>
            )}
          </div>
        </div>
        {!online && (
          <p className="notice warning" role="status">
            通信を再接続しています。表示は最後に受信した状態です。取引は接続が戻るまで待ってください。
          </p>
        )}
        {room.status === "lobby" && !teacher ? (
          <StudentWaitingCard>
            <p className="student-waiting-eyebrow">入室が完了しました</p>
            <h1>教員が開始するまでお待ちください</h1>
            <p>この画面を開いたままお待ちください。</p>
            <div className="student-waiting-count">
              参加者 <b>{room.participantCount}</b>人
            </div>
          </StudentWaitingCard>
        ) : room.status === "lobby" ? (
          <div className="lobby-layout">
            <section className="panel lobby-panel">
              <div className="lobby-title">
                <Users size={25} />
                <h2>
                  {teacher
                    ? "参加者の入室を待っています"
                    : "まもなく実験が始まります"}
                </h2>
              </div>
              <div className="arrival-count">
                <strong>{room.participantCount}</strong>
                <span>人</span>
              </div>
              <div
                className="seats"
                aria-label={`${room.participantCount}人が参加済み`}
              >
                {Array.from(
                  { length: Math.max(9, room.participantCount) },
                  (_, i) => (
                    <div
                      key={i}
                      className={`seat ${i < room.participantCount ? "filled" : ""}`}
                    >
                      <Users size={21} />
                      {teacher && room.participants[i] ? (
                        <span>{room.participants[i]!.name}</span>
                      ) : (
                        <span>
                          {i < room.participantCount ? "参加済み" : "待機中"}
                        </span>
                      )}
                    </div>
                  ),
                )}
              </div>
              <p className="muted">
                被験者番号と配当は、開始時に割り当てます。
              </p>
              {teacher && (
                <button
                  className="button primary"
                  disabled={disabled || room.participantCount < 3}
                  onClick={() => control("start")}
                >
                  <Play size={17} />
                  実験を開始
                </button>
              )}
            </section>
            <aside className="panel lobby-settings">
              <h2>今回の実験</h2>
              <dl>
                <div>
                  <dt>ラウンド</dt>
                  <dd>{room.rounds}回</dd>
                </div>
                <div>
                  <dt>各期</dt>
                  <dd>{room.periodSeconds}秒</dd>
                </div>
                <div>
                  <dt>1取引</dt>
                  <dd>{room.unitSeconds}秒</dd>
                </div>
                <div>
                  <dt>ラウンド間の休憩</dt>
                  <dd>{room.breakSeconds}秒</dd>
                </div>
                <div>
                  <dt>初期保有</dt>
                  <dd>{room.initialUnits}単位</dd>
                </div>
              </dl>
              <p className="field-note">
                {room.emptyUnitsLimit}
                回続けて取引が成立しなければ、その期を終了します。
              </p>
            </aside>
          </div>
        ) : (
          <>
            <div className="session-overview">
              <RoundStrip
                rounds={room.rounds}
                current={
                  room.status === "completed"
                    ? (room.results.at(-1)?.year ?? 0)
                    : room.year
                }
                finished={room.status === "completed"}
                label="ラウンドの進行"
                roundLabel={(n) =>
                  `第${n}ラウンド${room.experiment !== "exp2" && n === room.year && room.status !== "completed" ? `、${room.period}期` : ""}`
                }
              >
                {room.experiment === "exp2"
                  ? undefined
                  : (n) => (
                      <div>
                        <i className={periodClass(n, "A")}>A</i>
                        <i className={periodClass(n, "B")}>B</i>
                      </div>
                    )}
              </RoundStrip>
              <div className="session-bar">
                <div className="session-phase">
                  <strong>
                    {room.status === "completed"
                      ? "すべての取引が終了"
                      : room.status === "break"
                        ? "次のラウンドまで"
                        : countdown
                          ? "まもなく取引開始"
                          : room.experiment === "exp2"
                            ? "取引中"
                            : `Period ${room.period}`}
                  </strong>
                </div>
                <div className="timers">
                  {room.status !== "completed" && (
                    <>
                      <div>
                        <span>
                          {countdown
                            ? "開始まで"
                            : room.status === "break"
                              ? "休憩"
                              : "期の残り"}
                        </span>
                        <strong className="timer">
                          {clock(
                            remaining(
                              countdown
                                ? room.countdownEndsAt
                                : room.status === "break"
                                  ? room.breakEndsAt
                                  : room.periodEndsAt,
                              reference,
                            ),
                          )}
                        </strong>
                        {active && (
                          <progress
                            max={room.periodSeconds}
                            value={remaining(room.periodEndsAt, reference)}
                            aria-label={
                              room.exp2
                                ? "ラウンドの残り時間"
                                : `${room.period}期の残り時間`
                            }
                          />
                        )}
                      </div>
                      {active && (
                        <div
                          className={
                            remaining(room.unitEndsAt, reference) <= 5
                              ? "urgent"
                              : ""
                          }
                        >
                          <span>第{room.unit}取引の残り</span>
                          <strong className="timer small-timer">
                            {remaining(room.unitEndsAt, reference)}
                            <small>秒</small>
                          </strong>
                          <progress
                            max={room.unitSeconds}
                            value={remaining(room.unitEndsAt, reference)}
                            aria-label="この取引の残り時間"
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
                {teacher && room.status !== "completed" && (
                  <div className="control-buttons">
                    <button
                      className="button secondary"
                      disabled={disabled}
                      onClick={() => control(paused ? "resume" : "pause")}
                    >
                      {paused ? <Play size={16} /> : <Pause size={16} />}
                      <span>{paused ? "再開" : "一時停止"}</span>
                    </button>
                    {room.status === "break" ? (
                      <button
                        className="button secondary"
                        disabled={disabled || paused}
                        onClick={() => control("next-year")}
                      >
                        <SkipForward size={16} />
                        次へ
                      </button>
                    ) : (
                      <button
                        className="button quiet"
                        disabled={disabled || paused || countdown}
                        onClick={() =>
                          setConfirmation({
                            kind: "end-period",
                            phase: room.phaseKey,
                            year: room.year,
                            period: room.period,
                          })
                        }
                      >
                        期を終了
                      </button>
                    )}
                    {demo && (
                      <EmhEndExperiment
                        disabled={disabled}
                        onFinish={async () => {
                          await act({
                            kind: "finish",
                            expectedPhase: room.phaseKey,
                          });
                        }}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
            {room.status === "completed" ? (
              <div className="notice completion">
                <div>
                  <Check size={20} />
                  <span>
                    {teacher ? (
                      "実験が終了しました。結果と記録を確認できます。"
                    ) : (
                      <>
                        おつかれさまでした。あなたの累計損益は{" "}
                        <strong>
                          <Yen value={room.me?.totalProfit} />
                        </strong>{" "}
                        です。
                      </>
                    )}
                  </span>
                </div>
                {teacher && showReveal && !room.reveal && (
                  <button
                    className="button secondary small"
                    disabled={disabled}
                    onClick={() =>
                      setConfirmation({
                        kind: "reveal",
                        phase: room.phaseKey,
                        year: room.year,
                        period: room.period,
                      })
                    }
                  >
                    <Eye size={15} />
                    解説を公開
                  </button>
                )}
              </div>
            ) : room.status === "break" ? (
              <div className="notice">
                <span>
                  第{room.year}
                  ラウンドの損益が確定しました。次は証券を{room.initialUnits}
                  単位ずつ受け取ります。
                </span>
              </div>
            ) : (
              <div className="market-note" role="status" aria-atomic="true">
                <Radio size={14} />
                <span>
                  {paused
                    ? "教員が再開するまでお待ちください。"
                    : countdown
                      ? "自分の条件を確認してください。カウントダウン後に取引できます。"
                      : awaitingClock
                        ? "取引の切替を確認しています。"
                        : busy
                          ? "操作を送信しています。"
                          : teacher
                            ? "全員が提示・取引できます。"
                            : room.me?.holdings === 0
                              ? "買値を提示できます。保有0単位のため売れません。"
                              : "買値・売値を提示できます。相手の提示を受けると即時成立します。"}
                </span>
                {room.emptyUnits > 0 && (
                  <span className="inactivity">
                    連続{room.emptyUnits}回、成立なし
                  </span>
                )}
              </div>
            )}
            {(active || countdown) && (
              <div className="trading-clock-rule">
                <span>1取引につき1単位。時間切れは成立なしで次の取引へ。</span>
                <span>
                  連続{room.emptyUnitsLimit}回不成立、または
                  {room.exp2 ? "ラウンド" : "期"}の時間終了で精算します。
                </span>
              </div>
            )}
            {!teacher && (
              <>
                <div
                  className="personal-trade-feedback"
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {lastPersonalTrade && (
                    <p key={lastPersonalTrade.id}>
                      直近の成立：1単位を
                      <Yen value={lastPersonalTrade.price} />で
                      {lastPersonalTrade.buyerId === room.me?.id
                        ? "買いました"
                        : "売りました"}
                      。
                    </p>
                  )}
                </div>
              </>
            )}
            {teacher && (
              <div
                className="tabs room-tabs"
                role="tablist"
                aria-label="表示内容"
              >
                <button
                  role="tab"
                  aria-selected={tab === "market"}
                  onClick={() => setTab("market")}
                >
                  市場
                </button>
                <button
                  role="tab"
                  aria-selected={tab === "results"}
                  onClick={() => setTab("results")}
                >
                  結果
                </button>
                <button
                  role="tab"
                  aria-selected={tab === "people"}
                  onClick={() => setTab("people")}
                >
                  参加者
                </button>
              </div>
            )}
            {!teacher ? (
              <div className="market-grid student-market-grid">
                <OrderPanel
                  room={room}
                  act={act}
                  disabled={disabled || !active || paused}
                />
                <PersonalPanel
                  room={room}
                  act={act}
                  disabled={disabled}
                  finalScore={!!finalScore}
                />
                <div className="emh-records">
                  <HistoryPanel room={room} compact />
                  <ResultsPanel room={room} />
                </div>
              </div>
            ) : (
              tab === "market" && (
                <div className="market-grid">
                  <aside>
                    <OrderPanel room={room} />
                  </aside>
                  <HistoryPanel room={room} compact={!!demo && !!room.exp2} />
                </div>
              )
            )}
            {teacher && tab === "results" && <ResultsPanel room={room} />}
            {tab === "people" && teacher && <ParticipantsPanel room={room} />}
            {room.status === "completed" && tab === "market" && teacher && (
              <ResultsPanel room={room} />
            )}
            <ExportPanel room={room} demo={demo} />
          </>
        )}
        {teacher && room.status === "lobby" && room.participantCount > 0 && (
          <ParticipantsPanel room={room} />
        )}
        {confirmation && (
          <dialog
            ref={dialogRef}
            className="confirmation-dialog"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-description"
            onCancel={() => setConfirmation(null)}
          >
            <h2 id="confirm-title">
              {confirmation.kind === "end-period"
                ? "この期を終了"
                : "解説を公開"}
            </h2>
            <p id="confirm-description">
              {confirmation.kind === "end-period"
                ? `第${confirmation.year}ラウンド${room.experiment === "exp2" ? "" : ` ${confirmation.period}期`}を終了し、現在の保有量で配当を確定します。`
                : "全参加者に、全タイプの配当条件と理論価格を公開します。"}
            </p>
            <div>
              <button
                className="button secondary"
                onClick={() => setConfirmation(null)}
              >
                戻る
              </button>
              <button
                className="button primary"
                disabled={disabled}
                onClick={() => {
                  const chosen = confirmation;
                  setConfirmation(null);
                  void act({ kind: chosen.kind, expectedPhase: chosen.phase });
                }}
              >
                {confirmation.kind === "end-period"
                  ? "配当を確定して進む"
                  : "全員に公開する"}
              </button>
            </div>
          </dialog>
        )}
      </div>
    </>
  );
}
