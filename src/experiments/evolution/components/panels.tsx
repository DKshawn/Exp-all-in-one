"use client";
import { useState } from "react";
import { StudentWaitingCard } from "@/components/student-waiting-card";
import Link from "next/link";
import { label, displayChoices, type Key, type Lang } from "../locale";
import type { Action } from "../engine";
import type { View, Personal } from "../views";
import { Language, Rules } from "./rules";

type Props = {
  view: View;
  lang: Lang;
  busy: boolean;
  now: number;
  act: (action: Action) => void;
  downloads?: React.ReactNode;
};
function Decision({
  view,
  lang,
  busy,
  act,
}: {
  view: Extract<View, { role: "student" }>;
  lang: Lang;
  busy: boolean;
  act: Props["act"];
}) {
  const [selected, setSelected] = useState<number | null>(null),
    options = displayChoices(lang, view.settings);
  return (
    <form
      className="ev-decision"
      onSubmit={(e) => {
        e.preventDefault();
        if (selected !== null)
          act({ kind: "choose", round: view.round, choice: selected });
      }}
    >
      <fieldset>
        <legend>{label(lang, "choose")}</legend>
        <div className="ev-options">
          {options.map((c, i) => (
            <label
              className={"button " + (selected === i ? "primary" : "secondary")}
              key={i}
            >
              <input
                type="radio"
                name="choice"
                value={i}
                checked={selected === i}
                disabled={busy}
                onChange={() => setSelected(i)}
              />
              {c}
            </label>
          ))}
        </div>
      </fieldset>
      <button className="button primary" disabled={busy || selected === null}>
        {label(lang, "submit")}
      </button>
    </form>
  );
}
function History({
  rows,
  view,
  lang,
}: {
  rows: Personal[];
  view: View;
  lang: Lang;
}) {
  const t = (k: Key) => label(lang, k),
    options = displayChoices(lang, view.settings);
  const name = (c: number | null) => (c === null ? "—" : options[c]);
  return (
    <div className="ev-scroll">
      <table>
        <caption>{t("history")}</caption>
        <thead>
          <tr>
            {(
              [
                "round",
                "status",
                "mine",
                "other",
                "pay",
                "otherPay",
                "sum",
              ] as const
            ).map((k) => (
              <th key={k}>{t(k)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.toReversed().map((x) => (
            <tr key={x.round}>
              <th>{x.round}</th>
              <td>{t(x.status)}</td>
              <td>{name(x.choice)}</td>
              <td>{name(x.otherChoice)}</td>
              <td>{x.pay ?? "—"}</td>
              <td>{x.otherPay ?? "—"}</td>
              <td>{x.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Analysis({
  view,
  lang,
}: {
  view: Extract<View, { role: "teacher" }>;
  lang: Lang;
}) {
  const t = (k: Key) => label(lang, k),
    [group, setGroup] = useState(1),
    names = displayChoices(lang, view.settings),
    demand = view.settings.mode === "demand";
  function shares(counts: number[]) {
    const n = counts.reduce((a, b) => a + b, 0);
    return counts.map((v, i) => (
      <div className="ev-share" key={i}>
        <span>{names[i]}</span>{" "}
        <b>{n ? Math.round((1000 * v) / n) / 10 + "%" : "—"}</b>
        {n > 0 && <meter min={0} max={n} value={v} aria-label={names[i]} />}
      </div>
    ));
  }
  return (
    <section className="panel ev-panel">
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
      <div className="ev-scroll">
        <table>
          <thead>
            <tr>
              <th>{t("round")}</th>
              <th>{t("responses")}</th>
              <th>
                {t("share")}
                {demand ? " · A" : ""}
              </th>
              {demand && <th>{t("share")} · B</th>}
              <th>{t("pair")}</th>
              <th>{t("settledCount")}</th>
              <th>{t(demand ? "rateDemand" : "rateCoord")}</th>
              <th>{t("earnings")}</th>
              <th>{t("byes")}</th>
              <th>{t("timeouts")}</th>
            </tr>
          </thead>
          <tbody>
            {view.history
              .filter((x) => x.group === group)
              .map((x) => (
                <tr key={x.round}>
                  <th>{x.round}</th>
                  <td>
                    {x.submitted}/{x.paired}
                  </td>
                  <td>{shares(x.a ?? x.counts)}</td>
                  {x.b && <td>{shares(x.b)}</td>}
                  <td>
                    {Object.entries(x.pairs).map(([pair, n]) => (
                      <div key={pair}>
                        {pair
                          .split(",")
                          .map((i) => names[Number(i)])
                          .join(" / ")}{" "}
                        × {n}
                      </div>
                    ))}
                    {!x.settled && "—"}
                  </td>
                  <td>{x.settled}</td>
                  <td>
                    {x.settled
                      ? (
                          (100 *
                            (demand
                              ? x.settled - x.agreements
                              : x.agreements)) /
                          x.settled
                        ).toFixed(1) + "%"
                      : "—"}
                  </td>
                  <td>{x.settled ? x.total : "—"}</td>
                  <td>{x.byes}</td>
                  <td>{x.timeouts}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
export function Panels({ view: v, lang, busy, now, act, downloads }: Props) {
  const t = (k: Key) => label(lang, k),
    demand = v.settings.mode === "demand";
  const mine = v.role === "student" ? v.current : null;
  return (
    <main className="ev ev-room" lang={lang}>
      <div className="ev-heading">
        <h1>{v.title}</h1>
        <Language lang={lang} />
      </div>
      <section className="panel ev-panel">
        <div className="ev-heading">
          <h2>{t(v.phase)}</h2>
          <span className="ev-code">
            {t("code")} <b>{v.code}</b>
          </span>
        </div>
        <div className="ev-meta">
          <span>
            {t("round")}{" "}
            <b>
              {v.round} / {v.settings.rounds}
            </b>
          </span>
          {v.deadline !== null && (
            <span>
              {t(v.phase === "feedback" ? "next" : "timeLeft")}{" "}
              <b>
                {Math.max(0, Math.ceil((v.deadline - now) / 1000))} {t("sec")}
              </b>
            </span>
          )}
          {v.role === "teacher" ? (
            <span>
              {t("count")} <b>{v.count}</b>
            </span>
          ) : (
            <>
              <span>
                {t("sum")} <b>{v.total}</b>
              </span>
              {v.group > 0 && (
                <span>
                  {t("group")} <b>{v.group}</b>
                </span>
              )}
              {v.side && (
                <span>
                  {t("side")} <b>{v.side}</b>
                </span>
              )}
              {mine?.position && !demand && (
                <span>
                  <b>{t(mine.position)}</b>
                </span>
              )}
            </>
          )}
        </div>
      </section>
      {v.role === "teacher" ? (
        <>
          {(v.phase === "open" || v.phase === "ready") && (
            <section className="panel ev-panel">
              <h2>{t("preview")}</h2>
              <div className="ev-meta">
                <span>
                  {t("seconds")} <b>{v.settings.seconds}</b>
                </span>
                <span>
                  {t("feedbackSeconds")} <b>{v.settings.feedbackSeconds}</b>
                </span>
                {v.code !== "DEMO" && (
                  <Link
                    className="button secondary small-button"
                    target="_blank"
                    href={"/?code=" + v.code}
                  >
                    {t("invite")}
                  </Link>
                )}
              </div>
              <div className="ev-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{t("group")}</th>
                      <th>{t("size")}</th>
                      {demand && (
                        <>
                          <th>A</th>
                          <th>B</th>
                        </>
                      )}
                      <th>{t("byes")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {v.sizes.map((n, i) => (
                      <tr key={i}>
                        <th>{i + 1}</th>
                        <td>{n}</td>
                        {demand && (
                          <>
                            <td>{v.phase === "open" ? "—" : v.sides[i]}</td>
                            <td>{v.phase === "open" ? "—" : n - v.sides[i]}</td>
                          </>
                        )}
                        <td>{n % 2}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {v.sizes.some((n) => n < 2) && <p role="status">{t("tooFew")}</p>}
              <button
                className="button primary"
                disabled={busy || v.sizes.some((n) => n < 2)}
                onClick={() =>
                  act({ kind: v.phase === "open" ? "close" : "start" })
                }
              >
                {t(v.phase === "open" ? "close" : "start")}
              </button>
            </section>
          )}
          {v.round > 0 && <Analysis view={v} lang={lang} />}
          <div className="ev-options">{downloads}</div>
        </>
      ) : (
        <>
          {!mine && (
            <StudentWaitingCard assigned={v.phase === "ready"}>
              <h2>{t(v.phase === "ready" ? "ready" : "open")}</h2>
              <p>{t("random")}</p>
            </StudentWaitingCard>
          )}
          {mine && (
            <section className="panel ev-panel">
              <h2>{t(mine.status)}</h2>
              {mine.status === "choosing" ? (
                <Decision
                  key={v.round}
                  view={v}
                  lang={lang}
                  busy={busy || now >= (v.deadline ?? Infinity)}
                  act={act}
                />
              ) : (
                <dl className="ev-payoffs">
                  {(
                    [
                      [
                        "mine",
                        mine.choice === null
                          ? null
                          : displayChoices(lang, v.settings)[mine.choice],
                      ],
                      [
                        "other",
                        mine.otherChoice === null
                          ? null
                          : displayChoices(lang, v.settings)[mine.otherChoice],
                      ],
                      ["pay", mine.pay],
                      ["otherPay", mine.otherPay],
                    ] as const
                  ).map(([k, x]) => (
                    <div key={k}>
                      <dt>{t(k)}</dt>
                      <dd>{x ?? "—"}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>
          )}
        </>
      )}
      <details className="panel ev-panel" open>
        <summary className="button secondary">{t("rules")}</summary>
        <Rules lang={lang} s={v.settings} />
      </details>
      {v.role === "student" &&
        (v.history.length > 0 || v.phase === "finished") && (
          <section className="panel ev-panel">
            <History
              rows={
                mine && v.phase === "finished"
                  ? [...v.history, mine]
                  : v.history
              }
              view={v}
              lang={lang}
            />
          </section>
        )}
    </main>
  );
}
