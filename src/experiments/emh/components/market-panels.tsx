"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowBigLeft, Download, LockKeyhole } from "lucide-react";
import type { Action, RoomView, Side } from "@/experiments/emh/types";
import { OrderBookPanel } from "@/components/order-book-panel";
import type { OrderBookSide } from "@/lib/order-book";
import { canSellAtMarket } from "@/experiments/emh/order-book";
import { PriceChart } from "./price-chart";

export const fmt = (n: number | null | undefined, digits = 0) =>
  n == null
    ? "—"
    : n.toLocaleString("ja-JP", { maximumFractionDigits: digits });
export const pct = (n: number | null | undefined) =>
  n == null ? "—" : `${fmt(n * 100, 1)}%`;
export function Yen({
  value,
  digits = 0,
}: {
  value: number | null | undefined;
  digits?: number;
}) {
  return value == null ? (
    "—"
  ) : (
    <>
      {fmt(value, digits)}
      <span className="yen-unit">円</span>
    </>
  );
}
export type RunAction = (action: Action) => Promise<void>;

export function OrderPanel({
  room,
  act,
  disabled = false,
}: {
  room: RoomView;
  act?: RunAction;
  disabled?: boolean;
}) {
  const orderSides = ["bid", "ask"] as const;
  const sides: OrderBookSide[] = orderSides.map((side) => ({
    side: side === "bid" ? "buyer" : "seller",
    label: side === "bid" ? "買い注文" : "売り注文",
    rows: room.orderBook?.[side] ?? [],
  }));
  const cancellable = orderSides.filter((side) => room.ownQuotes[side].quoteId);
  return (
    <OrderBookPanel
      sides={sides}
      className="cda-order-book"
      footer={
        act &&
        cancellable.length > 0 && (
          <div className="emh-book-cancellations">
            {cancellable.map((side) => (
              <button
                key={side}
                type="button"
                className="button secondary small"
                disabled={disabled}
                onClick={() =>
                  act({
                    kind: "cancel",
                    side,
                    quoteId: room.ownQuotes[side].quoteId!,
                    unitKey: room.unitKey,
                  })
                }
              >
                {side === "bid" ? "買値を取り消す" : "売値を取り消す"}
              </button>
            ))}
          </div>
        )
      }
    />
  );
}

