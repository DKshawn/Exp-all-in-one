"use client";
import { useSetupText } from "@/components/experiment-language";
import {
  MAX_EXP2_MARKETS,
  type EmhSettings,
  type Exp2Options,
} from "../settings";

export function SettingsFields({
  settings,
  onChange,
  disabled = false,
  experiment = "exp1",
  demo = false,
}: {
  settings: EmhSettings;
  onChange: (settings: EmhSettings) => void;
  disabled?: boolean;
  experiment?: "exp1" | "exp2";
  demo?: boolean;
}) {
  const t = useSetupText();
  const options = settings.exp2;
  const range = experiment === "exp2" ? "3–999" : "3–12";
  function updateOptions(change: Partial<Exp2Options>) {
    if (options) onChange({ ...settings, exp2: { ...options, ...change } });
  }
  return (
    <fieldset className="emh-settings" disabled={disabled}>
      <legend>{t("実験条件", "实验条件", "Experiment settings")}</legend>
      <div className="form-grid">
        <label className="field">
          {t("ラウンド数", "轮数", "Rounds")}
          <input
            type="number"
            min={1}
            max={experiment === "exp2" ? 6 : 12}
            step={1}
            required
            value={settings.rounds || ""}
            onChange={(e) =>
              onChange({ ...settings, rounds: Number(e.target.value) })
            }
          />
        </label>
        <label className="field">
          {t("1取引の時間（秒）", "交易单元时长（秒）", "Trade unit (s)")}
          <input
            type="number"
            min={1}
            max={1800}
            step={1}
            required
            value={settings.unitSeconds || ""}
            onChange={(e) =>
              onChange({ ...settings, unitSeconds: Number(e.target.value) })
            }
          />
        </label>
        <label className="field">
          {t("休憩時間（秒）", "休息时长（秒）", "Break (s)")}
          <input
            type="number"
            min={1}
            max={1800}
            step={1}
            required
            value={settings.breakSeconds || ""}
            onChange={(e) =>
              onChange({ ...settings, breakSeconds: Number(e.target.value) })
            }
          />
        </label>
        <label className="field">
          {experiment === "exp2"
            ? t(
                "各ラウンドの時間（分）",
                "每轮时长（分钟）",
                "Round length (min)",
              )
            : t(
                "取引時間（A・B各期／分）",
                "A、B 各期时长（分钟）",
                "A/B period length (min)",
              )}
          <input
            type="number"
            name="periodMinutes"
            min={1}
            max={30}
            step="any"
            required
            value={settings.periodSeconds / 60 || ""}
            onChange={(e) =>
              onChange({
                ...settings,
                periodSeconds: Math.round(Number(e.target.value) * 60),
              })
            }
          />
        </label>
        <label className="field">
          {t(
            "1人あたりの初期証券数（各ラウンド）",
            "每轮人均初始证券数",
            "Initial units/person/round",
          )}
          <input
            type="number"
            name="initialUnits"
            min={1}
            max={20}
            step={1}
            required
            value={settings.initialUnits || ""}
            onChange={(e) =>
              onChange({
                ...settings,
                initialUnits: Number(e.target.value),
              })
            }
          />
        </label>
        <label className="field">
          {t("1市場の目標人数", "每个市场的目标人数", "Target market size")}
          <input
            type="number"
            name="targetMarketSize"
            min={3}
            max={experiment === "exp2" ? 999 : 12}
            step={1}
            required
            value={settings.targetMarketSize || ""}
            onChange={(e) =>
              onChange({
                ...settings,
                targetMarketSize: Number(e.target.value),
              })
            }
          />
        </label>
        {experiment === "exp2" && options && (
          <>
            <label className="field">
              {t(
                "連続不成立で終了する回数",
                "结束前连续无成交次数",
                "End after empty units",
              )}
              <input
                type="number"
                min={1}
                max={100}
                step={1}
                required
                value={options.emptyUnitsLimit || ""}
                onChange={(e) =>
                  updateOptions({ emptyUnitsLimit: Number(e.target.value) })
                }
              />
            </label>
            {!demo && (
              <label className="field">
                {t(
                  "市場数（空欄は自動）",
                  "市场数（留空则自动）",
                  "Markets (blank for auto)",
                )}
                <input
                  type="number"
                  min={1}
                  max={MAX_EXP2_MARKETS}
                  step={1}
                  value={options.marketCount ?? ""}
                  onChange={(e) =>
                    updateOptions({
                      marketCount:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </label>
            )}
            <label className="field">
              {t(
                "内部情報の開始ラウンド",
                "内部信息起始轮",
                "Insider start round",
              )}
              <input
                type="number"
                min={1}
                max={7}
                step={1}
                required
                value={options.insiderStartRound || ""}
                onChange={(e) =>
                  updateOptions({ insiderStartRound: Number(e.target.value) })
                }
              />
            </label>
            <label className="field">
              {t(
                "内部情報を持つ人数（各タイプ）",
                "每类知情者人数",
                "Insiders per type",
              )}
              <input
                type="number"
                min={0}
                max={999}
                step={1}
                required
                value={options.insiderCountPerType}
                onChange={(e) =>
                  updateOptions({ insiderCountPerType: Number(e.target.value) })
                }
              />
            </label>
          </>
        )}
      </div>
      <fieldset className="emh-type-ratios">
        <legend>
          {t("タイプ別人数の比率", "各类型人数比例", "Type ratios")}
        </legend>
        <div className="emh-ratio-grid">
          {settings.typeRatios.map((value, i) => (
            <label className="field" key={i}>
              {t(`タイプ${i + 1}`, `类型 ${i + 1}`, `Type ${i + 1}`)}
              <input
                type="number"
                name={`typeRatio${i + 1}`}
                min={1}
                max={100}
                step={1}
                required
                value={value || ""}
                onChange={(e) => {
                  const typeRatios = [
                    ...settings.typeRatios,
                  ] as EmhSettings["typeRatios"];
                  typeRatios[i] = Number(e.target.value);
                  onChange({ ...settings, typeRatios });
                }}
              />
            </label>
          ))}
        </div>
      </fieldset>
      <p className="field-help">
        {t(
          `全員を${range.replace("–", "〜")}人の市場に分け、各タイプを1人以上配置します。端数は実人数に合わせて調整します。`,
          `每个市场分配 ${range} 人，每个类型至少一人。人数按实际入室情况调整。`,
          `Each market gets ${range} participants and at least one of each type. Counts are rounded to match actual attendance.`,
        )}
      </p>
      {experiment === "exp2" && options && (
        <p className="field-help">
          {!demo &&
            t(
              "市場数を指定すると、実際の参加者を指定した市場に均等に分けます。 ",
              "指定市场数后，参与者将尽量均分到各市场。",
              "When a market count is specified, participants are split evenly across those markets. ",
            )}
          {t(
            "内部情報は各タイプの人数を上限に配ります。開始ラウンドが実施回数より後の場合は配りません。",
            "各类型的知情者人数以该类型实际人数为上限。若起始轮超过总轮数，则不分配内部信息。",
            "Insider counts are capped at the size of each type. No insider information is assigned if the start round exceeds the number of rounds.",
          )}
        </p>
      )}
      {experiment === "exp2" && options && (
        <details className="emh-exp2-conditions">
          <summary className="button secondary small-button disclosure-button">
            {t("状態・配当の設定", "状态与股息设置", "States and dividends")}
          </summary>
          <fieldset className="emh-exp2-grid">
            <legend>
              {t("状態の確率（%）", "状态概率（%）", "State probabilities (%)")}
            </legend>
            <div className="emh-ratio-grid">
              {options.states.prior.map((probability, i) => (
                <label className="field" key={i}>
                  {t(`状態${i + 1}`, `状态 ${i + 1}`, `State ${i + 1}`)}
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="any"
                    required
                    value={Math.round(probability * 1000000) / 10000}
                    onChange={(e) => {
                      const prior = [
                        ...options.states.prior,
                      ] as Exp2Options["states"]["prior"];
                      prior[i] = Number(e.target.value) / 100;
                      updateOptions({ states: { ...options.states, prior } });
                    }}
                  />
                </label>
              ))}
            </div>
            {Math.abs(
              options.states.prior.reduce((sum, n) => sum + n, 0) - 1,
            ) >= 0.000001 && (
              <p className="error-message" role="alert">
                {t(
                  "確率の合計は100%にしてください。",
                  "概率之和必须为 100%。",
                  "Probabilities must add up to 100%.",
                )}
              </p>
            )}
            <p className="field-help">
              {t(
                "各ラウンドの状態は実験開始時にこの確率で抽選します。",
                "实验开始时，按这些概率为每轮抽取一个状态。",
                "Each round’s state is drawn at the start using these probabilities.",
              )}
            </p>
          </fieldset>
          <fieldset className="emh-exp2-grid">
            <legend>
              {t(
                "タイプ別・状態別の配当（円／単位）",
                "类型与状态股息（¥/单位）",
                "State dividends (¥/unit)",
              )}
            </legend>
            {options.states.dividends.map((values, type) => (
              <div className="emh-ratio-grid" key={type}>
                {values.map((value, state) => (
                  <label className="field" key={state}>
                    {t(
                      `タイプ${type + 1}・状態${state + 1}`,
                      `类型 ${type + 1} · 状态 ${state + 1}`,
                      `Type ${type + 1} · State ${state + 1}`,
                    )}
                    <input
                      type="number"
                      min={0}
                      max={100000}
                      step={1}
                      required
                      value={value}
                      onChange={(e) => {
                        const dividends = structuredClone(
                          options.states.dividends,
                        );
                        dividends[type]![state] = Number(e.target.value);
                        updateOptions({
                          states: { ...options.states, dividends },
                        });
                      }}
                    />
                  </label>
                ))}
              </div>
            ))}
          </fieldset>
        </details>
      )}
    </fieldset>
  );
}
