"use client";
import { label, displayChoices, type Lang } from "../locale";
import { choices, type Settings } from "../settings";
export function PayoffRules({ s, lang }: { s: Settings; lang: Lang }) {
  const t = (k: Parameters<typeof label>[1]) => label(lang, k),
    names = displayChoices(lang, s);
  return (
    <div className="ev-rules ev-payoff-rules">
      {s.mode === "coordination" ? (
        <>
          <p>{t("matrixRule")}</p>
          <div className="ev-scroll">
            <table>
              <caption>{t("matrix")}</caption>
              <thead>
                <tr>
                  <th>
                    {t("row")} / {t("column")}
                  </th>
                  {names.map((x, i) => (
                    <th key={i}>{x}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.matrix.map((row, i) => (
                  <tr key={i}>
                    <th>{names[i]}</th>
                    {row.map((p, j) => (
                      <td key={j}>({p.join(", ")})</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <p>
            {t("total")} <b>{s.total}</b> · {t("choose")}{" "}
            <b>{choices(s).join(" / ")}</b>
          </p>
          <p>{t("demandRule")}</p>
        </>
      )}
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
