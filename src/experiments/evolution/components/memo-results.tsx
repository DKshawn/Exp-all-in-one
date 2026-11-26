"use client";
import { useState } from "react";
import { displayChoices, label, type Key, type Lang } from "../locale";
import { roundedAmount } from "../numbers";
import type { View } from "../views";

export function MemoResults({
  view,
  lang,
}: {
  view: Extract<View, { role: "teacher" }>;
  lang: Lang;
}) {
  const [group, setGroup] = useState(1);
  const t = (k: Key) => label(lang, k);
  const names = displayChoices(lang, view.settings);
  const percent = new Intl.NumberFormat(lang, {
    style: "percent",
    maximumFractionDigits: 1,
  });
  return (
    <section className="panel ev-panel ev-analysis">
      <h2>{t("results")}</h2>
      <label className="field ev-filter">
        {t("group")}
        <select
          value={group}
          onChange={(e) => setGroup(Number(e.target.value))}
        >
          {view.sizes.map((_, i) => (
            <option key={i} value={i + 1}>
              {i + 1}
            </option>
          ))}
        </select>
      </label>
      <div
        className="ev-scroll"
        tabIndex={0}
        role="region"
        aria-label={t("results")}
      >
        <table aria-label={t("results")}>
          <thead>
            <tr>
              <th scope="col">{t("round")}</th>
              <th scope="col">{t("memoEligibleCount")}</th>
              <th scope="col">{t("responses")}</th>
              <th scope="col">{t("timeouts")}</th>
              <th scope="col">{t("memoSettledCount")}</th>
              <th scope="col">{t("share")}</th>
              <th scope="col">{t("earnings")}</th>
            </tr>
          </thead>
          <tbody>
            {view.history
              .filter((row) => row.group === group && row.memoStats)
              .reverse()
              .map((row) => {
                const { eligible, settledPlayers } = row.memoStats!;
                return (
                  <tr key={row.round}>
                    <th scope="row">{row.blockRound}</th>
                    <td>
                      {eligible}/{row.assigned}
                    </td>
                    <td>{row.submitted}</td>
                    <td>{row.timeouts}</td>
                    <td>
                      {settledPlayers}/{row.assigned}
                    </td>
                    <td>
                      {settledPlayers
                        ? row.counts.map((count, i) => (
                            <div className="ev-share" key={names[i]}>
                              <span>{names[i]}</span>
                              <b>{percent.format(count / settledPlayers)}</b>
                              <meter
                                max={settledPlayers}
                                value={count}
                                aria-label={names[i]}
                              />
                            </div>
                          ))
                        : "—"}
                    </td>
                    <td>{settledPlayers ? roundedAmount(row.total) : "—"}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
