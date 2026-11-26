"use client";
import { useId, type ReactNode } from "react";
import { displayChoices, label, type Key, type Lang } from "../locale";
import { MEMO_LOCK_ROUNDS, MEMO_MATRIX } from "../settings";
import type { Personal, View } from "../views";

export function MemoStudent({
  view,
  memo,
  mine,
  lang,
  now,
  renderDecision,
}: {
  view: Extract<View, { role: "student" }>;
  memo: NonNullable<Personal["memo"]>;
  mine: Personal;
  lang: Lang;
  now: number;
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
  const pointLabel = (point: (typeof points)[number]) =>
    `${t("round")} ${point.round}: ${format.format(point.hare / point.size)}`;
  const left = 42,
    right = 262,
    top = 12,
    bottom = 82;
  const x = (i: number) =>
    left + (i * (right - left)) / Math.max(1, points.length - 1);
  const y = (share: number) => bottom - share * (bottom - top);
  const ticks = new Set(
    Array.from({ length: 5 }, (_, i) =>
      Math.round((i * (points.length - 1)) / 4),
    ),
  );
  let status: string;
  if (mine.status === "interrupted") status = t("interrupted");
  else if (memo.blockRound <= MEMO_LOCK_ROUNDS)
    status = t("memoForced").replace("{choice}", names[memo.initialChoice]);
  else if (memo.timedOut) status = t("memoTimeout");
  else if (!memo.eligible) status = t("memoCarry");
  else if (mine.status !== "choosing") status = t("memoSubmitted");
  else if (view.pausedAt !== null) status = t("paused");
  else if (now >= (view.deadline ?? Infinity)) status = t("memoChoiceClosed");
  else status = t("memoEligible");

  return (
    <>
      <section className="panel ev-panel ev-memo-choice">
        <h2>{t("mine")}</h2>
        {renderDecision(statusId)}
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
        <h2>{t("memoResult")}</h2>
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
            <dd>{memo.priorPay ?? "—"}</dd>
          </div>
        </dl>
        <figure>
          <figcaption>{t(prior ? "memoTrend" : "memoNoFeedback")}</figcaption>
          <svg
            role={prior ? "img" : undefined}
            aria-label={prior ? points.map(pointLabel).join("; ") : undefined}
            aria-hidden={prior ? undefined : true}
            viewBox="0 0 280 124"
            width="280"
            height="124"
          >
            {[1, 0.5, 0].map((share) => (
              <g key={share}>
                <line
                  className="ev-memo-gridline"
                  x1={left}
                  x2={right}
                  y1={y(share)}
                  y2={y(share)}
                />
                <text
                  x={left - 6}
                  y={y(share)}
                  textAnchor="end"
                  dominantBaseline="middle"
                >
                  {format.format(share)}
                </text>
              </g>
            ))}
            <path
              className="ev-memo-axis"
              d={`M ${left} ${top} V ${bottom} H ${right}`}
            />
            {points.map(
              (point, i) =>
                ticks.has(i) && (
                  <g key={point.round}>
                    <line
                      className="ev-memo-axis"
                      x1={x(i)}
                      x2={x(i)}
                      y1={bottom}
                      y2={bottom + 5}
                    />
                    <text x={x(i)} y={bottom + 19} textAnchor="middle">
                      {point.round}
                    </text>
                  </g>
                ),
            )}
            <text x={(left + right) / 2} y="119" textAnchor="middle">
              {t("round")}
            </text>
            {points.length > 1 && (
              <polyline
                points={points
                  .map((point, i) => `${x(i)},${y(point.hare / point.size)}`)
                  .join(" ")}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
            )}
            {points.map((point, i) => (
              <circle
                key={point.round}
                cx={x(i)}
                cy={y(point.hare / point.size)}
                r="2.5"
                fill="currentColor"
              >
                <title>{pointLabel(point)}</title>
              </circle>
            ))}
          </svg>
        </figure>
      </section>

      <section className="panel ev-panel ev-memo-revision">
        <h2>{t("memoRevision")}</h2>
        <p className="ev-memo-revision-status" id={statusId} role="status">
          {status}
        </p>
        <div className="ev-memo-revision-details">
          {memo.blockRound === 1 && <p>{t("memoNew")}</p>}
          {mine.pay !== null && (
            <p className="ev-memo-current-pay">
              {t("pay")} <strong>{mine.pay}</strong>
            </p>
          )}
        </div>
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
          <strong>{view.total}</strong>
        </div>
      </div>
      <section className="panel ev-panel">
        <h2>{t("rules")}</h2>
        <p>{t("memoRule")}</p>
        <p>{t("memoRevisionRule")}</p>
      </section>
    </>
  );
}