function StudentOrderEntry({
  room,
  act,
  disabled,
}: {
  room: RoomView;
  act: RunAction;
  disabled: boolean;
}) {
  const [bidPrice, setBidPrice] = useState("");
  const [askPrice, setAskPrice] = useState("");
  const trading = room.status === "trading" && room.pausedAt === null;
  const canTrade = trading && !disabled;
  async function submit(event: FormEvent, side: Side, price: string) {
    event.preventDefault();
    if (!canTrade) return;
    await act({
      kind: "quote",
      side,
      price: Number(price),
      unitKey: room.unitKey,
    });
  }
  return (
    <div className="study-private-order student-action-columns">
      {(["bid", "ask"] as const).map((side) => {
        const buying = side === "bid";
        const oppositeSide = buying ? "ask" : "bid";
        const offer = room[oppositeSide];
        const ownOffer = !!offer && offer.participantId === room.me?.id;
        const label = buying ? "買値" : "売値";
        const actionLabel = buying ? "買い" : "売り";
        const price = buying ? bidPrice : askPrice;
        const crosses =
          !!price &&
          !!offer &&
          (buying
            ? Number(price) >= offer.price
            : Number(price) <= offer.price);
        const noHoldings = !buying && !room.me?.holdings;
        const sameLimit =
          room.ownQuotes[side].price === Number(price) &&
          room.ownQuotes[side].status === "active";
        const cannotQuote =
          !canTrade || noHoldings || sameLimit || (crosses && ownOffer);
        const reserved =
          !buying &&
          !noHoldings &&
          !canSellAtMarket(
            room.me!.holdings,
            room.ownQuotes.ask.status === "active",
          );
        return (
          <div
            key={side}
            className={`student-action-column ${buying ? "buy-side" : "sell-side"}`}
          >
            <h3 className={buying ? "buy-text" : "sell-text"}>
              {buying ? "買う" : "売る"}
            </h3>
            <form
              className="study-order-form"
              onSubmit={(event) => submit(event, side, price)}
            >
              <div className="field">
                <div className="study-price-input">
                  <input
                    id={`order-${side}-price`}
                    aria-label={`${label}（円）`}
                    inputMode="numeric"
                    type="number"
                    placeholder={`${label}を入力`}
                    min={1}
                    max={100000}
                    step={1}
                    value={price}
                    onChange={(event) =>
                      (buying ? setBidPrice : setAskPrice)(event.target.value)
                    }
                    disabled={!trading || noHoldings}
                    required
                  />
                  <span aria-hidden="true">円</span>
                </div>
              </div>
              <div className="emh-order-actions">
                <div className="study-market-order">
                  <button
                    className={`button ${buying ? "buy" : "sell"} full`}
                    disabled={cannotQuote}
                    aria-label={`${actionLabel}指値注文${crosses && !ownOffer ? "（即時成立）" : ""}`}
                  >
                    指値注文{crosses && !ownOffer ? "（即時）" : ""}
                  </button>
                </div>
                <div className="study-market-order">
                  <button
                    type="button"
                    className={`button ${buying ? "buy" : "sell"} full`}
                    aria-label={`${actionLabel}成行注文`}
                    disabled={
                      !canTrade || !offer || ownOffer || noHoldings || reserved
                    }
                    title={
                      reserved
                        ? "売り指値注文を取り消すと、この証券を成行で売れます。"
                        : undefined
                    }
                    onClick={() =>
                      act({
                        kind: "accept",
                        side: oppositeSide,
                        quoteId: offer!.id,
                        unitKey: room.unitKey,
                      })
                    }
                  >
                    成行注文
                  </button>
                </div>
              </div>
            </form>
          </div>
        );
      })}
    </div>
  );
}

