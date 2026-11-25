import { useCallback, useEffect, useId, useRef, useState } from "react";
import { label, sliderInstructions, type Lang } from "../locale";
import {
  choiceStride,
  DEMAND_STEPS,
  demandLabel,
  demandStep,
  type Settings,
} from "../settings";

export function DemandDecision({
  settings,
  lang,
  busy,
  commit,
}: {
  settings: Extract<Settings, { mode: "demand" }>;
  lang: Lang;
  busy: boolean;
  commit: (choice: number) => void;
}) {
  const id = useId();
  const field = useRef<HTMLInputElement>(null);
  const focusRange = useRef(false);
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);
  const step = demandStep(settings);
  const stride = choiceStride(settings);
  const value = Number(draft);
  const thousandths = Math.round(value * DEMAND_STEPS);
  const choice =
    draft !== "" &&
    value >= 0 &&
    value <= 1 &&
    value === thousandths / DEMAND_STEPS &&
    thousandths % stride === 0
      ? thousandths
      : null;

  useEffect(() => {
    if (!busy && !window.matchMedia("(pointer: coarse)").matches)
      field.current?.focus({ preventScroll: true });
  }, [busy]);

  const rangeRef = useCallback((input: HTMLInputElement | null) => {
    if (input && focusRange.current) {
      focusRange.current = false;
      input.focus({ preventScroll: true });
    }
  }, []);

  function edit(next: string) {
    setDraft(next);
    setInvalid(false);
  }

  return (
    <form
      className="ev-demand"
      onSubmit={(e) => {
        e.preventDefault();
        if (busy) return;
        if (choice !== null) commit(choice);
        else if (draft !== "") setInvalid(true);
      }}
    >
      {choice === null ? (
        <button
          type="button"
          className="ev-demand-track"
          aria-label={label(lang, "chooseOnScale")}
          aria-describedby={id + "-help"}
          disabled={busy}
          onClick={(e) => {
            if (e.detail === 0) {
              field.current?.focus({ preventScroll: true });
              return;
            }
            const { left, width } = e.currentTarget.getBoundingClientRect();
            const fraction = Math.min(
              1,
              Math.max(0, (e.clientX - left) / width),
            );
            focusRange.current = true;
            edit(
              demandLabel(
                Math.round((fraction * DEMAND_STEPS) / stride) * stride,
              ),
            );
          }}
        />
      ) : (
        <input
          ref={rangeRef}
          type="range"
          min={0}
          max={1}
          step={step}
          value={demandLabel(choice)}
          disabled={busy}
          aria-label={label(lang, "demandAmount")}
          aria-describedby={id + "-help"}
          onChange={(e) => edit(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (!e.repeat) e.currentTarget.form?.requestSubmit();
            }
          }}
        />
      )}
      <div className="ev-demand-endpoints" aria-hidden="true">
        <span>0</span>
        <span>1</span>
      </div>
      <div className="ev-demand-entry">
        <label className="field" htmlFor={id}>
          {label(lang, "demandAmount")}
          <input
            ref={field}
            id={id}
            type="number"
            inputMode="decimal"
            min={0}
            max={1}
            step={step}
            value={draft}
            required
            disabled={busy}
            aria-invalid={invalid || undefined}
            aria-describedby={
              id + "-help" + (invalid ? " " + id + "-error" : "")
            }
            onChange={(e) => edit(e.currentTarget.value)}
            onInvalid={(e) => {
              e.preventDefault();
              setInvalid(true);
              e.currentTarget.focus();
            }}
            onKeyDown={(e) => {
              if (
                draft === "" &&
                (e.key === "ArrowUp" || e.key === "ArrowDown")
              )
                e.preventDefault();
            }}
          />
        </label>
        <button
          type="submit"
          className="button primary"
          disabled={busy || draft === ""}
        >
          {label(lang, "confirmDemand")}
        </button>
      </div>
      <p id={id + "-help"} className="field-help">
        {sliderInstructions(lang, step)}
      </p>
      {invalid && (
        <p id={id + "-error"} className="error-message" role="alert">
          {label(lang, "invalidDemand")}
        </p>
      )}
    </form>
  );
}
