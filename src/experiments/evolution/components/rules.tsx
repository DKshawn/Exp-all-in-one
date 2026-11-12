"use client";
import { useSyncExternalStore } from "react";
import { label, displayChoices, type Lang } from "../locale";
import { choices, type Settings } from "../settings";
const storageKey = "evolution-language";
function subscribe(fn: () => void) {
  window.addEventListener("storage", fn);
  window.addEventListener(storageKey, fn);
  return () => {
    window.removeEventListener("storage", fn);
    window.removeEventListener(storageKey, fn);
  };
}
function language(): Lang {
  const v = localStorage.getItem(storageKey);
  return v === "en" || v === "zh-CN" ? v : "ja";
}
export function useLanguage() {
  return useSyncExternalStore(subscribe, language, () => "ja" as Lang);
}
export function Language({ lang }: { lang: Lang }) {
  return (
    <select
      className="ev-lang"
      aria-label={label(lang, "language")}
      value={lang}
      onChange={(e) => {
        localStorage.setItem(storageKey, e.target.value);
        window.dispatchEvent(new Event(storageKey));
      }}
    >
      <option value="ja">日本語</option>
      <option value="zh-CN">中文</option>
      <option value="en">English</option>
    </select>
  );
}
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
