import { equilibrium } from "@/experiments/double-auction/lib/equilibrium";
import { useSetupText } from "@/components/experiment-language";
import {
  studyMarketSettings,
  studyInstitutions,
} from "@/experiments/double-auction/lib/study-config";
import { studyCommissionEquilibrium } from "@/experiments/double-auction/lib/study-commission";
import { INSTITUTIONS } from "@/experiments/double-auction/lib/study-rules";
import type { RoomConfig } from "@/experiments/double-auction/lib/types";
import type {
  StudyAllocationPlan,
  StudySettings,
  StudyEquilibrium,
  StudySchedules,
} from "@/experiments/double-auction/lib/study-types";
import { StudyConditionPreview } from "./study-condition-preview";

export function StudyAllocationPreview({
  plan,
  config,
  settings,
  otherSettings,
  settingsByInstitution,
  commission,
}: {
  plan: StudyAllocationPlan;
  config: RoomConfig;
  settings: StudySettings;
  otherSettings?: StudySettings;
  settingsByInstitution?: StudySchedules;
  commission: number;
}) {
  const t = useSetupText();
  const actualConfig = { ...config, studyLayout: plan.layout };
  const rows = plan.layout.flatMap((counts, index) =>
    studyInstitutions(config).map((institution) => {
      const actual = studyMarketSettings(
        actualConfig,
        settingsByInstitution?.[institution] ??
          (institution === "cda" ? settings : (otherSettings ?? settings)),
        index + 1,
      );
      const waiting = !counts.buyers || !counts.sellers;
      return {
        market: index + 1,
        counts,
        institution,
        actual,
        eq: waiting
          ? null
          : equilibrium(actual.values.flat(), actual.costs.flat()),
        rewarded: waiting
          ? null
          : studyCommissionEquilibrium(
              actual,
              Number.isFinite(commission) ? commission : 0,
            ),
      };
    }),
  );
  const range = (min: number, max: number) =>
    min === max ? min : t(`${min}〜${max}`, `${min}–${max}`, `${min}–${max}`);
  const yen = (amount: number | string) =>
    t(`${amount}円`, `${amount} 日元`, `¥${amount}`);
  const price = (eq: StudyEquilibrium | null) =>
    eq ? yen(range(eq.low, eq.high)) : "—";
  const quantity = (eq: StudyEquilibrium | null) => {
    if (!eq) return "—";
    const count = range(eq.quantity, eq.quantityMax);
    return t(`${count}単位`, `${count} 单位`, `${count} units`);
  };
  const title = t(
    "市場別の供需プレビュー",
    "各市场供需预览",
    "Market supply and demand",
  );
  const largest = Math.max(0, ...plan.layout.map((m) => m.buyers + m.sellers));
  return (
    <section className="study-allocation-preview" aria-label={title}>
      <h3>{title}</h3>
      <p className="field-help">
        {t(
          `${plan.attendance}人・${plan.layout.length}市場 ／ 最大市場${largest}人 → 供需テンプレート${plan.templateSize}人（買・売 各${plan.templateSize / 2}人）`,
          `${plan.attendance} 人，${plan.layout.length} 个市场。最大市场 ${largest} 人，采用 ${plan.templateSize} 人供需模板，买卖双方各 ${plan.templateSize / 2} 人。`,
          `${plan.attendance} participants across ${plan.layout.length} market(s). Largest market: ${largest}. Template: ${plan.templateSize} participants, ${plan.templateSize / 2} per side.`,
        )}
      </p>
      {!rows.length ? (
        <p className="field-help">
          {t(
            "入室人数が2人以上になると、市場ごとの供需条件を表示します。",
            "至少两人入室后显示各市场供需条件。",
            "Market conditions appear when at least two participants join.",
          )}
        </p>
      ) : (
        <>
          <div
            className="study-table-wrap study-allocation-table"
            tabIndex={0}
            aria-label={t(
              "市場別の理論均衡をスクロール",
              "滚动查看各市场理论均衡",
              "Scroll theoretical equilibria by market",
            )}
          >
            <table>
              <caption>
                {t(
                  "実人数での理論均衡",
                  "按实际人数计算的理论均衡",
                  "Theoretical equilibrium at actual attendance",
                )}
              </caption>
              <thead>
                <tr>
                  <th>{t("市場", "市场", "Market")}</th>
                  <th>{t("制度", "制度", "Institution")}</th>
                  <th>{t("買／売", "买方/卖方", "Buyers/sellers")}</th>
                  <th>{t("原始均衡価格", "原始均衡价", "Baseline price")}</th>
                  <th>
                    {t("原始均衡数量", "原始均衡数量", "Baseline quantity")}
                  </th>
                  <th>
                    {t(
                      "Commission込み価格",
                      "含佣金均衡价",
                      "Price with commission",
                    )}
                  </th>
                  <th>
                    {t(
                      "Commission込み数量",
                      "含佣金均衡数量",
                      "Quantity with commission",
                    )}
                  </th>
                  <th>
                    {t("最大総余剰", "最大总盈余", "Maximum total surplus")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.market}-${row.institution}`}>
                    <td>
                      {row.market}
                      {!row.eq &&
                        t("（補充待ち）", "（等待补足）", " (waiting)")}
                    </td>
                    <td>{INSTITUTIONS[row.institution].short}</td>
                    <td>
                      {row.counts.buyers}／{row.counts.sellers}
                    </td>
                    <td>{price(row.eq)}</td>
                    <td>{quantity(row.eq)}</td>
                    <td>{price(row.rewarded)}</td>
                    <td>{quantity(row.rewarded)}</td>
                    <td>{row.eq ? yen(row.eq.surplus) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details>
            <summary className="button secondary small-button disclosure-button">
              {t(
                "各市場の供需図・全単位の数値",
                "各市场供需图和单位数值",
                "Market charts and unit values",
              )}
            </summary>
            {rows
              .filter((row) => row.eq)
              .map((row) => (
                <section key={`${row.market}-${row.institution}`}>
                  <h4>
                    {t(
                      `市場${row.market}・${INSTITUTIONS[row.institution].short}（買${row.counts.buyers}人・売${row.counts.sellers}人）`,
                      `市场 ${row.market} · ${INSTITUTIONS[row.institution].short}（买方 ${row.counts.buyers}，卖方 ${row.counts.sellers}）`,
                      `Market ${row.market} · ${INSTITUTIONS[row.institution].short} (${row.counts.buyers} buyers, ${row.counts.sellers} sellers)`,
                    )}
                  </h4>
                  <StudyConditionPreview
                    settings={row.actual}
                    commission={commission}
                  />
                </section>
              ))}
          </details>
        </>
      )}
    </section>
  );
}
