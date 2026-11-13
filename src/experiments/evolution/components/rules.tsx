"use client";
import { Fragment, useId } from "react";
import { label, displayChoices, type Lang } from "../locale";
import type { Settings } from "../settings";

export function PayoffMatrix({
  s,
  lang,
  onPayoffChange,
}: {
  s: Extract<Settings, { mode: "coordination" }>;
  lang: Lang;
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
  return (
    <div className="ev-payoff-matrix">
      <div className="ev-scroll">
        <table aria-describedby={ruleId}>
          <caption>{t("matrix")}</caption>
          <thead>
            <tr>
              <th scope="col">
                {t("row")} / {t("column")}
              </th>
              {names.map((name, column) => (
                <th scope="col" key={column}>
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {s.matrix.map((row, i) => (
              <tr key={i}>
                <th scope="row">{names[i]}</th>
                {row.map((pair, j) => (
                  <td key={j}>
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
                              required
                              maxLength={20}
                              size={Math.max(1, value.length)}
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
                    ) : (
                      `(${pair.join(", ")})`
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p id={ruleId}>{t("matrixRule")}</p>
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
        <b>{s.options.join(" / ")}</b>
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
      {s.mode === "demand" && <p>{t("fixed")}</p>}
      <p>{t("random")}</p>
      <p>{t("missing")}</p>
      <p>{t("private")}</p>
    </section>
  );
}
