import { useEffect, useId, useRef, useState } from "react";
import { label, sliderInstructions, type Lang } from "../locale";
import {
  DEMAND_STEPS,
  demandLabel,
  demandStep,
  type Settings,
} from "../settings";

export function DemandDecision({
  settings,
  lang,
  busy,
  initialChoice,
  saveDraft,
  commit,
}: {
  settings: Extract<Settings, { mode: "demand" }>;
  lang: Lang;
  busy: boolean;
  initialChoice: number | null;
  saveDraft: (choice: number) => void | Promise<void>;
  commit: (choice: number) => void;
}) {
  const id = useId();
  const slider = useRef<HTMLInputElement>(null);
  const initialPointer = useRef<number | null>(null);
  const pending = useRef<number | null>(null);
  const saving = useRef(false);
  const [choice, setChoice] = useState(initialChoice);
  const [saveFailed, setSaveFailed] = useState(false);
  const step = demandStep(settings);
  const value = choice === null ? null : demandLabel(choice);

  useEffect(() => {
    if (!busy && !window.matchMedia("(pointer: coarse)").matches)
      slider.current?.focus({ preventScroll: true });
  }, [busy]);
  useEffect(
    () => () => {
      pending.current = null;
    },
    [],
  );

  async function select(next: number) {
    setChoice(next);
    pending.current = next;
    if (saving.current) return;
    saving.current = true;
    // Send only the latest change queued while a draft is being saved.
    while (pending.current !== null) {
      const draft = pending.current;
      pending.current = null;
      try {
        await saveDraft(draft);
        setSaveFailed(false);
      } catch {
        setSaveFailed(true);
      }
    }
    saving.current = false;
  }

  return (
    <form
      className="ev-demand"
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy && choice !== null) commit(choice);
      }}
    >
      <div className="ev-demand-current">
        <label htmlFor={id}>{label(lang, "demandAmount")}</label>
        <span aria-hidden="true">{value ?? "—"}</span>
      </div>
      <input
        ref={slider}
        id={id}
        type="range"
        min={0}
        max={1}
        step={step}
        value={value ?? "0"}
        disabled={busy}
        data-unselected={choice === null ? true : undefined}
        aria-valuetext={value ?? label(lang, "demandUnselected")}
        aria-describedby={`${id}-help`}
        onChange={(event) =>
          void select(
            Math.round(event.currentTarget.valueAsNumber * DEMAND_STEPS),
          )
        }
        onPointerDown={(event) => {
          if (choice === null && event.isPrimary && event.button === 0)
            initialPointer.current = event.pointerId;
        }}
        onPointerUp={(event) => {
          // A tap at zero may emit no native input or click event.
          if (choice === null && initialPointer.current === event.pointerId)
            void select(
              Math.round(event.currentTarget.valueAsNumber * DEMAND_STEPS),
            );
          initialPointer.current = null;
        }}
        onPointerCancel={() => {
          initialPointer.current = null;
        }}
        onPointerLeave={() => {
          initialPointer.current = null;
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Enter") {
            event.preventDefault();
            if (!event.repeat && choice !== null)
              event.currentTarget.form?.requestSubmit();
            return;
          }
          if (choice !== null) return;
          // With no current value, start at the end from which the key can move.
          const fromMin = ["Home", "ArrowUp", "ArrowRight", "PageUp"].includes(
            event.key,
          );
          const fromMax = [
            "End",
            "ArrowDown",
            "ArrowLeft",
            "PageDown",
          ].includes(event.key);
          if (fromMin || fromMax) {
            event.preventDefault();
            void select(fromMin ? 0 : DEMAND_STEPS);
          }
        }}
      />
      <div className="ev-demand-endpoints" aria-hidden="true">
        <span>0</span>
        <span>1</span>
      </div>
      <button
        type="submit"
        className="button primary"
        disabled={busy || choice === null}
      >
        {label(lang, "confirmDemand")}
      </button>
      <p id={`${id}-help`} className="field-help">
        {sliderInstructions(lang, step)}
      </p>
      {saveFailed && (
        <p className="error-message" role="alert">
          {label(lang, "draftSaveFailed")}
        </p>
      )}
    </form>
  );
}
