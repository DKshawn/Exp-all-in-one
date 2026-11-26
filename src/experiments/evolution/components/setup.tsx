"use client";
import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, errorMessage } from "@/lib/client";
import { teacherRoomHref } from "@/lib/room-navigation";
import { MAX_ROOM_PARTICIPANTS } from "@/lib/participant-config";
import {
  defaults,
  demandStep,
  DEMAND_STEP_OPTIONS,
  SETUP_NUMBER_RANGES,
  settingsSchema,
  type DemandStep,
  type Settings,
  type Mode,
} from "../settings";
import { label, displayChoices, type Key, type Lang } from "../locale";
import { PayoffMatrix, PayoffRules } from "./rules";
import { useLanguage } from "./language";

const DEMO_PARTICIPANT_RANGE = [2, MAX_ROOM_PARTICIPANTS] as const;
const numberFields = Object.keys(
  SETUP_NUMBER_RANGES,
) as (keyof typeof SETUP_NUMBER_RANGES)[];

function NumberSetting({
  lang,
  name,
  bounds,
  value,
  onChange,
}: {
  lang: Lang;
  name: Key;
  bounds: readonly [number, number];
  value: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const hintId = `${id}-range`;
  const errorId = `${id}-error`;
  const [showError, setShowError] = useState(false);
  const [min, max] = bounds;
  const field = label(lang, name);
  const lower = min.toLocaleString(lang);
  const upper = max.toLocaleString(lang);
  let error = "";
  if (showError) {
    if (Number.isNaN(value)) error = label(lang, "numberRequired");
    else if (!Number.isInteger(value)) error = label(lang, "numberInteger");
    else if (value < min)
      error = label(lang, "numberTooSmall").replace("{limit}", lower);
    else if (value > max)
      error = label(lang, "numberTooLarge").replace("{limit}", upper);
    error = error.replace("{field}", field);
  }

  return (
    <div className="field">
      <label htmlFor={id}>{field}</label>
      <input
        id={id}
        name={name}
        type="number"
        required
        min={min}
        max={max}
        value={Number.isNaN(value) ? "" : value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${hintId} ${errorId}` : hintId}
        onBlur={() => setShowError(true)}
        onInvalid={() => setShowError(true)}
        onChange={(event) => {
          setShowError(false);
          onChange(event.currentTarget.valueAsNumber);
        }}
      />
      <span id={hintId} className="field-help">
        {label(lang, "inputRange")}
        {lower}–{upper}
      </span>
      {error && (
        <p id={errorId} className="error-message ev-input-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function useSetupDraft() {
  const [s, set] = useState(() => defaults("coordination")),
    [title, setTitle] = useState(""),
    [n, setN] = useState(6);
  const parsed = settingsSchema.safeParse(s);
  const validDemo =
    parsed.success &&
    Number.isInteger(n) &&
    n >= DEMO_PARTICIPANT_RANGE[0] &&
    n <= DEMO_PARTICIPANT_RANGE[1];
  return { s, set, title, setTitle, n, setN, parsed, validDemo };
}

export function EvolutionSetup({ ready }: { ready: boolean }) {
  const draft = useSetupDraft();
  return <SetupForm draft={draft} ready={ready} />;
}

export function SetupForm({
  draft,
  ready = true,
  onDemo,
}: {
  draft: ReturnType<typeof useSetupDraft>;
  ready?: boolean;
  onDemo?: (title: string, s: Settings, n: number) => void;
}) {
  const lang = useLanguage(),
    t = (k: Key) => label(lang, k),
    router = useRouter();
  const { s, set, title, setTitle, n, setN, parsed } = draft;
  const [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const demandStepId = useId();
  const names = displayChoices(lang, s);
  const otherIssues = parsed.success
    ? []
    : parsed.error.issues.filter(
        (issue) => !numberFields.some((field) => issue.path[0] === field),
      );
  const problem =
    otherIssues.length === 0
      ? ""
      : t(
          otherIssues.some((i) =>
            ["names", "matrix"].includes(String(i.path[0])),
          )
            ? "badMatrix"
            : "invalid",
        );
  async function create(e: FormEvent) {
    e.preventDefault();
    if (!parsed.success) return;
    const roomTitle = title.trim() || t("title");
    if (onDemo) {
      if (draft.validDemo) onDemo(roomTitle, parsed.data, n);
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
      <div className="ev-heading">
        <h1>{t("title")}</h1>
      </div>
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
        {numberFields.map((key) => (
          <NumberSetting
            key={key}
            lang={lang}
            name={key}
            value={s[key]}
            bounds={SETUP_NUMBER_RANGES[key]}
            onChange={(value) => set({ ...s, [key]: value })}
          />
        ))}
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
          <PayoffMatrix
            s={s}
            lang={lang}
            onPayoffChange={(row, column, position, value) => {
              const matrix = structuredClone(s.matrix);
              matrix[row][column][position] = value;
              set({ ...s, matrix });
            }}
          />
        </>
      ) : (
        <>
          <div className="field">
            <label htmlFor={demandStepId}>{t("demandStep")}</label>
            <select
              id={demandStepId}
              aria-describedby={`${demandStepId}-options`}
              value={demandStep(s)}
              onChange={(e) =>
                set({ ...s, demandStep: e.target.value as DemandStep })
              }
            >
              {DEMAND_STEP_OPTIONS.map((step) => (
                <option key={step} value={step}>
                  {step}
                </option>
              ))}
            </select>
            <span id={`${demandStepId}-options`} className="field-help">
              {t("inputOptions")}
              {DEMAND_STEP_OPTIONS.join(" / ")}
            </span>
          </div>
          <PayoffRules s={s} lang={lang} />
        </>
      )}
      {problem && (
        <p className="error-message" role="alert">
          {problem}
        </p>
      )}
      {onDemo ? (
        <NumberSetting
          lang={lang}
          name="demoSize"
          value={n}
          bounds={DEMO_PARTICIPANT_RANGE}
          onChange={setN}
        />
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
        disabled={busy || !ready || !!problem}
        className="button primary full"
      >
        {t(onDemo ? "demoCreate" : "create")}
      </button>
    </form>
  );
}
