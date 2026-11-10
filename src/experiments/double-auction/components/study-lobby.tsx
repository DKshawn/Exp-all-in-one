"use client";

import {
  DoorOpen,
  Shuffle,
  UsersRound,
  Check,
  Wifi,
  WifiOff,
  ChevronDown,
  X,
} from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import type { Command, RoomView } from "@/experiments/double-auction/lib/types";
import {
  studyMarketCounts,
  studyInstitutions,
  studyPeriodCount,
  studyUnits,
  MAX_STUDY_MARKETS,
} from "@/experiments/double-auction/lib/study-config";
import { INSTITUTIONS } from "@/experiments/double-auction/lib/study-rules";
import { studyCommission } from "@/experiments/double-auction/lib/study-commission";
import { studyAllocationPlan } from "@/experiments/double-auction/lib/study-allocation";
import { Header } from "../../../components/shell";
import { StudentWaitingCard } from "@/components/student-waiting-card";
import { StudyAdmission } from "./study-admission";
import { ConfirmDialog } from "../../../components/confirm-dialog";
import { DEMO_TEACHER_HREFS } from "@/lib/demo-navigation";

type RosterPerson = NonNullable<
  NonNullable<RoomView["study"]>["teacher"]
>["participants"][number];
type RosterSlot = { alias: string; person?: RosterPerson };

