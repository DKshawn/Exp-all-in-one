"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, errorMessage } from "@/lib/client";
import { teacherRoomHref } from "@/lib/room-navigation";
import {
  defaults,
  settingsSchema,
  type Settings,
  type Mode,
} from "../settings";
import { label, displayChoices, type Key } from "../locale";
import { Language, Rules, useLanguage } from "./rules";

export function EvolutionSetup({
  ready = true,
  onDemo,
}: {
  ready?: boolean;
  onDemo?: (title: string, s: Settings, n: number) => void;
}) {
  const lang = useLanguage(),
    t = (k: Key) => label(lang, k),
    router = useRouter();
  const [s, set] = useState(() => defaults("coordination")),
    [title, setTitle] = useState(""),
    [password, setPassword] = useState(""),
    [text, setText] = useState("1/3, 1/2, 2/3"),
    [n, setN] = useState(5),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const names = displayChoices(lang, s);
  const candidate =
    s.mode === "demand"
      ? { ...s, options: text.split(/[,，]/).map((x) => x.trim()) }
      : s;
  const parsed = settingsSchema.safeParse(candidate);
  const problem = parsed.success
    ? ""
    : t(
        parsed.error.issues.some((i) =>
          ["names", "matrix"].includes(String(i.path[0])),
        )
          ? "badMatrix"
          : parsed.error.issues.some((i) =>
                ["options", "total"].includes(String(i.path[0])),
              )
            ? "badDemand"
            : "invalid",
      );
  async function create(e: FormEvent) {
    e.preventDefault();
    if (!parsed.success) return;
    const roomTitle = title.trim() || t("title");
    if (onDemo) {
      onDemo(roomTitle, parsed.data, n);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { code } = await api<{ code: string }>("/api/evolution/rooms", {
        title: roomTitle,
        password,
        settings: parsed.data,
      });
      router.push(teacherRoomHref(code));
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <form lang={lang} className="emh-create ev ev-setup" onSubmit={create}>
      <Language lang={lang} />
      <h1>{t("title")}</h1>
      <label className="field">
        {t("name")}
        <input
          value={title}
          placeholder={t("title")}
          maxLength={60}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="field">
        {t("mode")}
        <select
          value={s.mode}
          onChange={(e) => {
            const next = defaults(e.target.value as Mode);
            set({
              ...next,
              groups: s.groups,
              seconds: s.seconds,
              rounds: s.rounds,
              feedbackSeconds: s.feedbackSeconds,
            });
          }}
        >
          <option value="coordination">{t("coordination")}</option>
          <option value="demand">{t("demand")}</option>
        </select>
      </label>
      <div className="ev-fields">
        {(["groups", "rounds", "seconds", "feedbackSeconds"] as const).map(
          (key, i) => (
            <label className="field" key={key}>
              {t(key)}
              <input
                type="number"
                required
                min={[1, 1, 5, 3][i]}
                max={[32, 100, 600, 120][i]}
                value={s[key] || ""}
                onChange={(e) => set({ ...s, [key]: Number(e.target.value) })}
              />
            </label>
          ),
        )}
      </div>
      {s.mode === "coordination" ? (
        <>
          <fieldset>
            <legend>{t("names")}</legend>
            <div className="ev-fields">
              {names.map((x, i) => (
                <label key={i} className="field">
                  {t("choose")} {i + 1}
                  <input
                    value={x}
                    maxLength={16}
                    required
                    onChange={(e) => {
                      const updated = [...names] as typeof s.names;
                      updated[i] = e.target.value;
                      set({ ...s, names: updated });
                    }}
                  />
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>{t("matrix")}</legend>
            <p>{t("matrixRule")}</p>
            {s.matrix.flatMap((row, i) =>
              row.map((p, j) => (
                <div className="ev-cell" key={i + "," + j}>
                  <strong>
                    {names[i]} / {names[j]}
                  </strong>
                  <div className="ev-fields">
                    {p.map((v, k) => (
                      <label key={k} className="field">
                        {t(k === 0 ? "row" : "column")}
                        <input
                          required
                          aria-label={[
                            names[i],
                            names[j],
                            t(k === 0 ? "row" : "column"),
                          ].join(" / ")}
                          maxLength={20}
                          value={v}
                          onChange={(e) => {
                            const matrix = structuredClone(s.matrix);
                            matrix[i][j][k] = e.target.value;
                            set({ ...s, matrix });
                          }}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )),
            )}
          </fieldset>
        </>
      ) : (
        <>
          <label className="field">
            {t("total")}
            <input
              value={s.total}
              required
              maxLength={20}
              onChange={(e) => set({ ...s, total: e.target.value })}
            />
          </label>
          <label className="field">
            {t("options")}
            <input
              value={text}
              required
              maxLength={264}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
        </>
      )}
      {parsed.success ? (
        <details open>
          <summary className="button secondary">{t("preview")}</summary>
          <Rules s={parsed.data} lang={lang} />
        </details>
      ) : (
        <p className="error-message" role="alert">
          {problem}
        </p>
      )}
      {onDemo ? (
        <label className="field">
          {t("demoSize")}
          <input
            type="number"
            min="2"
            max="128"
            required
            value={n || ""}
            onChange={(e) => setN(Number(e.target.value))}
          />
        </label>
      ) : (
        <label className="field">
          {t("password")}
          <input
            type="password"
            required
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
      )}
      {(!ready || error) && (
        <p className="error-message" role="alert">
          {error || t("unavailable")}
        </p>
      )}
      <button
        disabled={busy || !ready || !parsed.success}
        className="button primary full"
      >
        {t(onDemo ? "demoCreate" : "create")}
      </button>
    </form>
  );
}
