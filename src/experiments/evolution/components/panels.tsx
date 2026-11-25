"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { CopyJoinLinkButton } from "@/components/copy-join-link-button";
import { StudentWaitingCard } from "@/components/student-waiting-card";
import { StudyDetailDialog } from "@/experiments/double-auction/components/study-detail-dialog";
import { studentJoinHref } from "@/lib/room-navigation";
import {
  label,
  displayChoices,
  sliderInstructions,
  type Key,
  type Lang,
} from "../locale";
import type { Action } from "../engine";
import type { View, Personal } from "../views";
import { Admission, SessionOverview } from "./session-controls";
import { PayoffMatrix, PayoffRules, Rules } from "./rules";
import { continuous, DEMAND_STEPS, demandLabel, demandStep } from "../settings";

type Props = {
  view: View;
  lang: Lang;
  busy: boolean;
  now: number;
  act: (action: Action) => void | Promise<void>;
  loadHistory?: (before: number) => Promise<View>;
  downloads?: React.ReactNode;
};
function Decision({
  view,
  lang,
  busy,
  act,
  selected,
}: {
  view: Extract<View, { role: "student" }>;
  lang: Lang;
  busy: boolean;
  act: Props["act"];
  selected: number | null;
}) {
  const [value, setValue] = useState(DEMAND_STEPS / 2);
  const slider = useRef<HTMLInputElement>(null);
  const id = useId();
  useEffect(() => {
    if (!busy) slider.current?.focus({ preventScroll: true });
  }, [busy]);
  const options = displayChoices(lang, view.settings);
  const commit = (choice: number) => {
    if (!busy) void act({ kind: "choose", round: view.round, choice });
  };
  if (continuous(view.settings)) {
    const step = demandStep(view.settings);
    return (
      <div className="ev-demand">
        <div className="ev-heading">
          <label htmlFor={id}>{label(lang, "demandAmount")}</label>
          <output htmlFor={id} aria-live="off">
            {demandLabel(value)}
          </output>
        </div>
        <input
          ref={slider}
          id={id}
          type="range"
          min={0}
          max={1}
          step={step}
          value={demandLabel(value)}
          disabled={busy}
          aria-describedby={id + "-help"}
          onChange={(e) =>
            setValue(Math.round(e.currentTarget.valueAsNumber * DEMAND_STEPS))
          }
          onPointerUp={(e) => {
            if (e.isPrimary && e.button === 0)
              commit(Math.round(e.currentTarget.valueAsNumber * DEMAND_STEPS));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.repeat) {
              e.preventDefault();
              commit(value);
            }
          }}
        />
        <div className="ev-demand-endpoints" aria-hidden="true">
          <span>0</span>
          <span>1</span>
        </div>
        <p id={id + "-help"} className="field-help">
          {sliderInstructions(lang, step)}
        </p>
      </div>
    );
  }
  return (
    <div className="ev-decision">
      <fieldset
        aria-label={
          view.settings.mode === "coordination"
            ? label(lang, "choose")
            : undefined
        }
      >
        {view.settings.mode !== "coordination" && (
          <legend>{label(lang, "choose")}</legend>
        )}
        <div className="ev-options">
          {options.map((c, i) => (
            <button
              type="button"
              className={"button " + (i === selected ? "primary" : "secondary")}
              aria-pressed={i === selected}
              key={i}
              disabled={busy}
              onClick={() => commit(i)}
            >
              {c}
            </button>
          ))}
        </div>
      </fieldset>
    </div>
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
  const name = (c: number | null) =>
    c === null ? "—" : continuous(view.settings) ? demandLabel(c) : options[c];
  return (
    <div
      className="ev-scroll ev-history-scroll"
      tabIndex={0}
      role="region"
      aria-label={t("history")}
    >
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
          {!rows.length && (
            <tr>
              <td colSpan={7}>{t("empty")}</td>
            </tr>
          )}
          {rows
            .slice()
            .reverse()
            .map((x) => (
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
  controls,
}: {
  view: Extract<View, { role: "teacher" }>;
  lang: Lang;
  controls: ReactNode;
}) {
  const t = (k: Key) => label(lang, k),
    [group, setGroup] = useState(1),
    names = displayChoices(lang, view.settings),
    demand = view.settings.mode === "demand",
    slider = continuous(view.settings);
  const bands = Array.from(
    { length: 10 },
    (_, i) => `${i / 10}–${i === 9 ? 1 : ((i + 1) * 100 - 1) / DEMAND_STEPS}`,
  );
  function shares(counts: number[]) {
    const n = counts.reduce((a, b) => a + b, 0);
    return counts.map((v, i) => (
      <div className="ev-share" key={i}>
        <span>{slider ? bands[i] : names[i]}</span>{" "}
        <b>{n ? Math.round((1000 * v) / n) / 10 + "%" : "—"}</b>
        {n > 0 && (
          <meter
            min={0}
            max={n}
            value={v}
            aria-label={slider ? bands[i] : names[i]}
          />
        )}
      </div>
    ));
  }
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
              {!slider && <th>{t("pair")}</th>}
              <th>{t("settledCount")}</th>
              <th>{t(demand ? "rateDemand" : "rateCoord")}</th>
              <th>{t("earnings")}</th>
              <th>{t("byes")}</th>
              <th>{t("timeouts")}</th>
            </tr>
          </thead>
          <tbody>
            {view.history
              .slice()
              .reverse()
              .filter((x) => x.group === group)
              .map((x) => (
                <tr key={x.round}>
                  <th>{x.round}</th>
                  <td>
                    {x.submitted}/{x.paired}
                  </td>
                  <td>{shares(x.a ?? x.counts)}</td>
                  {x.b && <td>{shares(x.b)}</td>}
                  {!slider && (
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
                  )}
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
      {controls}
    </section>
  );
}
export function Panels({
  view: v,
  lang,
  busy,
  now,
  act,
  downloads,
  loadHistory,
}: Props) {
  const t = (k: Key) => label(lang, k),
    waiting = v.round === 0,
    demand = v.settings.mode === "demand";
  const mine = v.role === "student" ? v.current : null,
    names = displayChoices(lang, v.settings);
  const coordination = v.settings.mode === "coordination";
  const name = (c: number | null) =>
    c === null ? null : continuous(v.settings) ? demandLabel(c) : names[c];
  const [page, setPage] = useState<View | null>(null);
  const [historyPending, setHistoryPending] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const oldest = (page ?? v).history[0]?.round ?? 1;
  const controls = loadHistory && (oldest > 1 || page) && (
    <div className="ev-options">
      {oldest > 1 && (
        <button
          type="button"
          className="button secondary small-button"
          disabled={historyPending}
          onClick={async () => {
            setHistoryPending(true);
            setHistoryError(false);
            try {
              const result = await loadHistory(oldest);
              if (result.role === "teacher")
                result.history = result.history.filter(
                  (row) => row.round < oldest,
                );
              setPage(result);
            } catch {
              setHistoryError(true);
            } finally {
              setHistoryPending(false);
            }
          }}
        >
          {t("older")}
        </button>
      )}
      {page && (
        <button
          type="button"
          className="button secondary small-button"
          disabled={historyPending}
          onClick={() => {
            setPage(null);
            setHistoryError(false);
          }}
        >
          {t("latest")}
        </button>
      )}
      {historyError && <span role="alert">{t("unavailable")}</span>}
    </div>
  );
  return (
    <main className="ev ev-room" lang={lang}>
      <div className="ev-heading">
        <h1>{v.title}</h1>
        <span className="ev-code">
          {t("code")} <b>{v.code}</b>
        </span>
      </div>
      {waiting ? (
        <section className="ev-heading">
          <h2>{t(v.phase)}</h2>
          {v.role === "teacher" && (
            <span>
              {t("count")} <b>{v.count}</b>
            </span>
          )}
        </section>
      ) : (
        <SessionOverview view={v} lang={lang} now={now} busy={busy} act={act} />
      )}
      {v.role === "teacher" ? (
        <>
          {waiting ? (
            <section className="panel ev-panel">
              <div className="ev-heading">
                <h2>{t("roster")}</h2>
                {v.code !== "DEMO" && (
                  <CopyJoinLinkButton
                    href={studentJoinHref(v.code)}
                    lang={lang}
                  />
                )}
              </div>
              <Admission view={v} lang={lang} now={now} busy={busy} act={act} />
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
                      {v.phase === "ready" && <th>{t("student")}</th>}
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
                        {v.phase === "ready" && (
                          <td className="ev-roster-seats">
                            {v.seats
                              .filter((p) => p.group === i + 1)
                              .map((p) => (
                                <span key={p.number}>
                                  #{p.number} {p.side}
                                </span>
                              ))}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : (
            <Analysis
              view={page?.role === "teacher" ? page : v}
              lang={lang}
              controls={controls}
            />
          )}
          <div className="ev-options">{downloads}</div>
        </>
      ) : waiting ? (
        <StudentWaitingCard assigned={v.phase === "ready"}>
          <h2>{t(v.phase)}</h2>
          <p>
            {v.group
              ? t("group") + " " + v.group + (v.side ? " · " + v.side : "")
              : t("random")}
          </p>
          {v.admission.deadline !== null || v.admission.remaining !== null ? (
            <strong role="timer">
              {Math.ceil(
                Math.max(
                  0,
                  v.admission.deadline === null
                    ? v.admission.remaining!
                    : v.admission.deadline - now,
                ) / 1000,
              )}{" "}
              {t("sec")}
            </strong>
          ) : null}
          <StudyDetailDialog
            label={t("rules")}
            closeLabel={t("dismiss")}
            className="ev-rules-dialog"
            triggerClassName="button secondary small-button"
          >
            <Rules lang={lang} s={v.settings} />
          </StudyDetailDialog>
        </StudentWaitingCard>
      ) : (
        mine && (
          <>
            <div className="ev-account">
              {[
                ["sum", v.total],
                ["group", v.group],
                ...(v.side
                  ? [["side", v.side]]
                  : mine.position
                    ? [["position", t(mine.position)]]
                    : []),
              ].map(([k, value]) => (
                <div key={k}>
                  <span>{t(k as Key)}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <div
              className={
                "ev-workbench" +
                (v.history.length ? " has-history" : "") +
                (coordination ? " ev-workbench-coordination" : "")
              }
            >
              <div className="ev-play-column">
                <section className="panel ev-panel ev-task">
                  <h2>{t(mine.status)}</h2>
                  {(coordination || mine.status === "choosing") && (
                    <Decision
                      key={v.round}
                      view={v}
                      lang={lang}
                      selected={mine.choice}
                      busy={
                        mine.status !== "choosing" ||
                        busy ||
                        v.pausedAt !== null ||
                        now >= (v.deadline ?? Infinity)
                      }
                      act={act}
                    />
                  )}
                  {(coordination || mine.status !== "choosing") && (
                    <dl className="ev-payoffs">
                      {(
                        [
                          ["mine", name(mine.choice)],
                          ["other", name(mine.otherChoice)],
                          ...(!coordination
                            ? ([
                                ["pay", mine.pay],
                                ["otherPay", mine.otherPay],
                              ] as const)
                            : []),
                        ] as const
                      ).map(([k, val]) => (
                        <div key={k}>
                          <dt>{t(k)}</dt>
                          <dd>{val ?? "—"}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </section>
                {v.settings.mode === "coordination" ? (
                  <section className="panel ev-panel ev-reference">
                    <PayoffMatrix s={v.settings} lang={lang} player={mine} />
                  </section>
                ) : (
                  mine.status === "choosing" && (
                    <section className="panel ev-panel ev-reference">
                      <PayoffRules s={v.settings} lang={lang} />
                    </section>
                  )
                )}
              </div>
              <section className="panel ev-panel ev-history">
                <History
                  view={v}
                  lang={lang}
                  rows={
                    page?.role === "student"
                      ? page.history
                      : mine.status === "choosing" ||
                          mine.status === "submitted"
                        ? v.history
                        : [...v.history, mine]
                  }
                />
                {controls}
              </section>
            </div>
          </>
        )
      )}
    </main>
  );
}
