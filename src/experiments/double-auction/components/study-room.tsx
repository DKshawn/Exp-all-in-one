"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowBigLeft,
  Clock3,
  LockKeyhole,
  UsersRound,
  Wifi,
  WifiOff,
  Copy,
} from "lucide-react";
import { Header } from "../../../components/shell";
import { StudyDetailDialog } from "./study-detail-dialog";
import { StudyViewport } from "./study-viewport";
import { ExportDownloads } from "./export-downloads";
import { StudyMarketOverview } from "./study-market-overview";
import { StudyMarketHistory } from "./study-market-history";
import { StudyOrderBook } from "./study-order-book";
import { StudyRoster, StudyWaitingRoom } from "./study-lobby";
import { StudySetup } from "./study-setup";
import {
  StudyPersonalHistory,
  StudyTradeFeedback,
} from "./study-personal-trades";
import { PriceChart } from "./price-chart";
import { ConfirmDialog } from "../../../components/confirm-dialog";
import { EndExperimentButton } from "@/components/end-experiment-button";
import { StudySettingsEditor } from "./study-settings";
import { StudyTimingEditor } from "./study-timing-settings";
import { StudyProgramEditor } from "./study-program-settings";
import {
  studyCommission,
  studyUnitProfit,
} from "@/experiments/double-auction/lib/study-commission";
import {
  isCurrentStudyPeriod,
  studyTiming,
  studyCountdownLabel,
  studyRemainingMs,
  studyPeriodTransition,
} from "@/experiments/double-auction/lib/study-timing";
import { decimal, timeLabel } from "@/lib/client";
import { blockInteraction } from "@/experiments/double-auction/lib/action-tracker";
import {
  isValidPrice,
  MAX_PRICE,
} from "@/experiments/double-auction/lib/price";
import { INSTITUTIONS } from "@/experiments/double-auction/lib/study-rules";
import {
  studyInstitutions,
  studyMarketSize,
  studyUnits,
  studySingleUnitOrders,
  studyCallsPerPeriod,
  studyPeriodAt,
  studyPeriodCount,
  studyPeriodRanges,
} from "@/experiments/double-auction/lib/study-config";
import type {
  Institution,
  StudyMarketView,
  StudyStage,
} from "@/experiments/double-auction/lib/study-types";
import type { Command, RoomView } from "@/experiments/double-auction/lib/types";
import { teacherSetupHref } from "@/lib/room-navigation";
import { DEMO_TEACHER_HREFS } from "@/lib/demo-navigation";
import type { ExportProvider } from "@/experiments/double-auction/lib/exports";

type Props = {
  view: RoomView;
  now: number;
  command: (command: Command) => Promise<boolean>;
  disabled: boolean;
  connected: boolean;
  error: string;
  notice: string;
  retry: () => void;
  demo?: boolean;
  toolbar?: ReactNode;
  onConfigure?: () => void;
  loadExport?: ExportProvider;
};
type MarketProps = {
  view: RoomView;
  market: StudyMarketView;
  command: Props["command"];
  disabled: boolean;
};
const stages: Record<StudyStage, string> = {
  waiting: "開始待ち",
  countdown: "開始カウントダウン",
  cda: "連続取引",
  call: "注文受付・清算待ち",
  offer: "売り手の価格提示",
  purchase: "買い手の取引",
  feedback: "取引結果の確認",
  done: "実験終了",
};
const money = (n: number | null | undefined) => `${decimal(n)} 円`;

