"use client";
import { useMemo, useState } from "react";
import { displayChoices, label, type Key, type Lang } from "../locale";
import { isNeighborMemo } from "../settings";
import { roundedAmount } from "../numbers";
import { memoRoundReports } from "../memo-reports";
import type { View } from "../views";

export function MemoResults({
  view,
  lang,
}: {
  view: Extract<View, { role: "teacher" }>;
  lang: Lang;
}) {
  const [group, setGroup] = useState(0);
  const rows = useMemo(
    () => memoRoundReports(view.history, group),
    [view.history, group],
  );
  const t = (k: Key) => label(lang, k);
  const neighbors = isNeighborMemo(view.settings);
  const names = displayChoices(lang, view.settings);
  const percent = new Intl.NumberFormat(lang, {
    style: "percent",
    maximumFractionDigits: 1,
  });
  return (
    <section className="panel ev-panel ev-analysis ev-memo-results">
      <h2>{t("results")}</h2>
      {neighbors ? (
        <p>{t("h5Pending")}</p>
      ) : (
        <label className="field ev-filter">
          {t("group")}
          <select
            value={group}
            onChange={(e) => setGroup(Number(e.target.value))}
          >
            <option value={0}>{t("memoAllGroups")}</option>
            {view.sizes.map((_, i) => (
              <option key={i} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
      )}
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
              <th scope="col">
                {t(neighbors ? "h5Finalized" : "memoSettledCount")}
              </th>
              <th scope="col">{t("share")}</th>
              <th scope="col">
                {names[0]} → {names[1]}
              </th>
              <th scope="col">
                {names[1]} → {names[0]}
              </th>
              {!neighbors && <th scope="col">{t("earnings")}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const { eligible, settledPlayers, memoTransitions } = row;
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
                  {[0, 1].map((strategy) => {
                    const previous = memoTransitions?.previous[strategy] ?? 0;
                    const switched = memoTransitions?.switched[strategy] ?? 0;
                    return (
                      <td key={strategy}>
                        {previous > 0
                          ? `${percent.format(switched / previous)} (${switched}/${previous})`
                          : "—"}
                      </td>
                    );
                  })}
                  {!neighbors && (
                    <td>
                      {settledPlayers && row.total !== null
                        ? roundedAmount(row.total)
                        : "—"}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
