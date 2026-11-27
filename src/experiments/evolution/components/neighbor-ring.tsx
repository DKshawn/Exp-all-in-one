import { label, type Key, type Lang } from "../locale";
import type { NeighborFeedback } from "../memo-v3";
import { H5_RADIUS } from "../settings";

export function NeighborRing({
  neighborhood,
  carriedChoice,
  names,
  lang,
}: {
  neighborhood: NeighborFeedback;
  carriedChoice: 0 | 1;
  names: readonly string[];
  lang: Lang;
}) {
  const { previous } = neighborhood;
  const count = previous.filter((choice) => choice === 1).length;
  const t = (k: Key) => label(lang, k);
  const details = previous.length
    ? [
        t("h5Left") +
          ": " +
          previous
            .slice(0, H5_RADIUS)
            .map((c) => names[c])
            .join(", "),
        t("h5You") + ": " + names[carriedChoice],
        t("h5Right") +
          ": " +
          previous
            .slice(H5_RADIUS)
            .map((c) => names[c])
            .join(", "),
      ].join(". ")
    : t("memoNoFeedback");

  return (
    <section className="panel ev-panel ev-h5-feedback">
      <h2>{t("memoResult")}</h2>
      <div className="ev-h5-result">
        <svg
          className="ev-h5-ring"
          viewBox="0 0 128 128"
          role="img"
          aria-label={details}
        >
          <circle className="ev-h5-track" cx="64" cy="64" r="51" />
          {Array.from({ length: H5_RADIUS * 2 + 1 }, (_, i) => {
            const self = i === H5_RADIUS;
            const angle = ((i - H5_RADIUS) * Math.PI) / 14;
            const choice = !previous.length
              ? undefined
              : self
                ? carriedChoice
                : previous[i > H5_RADIUS ? i - 1 : i];
            return (
              <circle
                key={i}
                className="ev-h5-seat"
                data-self={self}
                data-choice={choice}
                cx={64 + 51 * Math.sin(angle)}
                cy={64 - 51 * Math.cos(angle)}
                r={self ? 6 : 4.5}
              />
            );
          })}
        </svg>
        <div className="ev-h5-count">
          <span>{t("h5PriorHare")}</span>
          <strong>
            {previous.length ? count + " / " + previous.length : "—"}
          </strong>
          {previous.length > 0 && (
            <progress
              className="ev-memo-progress"
              aria-label={t("h5PriorHare")}
              max={previous.length}
              value={count}
            />
          )}
        </div>
      </div>
      <div className="ev-h5-legend">
        <span data-self="true">{t("h5You")}</span>
        <span data-choice="0">{names[0]}</span>
        <span data-choice="1">{names[1]}</span>
      </div>
    </section>
  );
}
