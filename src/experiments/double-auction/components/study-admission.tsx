"use client";

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { AdmissionTimer } from "@/components/admission-timer";
import type { Command, RoomView } from "@/experiments/double-auction/lib/types";
import { MAX_STUDY_MARKETS } from "@/experiments/double-auction/lib/study-config";
import {
  studyAllocationPlan,
  studyAllocationWaitingMessage,
} from "@/experiments/double-auction/lib/study-allocation";

export function StudyAdmission({
  view,
  now,
  command,
  disabled,
  marketDraft,
  onMarketDraftChange,
  section = "all",
}: {
  view: RoomView;
  now: number;
  command: (command: Command) => Promise<boolean>;
  disabled: boolean;
  marketDraft: string | null;
  onMarketDraftChange: Dispatch<SetStateAction<string | null>>;
  section?: "all" | "markets" | "deadline";
}) {
  const lobby = view.study!.lobby!,
    admission = lobby.admission;
  const markets =
    marketDraft ?? String(admission?.targetMarkets ?? view.config.markets ?? 1);
  const marketCount = Number(markets);
  const validMarkets =
    Number.isInteger(marketCount) &&
    marketCount >= 1 &&
    marketCount <= MAX_STUDY_MARKETS;
  const waitingMessage = validMarkets
    ? studyAllocationWaitingMessage(
        studyAllocationPlan(
          view.participantCount,
          marketCount,
          marketDraft === null ? view.config.studyMarketMode : "manual",
        ),
      )
    : "";
  const [savingMarkets, setSavingMarkets] = useState(false);
  const lastAttempt = useRef<{ markets: number; revision: number } | null>(
    null,
  );
  const [secondsDraft, setSecondsDraft] = useState<string | null>(null);
  const seconds = secondsDraft ?? String(admission?.timerSeconds ?? 60);
  const running = admission?.closesAt != null;
  const paused = admission?.pausedRemainingMs !== undefined;
  const remainingSeconds = Math.max(
    0,
    Math.ceil(
      (running
        ? admission!.closesAt! - now
        : (admission?.pausedRemainingMs ?? 0)) / 1000,
    ),
  );
  const saveMarkets = useEffectEvent(async () => {
    if (disabled || admission?.status !== "open") return;
    lastAttempt.current = { markets: marketCount, revision: lobby.revision };
    setSavingMarkets(true);
    try {
      const saved = await command({
        type: "study-admission",
        action: "configure",
        markets: marketCount,
        expectedRevision: lobby.revision,
      });
      if (saved)
        onMarketDraftChange((current) =>
          Number(current) === marketCount ? null : current,
        );
    } finally {
      setSavingMarkets(false);
    }
  });
  useEffect(() => {
    if (
      disabled ||
      section === "deadline" ||
      admission?.status !== "open" ||
      !validMarkets ||
      (marketCount === admission.targetMarkets &&
        !(view.config.studyMarketMode === "auto" && marketDraft !== null)) ||
      (lastAttempt.current?.markets === marketCount &&
        lastAttempt.current.revision === lobby.revision)
    )
      return;
    const timer = window.setTimeout(() => void saveMarkets(), 400);
    return () => window.clearTimeout(timer);
  }, [
    markets,
    section,
    marketCount,
    validMarkets,
    disabled,
    admission?.status,
    admission?.targetMarkets,
    view.config.studyMarketMode,
    marketDraft,
    lobby.revision,
  ]);
  const send = (
    action: Extract<Command, { type: "study-admission" }>["action"],
  ) =>
    command({
      type: "study-admission",
      action,
      expectedRevision: lobby.revision,
      ...((action === "schedule" || action === "close") &&
      (marketDraft !== null || view.config.studyMarketMode !== "auto")
        ? { markets: marketCount }
        : {}),
      ...(action === "schedule" ? { seconds: Number(seconds) } : {}),
    });
  if (!admission)
    return (
      <button
        className="button secondary"
        disabled={disabled}
        onClick={() => void send("open")}
      >
        人数を確定せず入室を受け付ける
      </button>
    );
  return (
    <section className="study-admission" aria-label="入室受付の設定">
      <div className="study-admission-controls">
        {section !== "deadline" && (
          <>
            <label className="field">
              市場数
              <input
                type="number"
                min={1}
                max={MAX_STUDY_MARKETS}
                step={1}
                value={markets}
                disabled={
                  (disabled && !savingMarkets) || admission.status !== "open"
                }
                onChange={(e) => {
                  lastAttempt.current = null;
                  onMarketDraftChange(e.target.value);
                }}
              />
            </label>
            {view.config.studyMarketMode !== "auto" && (
              <button
                type="button"
                className="button secondary"
                disabled={disabled || admission.status !== "open"}
                onClick={async () => {
                  if (
                    await command({
                      type: "study-admission",
                      action: "configure",
                      marketMode: "auto",
                      expectedRevision: lobby.revision,
                    })
                  )
                    onMarketDraftChange(null);
                }}
              >
                自動（1市場16人）に戻す
              </button>
            )}
          </>
        )}
        {section !== "markets" &&
          (admission.status === "open" ? (
            <>
              <AdmissionTimer
                seconds={seconds}
                onSeconds={setSecondsDraft}
                running={running}
                paused={paused}
                remaining={remainingSeconds}
                disabled={disabled}
                canStart={
                  validMarkets &&
                  Number.isInteger(Number(seconds)) &&
                  Number(seconds) >= 5 &&
                  Number(seconds) <= 3600
                }
                onStart={async () => {
                  if (await send(paused ? "resume-timer" : "schedule"))
                    setSecondsDraft(null);
                }}
                onPause={() => void send("pause-timer")}
                onReset={async () => {
                  if (await send("cancel-timer")) setSecondsDraft(null);
                }}
              />
              <button
                className="button primary"
                disabled={
                  disabled ||
                  !validMarkets ||
                  view.participantCount < 2 ||
                  !!waitingMessage
                }
                onClick={() => void send("close")}
              >
                入室を締め切って割り当て
              </button>
            </>
          ) : (
            <button
              className="button secondary"
              disabled={disabled}
              onClick={() => void send("open")}
            >
              入室を再開
            </button>
          ))}
      </div>
      {admission.status === "open" && waitingMessage && (
        <p className="field-help study-admission-waiting" role="status">
          {waitingMessage}
        </p>
      )}
      {section !== "markets" && admission.error && (
        <p className="error-message" role="alert">
          {admission.error}
        </p>
      )}
    </section>
  );
}
