"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  aiExperiments,
  aiRunActive,
  isAiExperiment,
  type AiConsoleView,
  type AiPhase,
  type AiProvider,
  type AiRecord,
} from "@/lib/ai-console";
import { api, errorMessage, timeLabel } from "@/lib/client";
import type { RoomSummary } from "@/lib/room-management";
import { teacherRoomHref } from "@/lib/room-navigation";
import { EMH_EXPERIMENT_LABELS } from "@/experiments/emh/types";
import { label } from "@/experiments/evolution/locale";
import styles from "@/app/teacher/ai/console.module.css";

const route = "/api/teacher/ai";
const phases: Record<AiPhase, string> = {
  joining: "入室中",
  ready: "開始待ち",
  running: "実行中",
  stopping: "停止中",
  finished: "実験終了",
  stopped: "停止済み",
  failed: "実行失敗",
  interrupted: "中断",
};
const actions: Record<string, string> = {
  "study-quote": "指値",
  "study-accept": "注文を受諾",
  "study-cancel": "注文を取消",
  quote: "指値",
  choose: "選択",
  wait: "待機",
  bid: "買い指値",
  ask: "売り指値",
  buy: "購入",
  sell: "売却",
  cancel_bid: "買い注文を取消",
  cancel_ask: "売り注文を取消",
  cancel: "注文を取消",
  "call-submit": "注文を提出",
  "posted-offer": "価格を提示",
  "posted-bid": "入札",
  "posted-buy": "購入",
  accept: "注文を受諾",
  "posted-pass": "見送り",
};
const outcome: Record<string, string> = {
  submitted: "受理",
  skipped: "見送り",
  error: "エラー",
  waiting_started: "待機",
};

function roomLabel(room: RoomSummary) {
  if (room.experiment === "emh")
    return `EMH ${EMH_EXPERIMENT_LABELS[room.variant]}`;
  if (room.experiment === "evolution")
    return `SEG ${label("ja", room.variant)}`;
  return "Double Auction";
}

function location(record: AiRecord) {
  if (record.market != null) return `市場 ${record.market}`;
  if (record.group != null) return `組 ${record.group}`;
  return "";
}

function decisionLabel(record: AiRecord) {
  const option = record.selectedOption;
  if (typeof option === "string") return option;
  if (option != null && typeof option === "object" && option.action) {
    const amount = typeof option.price === "number" ? ` ${option.price}円` : "";
    return `${actions[option.action] ?? option.action}${amount}`;
  }
  const action = record.decision?.action;
  if (!action) return "—";
  const amount =
    typeof record.decision?.price === "number"
      ? ` ${record.decision.price}円`
      : "";
  return `${actions[action] ?? action}${amount}`;
}

function Reason({ record }: { record: AiRecord }) {
  const reason =
    record.error ||
    record.decision?.reason ||
    (record.skipReason === "run_stopped" ? "実行停止" : record.skipReason) ||
    "—";
  if (reason.length <= 110) return reason;
  return (
    <details className={styles.reasonDetails}>
      <summary className="button secondary small-button">
        <span>理由を表示</span>
        <span>理由を閉じる</span>
      </summary>
      <p>{reason}</p>
    </details>
  );
}