export function PersonalPanel({
  room,
  act,
  disabled,
  finalScore,
}: {
  room: RoomView;
  act: RunAction;
  disabled: boolean;
  finalScore: boolean;
}) {
  const me = room.me!;
  const panelRef = useRef<HTMLElement>(null);
  const previousState = useRef({
    year: room.year,
    state: room.exp2?.state ?? null,
  });
  useEffect(() => {
    if (room.status !== "countdown") return;
    const panel = panelRef.current;
    if (!panel) return;
    const positionCard = () => {
      const card = document.querySelector(".emh-countdown-card");
      const overlay = card?.closest<HTMLElement>(".study-trade-feedback");
      if (!card || !overlay) return;
      const bounds = panel.getBoundingClientRect();
      const cardBounds = card.getBoundingClientRect();
      const center = Math.max(
        cardBounds.width / 2 + 12,
        Math.min(
          (bounds.left + bounds.right) / 2,
          window.innerWidth - cardBounds.width / 2 - 12,
        ),
      );
      overlay.style.left = `${center}px`;
      overlay.style.top = `${bounds.top - 40 - cardBounds.height / 2}px`;
    };
    const revealConditions = () => {
      const bounds = panel.getBoundingClientRect();
      const card = document.querySelector(".emh-countdown-card");
      if (!card) return;
      const cardBounds = card.getBoundingClientRect();
      const values = panel
        .querySelector(".private-dividends")
        ?.getBoundingClientRect();
      const conditionsHeight = values
        ? values.bottom - bounds.top
        : bounds.height;
      const top = Math.max(
        cardBounds.height + 52,
        Math.min(
          window.innerHeight * 0.55,
          window.innerHeight - conditionsHeight - 16,
        ),
      );
      window.scrollBy({ top: bounds.top - top, behavior: "instant" });
      positionCard();
    };
    const frame = requestAnimationFrame(revealConditions);
    window.addEventListener("resize", revealConditions);
    window.addEventListener("scroll", positionCard, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", revealConditions);
      window.removeEventListener("scroll", positionCard);
    };
  }, [room.status, room.pausedAt]);
  useEffect(() => {
    const state = room.exp2?.state ?? null;
    const previous = previousState.current;
    previousState.current = { year: room.year, state };
    if (
      state === null ||
      (previous.year === room.year && previous.state === state)
    )
      return;
    const card = panelRef.current?.querySelector(".exp2-state-realized");
    if (!card) return;
    const bounds = card.getBoundingClientRect();
    if (bounds.top < 0 || bounds.bottom > window.innerHeight) {
      card.scrollIntoView({ block: "center", behavior: "instant" });
    }
  }, [room.year, room.exp2?.state]);
  return (
    <aside
      ref={panelRef}
      className={`panel study-section private-panel emh-conditions${room.status === "countdown" ? " study-conditions-review" : ""}`}
    >
      {room.status === "countdown" && (
        <span className="study-conditions-arrow" aria-hidden="true">
          <ArrowBigLeft size={80} fill="currentColor" strokeWidth={1.5} />
        </span>
      )}
      <h2>
        <LockKeyhole size={16} aria-hidden="true" />
        {me.name}の条件
        {room.exp2 && (
          <span className="exp2-clue">
            <span>Clue カード</span>
            <strong>
              {room.exp2.clue ? `状態 ${room.exp2.clue}` : "情報なし"}
            </strong>
          </span>
        )}
        <small>非公開</small>
      </h2>
      <div className="study-private-values private-dividends">
        <div className="emh-personal-account">
          <div>
            <span>保有証券</span>
            <strong>
              {me.holdings}
              <small>単位</small>
            </strong>
          </div>
          <div>
            <span>売買収支</span>
            <strong>
              <Yen value={me.cash} />
            </strong>
          </div>
          <div className="emh-personal-score">
            <span>
              {finalScore ? "ラウンド損益（確定）" : "ラウンド損益（暫定）"}
            </span>
            <strong>
              <Yen value={me.cash + me.dividend} />
            </strong>
          </div>
        </div>
        <p className="emh-personal-score-note">
          {finalScore
            ? "このラウンドの損益は確定しました。"
            : room.exp2
              ? "ラウンド末に確定。表示は売買収支＋受取済み配当です。"
              : "B期末に確定。A期は途中経過で、B期の売買と配当も反映します。"}
          <span>
            受取済み配当 <Yen value={me.dividend} />
            {!finalScore && "・未受取の配当は損益に含みません。"}
          </span>
        </p>
        {!room.exp2 ? (
          <>
            <p>1単位あたりの配当</p>
            <div className="study-values dividend-grid">
              <div className={room.period === "A" ? "current" : ""}>
                <span>A期末</span>
                <b>
                  <Yen value={me.dividends?.a} />
                </b>
              </div>
              <div className={room.period === "B" ? "current" : ""}>
                <span>B期末</span>
                <b>
                  <Yen value={me.dividends?.b} />
                </b>
              </div>
            </div>
          </>
        ) : (
          <div className="exp2-private-values">
            <div className="exp2-state-info">
              <div
                className="exp2-state-values"
                role="group"
                aria-label="状態別の配当、確率と期待配当"
              >
                {room.exp2.prior.map((probability, index) => (
                  <div
                    key={`${room.year}:${index}`}
                    className={
                      room.exp2!.state === index + 1
                        ? "exp2-state-realized"
                        : undefined
                    }
                  >
                    <span>
                      状態 {index + 1}
                      {room.exp2!.state === index + 1 && (
                        <b className="exp2-state-realized-label">実現</b>
                      )}
                    </span>
                    <div className="exp2-state-line">
                      <span>配当</span>
                      <strong>
                        <Yen value={room.exp2!.dividends?.[index]} />
                      </strong>
                    </div>
                    <div className="exp2-state-line">
                      <span>確率</span>
                      <strong>{fmt(probability * 100, 4)}%</strong>
                    </div>
                    <div className="exp2-state-line exp2-expected-contribution">
                      <span>期待配当</span>
                      <strong>
                        <Yen
                          value={
                            room.exp2!.dividends
                              ? room.exp2!.dividends[index]! * probability
                              : null
                          }
                          digits={4}
                        />
                      </strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="sr-only" role="status" aria-live="polite">
              {room.exp2.state !== null &&
                `実現した状態は状態 ${room.exp2.state} です`}
            </div>
          </div>
        )}
      </div>
      <StudentOrderEntry
        key={`${room.code}:${me.id}:${room.year}:${room.period}`}
        room={room}
        act={act}
        disabled={disabled}
      />
    </aside>
  );
}
export function HistoryPanel({
  room,
  compact = false,
}: {
  room: RoomView;
  compact?: boolean;
}) {
  const [selection, setSelection] = useState<number | null>(null);
  const [personalOnly, setPersonalOnly] = useState(false);
  const teacher = room.role === "teacher";
  const year = selection ?? room.year;
  const allTrades = room.trades.filter((t) => t.year === year);
  const personal = allTrades.filter(
    (t) => t.buyerId === room.me?.id || t.sellerId === room.me?.id,
  );
  const trades = !teacher && personalOnly ? personal : allTrades;
  return (
    <section className="panel history-panel">
      <div className="section-heading">
        <h2>{teacher ? "取引価格（円）" : "取引記録"}</h2>
        <label className="round-select">
          <span className="sr-only">表示ラウンド</span>
          <select
            value={selection ?? "current"}
            onChange={(e) =>
              setSelection(
                e.target.value === "current" ? null : Number(e.target.value),
              )
            }
          >
            <option value="current">現在 · 第{room.year}ラウンド</option>
            {Array.from({ length: room.year }, (_, i) => (
              <option key={i} value={i + 1}>
                第{i + 1}ラウンド
              </option>
            ))}
          </select>
        </label>
      </div>
      {teacher ? (
        <PriceChart
          trades={trades}
          benchmarks={room.benchmarks}
          singlePeriod={!!room.exp2}
          compact={compact}
        />
      ) : (
        <div className="trade-history-filter" aria-label="取引記録の表示">
          <button
            className="button secondary small-button"
            aria-pressed={!personalOnly}
            onClick={() => setPersonalOnly(false)}
          >
            全体 {allTrades.length}件
          </button>
          <button
            className="button secondary small-button"
            aria-pressed={personalOnly}
            onClick={() => setPersonalOnly(true)}
          >
            自分の売買 {personal.length}件
          </button>
        </div>
      )}
      <div className="table-scroll trade-table">
        <table>
          <thead>
            <tr>
              <th>取引</th>
              {!room.exp2 && <th>期</th>}
              <th>価格（円）</th>
              {teacher ? (
                <>
                  <th>買い手</th>
                  <th>売り手</th>
                </>
              ) : (
                <>
                  <th>数量</th>
                  <th>自分の売買</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {trades.length ? (
              [...trades].reverse().map((t) => (
                <tr
                  key={t.id}
                  className={
                    room.me &&
                    (t.buyerId === room.me.id || t.sellerId === room.me.id)
                      ? "my-trade"
                      : ""
                  }
                >
                  <td>{t.sequence}</td>
                  {!room.exp2 && (
                    <td>
                      <span className={`period-chip ${t.period.toLowerCase()}`}>
                        {t.period}
                      </span>
                    </td>
                  )}
                  <td className="numeric emphasis">{fmt(t.price)}</td>
                  {teacher ? (
                    <>
                      <td>#{t.buyerSeat}</td>
                      <td>#{t.sellerSeat}</td>
                    </>
                  ) : (
                    <>
                      <td>1単位</td>
                      <td>
                        {t.buyerId === room.me?.id
                          ? "買い"
                          : t.sellerId === room.me?.id
                            ? "売り"
                            : "—"}
                      </td>
                    </>
                  )}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={room.exp2 ? 4 : 5} className="empty-cell">
                  {personalOnly
                    ? "このラウンドではまだ売買していません"
                    : "まだ取引はありません"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
export function ParticipantsPanel({ room }: { room: RoomView }) {
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>参加者</h2>
        <span className="muted">{room.participantCount}人</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>番号</th>
              <th>名前</th>
              <th>参加者番号</th>
              <th>
                {room.exp2 ? "状態 1 / 2 / 3 配当（円）" : "A / B 配当（円）"}
              </th>
              <th>保有</th>
              <th>売買収支（円）</th>
              <th>累計損益（円）</th>
            </tr>
          </thead>
          <tbody>
            {[...room.participants]
              .sort((a, b) => (a.seat ?? 99) - (b.seat ?? 99))
              .map((p) => (
                <tr key={p.id}>
                  <td>{p.seat ? `#${p.seat}` : "—"}</td>
                  <td>{p.name}</td>
                  <td className="muted">{p.studentId}</td>
                  <td>
                    {room.exp2 && p.type
                      ? room.exp2.allDividends?.[p.type - 1]?.join(" / ")
                      : p.dividends
                        ? `${p.dividends.a} / ${p.dividends.b}`
                        : "—"}
                  </td>
                  <td>{p.holdings}</td>
                  <td>{fmt(p.cash)}</td>
                  <td className="emphasis">{fmt(p.totalProfit)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
export function ResultsPanel({ room }: { room: RoomView }) {
  const teacher = room.role === "teacher";
  return (
    <section className="panel results-panel">
      <div className="section-heading">
        <h2>{teacher ? "ラウンドの結果" : "配当・損益の記録"}</h2>
        <span className="muted">
          {room.results.length ? `${room.results.length}期を精算` : "精算待ち"}
        </span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>ラウンド</th>
              <th>{room.exp2 ? "状態" : "期"}</th>
              {teacher ? (
                <>
                  <th>成立数</th>
                  <th>平均価格（円）</th>
                  <th>{room.exp2 ? "価格 / RE" : "価格 / PF"}</th>
                  <th>配当 / 最大配当</th>
                  <th>改善分の効率</th>
                </>
              ) : (
                <>
                  <th>期末保有</th>
                  <th>
                    配当<span className="table-unit">（円）</span>
                  </th>
                  <th>
                    売買収支<span className="table-unit">（円）</span>
                  </th>
                  <th>
                    損益<span className="table-unit">（円）</span>
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {room.results.length ? (
              room.results.map((r) => {
                const payout = r.payouts.find(
                  (p) => p.participantId === room.me?.id,
                );
                return (
                  <tr key={`${r.year}${r.period}`}>
                    <td>{r.year}</td>
                    <td>
                      <span className={`period-chip ${r.period.toLowerCase()}`}>
                        {room.exp2 ? r.state : r.period}
                      </span>
                    </td>
                    {teacher ? (
                      <>
                        <td>{r.volume}</td>
                        <td>{fmt(r.meanPrice, 1)}</td>
                        <td>{pct(r.priceRatio)}</td>
                        <td>{pct(r.allocationEfficiency)}</td>
                        <td>{pct(r.gainEfficiency)}</td>
                      </>
                    ) : (
                      <>
                        <td>{payout?.holdings}</td>
                        <td>{fmt(payout?.dividend)}</td>
                        <td>{fmt(payout?.cash)}</td>
                        <td className="emphasis">
                          {fmt(payout?.yearProfit)}
                          <span
                            className={`score-status ${!room.exp2 && r.period === "A" ? "provisional" : "final"}`}
                          >
                            {!room.exp2 && r.period === "A" ? "暫定" : "確定"}
                          </span>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={teacher ? 7 : 6} className="empty-cell">
                  期が終了すると結果を表示します
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {teacher ? (
        <details className="metric-help">
          <summary className="button secondary small-button disclosure-button">
            指標の計算
          </summary>
          <p>
            {room.exp2
              ? "価格 / RE：平均取引価格 ÷ RE均衡価格。"
              : "価格 / PF：その期の平均取引成立価格 ÷ 完全予見均衡価格。"}
            取引成立がない期は空欄です。
          </p>
          <p>
            配当 / 最大配当：実際の総配当 ÷
            全証券を最も配当の高いタイプが保有した場合の総配当。
          </p>
          <p>
            改善分の効率：（実際の総配当 − 初期配分の総配当）÷（最大総配当 −
            初期配分の総配当）。全員の配当が同じ場合は定義しません。
          </p>
        </details>
      ) : null}
      {room.exp2 && (teacher || room.reveal) && (
        <div className="debrief">
          <h3>実験2の条件と均衡</h3>
          <p>事前確率：{room.exp2.prior.join(" / ")}</p>
          <table>
            <thead>
              <tr>
                <th>タイプ</th>
                <th>状態1（円）</th>
                <th>状態2（円）</th>
                <th>状態3（円）</th>
              </tr>
            </thead>
            <tbody>
              {room.exp2.allDividends?.map((d, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  {d.map((v, j) => (
                    <td key={j}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <table>
            <thead>
              <tr>
                <th>ラウンド</th>
                <th>状態</th>
                <th>PI（円）</th>
                <th>RE（円）</th>
              </tr>
            </thead>
            <tbody>
              {room.results.map((r) => (
                <tr key={r.year}>
                  <td>{r.year}</td>
                  <td>{r.state}</td>
                  <td>{fmt(r.piPrice, 2)}</td>
                  <td>{fmt(r.rePrice, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {room.reveal && room.conditions && room.benchmarks && (
        <div className="debrief">
          <h3>実験の解説</h3>
          <div className="debrief-grid">
            <table>
              <thead>
                <tr>
                  <th>タイプ</th>
                  <th>A配当（円）</th>
                  <th>B配当（円）</th>
                </tr>
              </thead>
              <tbody>
                {room.conditions.map((d, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{d.a}</td>
                    <td>{d.b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div>
              <p>
                A期の私的情報均衡{" "}
                <strong>
                  <Yen value={room.benchmarks.naiveA} />
                </strong>
              </p>
              <p>
                A期の完全予見均衡{" "}
                <strong>
                  <Yen value={room.benchmarks.perfectA} />
                </strong>
              </p>
              <p>
                B期の均衡{" "}
                <strong>
                  <Yen value={room.benchmarks.perfectB} />
                </strong>
              </p>
            </div>
          </div>
          <p>
            他の人の配当について取引を通じて学べるなら、A期に買った証券をB期で売る価格も判断に反映できます。A期の完全予見均衡は「A配当の最大値
            ＋ B配当の最大値」です。
          </p>
        </div>
      )}
    </section>
  );
}
export function ExportPanel({
  room,
  demo,
}: {
  room: RoomView;
  demo?: boolean;
}) {
  if (demo) return null;
  const teacher = room.role === "teacher";
  const options = teacher
    ? [
        ["trades", "取引"],
        ["results", "期別結果"],
        ["payouts", "個人別配当"],
        ["participants", "参加者"],
        ["conditions", "実験条件"],
        ["audit", "操作記録"],
      ]
    : [["personal", "自分の記録"]];
  return (
    <div className="export-links">
      {options.map(([kind, label]) => (
        <a
          key={kind}
          href={`/api/rooms/${room.code}/emh/export?session=${room.role}&market=${room.marketId ?? 1}&kind=${kind}`}
          className="button small secondary"
        >
          <Download size={14} />
          {label}
          {kind !== "conditions" && <span className="filetype">CSV</span>}
        </a>
      ))}
    </div>
  );
}
