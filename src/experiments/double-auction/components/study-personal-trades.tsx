"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, Info, X } from "lucide-react";
import { decimal } from "@/lib/client";
import type { StudyView } from "@/experiments/double-auction/lib/study-types";

type PersonalTrade = StudyView["myTrades"][number];

export function StudyTradeFeedback({
  trades,
  buyer,
  feedbackRound = null,
  feedbackPeriod,
  countdown,
}: {
  trades: PersonalTrade[];
  buyer: boolean;
  feedbackRound?: number | null;
  feedbackPeriod?: number;
  countdown?: ReactNode;
}) {
  // The initial snapshot is history, not a new fill. Compare confirmed IDs so
  // polling, command retries and trades initiated by the counterparty behave alike.
  const [previous, setPrevious] = useState({ trades, feedbackRound });
  const [notification, setNotification] = useState<PersonalTrade[]>([]);
  if (previous.trades !== trades || previous.feedbackRound !== feedbackRound) {
    setPrevious({ trades, feedbackRound });
    const seen = new Set(previous.trades.map((trade) => trade.id));
    const added = trades.filter((trade) => !seen.has(trade.id));
    if (feedbackRound !== null) setNotification([]);
    else if (added.length) setNotification(added);
  }

  return (
    <div
      className="study-trade-feedback"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {countdown}
      {feedbackRound !== null ? (
        <PeriodNotice
          trades={trades.filter((trade) => trade.round === feedbackRound)}
          buyer={buyer}
          round={feedbackPeriod ?? feedbackRound}
        />
      ) : notification.length > 0 ? (
        <TradeNotice
          key={notification.at(-1)!.id}
          trades={notification}
          buyer={buyer}
        />
      ) : null}
    </div>
  );
}

function PeriodNotice({
  trades,
  buyer,
  round,
}: {
  trades: PersonalTrade[];
  buyer: boolean;
  round: number;
}) {
  return (
    <div className={`study-trade-notice ${trades.length ? "" : "is-unfilled"}`}>
      {trades.length ? (
        <CheckCircle2 size={22} aria-hidden="true" />
      ) : (
        <Info size={22} aria-hidden="true" />
      )}
      <div>
        <b>
          第{round}期の取引結果：
          {trades.length ? "取引が成立しました" : "未約定"}
        </b>
        {trades.length ? (
          <TradeDetails trades={trades} buyer={buyer} />
        ) : (
          <p>
            今期は取引が成立しませんでした。<span>利益 0 円</span>
          </p>
        )}
      </div>
    </div>
  );
}

function TradeNotice({
  trades,
  buyer,
}: {
  trades: PersonalTrade[];
  buyer: boolean;
}) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), 2500);
    return () => window.clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return (
    <div className="study-trade-notice">
      <CheckCircle2 size={22} aria-hidden="true" />
      <div>
        <b>取引が成立しました</b>
        <TradeDetails trades={trades} buyer={buyer} />
      </div>
      <button
        type="button"
        className="text-button"
        aria-label="取引通知を閉じる"
        data-audit-button="trade-notice.close"
        onClick={() => setVisible(false)}
      >
        <X size={18} />
      </button>
    </div>
  );
}

function TradeDetails({
  trades,
  buyer,
}: {
  trades: PersonalTrade[];
  buyer: boolean;
}) {
  const prices = [...new Set(trades.map((trade) => trade.price))];
  const profit = trades.reduce((sum, trade) => sum + trade.profit, 0);
  const commission = trades.reduce(
    (sum, trade) => sum + (trade.commission ?? 0),
    0,
  );
  return (
    <p>
      {trades.length}単位を
      {prices.map((price) => `${decimal(price)} 円`).join("・")}で
      {buyer ? "購入" : "販売"}
      <span className={profit < 0 ? "loss" : ""}>
        利益 {decimal(profit)} 円{profit < 0 ? "（損失）" : ""}
        {commission > 0 && `（Commission ${decimal(commission)} 円込み）`}
      </span>
    </p>
  );
}

export function StudyPersonalHistory({
  trades,
  firstPeriod = 1,
}: {
  trades: PersonalTrade[];
  firstPeriod?: number;
}) {
  const rows = trades.slice().reverse();
  return (
    <section
      className="panel study-section study-personal-history"
      aria-label="あなたの取引履歴"
    >
      <div className="study-history-heading">
        <h2>あなたの取引履歴（{trades.length}件）</h2>
      </div>
      <div
        className="study-personal-history-scroll"
        role="region"
        aria-label="あなたの取引履歴・スクロールで全件表示"
        tabIndex={rows.length ? 0 : undefined}
      >
        {rows.length ? (
          <table>
            <thead>
              <tr>
                <th>制度内の期</th>
                <th>単位</th>
                <th>価格（円）</th>
                <th>利益（円）</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((trade) => (
                <tr key={trade.id}>
                  <td title={`全体の第${trade.round}期`}>
                    第{trade.round - firstPeriod + 1}期
                  </td>
                  <td>{trade.unit}</td>
                  <td>{decimal(trade.price)}</td>
                  <td className={trade.profit < 0 ? "loss" : "profit"}>
                    {decimal(trade.profit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">まだ取引はありません。</p>
        )}
      </div>
    </section>
  );
}
