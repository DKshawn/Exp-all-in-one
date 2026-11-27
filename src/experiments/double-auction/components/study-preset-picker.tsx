"use client";

import { useState, type ReactNode } from "react";
import { useSetupText } from "@/components/experiment-language";
import { studySetupError } from "@/experiments/double-auction/lib/study-setup-text";
import {
  DEFAULT_ASSIGNMENT_SEED,
  DEFAULT_STAIRCASE_PARAMETERS,
  generatedStudySettings,
} from "@/experiments/double-auction/lib/study-generator";
import type {
  StaircaseParameters,
  StudyGeneratorConfig,
  StudySettings,
  StudyAllocationPlan,
  StudyUnitCounts,
  StudySchedules,
  Institution,
} from "@/experiments/double-auction/lib/study-types";
import {
  StudyConditionPreview,
  StudyUnitValues,
} from "./study-condition-preview";
import { StudyCommissionField } from "./study-commission-settings";
import { studyCommissionError } from "@/experiments/double-auction/lib/study-commission";
import { MAX_PRICE } from "@/experiments/double-auction/lib/price";
import { studyMarketSettings } from "@/experiments/double-auction/lib/study-config";
import {
  conditionSchedules,
  presetStudyConditions,
} from "@/experiments/double-auction/lib/study-conditions";
import { INSTITUTIONS } from "@/experiments/double-auction/lib/study-rules";

export type StudyPresetPreview = {
  settings: StudySettings;
  otherSettings?: StudySettings;
  settingsByInstitution?: StudySchedules;
  generator?: StudyGeneratorConfig;
  revision: number;
};

