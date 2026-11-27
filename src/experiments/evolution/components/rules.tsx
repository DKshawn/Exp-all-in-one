"use client";
import { Fragment, useId, type CSSProperties } from "react";
import {
  label,
  displayChoices,
  sliderInstructions,
  type Lang,
} from "../locale";
import { continuous, demandStep, type Settings } from "../settings";
import type { Personal } from "../views";

export function PayoffMatrix({
  s,
  lang,
  player,
  onPayoffChange,
}: {
  s: Extract<Settings, { mode: "coordination" }>;
  lang: Lang;
  player?: Personal;
  onPayoffChange?: (
    row: number,
    column: number,
    position: number,
    value: string,
  ) => void;
}) {
  const ruleId = useId();
  const t = (k: Parameters<typeof label>[1]) => label(lang, k);
  const names = displayChoices(lang, s).map(
    (name, i) => name.trim() || `${t("choose")} ${i + 1}`,
  );
  const result = player?.status === "settled" ? player : null;
  const ownRow = player?.position === "row";
  const selectedRow = (ownRow ? result?.choice : result?.otherChoice) ?? -1;
  const selectedColumn = (ownRow ? result?.otherChoice : result?.choice) ?? -1;
  const rowRole = t(ownRow ? "you" : "peer");
  const columnRole = t(ownRow ? "peer" : "you");
  return (
    <div className="ev-payoff-matrix">
      <div
        className="ev-scroll"
        tabIndex={player ? 0 : undefined}
        role={player ? "region" : undefined}
        aria-labelledby={player ? ruleId + "-caption" : undefined}
      >
        <table aria-describedby={ruleId}>
          <caption id={ruleId + "-caption"}>{t("matrix")}</caption>
          <thead>
            <tr>
              <th scope="col">
                {t("row")} / {t("column")}
              </th>
              {names.map((name, column) => (
                <th
                  scope="col"
                  key={column}
                  className={
                    column === selectedColumn ? "ev-matrix-axis" : undefined
                  }
                >
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {s.matrix.map((row, i) => (
              <tr key={i}>
                <th
                  scope="row"
                  className={i === selectedRow ? "ev-matrix-axis" : undefined}
                >
                  {names[i]}
                </th>
                {row.map((pair, j) => {
                  const realized = i === selectedRow && j === selectedColumn;
                  const breakdown = `${rowRole} ${pair[0]} · ${columnRole} ${pair[1]}`;
                  return (
                    <td
                      key={j}
                      className={realized ? "ev-matrix-result" : undefined}
                      aria-label={
                        realized
                          ? `${t("matrixResult")} · ${breakdown}`
                          : undefined
                      }
                    >
                      {onPayoffChange ? (
                        <span className="ev-payoff-pair">
                          <span aria-hidden="true">(</span>
                          {pair.map((value, position) => (
                            <Fragment key={position}>
                              <input
                                aria-label={[
                                  names[i],
                                  names[j],
                                  t(position === 0 ? "row" : "column"),
                                ].join(" / ")}
                                aria-describedby={`${ruleId}-format`}
                                required
                                maxLength={20}
                                size={Math.max(1, value.length)}
                                style={
                                  {
                                    "--payoff-width": `${value.length}ch`,
                                  } as CSSProperties
                                }
                                value={value}
                                onChange={(e) =>
                                  onPayoffChange(i, j, position, e.target.value)
                                }
                              />
                              <span aria-hidden="true">
                                {position === 0 ? "," : ")"}
                              </span>
                            </Fragment>
                          ))}
                        </span>
                      ) : player ? (
                        <span className="ev-matrix-cell">
                          <span className="ev-matrix-values">
                            ({pair.join(", ")})
                          </span>
                          <span className="ev-matrix-breakdown">
                            {breakdown}
                          </span>
                        </span>
                      ) : (
                        `(${pair.join(", ")})`
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p id={ruleId}>{t("matrixRule")}</p>
      {onPayoffChange && (
        <p id={`${ruleId}-format`} className="field-help">
          {t("payoffFormat")}
        </p>
      )}
    </div>
  );
}

export function PayoffRules({ s, lang }: { s: Settings; lang: Lang }) {
  const t = (k: Parameters<typeof label>[1]) => label(lang, k);
  if (s.mode === "coordination") return <PayoffMatrix s={s} lang={lang} />;
  return (
    <div className="ev-rules">
      <p>
        {t("total")} <b>{s.total}</b> · {t("choose")}{" "}
        <b>{s.options?.join(" / ") ?? "0–1"}</b>
      </p>
      <p>{t("demandRule")}</p>
    </div>
  );
}
export function Rules({ s, lang }: { s: Settings; lang: Lang }) {
  const t = (k: Parameters<typeof label>[1]) => label(lang, k);
  return (
    <section className="ev-rules">
      <h3>{t(s.mode)}</h3>
      <PayoffRules s={s} lang={lang} />
      {continuous(s) && <p>{sliderInstructions(lang, demandStep(s))}</p>}
      {s.mode === "demand" && <p>{t("fixed")}</p>}
      <p>{t("random")}</p>
      <p>{t("missing")}</p>
      <p>{t("private")}</p>
    </section>
  );
}
