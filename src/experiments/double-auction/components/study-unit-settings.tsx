import { INSTITUTIONS } from "@/experiments/double-auction/lib/study-rules";
import { useSetupText } from "@/components/experiment-language";
import {
  DEFAULT_STUDY_INSTITUTIONS,
  MAX_STUDY_UNITS,
} from "@/experiments/double-auction/lib/study-config";
import type { Institution } from "@/experiments/double-auction/lib/study-types";

export function StudyUnitFields({
  units,
  onChange,
  disabled,
  institutions = DEFAULT_STUDY_INSTITUTIONS,
}: {
  units: Record<Institution, string>;
  onChange: (institution: Institution, units: string) => void;
  disabled: boolean;
  institutions?: readonly Institution[];
}) {
  const t = useSetupText();
  return (
    <fieldset className="study-unit-settings">
      <legend>
        {t("1人あたりの単位数", "每人单位数", "Units per participant")}
      </legend>
      <div className="study-unit-fields">
        {institutions.map((institution) => (
          <label className="field" key={institution}>
            {INSTITUTIONS[institution].short}
            <input
              aria-label={t(
                `${INSTITUTIONS[institution].short}の1人あたりの単位数`,
                `${INSTITUTIONS[institution].short} 每人单位数`,
                `${INSTITUTIONS[institution].short} units per participant`,
              )}
              type="number"
              min={1}
              max={MAX_STUDY_UNITS}
              step={1}
              required
              value={units[institution]}
              onChange={(e) => onChange(institution, e.target.value)}
              disabled={disabled}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
