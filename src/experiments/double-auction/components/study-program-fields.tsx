"use client";

import { useSetupText } from "@/components/experiment-language";

import {
  DEFAULT_STUDY_INSTITUTIONS,
  MAX_INSTITUTION_PERIODS,
} from "@/experiments/double-auction/lib/study-config";
import { INSTITUTIONS } from "@/experiments/double-auction/lib/study-rules";
import {
  MAX_STAGE_SECONDS,
  STUDY_TIMING_FIELDS,
} from "@/experiments/double-auction/lib/study-timing";
import type {
  Institution,
  StudyPeriods,
  StudyTiming,
} from "@/experiments/double-auction/lib/study-types";

/** Keep every institution's controls together in both creation and room setup. */
export function StudyProgramFields({
  institutions,
  periods,
  timing,
  onInstitutionsChange,
  onPeriodsChange,
  onTimingChange,
  disabled,
  marketSize = 16,
  postedBatch = true,
}: {
  institutions: readonly Institution[];
  periods: StudyPeriods;
  timing?: StudyTiming;
  onInstitutionsChange: (value: Institution[]) => void;
  onPeriodsChange: (value: StudyPeriods) => void;
  onTimingChange?: (value: StudyTiming) => void;
  disabled: boolean;
  marketSize?: number;
  postedBatch?: boolean;
}) {
  const t = useSetupText();
  const timingLabels = {
    cdaSeconds: t(
      "1期の取引（秒）",
      "每期交易时长（秒）",
      "Trading period (s)",
    ),
    callSeconds: t("1回の受付（秒）", "每次收单时长（秒）", "Order window (s)"),
    offerSeconds: t("価格提示（秒）", "卖方报价时长（秒）", "Offer window (s)"),
    buyerSeconds: t(
      "1人の購入（秒）",
      "每位买方时长（秒）",
      "Per-buyer window (s)",
    ),
    purchaseSeconds: t(
      "共通取引（秒）",
      "统一交易时长（秒）",
      "Shared trading window (s)",
    ),
  };
  return (
    <div className="study-program-columns">
      {DEFAULT_STUDY_INSTITUTIONS.map((institution) => {
        const selected = institutions.includes(institution);
        const name = INSTITUTIONS[institution].short;
        return (
          <fieldset className="study-program-column" key={institution}>
            <legend>
              <label className="study-institution-option">
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={disabled}
                  onChange={(event) =>
                    onInstitutionsChange(
                      DEFAULT_STUDY_INSTITUTIONS.filter((item) =>
                        item === institution
                          ? event.target.checked
                          : institutions.includes(item),
                      ),
                    )
                  }
                />
                {INSTITUTIONS[institution].short}
              </label>
            </legend>
            {selected && (
              <label className="field study-compact-field">
                {t("期数", "期数", "Periods")}
                <input
                  aria-label={t(
                    `${name}の期数`,
                    `${name} 期数`,
                    `${name} periods`,
                  )}
                  type="number"
                  min={1}
                  max={MAX_INSTITUTION_PERIODS}
                  step={1}
                  required={selected}
                  value={periods[institution] || ""}
                  disabled={disabled || !selected}
                  onChange={(event) =>
                    onPeriodsChange({
                      ...periods,
                      [institution]: Number(event.target.value),
                    })
                  }
                />
              </label>
            )}
            {selected &&
              timing &&
              STUDY_TIMING_FIELDS.filter(
                (field) =>
                  field.institution === institution &&
                  (field.key === "buyerSeconds"
                    ? !postedBatch
                    : field.key === "purchaseSeconds"
                      ? postedBatch
                      : true),
              ).map(({ key, label }) => (
                <label className="field study-compact-field" key={key}>
                  {timingLabels[key]}
                  <input
                    aria-label={t(
                      label,
                      `${name} ${timingLabels[key]}`,
                      `${name} ${timingLabels[key]}`,
                    )}
                    type="number"
                    min={1}
                    max={MAX_STAGE_SECONDS}
                    step={1}
                    required={selected}
                    disabled={disabled || !selected}
                    value={
                      (key === "purchaseSeconds"
                        ? (timing.purchaseSeconds ??
                          (timing.buyerSeconds * marketSize) / 2)
                        : timing[key]) || ""
                    }
                    onChange={(event) =>
                      onTimingChange?.({
                        ...timing,
                        [key]: Number(event.target.value),
                      })
                    }
                  />
                </label>
              ))}
          </fieldset>
        );
      })}
    </div>
  );
}