function Records({ records }: { records: AiRecord[] }) {
  const [student, setStudent] = useState("");
  const [market, setMarket] = useState("");
  const [round, setRound] = useState("");
  const visible = records.filter(
    (r) =>
      (!student || r.student === student) &&
      (!market || location(r) === market) &&
      (!round || String(r.round) === round),
  );
  const options = (values: string[], selected: string) =>
    Array.from(new Set([...values, selected]))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "ja", { numeric: true }));
  return (
    <>
      {records.length > 0 && (
        <div className={styles.filters}>
          <label className="field">
            <span>学生</span>
            <select
              value={student}
              onChange={(e) => setStudent(e.target.value)}
            >
              <option value="">全員</option>
              {options(
                records.map((r) => r.student ?? ""),
                student,
              ).map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>市場・組</span>
            <select value={market} onChange={(e) => setMarket(e.target.value)}>
              <option value="">すべて</option>
              {options(records.map(location), market).map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>ラウンド</span>
            <select value={round} onChange={(e) => setRound(e.target.value)}>
              <option value="">すべて</option>
              {options(
                records.map((r) => String(r.round ?? "")),
                round,
              ).map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      {visible.length ? (
        <div
          className={styles.tableViewport}
          tabIndex={0}
          role="region"
          aria-label="決定記録の表"
        >
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">時刻</th>
                <th scope="col">学生</th>
                <th scope="col">市場・回</th>
                <th scope="col">決定</th>
                <th scope="col">結果</th>
                <th scope="col">応答</th>
                <th scope="col">理由</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((record) => (
                <tr key={`${record.at}-${record.student}-${record.type}`}>
                  <td>
                    <time dateTime={record.at}>
                      {timeLabel(Date.parse(record.at))}
                    </time>
                  </td>
                  <td>{record.student ?? "—"}</td>
                  <td>
                    {[
                      location(record),
                      record.round == null
                        ? ""
                        : `${record.round}${record.period ?? ""}`,
                    ]
                      .filter(Boolean)
                      .join(" / ") || "—"}
                  </td>
                  <td>{decisionLabel(record)}</td>
                  <td>
                    <span
                      className={
                        record.type === "error"
                          ? styles.errorText
                          : record.type === "submitted"
                            ? styles.accepted
                            : styles.muted
                      }
                    >
                      {outcome[record.type] ?? record.type}
                    </span>
                    {record.fills?.map((fill) => (
                      <span key={fill.id} className={styles.fill}>
                        約定 {fill.price}円
                      </span>
                    ))}
                  </td>
                  <td>
                    {record.modelDurationMs === undefined
                      ? "—"
                      : `${(record.modelDurationMs / 1000).toFixed(2)}秒`}
                  </td>
                  <td className={styles.reason}>
                    <Reason record={record} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={styles.empty}>
          {records.length
            ? "条件に一致する記録がありません。"
            : "決定記録はまだありません。"}
        </p>
      )}
    </>
  );
}

export function AiExperimentConsole({
  localModel,
  openaiAvailable,
}: {
  localModel: string;
  openaiAvailable: boolean;
}) {
  const [roomList, setRoomList] = useState<RoomSummary[] | null>(null);
  const [code, setCode] = useState("");
  const [provider, setProvider] = useState<AiProvider>("local");
  const [model, setModel] = useState(localModel);
  const [view, setView] = useState<AiConsoleView>({
    runs: [],
    records: [],
    selected: null,
  });
  const [requested, setRequested] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [liveError, setLiveError] = useState("");
  const mutation = useRef(false);
  const choice = view.runs.find((run) => run.id === view.selected);
  const roomBusy = view.runs.some(
    (run) => run.code === code && aiRunActive(run.phase),
  );

  useEffect(() => {
    const controller = new AbortController();
    api<{ rooms: RoomSummary[] }>("/api/rooms/manage", {}, controller.signal)
      .then(({ rooms }) =>
        setRoomList(
          rooms.filter(
            (room) =>
              isAiExperiment(room.experiment) && room.phase === "waiting",
          ),
        ),
      )
      .catch((error) => {
        if (!controller.signal.aborted) setError(errorMessage(error));
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        if (!mutation.current) {
          const result = await api<AiConsoleView>(
            requested ? `${route}?run=${requested}` : route,
            undefined,
            controller.signal,
          );
          if (!controller.signal.aborted && !mutation.current) setView(result);
          if (!controller.signal.aborted) setLiveError("");
        }
      } catch (error) {
        if (!controller.signal.aborted) setLiveError(errorMessage(error));
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(refresh, 1000);
      }
    }
    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [requested]);

  async function submit(payload: object) {
    if (mutation.current) return;
    mutation.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api<AiConsoleView>(route, payload);
      setRequested(result.selected);
      setView(result);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  }

  function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    void submit({
      action: "start",
      code,
      provider,
      model,
      count: Number(fields.get("count")),
      parallel: Number(fields.get("parallel")),
      interval: Number(fields.get("interval")),
      timeout: Number(fields.get("timeout")),
      maxOutputTokens: Number(fields.get("maxOutputTokens")),
    });
  }

  function switchProvider(value: AiProvider) {
    setProvider(value);
    setModel(value === "local" ? localModel : "");
  }

  return (
    <div className={styles.stack}>
      <div className={styles.overview}>
        <section className={styles.panel} aria-labelledby="ai-setup-title">
          <h2 id="ai-setup-title">参加設定</h2>
          <form
            onSubmit={start}
            className={styles.form}
            aria-labelledby="ai-setup-title"
          >
            <div className="field">
              <label htmlFor="ai-room">ルーム</label>
              <select
                id="ai-room"
                name="code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
              >
                <option value="">
                  {roomList === null
                    ? "読み込み中…"
                    : roomList.length
                      ? "入室受付中のルームを選ぶ"
                      : "入室受付中のルームなし"}
                </option>
                {roomList?.map((room) => (
                  <option value={room.code} key={room.code}>
                    {room.code} · {roomLabel(room)}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.fields}>
              <label className="field">
                <span>接続先</span>
                <select
                  value={provider}
                  onChange={(e) => switchProvider(e.target.value as AiProvider)}
                >
                  <option value="local">ローカル</option>
                  <option value="openai" disabled={!openaiAvailable}>
                    OpenAI
                  </option>
                </select>
              </label>
              <label className="field">
                <span>AI 人数</span>
                <input
                  type="number"
                  name="count"
                  required
                  min="1"
                  max="999"
                  defaultValue="40"
                />
              </label>
            </div>
            <label className="field">
              <span>モデル名</span>
              <input
                name="model"
                required
                maxLength={200}
                value={model}
                onChange={(e) => setModel(e.target.value)}
                autoComplete="off"
              />
            </label>
            <details className={styles.advanced}>
              <summary>詳細設定</summary>
              <div className={styles.fields}>
                <label className="field">
                  <span>同時リクエスト</span>
                  <input
                    type="number"
                    name="parallel"
                    min="1"
                    max="999"
                    required
                    defaultValue="8"
                  />
                </label>
                <label className="field">
                  <span>決定間隔（秒）</span>
                  <input
                    type="number"
                    name="interval"
                    min="1"
                    max="3600"
                    required
                    defaultValue="10"
                  />
                </label>
                <label className="field">
                  <span>応答期限（秒）</span>
                  <input
                    type="number"
                    name="timeout"
                    min="1"
                    max="300"
                    required
                    defaultValue="60"
                  />
                </label>
                <label className="field">
                  <span>出力トークン上限</span>
                  <input
                    type="number"
                    name="maxOutputTokens"
                    min="1"
                    max="32768"
                    required
                    defaultValue="2048"
                  />
                </label>
              </div>
            </details>
            <div className={styles.actions}>
              <button
                type="submit"
                className="button primary"
                disabled={busy || roomBusy || !code || !model.trim()}
              >
                AI を入室させる
              </button>
              {roomList?.length === 0 && (
                <Link href="/teacher" className="button secondary">
                  ルームを作る
                </Link>
              )}
            </div>
            {error && (
              <p role="alert" className={styles.errorText}>
                {error}
              </p>
            )}
          </form>
        </section>

        <section className={styles.panel} aria-labelledby="ai-run-title">
          <div className={styles.heading}>
            <h2 id="ai-run-title">実行状況</h2>
            {choice && (
              <span
                role="status"
                className={styles.status}
                data-phase={choice.phase}
              >
                {phases[choice.phase]}
              </span>
            )}
          </div>
          <div className="field">
            <label htmlFor="ai-history">実行履歴</label>
            <select
              id="ai-history"
              value={requested ?? view.selected ?? ""}
              onChange={(e) => setRequested(e.target.value)}
              disabled={!view.runs.length || busy}
            >
              {!view.runs.length && <option value="">実行履歴なし</option>}
              {view.runs.map((run) => (
                <option value={run.id} key={run.id}>
                  {run.code} · {aiExperiments[run.experiment]} ·{" "}
                  {timeLabel(Date.parse(run.startedAt))}
                </option>
              ))}
            </select>
          </div>
          {choice ? (
            <>
              <div className={styles.runModel}>{choice.model}</div>
              <div className={styles.progressRow}>
                <label htmlFor="ai-admission-progress">入室</label>
                <strong>
                  {choice.joined} / {choice.count} 人
                </strong>
              </div>
              <progress
                id="ai-admission-progress"
                className={styles.progress}
                value={choice.joined}
                max={choice.count}
              />
              <dl className={styles.metrics}>
                <div>
                  <dt>モデル応答</dt>
                  <dd>{choice.decisions}</dd>
                </div>
                <div>
                  <dt>受理された操作</dt>
                  <dd>{choice.submitted}</dd>
                </div>
              </dl>
              {choice.error && (
                <p role="alert" className={styles.errorText}>
                  {choice.error}
                </p>
              )}
              <div className={styles.actions}>
                <Link
                  href={teacherRoomHref(choice.code)}
                  className="button secondary"
                >
                  ルームを開く
                </Link>
                {aiRunActive(choice.phase) && (
                  <button
                    type="button"
                    className="button danger"
                    disabled={busy || choice.phase === "stopping"}
                    onClick={() =>
                      void submit({ action: "stop", id: choice.id })
                    }
                  >
                    AI を停止
                  </button>
                )}
              </div>
            </>
          ) : (
            <p className={styles.empty}>
              AI を入室させると進捗が表示されます。
            </p>
          )}
          {liveError && (
            <p role="status" className={styles.errorText}>
              {liveError}
            </p>
          )}
        </section>
      </div>
      <section className={styles.panel} aria-labelledby="ai-records-title">
        <div className={styles.heading}>
          <h2 id="ai-records-title">決定記録</h2>
          {choice && (
            <a
              href={`${route}?export=${choice.id}`}
              className="button secondary small-button"
              download
            >
              CSV を保存
            </a>
          )}
        </div>
        <Records key={view.selected} records={view.records} />
      </section>
    </div>
  );
}