/** The same preview and confirmation flow before and after room creation. */
export function StudyPresetPicker({
  existingPreset,
  units,
  unitsPerParticipant = 2,
  unitsByInstitution,
  institutions,
  otherSettings,
  otherUnits,
  revision = 0,
  initialGenerator,
  disabled,
  locked = false,
  actionLabel,
  onConfirm,
  onDraftChange,
  renderAssignments,
  renderAllocation,
  marketLayout,
  commission,
  onCommissionChange,
  settingsPanel,
  renderUnitFields,
  validationError = "",
  confirmDisabled = false,
}: {
  existingPreset?: { label: string; settings: StudySettings };
  units: number;
  unitsPerParticipant?: number;
  unitsByInstitution?: StudyUnitCounts;
  institutions?: readonly Institution[];
  otherSettings?: StudySettings;
  // Creation derives the other institutions' two-unit schedule from the same preset.
  // After creation their saved conditions are passed unchanged via otherSettings.
  otherUnits?: number;
  revision?: number;
  initialGenerator?: StudyGeneratorConfig;
  disabled: boolean;
  locked?: boolean;
  actionLabel: string;
  onConfirm: (
    preview: StudyPresetPreview,
    commission: number,
  ) => boolean | Promise<boolean>;
  onDraftChange?: () => void;
  renderAssignments?: (preview: StudyPresetPreview) => ReactNode;
  renderAllocation?: (
    preview: StudyPresetPreview,
    otherSettings: StudySettings | undefined,
  ) => ReactNode;
  marketLayout?: StudyAllocationPlan["layout"];
  commission: number;
  onCommissionChange: (amount: number) => void;
  renderUnitFields?: (disabled: boolean) => ReactNode;
  validationError?: string;
  confirmDisabled?: boolean;
  settingsPanel?: {
    heading: ReactNode;
    labelledBy: string;
  };
}) {
  const t = useSetupText();
  const presetName =
    existingPreset?.label && existingPreset.label !== "Default"
      ? existingPreset.label
      : t("Default", "默认", "Default");
  const [preset, setPreset] = useState(
    initialGenerator ? "overlap" : "existing",
  );
  const [parameters, setParameters] = useState<StaircaseParameters>(() => ({
    ...(initialGenerator?.parameters ?? DEFAULT_STAIRCASE_PARAMETERS),
  }));
  const [seed, setSeed] = useState(
    initialGenerator?.seed ?? DEFAULT_ASSIGNMENT_SEED,
  );
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const custom = preset === "overlap";
  const perSide = units / unitsPerParticipant;
  const blocked = disabled || confirming;
  const fieldsBlocked = blocked;
  const cdaOnly =
    !unitsByInstitution &&
    (unitsPerParticipant !== 2 || Boolean(otherSettings));
  function otherConditions(generator?: StudyGeneratorConfig) {
    if (!otherUnits || !generator) return otherSettings;
    try {
      return generatedStudySettings(generator, otherUnits);
    } catch (e) {
      throw new Error(
        `Call Market・Posted Offer（2単位）の条件：${e instanceof Error ? e.message : "パラメータを確認してください。"}`,
      );
    }
  }
  let candidate: StudySettings | undefined;
  let candidates: StudySchedules | undefined;
  let candidateOther: StudySettings | undefined = otherSettings;
  let generationError = "";
  let otherError = "";
  const generator: StudyGeneratorConfig | undefined = custom
    ? { kind: "overlap-staircase", parameters: { ...parameters }, seed }
    : undefined;
  try {
    if (validationError) throw new Error(validationError);
    if (!generator && !existingPreset)
      throw new Error(
        "Defaultの供需条件を取得できません。画面を再読込してください。",
      );
    if (unitsByInstitution && institutions?.length) {
      candidates = conditionSchedules(
        presetStudyConditions(
          {
            title: "",
            rounds: 1,
            duration: 1,
            capacity: perSide * 2,
            marketSize: perSide * 2,
            studyInstitutions: [...institutions],
            studyUnitCounts: unitsByInstitution,
          },
          existingPreset?.settings ?? { values: [], costs: [] },
          generator,
        ),
      );
      candidate = candidates[institutions[0]];
    } else
      candidate = generator
        ? generatedStudySettings(generator, units, unitsPerParticipant)
        : existingPreset!.settings;
  } catch (e) {
    generationError =
      e instanceof Error ? e.message : "パラメータを確認してください。";
  }
  try {
    candidateOther = otherConditions(generator);
  } catch (e) {
    otherError =
      e instanceof Error ? e.message : "他制度の供需条件を確認してください。";
  }
  const templateSettings = candidates ? Object.values(candidates) : [];
  const actualSettings =
    candidates && marketLayout
      ? marketLayout.flatMap((counts, i) =>
          !counts.buyers || !counts.sellers
            ? []
            : templateSettings.map((settings) =>
                studyMarketSettings(
                  {
                    title: "",
                    capacity: 0,
                    rounds: 0,
                    duration: 0,
                    studyLayout: marketLayout,
                  },
                  settings,
                  i + 1,
                ),
              ),
        )
      : candidate && marketLayout
        ? marketLayout.flatMap((counts, i) =>
            !counts.buyers || !counts.sellers
              ? []
              : [
                  studyMarketSettings(
                    {
                      title: "",
                      capacity: 0,
                      rounds: 0,
                      duration: 0,
                      studyLayout: marketLayout,
                    },
                    candidate!,
                    i + 1,
                  ),
                  ...(candidateOther
                    ? [
                        studyMarketSettings(
                          {
                            title: "",
                            capacity: 0,
                            rounds: 0,
                            duration: 0,
                            studyLayout: marketLayout,
                          },
                          candidateOther,
                          i + 1,
                        ),
                      ]
                    : []),
                ],
          )
        : [];
  const commissionError =
    studyCommissionError(commission, candidate, candidateOther) ||
    [...templateSettings, ...actualSettings]
      .map((s) => studyCommissionError(commission, s))
      .find(Boolean) ||
    "";
  // A preview is derived from the current inputs; saving still requires confirmation.
  const preview: StudyPresetPreview | null =
    candidate && !generationError && !otherError
      ? {
          settings: candidate,
          settingsByInstitution: candidates,
          generator,
          revision,
        }
      : null;
  const previewError = generationError || otherError || error;

  function changed() {
    setError("");
    onDraftChange?.();
  }

  const content = (
    <>
      <label className="field">
        {t("供需プリセット", "供需预设", "Supply and demand preset")}
        <select
          value={preset}
          disabled={fieldsBlocked}
          onChange={(e) => {
            if (preset === "existing" && e.target.value === "overlap") {
              setParameters({ ...DEFAULT_STAIRCASE_PARAMETERS });
              setSeed(DEFAULT_ASSIGNMENT_SEED);
            }
            setPreset(e.target.value);
            changed();
          }}
        >
          <option value="existing">{presetName}</option>
          <option value="overlap">{t("カスタム", "自定义", "Custom")}</option>
        </select>
      </label>
      {renderUnitFields?.(fieldsBlocked)}
      <StudyCommissionField
        amount={commission}
        settings={candidate}
        otherSettings={candidateOther}
        additionalSettings={[...templateSettings, ...actualSettings]}
        disabled={fieldsBlocked || locked}
        onChange={(amount) => {
          onCommissionChange(amount);
          changed();
        }}
      />
      {custom && !validationError && (
        <>
          <p className="field-help">
            {unitsByInstitution && institutions
              ? `${INSTITUTIONS[institutions[0]].short}${t("：", "：", ": ")}`
              : cdaOnly && t("CDA：", "CDA：", "CDA: ")}
            {t(
              `条件テンプレート：買い手${perSide}人・売り手${perSide}人、各${unitsPerParticipant}単位、片側${units}単位。`,
              `条件模板：买卖双方各 ${perSide} 人，每人 ${unitsPerParticipant} 单位，单侧共 ${units} 单位。`,
              `Template: ${perSide} buyers and ${perSide} sellers, ${unitsPerParticipant} units each and ${units} per side. `,
            )}
            {cdaOnly &&
              t(
                "Call Market・Posted Offerは各自2単位です。",
                "Call Market 和 Posted Offer 每人 2 单位。",
                "Call Market and Posted Offer use 2 units per participant. ",
              )}
            {t(
              "既定のp=80・K=8・L=4・d=4は検討用の候補です。",
              "默认的 p=80、K=8、L=4、d=4 是供参考的参数。",
              "The default p=80, K=8, L=4 and d=4 are starting values to try.",
            )}
          </p>
          <div className="study-generator-fields">
            {(
              [
                [
                  "p",
                  t(
                    "均衡価格 p（円）",
                    "均衡价 p（日元）",
                    "Equilibrium price p (¥)",
                  ),
                ],
                [
                  "K",
                  t(
                    "正の余剰の単位数 K",
                    "正盈余单位数 K",
                    "Positive-surplus units K",
                  ),
                ],
                [
                  "L",
                  t(
                    "横向き重なりの長さ L",
                    "水平重叠长度 L",
                    "Horizontal overlap L",
                  ),
                ],
                [
                  "d",
                  t(
                    "階段の価格差 d（円）",
                    "阶梯价差 d（日元）",
                    "Price step d (¥)",
                  ),
                ],
              ] as const
            ).map(([key, label]) => (
              <label className="field" key={key}>
                {label}
                <input
                  type="number"
                  value={Number.isNaN(parameters[key]) ? "" : parameters[key]}
                  min={key === "d" ? undefined : 1}
                  step={key === "d" ? "any" : 1}
                  disabled={fieldsBlocked}
                  onChange={(e) => {
                    setParameters({
                      ...parameters,
                      [key]:
                        e.target.value === "" ? NaN : Number(e.target.value),
                    });
                    changed();
                  }}
                />
              </label>
            ))}
            <label className="field">
              {t("割当シード", "分配种子", "Assignment seed")}
              <input
                type="number"
                min={0}
                max={4294967295}
                step={1}
                value={Number.isNaN(seed) ? "" : seed}
                disabled={fieldsBlocked}
                onChange={(e) => {
                  setSeed(e.target.value === "" ? NaN : Number(e.target.value));
                  changed();
                }}
              />
            </label>
          </div>
          <p className="field-help">
            {t(
              `K・Lは1以上の整数、K＋L≤${units}、d>0。すべての生成値が1〜${MAX_PRICE}円の整数になる条件を指定してください。`,
              `K、L 都是正整数，K + L ≤ ${units}，d > 0。生成值必须是 1–${MAX_PRICE} 日元之间的整数。`,
              `K and L must be positive integers, K + L ≤ ${units}, and d > 0. Generated values must be whole yen between 1 and ${MAX_PRICE}.`,
            )}
          </p>
        </>
      )}
      {previewError && (
        <p className="error-message study-generator-error" role="alert">
          {studySetupError(t, previewError)}
        </p>
      )}
      {(custom || renderAllocation) && preview && (
        <div className="study-generated-preview">
          <h3>
            {unitsByInstitution && institutions
              ? `${INSTITUTIONS[institutions[0]].short}${t("：", "：", ": ")}`
              : cdaOnly && t("CDA：", "CDA：", "CDA: ")}
            {preview.generator
              ? t("カスタムのプレビュー", "自定义预览", "Custom preview")
              : t(
                  `${presetName}のプレビュー`,
                  `${presetName}预览`,
                  `${presetName} preview`,
                )}
          </h3>
          <StudyConditionPreview
            settings={preview.settings}
            commission={commission}
            showUnitValues={!settingsPanel}
          />
          {preview.generator && (
            <p className="field-help">
              {t(
                `第i単位から${perSide}単位間隔で${unitsPerParticipant}単位を同じ役割に配分します。同じ人数・入室順・シードで割当を再現し、`,
                `从第 i 个单位起，每隔 ${perSide} 个单位抽取一个，共 ${unitsPerParticipant} 个，分给同一角色。人数、入室顺序和种子相同时分配结果相同。`,
                `Starting at unit i, assign ${unitsPerParticipant} units to the same role at intervals of ${perSide}. Attendance, join order, and seed reproduce the assignment. `,
              )}
              {cdaOnly
                ? t(
                    "CDAの全期で固定します。",
                    "分配在 CDA 各期保持固定。",
                    "It stays fixed across all CDA periods. ",
                  )
                : t(
                    "全期・全制度で固定します。",
                    "分配在所有期和制度中保持固定。",
                    "It stays fixed across all periods and institutions. ",
                  )}
              {t(
                "各市場は共通テンプレートから実人数に合わせた条件を使います。",
                "各市场按实际人数从共用模板生成条件。",
                "Each market uses conditions from the common template sized to its actual attendance.",
              )}
            </p>
          )}
          {renderAssignments?.(preview)}
          {candidates &&
            institutions
              ?.slice(1)
              .filter(
                (i) =>
                  JSON.stringify(candidates[i]) !==
                  JSON.stringify(preview.settings),
              )
              .map((i) => (
                <details className="study-other-conditions" key={i}>
                  <summary className="button secondary small-button disclosure-button">
                    {t(
                      `${INSTITUTIONS[i].short}の条件（各自${unitsByInstitution![i]}単位）`,
                      `${INSTITUTIONS[i].short} 条件（每人 ${unitsByInstitution![i]} 单位）`,
                      `${INSTITUTIONS[i].short} (${unitsByInstitution![i]} units each)`,
                    )}
                  </summary>
                  <StudyConditionPreview
                    settings={candidates![i]!}
                    commission={commission}
                  />
                </details>
              ))}
          {candidateOther && (
            <details className="study-other-conditions">
              <summary className="button secondary small-button disclosure-button">
                {t(
                  "Call Market・Posted Offerの条件（各自2単位）",
                  "Call Market 和 Posted Offer（每人 2 单位）",
                  "Call Market and Posted Offer (2 units each)",
                )}
              </summary>
              <StudyConditionPreview
                settings={candidateOther}
                commission={commission}
              />
            </details>
          )}
        </div>
      )}
      {preview && renderAllocation?.(preview, candidateOther)}
      <div className="study-actions">
        <button
          type="button"
          className="button primary"
          disabled={
            blocked ||
            locked ||
            confirmDisabled ||
            !preview ||
            Boolean(commissionError)
          }
          onClick={async () => {
            if (!preview) return;
            setConfirming(true);
            try {
              if (
                await onConfirm(
                  { ...preview, otherSettings: candidateOther },
                  commission,
                )
              ) {
                setError("");
              }
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "条件を保存できませんでした。",
              );
            } finally {
              setConfirming(false);
            }
          }}
        >
          {actionLabel}
        </button>
      </div>
    </>
  );
  return settingsPanel ? (
    <div
      className={`study-preset-picker${custom ? " study-preset-with-units" : ""}`}
    >
      <section
        className="panel teacher-condition-settings study-preset-settings"
        aria-labelledby={settingsPanel.labelledBy}
      >
        {settingsPanel.heading}
        {content}
      </section>
      {custom && (
        <section
          className="panel teacher-units-panel"
          aria-label={t("全単位の数値", "各单位数值", "All unit values")}
        >
          {preview ? (
            <StudyUnitValues settings={preview.settings} fixedHeading />
          ) : (
            <>
              <h2>{t("全単位の数値", "各单位数值", "All unit values")}</h2>
              <p className="field-help">
                {t(
                  "有効な供需条件を設定してください。",
                  "请先设置有效的供需条件。",
                  "Set valid supply and demand conditions first.",
                )}
              </p>
            </>
          )}
        </section>
      )}
    </div>
  ) : (
    <div className="study-preset-picker">{content}</div>
  );
}
