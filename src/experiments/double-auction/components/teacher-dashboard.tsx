"use client";

import Image from "next/image";
import { useState } from "react";
import {
  BarChart3,
  Check,
  Copy,
  Download,
  Info,
  Pause,
  Play,
  Square,
  UsersRound,
} from "lucide-react";
import { GOODS } from "@/experiments/double-auction/lib/catalog";
import type { Command, RoomView } from "@/experiments/double-auction/lib/types";
import { decimal } from "@/lib/client";
import { equilibriumQuantity } from "@/experiments/double-auction/lib/equilibrium";
import { PriceChart } from "./price-chart";
import { ConfirmDialog } from "../../../components/confirm-dialog";
import { EndExperimentButton } from "@/components/end-experiment-button";
import { ExportDownloads } from "./export-downloads";
import { MarketSettingsPanel } from "./market-settings";

export function TeacherDashboard({
  view,
  command,
  disabled,
}: {
  view: RoomView;
  command: (command: Command) => Promise<boolean>;
  disabled: boolean;
}) {
  const teacher = view.teacher!;
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<"end-round" | "finish" | null>(null);
  const [copyError, setCopyError] = useState("");
  const [editingMarkets, setEditingMarkets] = useState(false);
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(
        `${location.origin}/?code=${view.code}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopyError(`参加コード ${view.code} を学生に共有してください。`);
    }
  }
  return (
    <>
      <section className="panel teacher-controls">
        <div className="room-invite">
          <span className="invite-label">学生用ルームコード</span>
          <strong>{view.code}</strong>
          <button className="button secondary small-button" onClick={copyLink}>
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? "コピーしました" : "参加リンク"}
          </button>
        </div>
        <div className="teacher-actions">
          <span className="participant-count">
            <UsersRound size={17} />
            <b>{view.participantCount}</b> / {view.config.capacity}人
          </span>
          {(view.phase === "waiting" || view.phase === "review") && (
            <button
              className="button success"
              disabled={
                disabled ||
                view.participantCount !== view.config.capacity ||
                (view.phase === "waiting" && editingMarkets)
              }
              onClick={() => void command({ type: "start" })}
            >
              <Play size={16} />
              {view.phase === "waiting"
                ? "実験を開始"
                : `ラウンド${view.round + 1}を開始`}
            </button>
          )}
          {view.phase === "running" && (
            <button
              className="button secondary"
              disabled={disabled}
              onClick={() => void command({ type: "pause" })}
            >
              <Pause size={16} />
              一時停止
            </button>
          )}
          {view.phase === "paused" && (
            <button
              className="button primary"
              disabled={disabled}
              onClick={() => void command({ type: "resume" })}
            >
              <Play size={16} />
              再開する
            </button>
          )}
          {["running", "paused"].includes(view.phase) && (
            <button
              className="button secondary"
              disabled={disabled}
              onClick={() => setConfirm("end-round")}
            >
              <Square size={14} />
              ラウンド終了
            </button>
          )}
          {view.phase !== "finished" && (
            <EndExperimentButton
              disabled={disabled}
              onClick={() => setConfirm("finish")}
            />
          )}
        </div>
      </section>
      {copyError && <p className="callout">{copyError}</p>}
      {view.phase === "waiting" && (
        <div className="callout">
          <Info size={17} />
          <p>
            参加者が{view.config.capacity}
            人そろうと開始できます。開始前に下の「価値・費用の設定」を確認してください。編集中は保存またはキャンセルしてから開始できます。
          </p>
        </div>
      )}
      <MarketSettingsPanel
        view={view}
        command={command}
        disabled={disabled}
        editing={editingMarkets}
        onEditingChange={setEditingMarkets}
      />
      <div className="section-heading">
        <div>
          <h2>
            <BarChart3 size={19} />
            市場ごとの価格推移
          </h2>
          <p>各点は1件の取引。帯は理論上の均衡価格区間です。</p>
        </div>
        <span className="private-tag">教員のみ表示</span>
      </div>
      <div className="teacher-markets">
        {GOODS.map((good) => {
          const eq = teacher.equilibria[good.id];
          const metrics = teacher.metrics[good.id];
          const current = metrics.at(-1);
          const trades = view.trades.filter((t) => t.good === good.id);
          return (
            <article className="panel teacher-market" key={good.id}>
              <div className="teacher-product-heading">
                <Image
                  src={good.image}
                  alt={good.name}
                  width={62}
                  height={62}
                />
                <div>
                  <h3>{good.name}</h3>
                  <p>
                    均衡価格{" "}
                    <b>
                      {eq.low}〜{eq.high}
                    </b>
                    <span> 円</span>
                  </p>
                </div>
              </div>
              <PriceChart
                trades={trades}
                equilibrium={eq}
                rounds={view.config.rounds}
                compact
              />
              <div className="chart-axis-caption">ラウンド</div>
              <div className="market-metrics">
                <div>
                  <span>取引数量 / 均衡数量</span>
                  <b>
                    {current?.quantity ?? 0}
                    <small> / {equilibriumQuantity(eq)}</small>
                  </b>
                </div>
                <div>
                  <span>平均価格（円）</span>
                  <b>{decimal(current?.mean)}</b>
                </div>
                <div>
                  <span>均衡区間からの距離（円）</span>
                  <b>{decimal(current?.deviation)}</b>
                </div>
                <div>
                  <span>取引効率</span>
                  <b>
                    {decimal(
                      current ? current.efficiency : eq.surplus ? 0 : null,
                    )}
                    {eq.surplus > 0 && <small> %</small>}
                  </b>
                </div>
              </div>
              <div className="metric-caption">
                ラウンド {view.round || "—"} の実績
              </div>
            </article>
          );
        })}
      </div>
      <details className="panel details-panel">
        <summary>
          指標の読み方とラウンド別集計<span>＋</span>
        </summary>
        <div className="details-content">
          <p className="muted small">
            「距離」は各取引価格から均衡区間までの距離の平均です。区間内なら0です。「取引効率」は実現した買い手・売り手の合計利益を、理論上の最大利益で割った割合です。取引のないラウンドの価格・距離と、最大利益が0の場合の効率は「—」で表示します。価値と費用が等しい限界の取引がある場合、均衡数量は範囲で表示します。
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>商品</th>
                  <th>ラウンド</th>
                  <th>取引数量</th>
                  <th>平均価格（円）</th>
                  <th>均衡からの距離（円）</th>
                  <th>効率</th>
                </tr>
              </thead>
              <tbody>
                {GOODS.flatMap((g) =>
                  teacher.metrics[g.id].map((m) => (
                    <tr key={`${g.id}-${m.round}`}>
                      <td>{g.name}</td>
                      <td>{m.round}</td>
                      <td>{m.quantity}</td>
                      <td>{decimal(m.mean)}</td>
                      <td>{decimal(m.deviation)}</td>
                      <td>
                        {decimal(m.efficiency)}
                        {m.efficiency === null ? "" : "%"}
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </div>
      </details>
      <section className="panel">
        <div className="panel-heading">
          <h2>
            <UsersRound size={18} />
            参加者と割り当て
          </h2>
          <span className="muted small">
            買い手{" "}
            {teacher.participants.filter((p) => p.role === "buyer").length}
            人・売り手{" "}
            {teacher.participants.filter((p) => p.role === "seller").length}人
          </span>
        </div>
        <div className="table-scroll">
          <table className="participants-table">
            <thead>
              <tr>
                <th>参加者</th>
                <th>役割</th>
                {GOODS.map((g) => (
                  <th key={g.id}>
                    {g.name}
                    <small>価値 / 費用（円）</small>
                  </th>
                ))}
                <th>累積利益（円）</th>
              </tr>
            </thead>
            <tbody>
              {teacher.participants
                .slice()
                .sort((a, b) => a.alias.localeCompare(b.alias))
                .map((p) => (
                  <tr key={p.id}>
                    <td>
                      <b>{p.nickname}</b>
                      <small>{p.alias}</small>
                    </td>
                    <td>
                      <span className={`role-tag ${p.role}`}>
                        {p.role === "buyer" ? "買い手" : "売り手"}
                      </span>
                    </td>
                    {GOODS.map((g) => (
                      <td key={g.id}>{p.limits[g.id]}</td>
                    ))}
                    <td className="profit">{p.profit}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          {!teacher.participants.length && (
            <div className="empty-state">
              <UsersRound size={27} />
              <p>参加者の入室を待っています</p>
              <small>
                上の参加リンクまたはルームコードを共有してください。
              </small>
            </div>
          )}
        </div>
      </section>
      <div className="teacher-bottom-grid">
        <section className="panel export-panel">
          <div className="panel-heading">
            <h2>
              <Download size={18} />
              実験データを保存
            </h2>
          </div>
          <p>授業の振り返りや、ラウンド間の比較に使えます。</p>
          <ExportDownloads code={view.code} />
        </section>
        <section className="panel experiment-summary">
          <div className="panel-heading">
            <h2>実験条件</h2>
          </div>
          <dl>
            <div>
              <dt>ラウンド</dt>
              <dd>
                {view.config.rounds}回 × {view.config.duration / 60}分
              </dd>
            </div>
            <div>
              <dt>取引可能数</dt>
              <dd>各商品・各ラウンド1単位</dd>
            </div>
            <div>
              <dt>役割・価値・費用</dt>
              <dd>全ラウンド固定</dd>
            </div>
            <div>
              <dt>損失の出る注文</dt>
              <dd>不可</dd>
            </div>
          </dl>
        </section>
      </div>
      <details className="panel details-panel">
        <summary>
          需要・供給の設定を確認<span>＋</span>
        </summary>
        <div className="details-content">
          <p className="muted small">
            均衡はこれらの値から計算した比較基準です。注文や取引価格を均衡に誘導する処理はありません。
          </p>
          {GOODS.map((g) => (
            <div className="schedule-row" key={g.id}>
              <b>{g.name}</b>
              <p>
                買い手の価値（円）：{teacher.schedules[g.id].values.join("、")}
              </p>
              <p>
                売り手の費用（円）：{teacher.schedules[g.id].costs.join("、")}
              </p>
            </div>
          ))}
        </div>
      </details>
      {confirm && (
        <ConfirmDialog
          danger={confirm === "finish"}
          title={
            confirm === "finish"
              ? "実験を終了しますか？"
              : "このラウンドを終了しますか？"
          }
          message={
            confirm === "finish"
              ? "進行中の注文を取り消し、すべての取引を終了します。結果の確認とデータの保存は引き続きできます。"
              : "残っている注文が取り消されます。次のラウンドは、教員が開始するまで始まりません。"
          }
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            await command({ type: confirm });
            setConfirm(null);
          }}
        />
      )}
    </>
  );
}
