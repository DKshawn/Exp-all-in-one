"use client";
import { displayChoices, label, type Lang } from "../locale";
import type { Personal, View } from "../views";

export function MemoFeedback({
  view,
  mine,
  lang,
}: {
  view: Extract<View, { role: "student" }>;
  mine: Personal;
  lang: Lang;
}) {
  const m = mine.memo!;
  const names = displayChoices(lang, view.settings);
  const t = (k: Parameters<typeof label>[1]) => label(lang, k);
  const points = m.feedback;
  const prior = points.at(-1);
  const fmt = (count: number, size: number) =>
    new Intl.NumberFormat(lang, {
      style: "percent",
      maximumFractionDigits: 1,
    }).format(count / size);
  const line = points
    .map((p, i) => `${(i / 19) * 260 + 10},${92 - (82 * p.hare) / p.size}`)
    .join(" ");
  return (
    <section className="panel ev-panel ev-memo-feedback">
      <h2>{t("memoFeedback")}</h2>
      {prior ? (
        <>
          <p>
            <strong>{fmt(prior.hare, prior.size)}</strong> ({prior.hare}/
            {prior.size})
          </p>
          <progress
            aria-label={t("memoFeedback")}
            max={prior.size}
            value={prior.hare}
          />
          <svg
            role="img"
            aria-label={points
              .map((p) => `${t("round")} ${p.round}: ${fmt(p.hare, p.size)}`)
              .join("; ")}
            viewBox="0 0 280 100"
            width="280"
            height="100"
          >
            {[10, 51, 92].map((y) => (
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
              points={line}
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
            />
            {points.map((p, i) => (
              <circle
                key={p.round}
                cx={(i / 19) * 260 + 10}
                cy={92 - (82 * p.hare) / p.size}
                r="3"
                fill="currentColor"
              >
                <title>
                  {t("round")} {p.round}: {fmt(p.hare, p.size)}
                </title>
              </circle>
            ))}
          </svg>
          <p>
            {t("memoPrior")}: {names[m.carriedChoice]} · {m.priorPay ?? "—"}
          </p>
        </>
      ) : (
        <p>{t("memoNoFeedback")}</p>
      )}
    </section>
  );
}
