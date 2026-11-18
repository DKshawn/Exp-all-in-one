"use client";

import { useState } from "react";
import { decimal } from "@/lib/client";
import { INSTITUTIONS } from "@/experiments/double-auction/lib/study-rules";
import { isCurrentStudyPeriod } from "@/experiments/double-auction/lib/study-timing";
import type { StudyView } from "@/experiments/double-auction/lib/study-types";
import type {
  RoomConfig,
  RoomView,
} from "@/experiments/double-auction/lib/types";
import {
  studyMarketCounts,
  studyPeriodAt,
  studyCallsPerPeriod,
} from "@/experiments/double-auction/lib/study-config";

export function StudyMarketOverview({
  teacher,
  config,
  phase,
  now,
  selected,
  onSelect,
  onOpen,
  demo,
}: {
  teacher: NonNullable<StudyView["teacher"]>;
  config: RoomConfig;
  phase: RoomView["phase"];
  now: number;
  selected: number;
  onSelect: (market: number) => void;
  onOpen: (market: number) => void;
  demo: boolean;
}) {
  const [chosenRound, setChosenRound] = useState<number | null>(null);
  const currentRound = Math.max(...teacher.markets.map((m) => m.round));
  const demoHuman = demo
    ? teacher.participants.find((p) => p.nickname === "あなた")
    : undefined;
  const demoBotCount = demoHuman
    ? teacher.participants.filter(
        (p) => p.market === demoHuman.market && p.id !== demoHuman.id,
      ).length
    : 0;
  // Metrics are already calculated per market and period on the server.
  // In particular, Call quantity includes all clearings in the selected period.
  const metrics = new Map(
    teacher.metrics.map((row) => [`${row.market}:${row.round}`, row]),
  );

  return (
    <section
      className="panel study-section study-market-overview"
      aria-label="全市場の結果"
    >
      <div className="study-overview-heading">
        <h2>
          全市場の結果 <small>{teacher.markets.length}市場</small>
        </h2>
        <label className="field">
          集計する期
          <select
            value={chosenRound ?? "latest"}
            disabled={currentRound === 0}
            onChange={(event) =>
              setChosenRound(
                event.target.value === "latest"
                  ? null
                  : Number(event.target.value),
              )
            }
          >
            <option value="latest">各市場の現在の期</option>
            {Array.from({ length: currentRound }, (_, index) => (
              <option key={index + 1} value={index + 1}>
                第{index + 1}期
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted">
        {chosenRound === null
          ? `各市場の現在の期を集計（Callは${studyCallsPerPeriod(config)}回分）。期の右の時間は現在の段階の残り時間です。`
          : `第${chosenRound}期の集計です。進行期・残り時間・入室・状態は現在の状況です。`}
        市場名を押すと表示を切り替え、ダブルクリックで注文・清算を開きます。
      </p>
      <div className="study-overview-table">
        <table
          aria-label={
            chosenRound === null
              ? "全市場の現在の進行状況と結果"
              : `第${chosenRound}期の全市場の結果`
          }
        >
          <thead>
            <tr>
              <th scope="col">市場</th>
              <th scope="col">{chosenRound === null ? "制度" : "集計制度"}</th>
              <th scope="col">進行期</th>
              <th scope="col">入室</th>
              <th scope="col">状態</th>
              <th scope="col">約定数量（単位）</th>
              <th scope="col">平均（円）</th>
              <th scope="col">Smith α</th>
              <th scope="col">効率（%）</th>
            </tr>
          </thead>
          <tbody>
            {teacher.markets.map((market) => {
              const round = chosenRound ?? market.round;
              const metric = metrics.get(`${market.id}:${round}`);
              const institution =
                metric?.institution ??
                studyPeriodAt(config, market.order, round).institution;
              const currentMetric = metrics.get(`${market.id}:${market.round}`);
              const state =
                market.stage === "done" || phase === "finished"
                  ? currentMetric?.completion === "complete"
                    ? "complete"
                    : "interrupted"
                  : phase === "paused"
                    ? "paused"
                    : market.stage === "waiting"
                      ? "waiting"
                      : "running";
              const status = {
                waiting: phase === "waiting" ? "開始前" : "入室待ち",
                complete: "実験終了",
                interrupted: "途中終了",
                paused: "一時停止",
                running:
                  market.stage === "countdown"
                    ? "開始まで"
                    : market.stage === "feedback"
                      ? "結果確認"
                      : market.stage === "call"
                        ? `受付 ${market.call}/${studyCallsPerPeriod(config)}`
                        : market.stage === "offer"
                          ? "価格提示"
                          : "取引中",
              }[state];
              const remaining =
                phase === "running" && market.deadline !== null
                  ? Math.max(0, market.deadline - now)
                  : market.remainingMs;
              const seconds = Math.ceil(remaining / 1000);
              const time =
                !market.round && market.stage !== "countdown"
                  ? "--:--"
                  : ["complete", "interrupted"].includes(state)
                    ? "終了"
                    : `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
              return (
                <tr
                  key={market.id}
                  onDoubleClick={() => onOpen(market.id)}
                  className={
                    market.id === selected ? "selected-row" : undefined
                  }
                >
                  <th scope="row">
                    <button
                      type="button"
                      className="text-button"
                      aria-label={`市場${market.id}の詳細を表示`}
                      aria-pressed={market.id === selected}
                      aria-haspopup="dialog"
                      title="ダブルクリックで注文・清算を表示"
                      onClick={() => onSelect(market.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onOpen(market.id);
                        }
                      }}
                    >
                      市場{market.id}
                    </button>
                  </th>
                  <td>{INSTITUTIONS[institution].short}</td>
                  <td>
                    <span className="study-market-progress">
                      <span
                        aria-current={
                          isCurrentStudyPeriod(phase, market)
                            ? "step"
                            : undefined
                        }
                      >
                        {market.round ? `第${market.round}期` : "—"}
                      </span>
                      <span
                        className="study-market-timer"
                        aria-label={`市場${market.id}・${status}・残り時間 ${time}`}
                      >
                        {time}
                      </span>
                    </span>
                  </td>
                  <td>
                    {market.participantCount}/
                    {studyMarketCounts(config, market.id).buyers +
                      studyMarketCounts(config, market.id).sellers}
                  </td>
                  <td>
                    <span className={`study-overview-status ${state}`}>
                      {status}
                    </span>
                  </td>
                  <td>{decimal(metric?.quantity)}</td>
                  <td>{decimal(metric?.mean)}</td>
                  <td>
                    {metric?.alpha == null ? "—" : metric.alpha.toFixed(4)}
                  </td>
                  <td>{decimal(metric?.efficiency)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {demo && (
        <p className="study-overview-note">
          あなたの市場はあなた1人＋仮想参加者
          {demoBotCount}
          人です。
          {config.markets! > 1 && "他市場は全員が仮想参加者です。"}
        </p>
      )}
    </section>
  );
}
