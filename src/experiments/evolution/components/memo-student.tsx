"use client";
import { LockKeyhole } from "lucide-react";
import { useId, type ReactNode } from "react";
import { displayChoices, label, type Key, type Lang } from "../locale";
import { MEMO_LOCK_ROUNDS, MEMO_MATRIX } from "../settings";
import { roundedAmount } from "../numbers";
import type { FeedbackPoint } from "../memo-v3";
import type { Personal, View } from "../views";

export function MemoStudent({
  view,
  memo,
  mine,
  lang,
  now,
  canChoose,
  renderDecision,
}: {
  view: Extract<View, { role: "student" }>;
  memo: NonNullable<Personal["memo"]>;
  mine: Personal;
  lang: Lang;
  now: number;
  canChoose: boolean;
  renderDecision: (statusId: string) => ReactNode;
}) {
  const statusId = useId();
  const names = displayChoices(lang, view.settings);
  const t = (k: Key) => label(lang, k);
  const points = memo.feedback;
  const prior = points.at(-1);
  const format = new Intl.NumberFormat(lang, {
    style: "percent",
    maximumFractionDigits: 1,
  });
  let status: string;
  if (mine.status === "interrupted") status = t("interrupted");
  else if (memo.blockRound <= MEMO_LOCK_ROUNDS)
    status = t("memoForced").replace("{choice}", names[memo.initialChoice]);
  else if (memo.timedOut) status = t("memoTimeout");
  else if (!memo.eligible) status = t("memoCarry");
  else if (mine.status !== "choosing") status = t("memoSubmitted");
  else if (view.pausedAt !== null) status = t("paused");
  else if (now >= (view.deadline ?? Infinity)) status = t("memoChoiceClosed");
  else status = t(canChoose ? "memoEligible" : "processing");

  return (
    <>
      <section
        className="panel ev-panel ev-memo-choice"
        data-can-choose={canChoose}
      >
        <h2>{t("mine")}</h2>
        <p className="ev-memo-choice-status" id={statusId} role="status">
          {status}
        </p>
        <div className="ev-memo-options">
          {renderDecision(statusId)}
          {!canChoose && (
            <LockKeyhole
              className="ev-memo-choice-lock"
              size={24}
              aria-hidden="true"
            />
          )}
        </div>
        <table>
          <caption>{t("memoPayoffTable")}</caption>
          <thead>
            <tr>
              <th scope="col">{t("mine")}</th>
              {names.map((name) => (
                <th scope="col" key={name}>
                  {t("memoOpponent").replace("{choice}", name)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MEMO_MATRIX.map((row, i) => (
              <tr key={names[i]}>
                <th scope="row">{names[i]}</th>
                {row.map(([pay], j) => (
                  <td key={names[j]}>{pay}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p>{t("memoRoundPay")}</p>
      </section>

      <section className="panel ev-panel ev-memo-feedback">
        <div className="ev-memo-feedback-title">
          <h2>{t("memoResult")}</h2>
          {memo.blockRound === 1 && <p>{t("memoNew")}</p>}
        </div>
        <div className="ev-memo-proportion">
          <span>{t("memoFeedback")}</span>
          <strong>
            {prior ? format.format(prior.hare / prior.size) : "—"}
          </strong>
          {prior ? (
            <progress
              className="ev-memo-progress"
              aria-label={t("memoFeedback")}
              max={prior.size}
              value={prior.hare}
            />
          ) : (
            <span className="ev-memo-progress" aria-hidden="true" />
          )}
        </div>
        <dl className="ev-memo-payoffs">
          <div>
            <dt>{t("mine")}</dt>
            <dd>{prior ? names[memo.carriedChoice] : "—"}</dd>
          </div>
          <div>
            <dt>{t("pay")}</dt>
            <dd>
              {memo.priorPay === null ? "—" : roundedAmount(memo.priorPay)}
            </dd>
          </div>
        </dl>
        <MemoTrend points={points} lang={lang} format={format} />
      </section>

      <div className="ev-account">
        <div>
          <span>{t("group")}</span>
          <strong>{view.group}</strong>
        </div>
        <div>
          <span>{t("size")}</span>
          <strong>{memo.groupSize}</strong>
        </div>
        <div>
          <span>{t("sum")}</span>
          <strong>{roundedAmount(view.total)}</strong>
        </div>
      </div>
      {view.code === "DEMO" && (
        <section className="panel ev-panel">
          <h2>{t("rules")}</h2>
          <p>{t("memoRule")}</p>
          <p>{t("memoRevisionRule")}</p>
        </section>
      )}
    </>
  );
}

function MemoTrend({
  points,
  lang,
  format,
}: {
  points: FeedbackPoint[];
  lang: Lang;
  format: Intl.NumberFormat;
}) {
  const hasFeedback = points.length > 0;
  const roundLabel = label(lang, "round");
  const pointLabel = (point: FeedbackPoint) =>
    `${roundLabel} ${point.round}: ${format.format(point.hare / point.size)}`;
  const x = (index: number) =>
    `${points.length === 1 ? 50 : (index * 100) / (points.length - 1)}%`;
  const y = (share: number) => `${(1 - share) * 100}%`;
  const levels = [1, 0.5, 0];
  const ticks = new Set(
    Array.from({ length: 5 }, (_, i) =>
      Math.round((i * (points.length - 1)) / 4),
    ),
  );

  return (
    <figure>
      <figcaption>
        {label(lang, hasFeedback ? "memoTrend" : "memoNoFeedback")}
      </figcaption>
      <div
        className="ev-memo-chart"
        role={hasFeedback ? "img" : undefined}
        aria-label={hasFeedback ? points.map(pointLabel).join("; ") : undefined}
        aria-hidden={hasFeedback ? undefined : true}
      >
        <div className="ev-memo-chart-scale">
          {levels.map((share) => (
            <span key={share} style={{ insetBlockStart: y(share) }}>
              {format.format(share)}
            </span>
          ))}
        </div>
        <div className="ev-memo-chart-plot">
          <svg aria-hidden="true">
            {levels.map((share) => (
              <line
                key={share}
                className="ev-memo-gridline"
                x1="0"
                x2="100%"
                y1={y(share)}
                y2={y(share)}
              />
            ))}
            <line
              className="ev-memo-axis"
              x1="0"
              x2="100%"
              y1="100%"
              y2="100%"
            />
            <line className="ev-memo-axis" x1="0" x2="0" y1="0" y2="100%" />
            {points.map((point, i) => {
              const previous = points[i - 1];
              return (
                <g key={point.round}>
                  {previous && (
                    <line
                      x1={x(i - 1)}
                      y1={y(previous.hare / previous.size)}
                      x2={x(i)}
                      y2={y(point.hare / point.size)}
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                  )}
                  <circle
                    cx={x(i)}
                    cy={y(point.hare / point.size)}
                    r="2.5"
                    fill="currentColor"
                  >
                    <title>{pointLabel(point)}</title>
                  </circle>
                </g>
              );
            })}
          </svg>
          <div className="ev-memo-chart-rounds">
            {points.map(
              (point, i) =>
                ticks.has(i) && (
                  <span key={point.round} style={{ insetInlineStart: x(i) }}>
                    {point.round}
                  </span>
                ),
            )}
          </div>
          <div className="ev-memo-chart-round-label">{roundLabel}</div>
        </div>
      </div>
    </figure>
  );
}
