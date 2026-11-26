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
  tools,
  renderDecision,
}: {
  view: Extract<View, { role: "student" }>;
  memo: NonNullable<Personal["memo"]>;
  mine: Personal;
  lang: Lang;
  now: number;
  tools?: ReactNode;
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
  const coordinates = points.map((point, i) => ({
    x: 10 + (i * 260) / 19,
    y: 60 - (54 * point.hare) / point.size,
  }));
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
        {prior ? (
          <>
            <div className="ev-memo-proportion">
              <span>{t("memoFeedback")}</span>
              <strong>{format.format(prior.hare / prior.size)}</strong>
              <progress
                aria-label={t("memoFeedback")}
                max={prior.size}
                value={prior.hare}
              />
            </div>
            <dl className="ev-memo-payoffs">
              <div>
                <dt>{t("mine")}</dt>
                <dd>{names[memo.carriedChoice]}</dd>
              </div>
              <div>
                <dt>{t("pay")}</dt>
                <dd>{memo.priorPay ?? "—"}</dd>
              </div>
            </dl>
            <figure>
              <figcaption>{t("memoTrend")}</figcaption>
              <svg
                role="img"
                aria-label={points.map(pointLabel).join("; ")}
                viewBox="0 0 280 66"
                width="280"
                height="66"
              >
                {[6, 33, 60].map((y) => (
                  <line
                    key={y}
                    x1="10"
                    y1={y}
                    x2="270"
                    y2={y}
                    stroke="currentColor"
                    opacity=".25"
                  />
                ))}
                <polyline
                  points={coordinates.map(({ x, y }) => `${x},${y}`).join(" ")}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                {coordinates.map(({ x, y }, i) => (
                  <circle
                    key={points[i].round}
                    cx={x}
                    cy={y}
                    r="2.5"
                    fill="currentColor"
                  >
                    <title>{pointLabel(points[i])}</title>
                  </circle>
                ))}
              </svg>
            </figure>
          </>
        ) : (
          <p>{t("memoNoFeedback")}</p>
        )}
      </section>

      <section className="panel ev-panel ev-memo-revision">
        <h2>{t("memoRevision")}</h2>
        <p id={statusId} role="status">
          {status}
        </p>
        {memo.blockRound === 1 && <p>{t("memoNew")}</p>}
        {mine.pay !== null && (
          <p>
            {t("pay")} <strong>{mine.pay}</strong>
          </p>
        )}
      </section>

      {tools}
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
