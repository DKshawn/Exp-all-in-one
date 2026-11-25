"use client";

import { useId } from "react";
import { useSetupText } from "@/components/experiment-language";
import { studySetupError } from "@/experiments/double-auction/lib/study-setup-text";
import {
  MAX_STUDY_COMMISSION,
  studyCommissionLimit,
  studyCommissionError,
} from "@/experiments/double-auction/lib/study-commission";
import type { StudySettings } from "@/experiments/double-auction/lib/study-types";

export function StudyCommissionField({
  amount,
  onChange,
  settings,
  otherSettings,
  additionalSettings = [],
  disabled = false,
}: {
  amount: number;
  onChange: (amount: number) => void;
  settings?: StudySettings;
  otherSettings?: StudySettings;
  additionalSettings?: StudySettings[];
  disabled?: boolean;
}) {
  const t = useSetupText();
  const id = useId();
  const error =
    studyCommissionError(amount, settings, otherSettings) ||
    additionalSettings
      .map((s) => studyCommissionError(amount, s))
      .find(Boolean) ||
    "";
  const limit = settings
    ? studyCommissionLimit(settings, otherSettings)
    : otherSettings
      ? studyCommissionLimit(otherSettings)
      : null;
  const maximum = Math.min(
    limit?.maximum ?? MAX_STUDY_COMMISSION,
    ...additionalSettings.map((s) => studyCommissionLimit(s).maximum),
  );
  return (
    <div className="field study-commission-field">
      <label htmlFor={id}>
        {t(
          "Commission（円／1単位・1人）",
          "每人每单位佣金（日元）",
          "Commission (¥/unit/person)",
        )}
      </label>
      <input
        id={id}
        type="number"
        name="studyCommission"
        min={0}
        max={maximum}
        step={1}
        required
        disabled={disabled}
        aria-describedby={error ? `${id}-help ${id}-bound` : `${id}-bound`}
        aria-invalid={Boolean(error)}
        value={Number.isFinite(amount) ? amount : ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? NaN : Number(e.target.value))
        }
      />
      {error && (
        <p id={`${id}-help`} className="error-message" role="alert">
          {studySetupError(t, error)}
        </p>
      )}
      <p id={`${id}-bound`} className="field-help study-commission-bound">
        {t(
          `入力範囲：0〜${maximum}円（整数）`,
          `请输入 0–${maximum} 日元之间的整数。`,
          `Enter a whole number from ¥0 to ¥${maximum}.`,
        )}
      </p>
    </div>
  );
}