export function StudyRoom({
  view,
  now,
  command,
  disabled,
  connected,
  error,
  notice,
  retry,
  demo = false,
  toolbar,
  onConfigure,
  loadExport,
}: Props) {
  const study = view.study!,
    teacher = study.teacher;
  const [selected, setSelected] = useState(1);
  const [dashboardAllMarkets, setDashboardAllMarkets] = useState(false);
  const [marketActivityOpen, setMarketActivityOpen] = useState(false);
  function openMarketActivity(id: number) {
    setSelected(id);
    setMarketActivityOpen(true);
  }
  const [teacherPriceScope, setTeacherPriceScope] = useState<
    Institution | "all"
  >("all");
  const sourceMarket =
    teacher?.markets.find((m) => m.id === selected) ?? study.market;
  const institutionRange = studyPeriodAt(
    view.config,
    sourceMarket.order,
    sourceMarket.round,
  );
  const institutionStart = institutionRange.first;
  const institutionEnd = institutionRange.last;
  const {
    trades: sourceTrades,
    orderHistory: sourceOrders,
    offerHistory: sourceOffers,
    clearings: sourceClearings,
    institution: sourceInstitution,
  } = sourceMarket;
  // Stable history props isolate the table from the 250ms clock and live book
  // updates. Student scope remains the current market and institution.
  const history = useMemo(
    () => ({
      trades: sourceTrades.filter(
        (trade) => trade.institution === sourceInstitution,
      ),
      orderHistory: sourceOrders.filter(
        (order) =>
          order.round >= institutionStart && order.round <= institutionEnd,
      ),
      offerHistory: (sourceOffers ?? []).filter(
        (offer) =>
          offer.round >= institutionStart && offer.round <= institutionEnd,
      ),
      clearings: sourceClearings.filter(
        (clearing) =>
          clearing.round >= institutionStart &&
          clearing.round <= institutionEnd,
      ),
    }),
    [
      sourceTrades,
      sourceOrders,
      sourceOffers,
      sourceClearings,
      sourceInstitution,
      institutionStart,
      institutionEnd,
    ],
  );
  const market = teacher ? sourceMarket : { ...sourceMarket, ...history };
  const priceScope = teacher ? teacherPriceScope : market.institution;
  const priceTrades =
    priceScope === "all"
      ? market.trades
      : market.trades.filter((trade) => trade.institution === priceScope);
  const priceStart =
    priceScope === "all"
      ? 1
      : studyPeriodRanges(view.config, market.order).find(
          (range) => range.institution === priceScope,
        )!.first;
  const pricePeriods =
    priceScope === "all"
      ? view.config.rounds
      : studyPeriodCount(view.config, priceScope);
  const priceScopeLabel =
    priceScope === "all"
      ? `全${view.config.rounds}期`
      : INSTITUTIONS[priceScope].short;
  const cdaLayout = !teacher && market.institution === "cda";
  const callLayout = !teacher && market.institution === "call";
  const postedLayout = !teacher && market.institution === "posted";
  const remaining = studyRemainingMs(view.phase, market, now);
  const seconds = Math.ceil(remaining / 1000);
  const transition = studyPeriodTransition(
    view.config,
    view.phase,
    market,
    now,
  );
  const stageLabel =
    view.phase === "finished" || market.stage === "done"
      ? "実験終了"
      : view.phase === "paused"
        ? "一時停止中"
        : market.stage === "purchase" && market.posted
          ? "全買い手の取引時間"
          : stages[market.stage];
  const blocked =
    disabled ||
    view.phase !== "running" ||
    remaining <= 0 ||
    ["done", "waiting", "countdown", "feedback"].includes(market.stage);
  const settingsLocked = view.phase !== "waiting" || view.round > 0;
  const preparing = Boolean(
    teacher && study.lobby?.admission && !settingsLocked,
  );
  const roomStatus = !demo ? (
    <>
      <span className={`connection ${connected ? "" : "disconnected"}`}>
        {connected ? <Wifi size={14} /> : <WifiOff size={14} />}{" "}
        {connected ? "接続中" : "再接続中"}
      </span>
      {!teacher && (
        <span className="header-room-code">
          ルーム <b>{view.code}</b>
        </span>
      )}
      <span className={`role-tag ${teacher ? "teacher" : view.me.role}`}>
        {teacher ? "教員" : view.me.role === "buyer" ? "買い手" : "売り手"}
      </span>
    </>
  ) : null;
  const priceScopeControl = teacher ? (
    <label className="field study-price-scope">
      表示範囲
      <select
        aria-label="価格履歴の表示範囲"
        value={teacherPriceScope}
        onChange={(event) =>
          setTeacherPriceScope(event.target.value as Institution | "all")
        }
      >
        <option value="all">全{view.config.rounds}期</option>
        {market.order.map((institution) => (
          <option key={institution} value={institution}>
            {INSTITUTIONS[institution].short}・制度内1〜
            {studyPeriodCount(view.config, institution)}期
          </option>
        ))}
      </select>
    </label>
  ) : null;
  const priceChart = (
    <PriceChart
      trades={priceTrades.map((trade) => ({
        ...trade,
        good: "apple",
        round: trade.round - priceStart + 1,
      }))}
      rounds={pricePeriods}
      ariaLabel={`${teacher ? `市場${market.id}・` : ""}${priceScopeLabel}の取引価格（円）を${priceScope === "all" ? `全体の第1〜${view.config.rounds}期` : `制度内の第1〜${pricePeriods}期`}で表示したグラフ${teacher ? "。色付きの帯は理論上の均衡価格区間です。" : ""}`}
      periodAxis
      fill
      equilibrium={
        teacher?.marketEquilibria?.[market.id]?.[market.institution] ??
        teacher?.equilibrium
      }
    />
  );
  const teacherNavigation = teacher ? (
    <>
      {!study.lobby?.admission && (
        <StudyDetailDialog
          label="実験設定を変更"
          title="実験設定"
          triggerClassName="button secondary"
          disabled={disabled || settingsLocked}
        >
          <StudyProgramEditor
            view={view}
            command={command}
            disabled={disabled}
          />
          <StudyTimingEditor
            view={view}
            command={command}
            disabled={disabled}
          />
          <StudySettingsEditor
            view={view}
            command={command}
            disabled={disabled}
          />
          <TeacherParticipants view={view} market={market} />
        </StudyDetailDialog>
      )}
      <StudyDetailDialog
        label="Dashboard"
        title="Dashboard"
        triggerClassName="button secondary"
      >
        <section className="panel study-section">
          <h2>データをダウンロード（CSV・JSON）</h2>
          <p>
            ルーム {view.code} の全市場・全{view.config.rounds}
            期が対象です。CSVはExcelで開けます。
          </p>
          <ExportDownloads code={view.code} loadExport={loadExport} />
        </section>
        <label className="field study-dashboard-market">
          表示する市場
          <select
            value={dashboardAllMarkets ? "all" : market.id}
            onChange={(event) => {
              const all = event.target.value === "all";
              setDashboardAllMarkets(all);
              if (!all) setSelected(Number(event.target.value));
            }}
          >
            <option value="all">すべての市場</option>
            {[...teacher.markets]
              .sort((a, b) => a.id - b.id)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  市場{item.id}
                </option>
              ))}
          </select>
        </label>
        {dashboardAllMarkets ? (
          <StudyAllMarketResults view={view} />
        ) : (
          <>
            <section className="panel study-section study-price-panel study-dashboard-price">
              <h2>
                市場{market.id}・{priceScopeLabel}の取引価格
              </h2>
              {priceScopeControl}
              {priceChart}
            </section>
            <TeacherMetrics view={view} market={market} />
          </>
        )}
      </StudyDetailDialog>
    </>
  ) : null;
  if (
    !teacher &&
    study.lobby &&
    (view.phase === "waiting" || view.me.withdrawnAt)
  )
    return (
      <StudyWaitingRoom
        view={view}
        connected={connected}
        retry={retry}
        toolbar={toolbar}
        demo={demo}
        error={error}
      />
    );
  const reviewingConditions =
    !teacher && (market.stage === "countdown" || transition?.kind === "Start");
  const countdown =
    !teacher && (market.stage === "countdown" || transition) ? (
      <div className="panel study-countdown-card">
        <span className="eyebrow">
          市場{market.id} · {view.me.role === "buyer" ? "買い手" : "売り手"}
        </span>
        <h2>
          {transition
            ? `第${transition.period}期 ${transition.kind}`
            : view.phase === "paused"
              ? "開始前に一時停止しています"
              : "まもなく実験が始まります"}
        </h2>
        <strong>{(transition?.seconds ?? seconds) || "開始中"}</strong>
        <p>
          {view.phase === "paused"
            ? "教員が再開するまでお待ちください。"
            : transition?.kind === "End"
              ? "今期の取引は終了しました。"
              : "あなたの条件を確認してください。カウントダウン後に注文できます。"}
        </p>
      </div>
    ) : null;
  const screen = (
    <div
      className={`study-shell ${demo ? "study-demo" : ""} ${teacher && study.lobby && view.phase === "waiting" ? "study-lobby-shell" : ""}`}
    >
      {(teacher || demo) && (
        <Header
          demoLabel={demo ? "DEMOモード" : undefined}
          demoExitHref={DEMO_TEACHER_HREFS.institutions}
          homeHref={demo ? "/demo" : teacherSetupHref(view.code)}
          onHome={onConfigure}
        >
          {teacher && (
            <Link
              className="button secondary small-button"
              href={demo ? "/demo" : teacherSetupHref(view.code)}
              onNavigate={
                onConfigure
                  ? (event) => {
                      event.preventDefault();
                      onConfigure();
                    }
                  : undefined
              }
            >
              教員の管理・設定へ
            </Link>
          )}
          {roomStatus}
        </Header>
      )}
      <main className="room-main study-main">
        {toolbar}
        <div
          className={`room-heading study-room-context ${teacher ? "" : "study-student-context"}`}
        >
          {teacher && (
            <div className="study-room-title">
              <h1>{view.config.title}</h1>
            </div>
          )}
          {!(teacher && study.lobby && view.phase === "waiting") && (
            <section className="study-institution">
              <Image
                src="/fruits/apple.jpg"
                alt="取引する商品：りんご"
                width={44}
                height={44}
              />
              <div>
                <span className="eyebrow">
                  市場{market.id} · 制度内 第{market.institutionPeriod} /{" "}
                  {institutionRange.periods}期
                </span>
                <h2>
                  {INSTITUTIONS[market.institution].short}{" "}
                  <small>{INSTITUTIONS[market.institution].name}</small>
                </h2>
                {market.institution === "posted" && !market.posted && (
                  <p>
                    {view.config.studyPostedMechanism === "batch-bids-v1"
                      ? INSTITUTIONS.posted.description
                      : "旧ルーム：買い手が順番に購入します。"}
                  </p>
                )}
              </div>
            </section>
          )}
          {!teacher && (
            <div className="round-display">
              <div>
                <span className="phase-label">{stageLabel}</span>
                <strong>
                  第{" "}
                  <b
                    aria-current={
                      isCurrentStudyPeriod(view.phase, market)
                        ? "step"
                        : undefined
                    }
                  >
                    {market.round || "—"}
                  </b>{" "}
                  期 <small>/ {view.config.rounds}</small>
                </strong>
              </div>
              <span className="vertical-line" />
              <div className="timer">
                <span>
                  <Clock3 size={13} />
                  {studyCountdownLabel(market, view.config.rounds)}
                </span>
                <b>{`${Math.floor(seconds / 60)
                  .toString()
                  .padStart(
                    2,
                    "0",
                  )}:${(seconds % 60).toString().padStart(2, "0")}`}</b>
              </div>
            </div>
          )}
        </div>
        {view.mode === "local" && !demo && (
          <p className="local-banner">ローカル環境での実験</p>
        )}
        {!connected && (
          <div className="error-message" role="status">
            再接続しています。取引操作は一時的に停止中です。
            <button className="text-button" onClick={retry}>
              再接続
            </button>
          </div>
        )}
        <div className="feedback-area" aria-live="polite">
          {error ? (
            <p className="error-message" role="alert">
              {error}
            </p>
          ) : !teacher && notice ? (
            <p className="success-message">{notice}</p>
          ) : null}
        </div>
        {teacher && (
          <TeacherControls
            view={view}
            command={command}
            disabled={disabled}
            demo={demo}
            preparing={preparing}
          >
            {teacherNavigation}
          </TeacherControls>
        )}
        {preparing ? (
          <StudySetup
            key={view.code}
            view={view}
            now={now}
            command={command}
            disabled={disabled}
            onSelectMarket={setSelected}
            onOpenMarket={openMarketActivity}
          />
        ) : (
          teacher &&
          study.lobby && (
            <StudyRoster
              now={now}
              view={view}
              command={command}
              disabled={disabled}
              onSelectMarket={setSelected}
              onOpenMarket={openMarketActivity}
            />
          )
        )}
        {teacher && (
          <StudyDetailDialog
            label="注文・清算"
            title={`市場${market.id}・第${market.round || 1}期の注文・清算`}
            open={marketActivityOpen}
            onClose={() => setMarketActivityOpen(false)}
          >
            <MarketActivity
              view={view}
              market={market}
              command={command}
              disabled
            />
          </StudyDetailDialog>
        )}
        {!teacher &&
          !demo &&
          (view.phase !== "running" ||
            ["waiting", "done"].includes(market.stage)) && (
            <div className="phase-banner">
              <Clock3 size={19} />
              <div>
                <b>
                  {view.phase === "finished" || market.stage === "done"
                    ? "おつかれさまでした。実験は終了です"
                    : view.phase === "waiting"
                      ? "教員が実験を開始するまでお待ちください"
                      : view.phase === "paused"
                        ? "取引は一時停止中です"
                        : "この市場の参加者を待っています"}
                </b>
                <p>
                  {view.phase === "finished" || market.stage === "done"
                    ? `累積利益は ${money(view.me.profit)} です。`
                    : view.phase === "paused"
                      ? "教員が再開するまでお待ちください。残り時間は止まっています。"
                      : `この市場は ${market.participantCount} / ${studyMarketSize(view.config)}人が入室しています。教員が実験を開始し、${studyMarketSize(view.config)}人そろうと自動で始まります。`}
                </p>
              </div>
            </div>
          )}
        {!(teacher && study.lobby && view.phase === "waiting") && (
          <div
            className={`study-trading-grid ${teacher ? "teacher-layout" : ""} ${cdaLayout ? "cda-layout" : ""} ${callLayout ? "call-layout" : ""} ${postedLayout ? "posted-layout" : ""}`}
          >
            {!teacher && (
              <StudentConditions
                view={view}
                market={market}
                command={command}
                disabled={blocked}
                reviewing={reviewingConditions}
              />
            )}
            <div className="study-market-column">
              {teacher ? (
                <StudyMarketOverview
                  key={view.code}
                  teacher={teacher}
                  config={view.config}
                  phase={view.phase}
                  now={now}
                  selected={market.id}
                  onSelect={setSelected}
                  onOpen={openMarketActivity}
                  demo={demo}
                />
              ) : (
                <MarketActivity
                  view={view}
                  market={market}
                  command={command}
                  disabled={blocked}
                />
              )}
            </div>
            {!teacher && (
              <StudyMarketHistory
                key={`${market.id}-${market.institution}`}
                trades={market.trades}
                orders={market.orderHistory}
                clearings={market.clearings}
                offerHistory={market.offerHistory}
                participantId={view.me.id}
                institution={market.institution}
                firstPeriod={institutionStart}
                institutionPeriods={institutionRange.periods}
                rounds={view.config.rounds}
                standalone
              />
            )}
            {!teacher && (
              <StudyPersonalHistory
                key={`${view.code}-${view.me.id}-${market.institution}`}
                trades={study.myTrades.filter(
                  (trade) => trade.institution === market.institution,
                )}
                firstPeriod={institutionStart}
              />
            )}
            <section className="panel study-section study-price-panel">
              {!teacher && !demo && (
                <div className="study-price-status">{roomStatus}</div>
              )}
              <h2>
                {teacher
                  ? `市場${market.id}・${priceScopeLabel}の取引価格`
                  : "取引価格"}
              </h2>
              {priceScopeControl}
              {priceChart}
              <StudyDetailDialog
                key={`${market.id}-${priceScope}`}
                label={`${priceScopeLabel}の取引履歴（${priceTrades.length}件）`}
                title={`市場${market.id}・${priceScopeLabel}の取引履歴`}
              >
                <div className="study-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>
                          {priceScope === "all" ? "全体の期" : "制度内の期"}
                        </th>
                        <th>制度</th>
                        <th>時刻</th>
                        <th>価格</th>
                        <th>買い手</th>
                        <th>売り手</th>
                      </tr>
                    </thead>
                    <tbody>
                      {priceTrades.map((t) => (
                        <tr key={t.id}>
                          <td title={`全体の第${t.round}期`}>
                            {t.round - priceStart + 1}
                          </td>
                          <td>{INSTITUTIONS[t.institution].short}</td>
                          <td>{timeLabel(t.at)}</td>
                          <td>{money(t.price)}</td>
                          <td>{t.buyerAlias}</td>
                          <td>{t.sellerAlias}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </StudyDetailDialog>
              {!teacher && (
                <div className="study-personal-results">
                  <div className="study-profit">
                    <span>
                      今期の利益{" "}
                      <b className={view.me.roundProfit < 0 ? "loss" : ""}>
                        {money(view.me.roundProfit)}
                      </b>
                    </span>
                    <span>
                      累積利益{" "}
                      <b className={view.me.profit < 0 ? "loss" : ""}>
                        {money(view.me.profit)}
                      </b>
                    </span>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
        {countdown && (
          <div className="study-start-countdown" aria-hidden="true" />
        )}
      </main>
    </div>
  );
  return teacher ? (
    screen
  ) : (
    <>
      <StudyTradeFeedback
        key={`${view.code}-${view.me.id}`}
        trades={study.myTradeNotifications ?? study.myTrades}
        buyer={view.me.role === "buyer"}
        feedbackRound={market.stage === "feedback" ? market.round : null}
        feedbackPeriod={market.institutionPeriod}
        countdown={countdown}
      />
      <StudyViewport>{screen}</StudyViewport>
    </>
  );
}

function StudentConditions(props: MarketProps & { reviewing: boolean }) {
  const { reviewing } = props;
  const next = reviewing ? props.view.study!.nextConditions : undefined;
  const market = next
    ? {
        ...props.market,
        institution: next.institution,
        submitted: false,
        myOffer: null,
        myOrders: [],
      }
    : props.market;
  // A Start prompt previews the upcoming first unit without resetting any fills.
  const view =
    reviewing && market.stage === "feedback"
      ? {
          ...props.view,
          study: {
            ...props.view.study!,
            unitLimits: next?.unitLimits ?? props.view.study!.unitLimits,
            unitsUsed: 0,
          },
        }
      : props.view;
  const study = view.study!;
  const totalUnits = studyUnits(view.config, market.institution);
  const completed = study.unitsUsed >= totalUnits;
  const directBuyer =
    market.institution === "posted" &&
    view.me.role === "buyer" &&
    view.config.studyPostedMechanism === "direct-purchase-v1";
  return (
    <aside
      className={`panel study-section private-panel ${market.institution === "posted" && view.me.role === "buyer" ? "study-purchase-conditions" : ""}${reviewing ? " study-conditions-review" : ""}`}
    >
      {reviewing && (
        <span className="study-conditions-arrow" aria-hidden="true">
          <ArrowBigLeft size={80} fill="currentColor" strokeWidth={1.5} />
        </span>
      )}
      <h2>
        <LockKeyhole size={16} /> {view.me.nickname}の条件
        <span className={`role-tag ${view.me.role} study-conditions-role`}>
          {view.me.role === "buyer" ? "買い手" : "売り手"}
        </span>
      </h2>
      <div className="study-private-values">
        <p className="study-commission-note">
          Commission {money(studyCommission(view.config))}／単位
        </p>
        <div className="study-values study-current-value" aria-live="polite">
          {study.unitLimits!.map((v, i) =>
            i === study.unitsUsed ? (
              <div key={i}>
                <span>
                  {i + 1}単位目 / {totalUnits}単位
                </span>
                <b>{money(v)}</b>
              </div>
            ) : null,
          )}
        </div>
      </div>
      {(!directBuyer || completed) && (
        <div
          className={`study-private-order${completed ? " study-completed-order" : ""}`}
        >
          {completed ? (
            <p
              className="success-message study-completion-message"
              role="status"
            >
              今期の全{totalUnits}単位を
              {view.me.role === "buyer" ? "購入" : "販売"}しました。
            </p>
          ) : (
            <StudentOrder
              key={`${market.round}-${market.stageKey}-${study.unitsUsed}`}
              {...props}
              view={view}
              market={market}
              disabled={props.disabled || reviewing}
            />
          )}
        </div>
      )}
    </aside>
  );
}

function MarketActivity(props: MarketProps) {
  const { market, view } = props;
  if (market.institution === "cda") return <StudyOrderBook {...props} />;
  if (market.institution === "posted") return <OfferBoard {...props} />;
  return (
    <StudyOrderBook
      view={view}
      market={market}
      title={`一括約定・第${market.call || 1}回 / ${studyCallsPerPeriod(view.config)}回`}
    />
  );
}

function TeacherParticipants({
  view,
  market,
}: {
  view: RoomView;
  market: StudyMarketView;
}) {
  return (
    <section className="panel study-section">
      <h2>市場{market.id}の参加者と条件（買い手・売り手）</h2>
      <div className="study-table-wrap">
        <table>
          <thead>
            <tr>
              <th>市場</th>
              <th>名前</th>
              <th>役割</th>
              {Array.from(
                { length: studyUnits(view.config, market.institution) },
                (_, unit) => (
                  <th key={unit}>第{unit + 1}単位</th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {view
              .study!.teacher!.participants.filter(
                (person) => person.market === market.id,
              )
              .map((person) => (
                <tr key={person.id}>
                  <td>{person.market}</td>
                  <td>{person.nickname}</td>
                  <td>{person.alias}</td>
                  {person.limits.map((value, unit) => (
                    <td key={unit}>{money(value)}</td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TeacherControls({
  view,
  command,
  disabled,
  demo,
  preparing,
  children,
}: {
  view: RoomView;
  command: Props["command"];
  disabled: boolean;
  demo: boolean;
  preparing: boolean;
  children: ReactNode;
}) {
  const [confirm, setConfirm] = useState<"finish" | "end-round" | null>(null),
    [copied, setCopied] = useState(false);
  return (
    <section className="panel study-section study-teacher-controls">
      <div className="study-section-heading">
        <div>
          <span className="eyebrow">ルームコード</span>
          <b className="study-code">{view.code}</b>
        </div>
        <span>
          <UsersRound size={16} /> {view.participantCount}
          {!view.study?.lobby?.admission && ` / ${view.config.capacity}`} 人
        </span>
      </div>
      <div className="study-actions">
        <button
          className="button secondary"
          disabled={demo}
          title={
            demo ? "ひとりデモのため、他の人を招待できません。" : undefined
          }
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(
                `${location.origin}/?code=${view.code}`,
              );
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          <Copy size={15} />
          {copied ? "コピーしました" : "参加リンクをコピー"}
        </button>
        {!preparing && ["waiting", "review"].includes(view.phase) && (
          <button
            className="button success"
            disabled={
              disabled ||
              Boolean(
                view.study?.lobby &&
                ((view.study.lobby.admission
                  ? view.study.lobby.admission.status !== "closed" ||
                    view.participantCount < 2
                  : view.participantCount !== view.config.capacity) ||
                  view.study.lobby.randomizedAt === null),
              )
            }
            onClick={() => void command({ type: "start" })}
          >
            実験を開始
          </button>
        )}
        {view.phase === "running" && (
          <button
            className="button secondary"
            disabled={disabled}
            onClick={() => void command({ type: "pause" })}
          >
            全市場を一時停止
          </button>
        )}
        {view.phase === "paused" && (
          <button
            className="button primary"
            disabled={disabled}
            onClick={() => void command({ type: "resume" })}
          >
            全市場を再開
          </button>
        )}
        {["running", "paused"].includes(view.phase) && (
          <button
            className="button secondary"
            disabled={
              disabled ||
              !view.study!.teacher!.markets.some(
                (m) =>
                  !["done", "waiting", "countdown", "feedback"].includes(
                    m.stage,
                  ),
              )
            }
            onClick={() => setConfirm("end-round")}
          >
            各市場の今期を終了
          </button>
        )}
        {children}
        {view.phase !== "finished" && (
          <EndExperimentButton
            className="study-teacher-finish"
            disabled={disabled}
            onClick={() => setConfirm("finish")}
          />
        )}
      </div>
      {confirm && (
        <ConfirmDialog
          danger={confirm === "finish"}
          title={
            confirm === "finish"
              ? "実験を終了しますか？"
              : "各市場の進行中の期を終了しますか？"
          }
          message={
            confirm === "finish"
              ? "すべての市場を終了します。受付中の注文は取り消され、未完了の期は「途中終了」として記録されます。"
              : "各市場の進行中の期を「途中終了」として記録し、次の期へ進みます。一時停止中は次の期も停止したままです。Callの未清算注文は約定しません。"
          }
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            await command({ type: confirm });
            setConfirm(null);
          }}
        />
      )}
    </section>
  );
}

function OfferBoard({ view, market, command, disabled }: MarketProps) {
  if (view.config.studyPostedMechanism === "batch-bids-v1")
    return (
      <StudyOrderBook view={view} market={market}>
        <p className="muted">
          {market.stage === "offer"
            ? "価格提示の締切後、売り注文を公開し、すべての買い手が買い注文を送信できます。"
            : "1秒ごとに高い買値・安い売値から約定します。同じ買値は抽選、同じ売値は提示順。取引価格は売り手の提示価格です。"}
        </p>
      </StudyOrderBook>
    );
  return (
    <PostedOfferCards
      view={view}
      market={market}
      command={command}
      disabled={disabled}
    />
  );
}

function PostedOfferCards({ view, market, command, disabled }: MarketProps) {
  const direct = view.config.studyPostedMechanism === "direct-purchase-v1";
  const mine =
    view.me.role === "buyer" &&
    (direct || market.activeBuyer === view.me.alias);
  const timing = studyTiming(view.config);
  const myTurn = market.stage === "purchase" && mine;
  const sortedOffers = [...market.offers].sort((a, b) => a.price - b.price);
  return (
    <section className="panel study-section study-offers study-market-workspace">
      <div className="study-offer-heading">
        <h2>売り手の提示価格</h2>
        {market.stage === "purchase" && !direct && (
          <span
            className={`study-offer-buyer-label ${myTurn ? "is-my-turn" : ""}`}
            role="status"
          >
            {myTurn
              ? `あなたの番：${timing.buyerSeconds}秒以内に購入数を選択`
              : view.me.role === "buyer"
                ? "自分の番までお待ちください。"
                : `現在は ${market.activeBuyer} の購入時間です。`}
          </span>
        )}
      </div>
      {market.stage === "offer" ? (
        <p className="study-empty">
          {timing.offerSeconds}
          秒の提示時間が終わると、全売り手の価格と在庫が公開されます。
        </p>
      ) : (
        <>
          <div className="study-offer-content">
            <div className="study-offer-list" aria-label="売り手の提示一覧">
              {sortedOffers.map((o) => (
                <div
                  className="study-offer-card"
                  key={direct ? o.participantId : o.id}
                >
                  <div className="study-offer-info">
                    <b>{money(o.price)}</b>
                  </div>
                  <div className="study-offer-actions">
                    {Array.from(
                      {
                        length: studySingleUnitOrders(view.config)
                          ? 1
                          : studyUnits(view.config, "posted"),
                      },
                      (_, i) => i + 1,
                    )
                      .filter(
                        (q) =>
                          q <=
                          Math.min(
                            o.remaining,
                            studyUnits(view.config, "posted") -
                              view.study!.unitsUsed,
                          ),
                      )
                      .map((q) => (
                        <div className="study-market-order" key={q}>
                          <button
                            className="button secondary full study-buy-button"
                            aria-label={`${money(o.price)}で${q}単位購入`}
                            data-audit-button="posted.buy"
                            data-audit-command="posted-buy"
                            disabled={disabled || !myTurn}
                            onClick={() =>
                              void command({
                                type: "posted-buy",
                                offerId: o.id,
                                quantity: q,
                              })
                            }
                          >
                            {q}単位購入
                          </button>
                          {view.me.role === "buyer" && (
                            <ExpectedProfit
                              view={view}
                              price={o.price}
                              quantity={q}
                            />
                          )}
                        </div>
                      ))}
                    {o.remaining === 0 && (
                      <div className="study-market-order">
                        <button
                          className="button secondary full study-buy-button"
                          disabled
                        >
                          売り切れ
                        </button>
                        {view.me.role === "buyer" && (
                          <small className="field-help" aria-hidden="true">
                            &nbsp;
                          </small>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {!market.offers.length && (
              <p className="study-empty">購入可能な在庫はありません。</p>
            )}
          </div>
          {market.stage !== "purchase" && (
            <div className="study-offer-status" role="status">
              <strong>
                {view.phase === "waiting"
                  ? "実験開始をお待ちください"
                  : "今期の購入時間は終了しました。"}
              </strong>
            </div>
          )}
        </>
      )}
      {view.study!.teacher && (
        <StudyMarketHistory
          key={market.id}
          trades={market.trades}
          orders={market.orderHistory}
          clearings={market.clearings}
          offerHistory={market.offerHistory}
          rounds={view.config.rounds}
          showParticipants
        />
      )}
    </section>
  );
}

function StudentOrder(props: MarketProps) {
  if (
    props.view.config.studyPostedMechanism === "batch-bids-v1" &&
    props.market.institution === "posted" &&
    props.view.me.role === "buyer"
  )
    return <PostedBidForm {...props} />;
  return <ExistingStudentOrder {...props} />;
}

function PostedBidForm({ view, market, command, disabled }: MarketProps) {
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState("");
  const mine =
    market.posted?.bids.filter((bid) => bid.participantId === view.me.id) ?? [];
  const reserved = mine.reduce((sum, bid) => sum + bid.remaining, 0);
  const sequential = studySingleUnitOrders(view.config);
  const available =
    sequential && reserved > 0
      ? 0
      : studyUnits(view.config, "posted") - view.study!.unitsUsed - reserved;
  return (
    <div className="study-order-form">
      {mine.length > 0 && (
        <p role="status">
          注文受付済み：
          {mine
            .map((bid) => `${bid.price}円 × 残${bid.remaining}単位`)
            .join("、")}
          。変更・取消はできません。
        </p>
      )}
      {available > 0 ? (
        <form
          className="study-order-form"
          data-audit-form="posted.bid"
          data-audit-command="posted-bid"
          onSubmit={async (event) => {
            event.preventDefault();
            if (disabled || market.stage !== "purchase") {
              blockInteraction(
                "BUTTON_DISABLED",
                "現在は購入希望を送信できません。",
              );
              return;
            }
            if (!isValidPrice(Number(price))) {
              blockInteraction(
                "INVALID_PRICE",
                `買値は1〜${MAX_PRICE}円の整数で入力してください。`,
              );
              setError(`買値は1〜${MAX_PRICE}円の整数で入力してください。`);
              return;
            }
            setError("");
            if (
              await command({
                type: "posted-bid",
                price: Number(price),
                quantity: sequential ? 1 : Math.min(quantity, available),
              })
            )
              setPrice("");
          }}
        >
          <label className="field">
            {view.study!.unitsUsed + 1}単位目の買いたい価格（円）
            <input
              type="number"
              min="1"
              max={MAX_PRICE}
              step="1"
              required
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              disabled={disabled || market.stage !== "purchase"}
            />
          </label>
          {!sequential && (
            <label className="field">
              今回注文する数量
              <select
                value={Math.min(quantity, available)}
                onChange={(event) => setQuantity(Number(event.target.value))}
                disabled={disabled || market.stage !== "purchase"}
              >
                {Array.from({ length: available }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1}単位
                  </option>
                ))}
              </select>
            </label>
          )}
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <div className="study-market-order">
            <button
              className="button primary full"
              disabled={disabled || market.stage !== "purchase"}
            >
              買い注文を出す
            </button>
            {isValidPrice(Number(price)) && (
              <ExpectedProfit
                view={view}
                price={Number(price)}
                quantity={sequential ? 1 : Math.min(quantity, available)}
                offset={reserved}
              />
            )}
          </div>
        </form>
      ) : (
        !reserved && (
          <p className="success-message">
            今期の{studyUnits(view.config, "posted")}単位の取引は完了しました。
          </p>
        )
      )}
    </div>
  );
}

function ExistingStudentOrder({
  view,
  market,
  command,
  disabled,
}: MarketProps) {
  const sequential = studySingleUnitOrders(view.config);
  const [price, setPrice] = useState(""),
    [additionalPrices, setAdditionalPrices] = useState<string[]>([]),
    [quantity, setQuantity] = useState(
      sequential
        ? 1
        : studyUnits(view.config, market.institution) - view.study!.unitsUsed,
    ),
    [validation, setValidation] = useState("");
  const study = view.study!,
    buyer = view.me.role === "buyer",
    remaining = studyUnits(view.config, market.institution) - study.unitsUsed;
  const priceInput = useRef<HTMLInputElement>(null);
  const focusNextUnit = useRef(
    (market.institution === "cda" || sequential) &&
      study.unitsUsed > 0 &&
      remaining > 0,
  );
  const formDisabled =
    disabled ||
    (market.institution === "posted" &&
      market.stage !== "offer" &&
      !(sequential && market.stage === "purchase" && study.unitsUsed > 0));
  useEffect(() => {
    // Every fill resets this keyed form. Focus the next available unit.
    if (focusNextUnit.current && !formDisabled && priceInput.current) {
      priceInput.current.focus({ preventScroll: true });
      focusNextUnit.current = false;
    }
  }, [formDisabled]);
  const best =
    market.institution === "cda"
      ? market.orders
          .filter((order) => order.side !== view.me.role)
          .sort(
            (a, b) =>
              (buyer ? a.price - b.price : b.price - a.price) ||
              a.sequence - b.sequence,
          )[0]
      : undefined;
  const callPrices = Array.from({ length: quantity }, (_, i) =>
    i === 0 ? price : (additionalPrices[i - 1] ?? ""),
  );
  const expected =
    quantity > 0 &&
    price &&
    !(market.institution === "call" && callPrices.some((value) => !value))
      ? study
          .unitLimits!.slice(
            study.unitsUsed,
            study.unitsUsed + (market.institution === "cda" ? 1 : quantity),
          )
          .reduce((sum, v, i) => {
            const p =
              market.institution === "call"
                ? Number(callPrices[i])
                : Number(price);
            return (
              sum +
              studyUnitProfit(
                buyer ? "buyer" : "seller",
                v,
                p,
                studyCommission(view.config),
              )
            );
          }, 0)
      : null;
  if (!remaining)
    return (
      <p className="success-message">
        今期の{studyUnits(view.config, market.institution)}
        単位の取引は完了しました。
      </p>
    );
  if (market.institution === "posted" && buyer)
    return (
      <p className="callout">
        購入順は毎期ランダムに決まります。自分の番になったら、提示一覧から購入してください。
      </p>
    );
  if (market.institution !== "cda" && market.submitted)
    return (
      <p className="success-message">
        送信済みです。
        {market.myOffer
          ? market.myOffer.quantity === 0
            ? "出品なし。"
            : `${market.myOffer.price}円・${market.myOffer.quantity}単位。`
          : market.myOrders.length
            ? market.myOrders
                .map((o) => `${o.unit}単位目：${o.price}円`)
                .join("、")
            : "今回は注文していません。"}
        {market.institution === "call"
          ? "この回の選択は変更できません。"
          : sequential
            ? "約定すると次の単位の価格を提示できます。"
            : "この提示は変更できません。"}
      </p>
    );
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setValidation("");
    if (formDisabled) {
      blockInteraction("BUTTON_DISABLED", "現在は注文できません。");
      return;
    }
    const prices =
      market.institution === "call" ? callPrices.map(Number) : [Number(price)];
    if (prices.some((p) => !isValidPrice(p))) {
      blockInteraction(
        "INVALID_PRICE",
        `注文価格は1〜${MAX_PRICE}円の整数で入力してください。`,
      );
      setValidation(`注文価格は1〜${MAX_PRICE}円の整数で入力してください。`);
      return;
    }
    const accepted = await command(
      market.institution === "cda"
        ? { type: "study-quote", price: Number(price) }
        : market.institution === "call"
          ? { type: "call-submit", prices }
          : { type: "posted-offer", price: Number(price), quantity },
    );
    if (accepted) {
      setPrice("");
      setAdditionalPrices([]);
    }
  }
  return (
    <form
      onSubmit={submit}
      data-audit-command={
        market.institution === "cda"
          ? "study-quote"
          : market.institution === "call"
            ? "call-submit"
            : "posted-offer"
      }
      data-audit-form={
        market.institution === "cda"
          ? "quote.submit"
          : `${market.institution}.submit`
      }
      noValidate
      className={`study-order-form ${market.institution === "call" && !sequential ? "study-call-form" : ""}`}
    >
      {market.institution !== "cda" && !sequential && (
        <label className="field">
          {market.institution === "call" ? "今回注文する数量" : "提示する数量"}
          <select
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            disabled={formDisabled}
          >
            {Array.from({ length: remaining }, (_, i) => (
              <option key={i} value={i + 1}>
                {i + 1}単位
              </option>
            ))}
          </select>
        </label>
      )}
      <label
        className={`field ${market.institution === "call" ? "study-call-price" : ""}`}
      >
        {market.institution === "posted" && !sequential
          ? "1単位あたりの販売価格"
          : market.institution === "call"
            ? `${study.unitsUsed + 1}単位目の${buyer ? "買値" : "売値"}`
            : `${study.unitsUsed + 1}単位目の${buyer ? "買いたい" : "売りたい"}価格`}
        <div className="study-price-input">
          <input
            ref={priceInput}
            type="number"
            min={1}
            max={MAX_PRICE}
            step={1}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
            disabled={formDisabled}
          />
          <span>円</span>
        </div>
      </label>
      {market.institution === "call" &&
        Array.from({ length: quantity - 1 }, (_, index) => (
          <label className="field study-call-price" key={index}>
            {study.unitsUsed + index + 2}単位目の{buyer ? "買値" : "売値"}
            <div className="study-price-input">
              <input
                type="number"
                min={1}
                max={MAX_PRICE}
                step={1}
                value={additionalPrices[index] ?? ""}
                onChange={(e) => {
                  const value = e.target.value;
                  setAdditionalPrices((previous) => {
                    const next = [...previous];
                    next[index] = value;
                    return next;
                  });
                }}
                required
                disabled={formDisabled}
              />
              <span>円</span>
            </div>
          </label>
        ))}
      {market.institution === "posted" && market.stage === "offer" && (
        <p className="field-help">
          締切までに確定しなければ、今期は出品しません。
        </p>
      )}
      {validation && (
        <p role="alert" className="error-message">
          {validation}
        </p>
      )}
      {market.institution === "cda" ? (
        <div className="study-cda-order-actions">
          <div className="study-market-order">
            <button
              type="submit"
              data-audit-button="quote.submit"
              data-audit-command="study-quote"
              className="button primary full"
              disabled={formDisabled}
            >
              指値注文
            </button>
            <ProfitBadge profit={expected} />
          </div>
          <div className="study-market-order">
            <button
              type="button"
              data-audit-button="quote.accept-best"
              data-audit-command="study-accept"
              className="button primary full"
              disabled={formDisabled || !best}
              onClick={() => {
                if (best)
                  void command({ type: "study-accept", orderId: best.id });
              }}
            >
              成行注文
            </button>
            {best && (
              <ExpectedProfit view={view} price={best.price} quantity={1} />
            )}
          </div>
        </div>
      ) : (
        <div className="study-market-order">
          <button className="button primary full" disabled={formDisabled}>
            {market.institution === "call"
              ? "今回の注文を確定"
              : sequential
                ? "この単位の価格を確定"
                : "価格と数量を確定"}
          </button>
          <ProfitBadge profit={expected} />
        </div>
      )}
    </form>
  );
}

function ExpectedProfit({
  view,
  price,
  quantity,
  offset = 0,
}: {
  view: RoomView;
  price: number;
  quantity: number;
  offset?: number;
}) {
  const study = view.study!;
  const firstUnit = study.unitsUsed + offset;
  if (
    !study.unitLimits ||
    firstUnit + quantity > studyUnits(view.config, study.market.institution)
  )
    return null;
  const profit = study.unitLimits
    .slice(firstUnit, firstUnit + quantity)
    .reduce(
      (sum, value) =>
        sum +
        studyUnitProfit(
          view.me.role === "buyer" ? "buyer" : "seller",
          value,
          price,
          studyCommission(view.config),
        ),
      0,
    );
  return <ProfitBadge profit={profit} />;
}

function ProfitBadge({ profit }: { profit: number | null }) {
  if (profit === null) return null;
  return (
    <small className={profit < 0 ? "loss" : "field-help"}>
      利益 {money(profit)}
    </small>
  );
}

type TeacherMetricsProps = { view: RoomView } & (
  | { market: StudyMarketView; markets?: never; institution?: Institution }
  | { market?: never; markets: StudyMarketView[]; institution: Institution }
);

function TeacherMetrics({
  view,
  market,
  markets,
  institution,
}: TeacherMetricsProps) {
  const teacher = view.study!.teacher!,
    eq =
      (market
        ? teacher.marketEquilibria?.[market.id]?.[
            institution ?? market.institution
          ]
        : undefined) ??
      teacher.equilibria?.[institution ?? market!.institution] ??
      teacher.equilibrium;
  const selectedMarkets = market ? [market] : markets;
  const marketIds = new Set(selectedMarkets.map((item) => item.id));
  const metrics = teacher.metrics
    .filter(
      (m) =>
        marketIds.has(m.market) &&
        (!institution || m.institution === institution),
    )
    .sort((a, b) => a.market - b.market || a.round - b.round);
  return (
    <section className="panel study-section">
      <h2>{market ? `市場${market.id}の` : ""}価格・数量・効率性</h2>
      {(!markets || !view.config.studyLayout) && (
        <p className="muted">
          均衡価格{" "}
          {eq.low === eq.high ? money(eq.low) : `${eq.low}〜${eq.high}円`} ／
          正余剰の数量 {eq.quantity}、ゼロ余剰を含む上限 {eq.quantityMax} ／
          最大総余剰 {money(eq.surplus)}
        </p>
      )}
      {markets && view.config.studyLayout && (
        <div className="study-table-wrap">
          <table aria-label="市場別の均衡基準">
            <thead>
              <tr>
                <th>市場</th>
                <th>均衡価格</th>
                <th>正余剰の数量</th>
                <th>最大総余剰</th>
              </tr>
            </thead>
            <tbody>
              {markets.map((m) => {
                const benchmark = teacher.marketEquilibria![m.id][institution!];
                return (
                  <tr key={m.id}>
                    <td>市場{m.id}</td>
                    <td>
                      {benchmark.low}〜{benchmark.high}円
                    </td>
                    <td>{benchmark.quantity}</td>
                    <td>{money(benchmark.surplus)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="field-help">
        個人利益はCommission込みです。総余剰・効率性・均衡の計算にはCommissionを含めません。
      </p>
      <div className="study-table-wrap">
        <table
          aria-label={
            markets
              ? `${INSTITUTIONS[institution!].short}の市場別統計`
              : undefined
          }
        >
          <thead>
            <tr>
              {markets && <th>市場</th>}
              <th>{institution ? "制度内の期" : "期"}</th>
              {!markets && <th>制度</th>}
              <th>状態</th>
              <th>数量</th>
              <th>Q/Q*</th>
              <th>平均価格</th>
              <th>価格偏離</th>
              <th>Smith α</th>
              <th>総余剰</th>
              <th>Commission支給総額</th>
              <th>効率</th>
              <th>非効率取引</th>
              <th>平均気配差</th>
            </tr>
          </thead>
          <tbody>
            {selectedMarkets.flatMap((item) => {
              const rows = metrics.filter((m) => m.market === item.id);
              if (!rows.length && markets)
                return [
                  <tr key={`${item.id}-empty`}>
                    <td>市場{item.id}</td>
                    <td colSpan={12}>まだ集計データはありません。</td>
                  </tr>,
                ];
              return rows.map((m) => (
                <tr key={`${m.market}-${m.round}`}>
                  {markets && <td>市場{m.market}</td>}
                  <td>{institution ? m.institutionPeriod : m.round}</td>
                  {!markets && <td>{INSTITUTIONS[m.institution].short}</td>}
                  <td>
                    {m.completion === "complete"
                      ? "完了"
                      : m.completion === "interrupted"
                        ? "途中終了"
                        : "進行中"}
                  </td>
                  <td>{m.quantity}</td>
                  <td>
                    {m.quantityRatio === null
                      ? "—"
                      : m.quantityRatio.toFixed(2)}
                  </td>
                  <td>{decimal(m.mean)}</td>
                  <td>{decimal(m.deviation)}</td>
                  <td>{m.alpha === null ? "—" : m.alpha.toFixed(4)}</td>
                  <td>{decimal(m.surplus)}</td>
                  <td>{decimal(m.commissionPaid)}</td>
                  <td>{decimal(m.efficiency)}%</td>
                  <td>{m.inefficientTrades}</td>
                  <td>{decimal(m.spread)}</td>
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
      <p className="field-help">
        αは均衡価格からの二乗平均平方根偏差を均衡価格で割った値です（単純な価格分散ではありません）。Callは全清算回の約定を用います。数量比の分母は正余剰の数量で、ゼロ余剰の取引により1を超える場合があります。気配差は両側に注文がある時間の加重平均です。
      </p>
      <div className="study-actions">
        {teacher.slopes
          .filter(
            (s) =>
              marketIds.has(s.market) &&
              (!institution || s.institution === institution),
          )
          .sort((a, b) => a.market - b.market)
          .map((s) => (
            <p key={`${s.market}-${s.institution}`}>
              {markets ? `市場${s.market}` : INSTITUTIONS[s.institution].short}
              のα傾き：
              <b>{s.slope === null ? "—" : s.slope.toFixed(4)}</b>（完了した
              {s.n}期）
            </p>
          ))}
      </div>
      <p className="field-help">
        途中終了・取引ゼロの期は傾き計算から除外します。傾きは各制度で設定した期数の記述統計で、有意差検定ではありません。
      </p>
    </section>
  );
}

export function StudyAllMarketResults({ view }: { view: RoomView }) {
  const teacher = view.study?.teacher;
  if (!teacher) return null;
  const markets = [...teacher.markets].sort((a, b) => a.id - b.id);
  return studyInstitutions(view.config).map((institution) => {
    const group = markets.filter((market) =>
      market.order.includes(institution),
    );
    if (!group.length) return null;
    const label = INSTITUTIONS[institution].short;
    const periods = studyPeriodCount(view.config, institution);
    return (
      <section
        className="study-dashboard-institution"
        aria-label={`${label}の市場別結果`}
        key={institution}
      >
        <h2>{label}</h2>
        <section className="panel study-section study-price-panel study-dashboard-price">
          <h3>取引価格</h3>
          <PriceChart
            series={group.map((market) => {
              const first = studyPeriodRanges(view.config, market.order).find(
                (range) => range.institution === institution,
              )!.first;
              return {
                id: String(market.id),
                label: `市場${market.id}`,
                trades: market.trades
                  .filter((trade) => trade.institution === institution)
                  .map((trade) => ({
                    ...trade,
                    good: "apple" as const,
                    round: trade.round - first + 1,
                  })),
              };
            })}
            rounds={periods}
            ariaLabel={`${label}の全市場の取引価格（円）を制度内の第1〜${periods}期で比較したグラフ。色付きの帯は理論上の均衡価格区間です。`}
            periodAxis
            fill
            equilibrium={
              view.config.studyLayout
                ? undefined
                : (teacher.equilibria?.[institution] ?? teacher.equilibrium)
            }
          />
        </section>
        <TeacherMetrics view={view} markets={group} institution={institution} />
      </section>
    );
  });
}
