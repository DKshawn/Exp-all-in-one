import { useId } from "react";
import { useSetupText } from "@/components/experiment-language";
import { equilibrium } from "@/experiments/double-auction/lib/equilibrium";
import { StudyConditionChart } from "./study-condition-chart";
import type { StudySettings } from "@/experiments/double-auction/lib/study-types";
import {
  studyCommissionEquilibrium,
  studyCommissionSchema,
} from "@/experiments/double-auction/lib/study-commission";

export function StudyConditionPreview({
  settings,
  commission = 0,
  showUnitValues = true,
}: {
  settings: StudySettings;
  commission?: number;
  showUnitValues?: boolean;
}) {
  const t = useSetupText();
  const demand = settings.values.flat().sort((a, b) => b - a);
  const supply = settings.costs.flat().sort((a, b) => a - b);
  const eq = equilibrium(demand, supply);
  const rewarded = studyCommissionSchema.safeParse(commission).success
    ? studyCommissionEquilibrium(settings, commission)
    : null;
  const yen = (amount: string | number) =>
    t(`${amount} 円`, `${amount} 日元`, `¥${amount}`);
  const units = (count: string | number) =>
    t(`${count} 単位`, `${count} 单位`, `${count} units`);
  const range = (low: number, high: number) =>
    low === high
      ? low
      : t(`${low}〜${high}`, `${low}–${high}`, `${low}–${high}`);
  const price = (value: typeof eq | null) =>
    value ? yen(range(value.low, value.high)) : "—";
  const quantity = (value: typeof eq | null) =>
    value ? units(range(value.quantity, value.quantityMax)) : "—";
  const commissionValue = Number.isFinite(commission) ? commission : "—";
  const stats = [
    [t("均衡価格", "均衡价", "Equilibrium price"), price(eq)],
    [
      t("均衡数量・下限", "均衡数量下限", "Minimum equilibrium quantity"),
      units(eq.quantity),
    ],
    [
      t("均衡数量・上限", "均衡数量上限", "Maximum equilibrium quantity"),
      units(eq.quantityMax),
    ],
    [
      t("正の余剰の単位数", "正盈余单位数", "Positive-surplus units"),
      units(eq.quantity),
    ],
    [
      t("ゼロ余剰の単位数", "零盈余单位数", "Zero-surplus units"),
      units(eq.quantityMax - eq.quantity),
    ],
    [t("最大総余剰", "最大总盈余", "Maximum total surplus"), yen(eq.surplus)],
  ];
  return (
    <div className="study-condition-preview">
      <div
        className="study-table-wrap study-equilibrium-comparison"
        aria-live="polite"
      >
        <table>
          <caption>
            {t(
              "理論均衡の比較",
              "理论均衡比较",
              "Theoretical equilibrium comparison",
            )}
          </caption>
          <thead>
            <tr>
              <th scope="col">{t("計算条件", "计算条件", "Scenario")}</th>
              <th scope="col">
                {t("均衡価格", "均衡价", "Equilibrium price")}
              </th>
              <th scope="col">
                {t("均衡数量", "均衡数量", "Equilibrium quantity")}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">
                {t(
                  "原始供需（Commissionなし）",
                  "原始供需（不含佣金）",
                  "Baseline (no commission)",
                )}
              </th>
              <td>{price(eq)}</td>
              <td>{quantity(eq)}</td>
            </tr>
            <tr>
              <th scope="row">
                {t(
                  `Commission込み（各${commissionValue}円／単位）`,
                  `含佣金（每人每单位 ${commissionValue} 日元）`,
                  `With commission (¥${commissionValue}/unit each)`,
                )}
              </th>
              <td>{price(rewarded)}</td>
              <td>{quantity(rewarded)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="field-help">
        {t(
          "Commission込みは価値＋Commission、費用−Commissionで計算します。実際の注文価格や取引結果を保証するものではありません。最大総余剰・以下の図と単位表はCommissionを除く原始供需です。",
          "含佣金时，买方价值加佣金，卖方成本减佣金。实际报价和成交结果可能不同。最大总盈余、下方图表和单位表均使用原始供需。",
          "For the commission-adjusted equilibrium, commission raises buyer values and lowers seller costs. Actual orders and trades can differ. The maximum surplus, chart, and unit table use the baseline schedules.",
        )}
      </p>
      <div
        className={`study-condition-preview-grid${showUnitValues ? "" : " study-chart-only"}`}
      >
        <div className="study-condition-plot">
          <dl className="study-condition-summary">
            {stats.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <StudyConditionChart
            key={`${demand.join(",")}:${supply.join(",")}`}
            demand={demand}
            supply={supply}
          />
        </div>
        {showUnitValues && <StudyUnitValues settings={settings} />}
      </div>
    </div>
  );
}

export function StudyUnitValues({
  settings,
  fixedHeading = false,
}: {
  settings: StudySettings;
  fixedHeading?: boolean;
}) {
  const t = useSetupText();
  const titleId = useId();
  const demand = settings.values.flat().sort((a, b) => b - a);
  const supply = settings.costs.flat().sort((a, b) => a - b);
  const eq = equilibrium(demand, supply);
  const title =
    demand.length === supply.length
      ? t(
          `全単位の数値（片側${demand.length}単位）`,
          `各单位数值（单侧 ${demand.length} 单位）`,
          `All unit values (${demand.length} per side)`,
        )
      : t(
          `全単位の数値（買${demand.length}・売${supply.length}単位）`,
          `各单位数值（买方 ${demand.length}，卖方 ${supply.length}）`,
          `All unit values (${demand.length} buy, ${supply.length} sell)`,
        );
  return (
    <>
      {fixedHeading && <h2 id={titleId}>{title}</h2>}
      <div
        className="study-table-wrap study-unit-preview"
        tabIndex={0}
        role="region"
        aria-label={t(
          "全単位の数値をスクロール",
          "滚动查看各单位数值",
          "Scroll all unit values",
        )}
      >
        <table aria-labelledby={fixedHeading ? titleId : undefined}>
          {!fixedHeading && <caption>{title}</caption>}
          <thead>
            <tr>
              <th scope="col">{t("単位 k", "单位 k", "Unit k")}</th>
              <th scope="col">{t("価値 D(k)", "价值 D(k)", "Value D(k)")}</th>
              <th scope="col">{t("費用 S(k)", "成本 S(k)", "Cost S(k)")}</th>
            </tr>
          </thead>
          <tbody>
            {Array.from(
              { length: Math.max(demand.length, supply.length) },
              (_, i) => (
                <tr
                  key={i}
                  className={
                    i >= eq.quantity && i < eq.quantityMax
                      ? "study-zero-surplus-row"
                      : undefined
                  }
                >
                  <th scope="row">{i + 1}</th>
                  <td>{demand[i] ?? "—"}</td>
                  <td>{supply[i] ?? "—"}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
