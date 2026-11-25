"use client";

import { Shuffle } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";
import type { Command, RoomView } from "@/experiments/double-auction/lib/types";
import {
  MAX_STUDY_MARKETS,
  studyInstitutions,
  studyPeriodCount,
  studyUnits,
} from "@/experiments/double-auction/lib/study-config";
import { studyCommission } from "@/experiments/double-auction/lib/study-commission";
import { INSTITUTIONS } from "@/experiments/double-auction/lib/study-rules";
import { StudyAdmission } from "./study-admission";
import { StudyRoster } from "./study-lobby";
import { StudyProgramEditor } from "./study-program-settings";
import { StudySettingsEditor } from "./study-settings";
import { StudySetupStep } from "./study-setup-step";

/** One preparation flow for real rooms and the in-memory demo. Server commands
 * remain authoritative; the accordion only tracks which settings were reviewed. */
export function StudySetup({
  view,
  now,
  command,
  disabled,
  onSelectMarket,
  onOpenMarket,
  admissionControls,
}: {
  view: RoomView;
  now: number;
  command: (command: Command) => Promise<boolean>;
  disabled: boolean;
  onSelectMarket: (id: number) => void;
  onOpenMarket: (id: number) => void;
  admissionControls?: ReactNode;
}) {
  const lobby = view.study!.lobby!;
  const admission = lobby.admission!;
  const ready = admission.status === "closed" && lobby.randomizedAt !== null;
  const configured = ready || view.config.studySetupConfirmed === true;
  const [confirmed, setConfirmed] = useState<[boolean, boolean]>(() => [
    configured,
    configured,
  ]);
  const [requestedStep, setRequestedStep] = useState(
    ready ? 3 : configured ? 2 : 0,
  );
  const [reviewedCutoff, setReviewedCutoff] = useState<number | null>(null);
  const [marketDraft, setMarketDraft] = useState<string | null>(null);
  const id = useId();
  // A timer can close admission while an earlier group is being edited. Keep
  // that edit open; advance automatically only from the admission group.
  const step =
    requestedStep < 2
      ? requestedStep
      : !confirmed[0]
        ? 0
        : !confirmed[1]
          ? 1
          : ready &&
              !(requestedStep === 2 && reviewedCutoff === admission.closedAt)
            ? 3
            : 2;
  useEffect(() => {
    document
      .getElementById(`${id}-heading-${step}`)
      ?.focus({ preventScroll: true });
  }, [id, step]);
  const markets = Number(marketDraft ?? admission.targetMarkets);
  const marketsSaved =
    Number.isInteger(markets) &&
    markets >= 1 &&
    markets <= MAX_STUDY_MARKETS &&
    markets === admission.targetMarkets &&
    !(view.config.studyMarketMode === "auto" && marketDraft !== null);
  function dirty(index: 0 | 1) {
    setConfirmed((previous) =>
      previous[index]
        ? index === 0
          ? [false, previous[1]]
          : [previous[0], false]
        : previous,
    );
  }
  function confirm(index: 0 | 1) {
    setReviewedCutoff(null);
    setConfirmed((previous) =>
      index === 0 ? [true, previous[1]] : [previous[0], true],
    );
    setRequestedStep(index === 0 && !confirmed[1] ? 1 : 2);
  }
  const programSummary = studyInstitutions(view.config)
    .map(
      (institution) =>
        `${INSTITUTIONS[institution].short} ${studyPeriodCount(view.config, institution)}期`,
    )
    .join(" · ");
  const labels = ["制度と進行", "市場・取引条件", "入室締切", "割り当て確認"];
  const summaries = [
    programSummary,
    `${admission.targetMarkets}市場 · ${studyInstitutions(view.config)
      .map((i) => `${INSTITUTIONS[i].short} ${studyUnits(view.config, i)}単位`)
      .join("・")} · Commission ${studyCommission(view.config)}円`,
    admission.status === "closed"
      ? `${view.participantCount}人・締切済み`
      : admission.closesAt !== null
        ? "締切タイマー作動中"
        : admission.pausedRemainingMs !== undefined
          ? "締切タイマー一時停止中"
          : `${view.participantCount}人入室・受付中`,
    ready
      ? `${view.participantCount}人・${view.study!.teacher!.markets.length}市場`
      : "割り当て後に確認",
  ];
  const completed = [confirmed[0], confirmed[1], ready, false];
  const enabled = [
    true,
    confirmed[0],
    confirmed[0] && confirmed[1],
    confirmed[0] && confirmed[1] && ready,
  ];
  return (
    <div className="study-setup-layout">
      <StudyRoster
        view={view}
        now={now}
        command={command}
        disabled={disabled}
        onSelectMarket={onSelectMarket}
        onOpenMarket={onOpenMarket}
        hideControls
        setupMarketDraft={marketDraft}
      />
      <section
        id="study-room-setup"
        className="panel study-setup study-compact-settings"
        aria-label="実験の準備"
        tabIndex={-1}
      >
        <header className="study-setup-heading">
          <h2>実験の準備</h2>
          <span>ステップ {step + 1} / 4</span>
        </header>
        {labels.map((label, index) => (
          <StudySetupStep
            key={label}
            id={id}
            index={index}
            label={label}
            summary={summaries[index]}
            expanded={step === index}
            complete={completed[index]}
            disabled={disabled || !enabled[index]}
            onOpen={() => {
              setReviewedCutoff(index === 2 ? admission.closedAt : null);
              setRequestedStep(index);
            }}
          >
            {index === 0 && (
              <StudyProgramEditor
                view={view}
                command={command}
                disabled={disabled || step !== 0}
                onDirty={() => dirty(0)}
                onConfirmed={() => confirm(0)}
              />
            )}
            {index === 1 && (
              <>
                <StudyAdmission
                  view={view}
                  now={now}
                  command={command}
                  disabled={disabled || step !== 1}
                  marketDraft={marketDraft}
                  onMarketDraftChange={(change) => {
                    setMarketDraft(change);
                    dirty(1);
                  }}
                  section="markets"
                />
                <StudySettingsEditor
                  view={view}
                  command={command}
                  disabled={disabled || step !== 1}
                  confirmDisabled={!marketsSaved}
                  onDirty={() => dirty(1)}
                  onConfirmed={() => confirm(1)}
                />
              </>
            )}
            {index === 2 && (
              <>
                <p className="study-setup-arrivals">
                  <b>{view.participantCount}</b> 人入室
                </p>
                {admissionControls}
                <StudyAdmission
                  view={view}
                  now={now}
                  command={command}
                  disabled={disabled || step !== 2}
                  marketDraft={marketDraft}
                  onMarketDraftChange={setMarketDraft}
                  section="deadline"
                />
                {admission.status === "closed" && !ready && (
                  <>
                    {admission.error && (
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => {
                          dirty(1);
                          setRequestedStep(1);
                        }}
                      >
                        供需条件を再設定
                      </button>
                    )}
                    <button
                      className="button primary"
                      disabled={disabled || view.participantCount < 2}
                      onClick={() =>
                        void command({
                          type: "study-randomize",
                          expectedRevision: lobby.revision,
                        })
                      }
                    >
                      割り当てを確定
                    </button>
                  </>
                )}
                {ready && (
                  <button
                    className="button primary"
                    disabled={disabled}
                    onClick={() => setRequestedStep(3)}
                  >
                    割り当て確認へ
                  </button>
                )}
              </>
            )}
            {index === 3 && (
              <>
                <dl className="study-setup-summary">
                  <div>
                    <dt>参加者</dt>
                    <dd>{view.participantCount}人</dd>
                  </div>
                  <div>
                    <dt>市場</dt>
                    <dd>{view.study!.teacher!.markets.length}市場</dd>
                  </div>
                  <div>
                    <dt>制度・期数</dt>
                    <dd>{programSummary}</dd>
                  </div>
                </dl>
                <div className="study-setup-secondary-actions">
                  <button
                    className="button secondary"
                    disabled={disabled || !ready}
                    onClick={() =>
                      void command({
                        type: "study-randomize",
                        expectedRevision: lobby.revision,
                      })
                    }
                  >
                    <Shuffle size={16} />
                    もう一度ランダムに割り当て
                  </button>
                  <button
                    className="button secondary"
                    disabled={disabled}
                    onClick={() =>
                      void command({
                        type: "study-admission",
                        action: "open",
                        expectedRevision: lobby.revision,
                      })
                    }
                  >
                    入室を再開
                  </button>
                </div>
                <button
                  className="button success full"
                  disabled={
                    disabled ||
                    !ready ||
                    !confirmed.every(Boolean) ||
                    view.participantCount < 2
                  }
                  onClick={() => void command({ type: "start" })}
                >
                  実験を開始
                </button>
                <p className="field-help">全市場で5秒後に取引が始まります。</p>
              </>
            )}
          </StudySetupStep>
        ))}
      </section>
    </div>
  );
}