export function StudyRoster({
  view,
  command,
  disabled,
  now,
  onSelectMarket,
  onOpenMarket,
  hideControls = false,
  setupMarketDraft,
}: {
  view: RoomView;
  command: (command: Command) => Promise<boolean>;
  disabled: boolean;
  now: number;
  onSelectMarket: (market: number) => void;
  onOpenMarket: (market: number) => void;
  hideControls?: boolean;
  setupMarketDraft?: string | null;
}) {
  const study = view.study!,
    teacher = study.teacher!,
    lobby = study.lobby!;
  const waiting = view.phase === "waiting";
  const assigned = lobby.randomizedAt !== null;
  const full = view.participantCount === view.config.capacity;
  const [withdraw, setWithdraw] = useState<{
    id: string;
    nickname: string;
  } | null>(null);
  const [localMarketDraft, setMarketDraft] = useState<string | null>(null);
  const [expandedMarkets, setExpandedMarkets] = useState<Set<number>>(
    () => new Set(),
  );
  const [rosterExpanded, setRosterExpanded] = useState(false);
  const rosterId = useId();
  const rosterVisible = waiting || rosterExpanded;
  const marketDraft = hideControls
    ? (setupMarketDraft ?? null)
    : localMarketDraft;
  const flexible = !!lobby.admission;
  const pending = flexible && !assigned;
  const draftCount = Number(marketDraft);
  const previewCount =
    Number.isInteger(draftCount) &&
    draftCount >= 1 &&
    draftCount <= MAX_STUDY_MARKETS
      ? draftCount
      : (lobby.admission?.targetMarkets ?? 1);
  const arrivals = pending
    ? teacher.participants
        .filter((person) => !person.withdrawnAt)
        .sort((a, b) => a.joinOrder - b.joinOrder)
    : [];
  const preview = studyAllocationPlan(
    arrivals.length,
    previewCount,
    marketDraft !== null ? "manual" : view.config.studyMarketMode,
    !teacher.generation || teacher.generation.seed % 2 === 0,
  );
  const markets = pending
    ? preview.layout.map((counts, index) => {
        const start = preview.layout
          .slice(0, index)
          .reduce((sum, m) => sum + m.buyers + m.sellers, 0);
        const people = arrivals.slice(
          start,
          start + counts.buyers + counts.sellers,
        );
        const buyers = counts.buyers;
        const slots = (side: RosterPerson[], role: "buyer" | "seller") =>
          side.map((person, seat) => ({
            alias: `${role === "buyer" ? "買" : "売"}${String(seat + 1).padStart(2, "0")}`,
            person,
          }));
        return {
          id: index + 1,
          order: "",
          buyers: slots(people.slice(0, buyers), "buyer"),
          sellers: slots(people.slice(buyers), "seller"),
        };
      })
    : teacher.markets.map((market) => {
        const counts = studyMarketCounts(view.config, market.id);
        const byAlias = new Map(
          teacher.participants
            .filter((person) => person.market === market.id)
            .map((person) => [person.alias, person]),
        );
        const slots = (role: "buyer" | "seller", count: number): RosterSlot[] =>
          Array.from({ length: count }, (_, index) => {
            const alias = `${role === "buyer" ? "買" : "売"}${String(index + 1).padStart(2, "0")}`;
            return { alias, person: byAlias.get(alias) };
          });
        return {
          id: market.id,
          order: market.order.map((i) => INSTITUTIONS[i].short).join(" → "),
          buyers: slots("buyer", counts.buyers),
          sellers: slots("seller", counts.sellers),
        };
      });
  const participantAction = (person: (typeof teacher.participants)[number]) =>
    person.withdrawnAt ? (
      <span
        className="study-roster-withdrawn"
        title="参加終了"
        aria-label="参加終了"
      >
        <X size={16} aria-hidden="true" />
      </span>
    ) : view.phase !== "finished" ? (
      <button
        type="button"
        className="study-roster-withdraw"
        title="参加終了"
        aria-label={`${person.nickname}さんの参加を終了`}
        disabled={disabled}
        onDoubleClick={(e) => e.stopPropagation()}
        onClick={() => setWithdraw(person)}
      >
        <X size={16} aria-hidden="true" />
      </button>
    ) : null;
  return (
    <section
      className={`panel study-roster${rosterVisible ? "" : " study-roster-collapsed"}`}
      aria-labelledby={`${rosterId}-heading`}
    >
      <header className="study-roster-heading">
        <div>
          <UsersRound size={22} />
          <h2 id={`${rosterId}-heading`}>
            学生の割り当て{" "}
            <small>
              {view.participantCount}
              {!flexible && ` / ${view.config.capacity}`}人
            </small>
          </h2>
        </div>
        <span className={`study-lobby-label ${assigned ? "assigned" : ""}`}>
          {assigned
            ? "割り当て済み"
            : flexible
              ? lobby.admission!.status === "open"
                ? "入室受付中"
                : "入室受付終了"
              : "入室順の仮配置"}
        </span>
        {!waiting && (
          <button
            type="button"
            className="button secondary small-button"
            aria-expanded={rosterVisible}
            aria-controls={`${rosterId}-content`}
            onClick={() => setRosterExpanded((expanded) => !expanded)}
          >
            {rosterVisible ? "割り当てを折りたたむ" : "割り当てを表示"}
          </button>
        )}
      </header>
      <div
        id={`${rosterId}-content`}
        className="study-roster-content"
        hidden={!rosterVisible}
      >
        {waiting && !hideControls && (
          <StudyAdmission
            view={view}
            now={now}
            command={command}
            disabled={disabled}
            marketDraft={marketDraft}
            onMarketDraftChange={setMarketDraft}
          />
        )}
        {!hideControls && (
          <div className="study-roster-actions">
            {(!waiting || assigned) && (
              <p>
                {waiting
                  ? "市場と買い手・売り手の割り当てが完了しました。「実験を開始」で全市場の5秒カウントダウンが始まります。"
                  : "実験開始時の割り当てです。各市場の買い手・売り手は実験終了まで固定されます。"}
              </p>
            )}
            {waiting && (!flexible || lobby.admission!.status === "closed") && (
              <button
                className="button primary"
                disabled={
                  disabled || (flexible ? view.participantCount < 2 : !full)
                }
                onClick={() =>
                  void command({
                    type: "study-randomize",
                    expectedRevision: lobby.revision,
                  })
                }
              >
                <Shuffle size={17} />
                {assigned ? "もう一度ランダムに割り当て" : "ランダムに割り当て"}
              </button>
            )}
          </div>
        )}
        {waiting && !flexible && !full && (
          <p className="field-help">
            あと{view.config.capacity - view.participantCount}
            人の入室を待っています。
          </p>
        )}
        <div className="study-roster-grid">
          {markets.map((market) => {
            const expanded = expandedMarkets.has(market.id);
            const activeCount = (slots: RosterSlot[]) =>
              slots.filter(({ person }) => person && !person.withdrawnAt)
                .length;
            const buyers = activeCount(market.buyers);
            const sellers = activeCount(market.sellers);
            return (
              <section
                className="study-roster-room"
                key={market.id}
                aria-label={`市場${market.id}の${pending ? "仮配置" : "学生"}`}
                onDoubleClick={
                  pending ? undefined : () => onOpenMarket(market.id)
                }
              >
                <h3>
                  <button
                    type="button"
                    className="study-roster-market-toggle"
                    aria-expanded={expanded}
                    aria-controls={`${rosterId}-market-${market.id}`}
                    onClick={() => {
                      if (!pending) onSelectMarket(market.id);
                      setExpandedMarkets((previous) => {
                        const next = new Set(previous);
                        if (next.has(market.id)) next.delete(market.id);
                        else next.add(market.id);
                        return next;
                      });
                    }}
                  >
                    <span className="study-roster-market-name">
                      <DoorOpen size={18} /> 市場 {market.id}
                      {pending && buyers + sellers === 1 && (
                        <span className="study-roster-waiting">補充待ち</span>
                      )}
                      <ChevronDown size={16} />
                    </span>
                    <span className="study-roster-counts">
                      <span className="buy-text">
                        買 <b>{buyers}</b>人
                      </span>
                      <span className="sell-text">
                        売 <b>{sellers}</b>人
                      </span>
                      <span>
                        合計 <b>{buyers + sellers}</b>人
                      </span>
                    </span>
                  </button>
                </h3>
                <div id={`${rosterId}-market-${market.id}`} hidden={!expanded}>
                  {market.order && (
                    <p className="study-roster-sequence">{market.order}</p>
                  )}
                  <table
                    className="study-roster-table"
                    aria-label={`市場${market.id}の買い手・売り手`}
                  >
                    <thead className="study-roster-accessible-head">
                      <tr>
                        <th scope="col" className="buy-text">
                          買
                        </th>
                        <th scope="col" className="sell-text">
                          売
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from(
                        {
                          length: Math.max(
                            1,
                            market.buyers.length,
                            market.sellers.length,
                          ),
                        },
                        (_, index) => (
                          <tr key={index}>
                            {(["buyers", "sellers"] as const).map((side) => {
                              const slot = market[side][index];
                              const person = slot?.person;
                              return (
                                <td key={side}>
                                  <div
                                    className={`study-roster-person ${person?.withdrawnAt ? "withdrawn" : ""}`}
                                  >
                                    {slot && (
                                      <span
                                        className={`role-tag ${side === "buyers" ? "buyer" : "seller"}`}
                                      >
                                        {slot.alias.slice(1)}
                                      </span>
                                    )}
                                    {person ? (
                                      <>
                                        <b title={person.nickname}>
                                          {person.nickname}
                                        </b>
                                        {participantAction(person)}
                                      </>
                                    ) : (
                                      <span className="study-roster-empty">
                                        {slot || pending ? "入室待ち" : "—"}
                                      </span>
                                    )}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
        {withdraw && (
          <ConfirmDialog
            title={`${withdraw.nickname} さんの参加を終了`}
            message={
              waiting
                ? "この学生を割り当て対象から外します。同じルームで入室を受け付け直し、再度割り当てできます。"
                : "未約定の注文を取り消します。成立済みの取引・利益・役割は保存し、他の学生は実験を続けます。"
            }
            onCancel={() => setWithdraw(null)}
            onConfirm={async () => {
              await command({
                type: "study-withdraw",
                participantId: withdraw.id,
                expectedRevision: lobby.revision,
              });
              setWithdraw(null);
            }}
          />
        )}
      </div>
    </section>
  );
}

export function StudyWaitingRoom({
  view,
  connected,
  retry,
  toolbar,
  demo,
  error,
}: {
  view: RoomView;
  connected: boolean;
  retry: () => void;
  toolbar?: ReactNode;
  demo: boolean;
  error: string;
}) {
  const assigned = view.study!.lobby!.randomizedAt !== null;
  return (
    <div className="study-shell study-waiting-shell">
      <Header
        demoLabel={demo ? "DEMOモード" : undefined}
        demoExitHref={DEMO_TEACHER_HREFS.institutions}
      >
        {!demo && (
          <span className={`connection ${connected ? "" : "disconnected"}`}>
            {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
            {connected ? "接続中" : "再接続中"}
          </span>
        )}
        <span className="header-room-code">
          ルーム <b>{view.code}</b>
        </span>
      </Header>
      <main className="study-main">
        {toolbar}
        <StudentWaitingCard assigned={assigned} className="study-waiting-card">
          <p className="eyebrow study-waiting-admission">
            {view.me.withdrawnAt ? "参加を終了しました" : "入室が完了しました"}
          </p>
          {!view.me.withdrawnAt && (
            <h1>
              {assigned
                ? "割り当てが完了しました"
                : "教員が開始するまでお待ちください"}
            </h1>
          )}
          <p className="study-waiting-message">
            {view.me.withdrawnAt
              ? "これまでの取引記録は保存されています。"
              : `${view.me.nickname} さん、この画面を開いたままお待ちください。`}
          </p>
          <p>
            {view.me.withdrawnAt
              ? "他の参加者は実験を続けます。"
              : assigned
                ? "教員が開始すると実験画面に切り替わり、5秒後に取引が始まります。"
                : "入室締切後、教員が市場と買い手・売り手を割り当てます。"}
          </p>
          <div
            className="study-waiting-institutions"
            aria-label="本実験で実施する制度"
          >
            <p>本実験で実施する制度</p>
            <ul>
              {studyInstitutions(view.config).map((institution) => (
                <li key={institution}>
                  {INSTITUTIONS[institution].short}{" "}
                  {studyPeriodCount(view.config, institution)}期
                  {`・1人${studyUnits(view.config, institution)}単位／期`}
                </li>
              ))}
            </ul>
            <span>計{view.config.rounds}期</span>
          </div>
          <p className="study-waiting-commission">
            成立1単位につき、買い手・売り手に各 {studyCommission(view.config)}{" "}
            円のCommission
          </p>
          <ol className="study-waiting-steps">
            <li className="complete">
              <Check size={16} />
              入室
            </li>
          </ol>
          <div className="study-waiting-count">
            参加者 <b>{view.participantCount}</b>
            {!view.study!.lobby!.admission && ` / ${view.config.capacity}`}人
          </div>
          {!connected && (
            <p className="error-message" role="status">
              接続が切れています。
              <button className="text-button" onClick={retry}>
                再接続
              </button>
            </p>
          )}
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
        </StudentWaitingCard>
      </main>
    </div>
  );
}
