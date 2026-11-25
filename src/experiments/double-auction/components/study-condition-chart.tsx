"use client";

import { useId, useState } from "react";
import { useSetupText } from "@/components/experiment-language";
import { Minus, Plus } from "lucide-react";
import { staircasePoints } from "@/experiments/double-auction/lib/study-generator";
import {
  studyChartTicks,
  studyChartViewport,
} from "@/experiments/double-auction/lib/study-chart";

export function StudyConditionChart({
  demand,
  supply,
}: {
  demand: number[];
  supply: number[];
}) {
  const t = useSetupText();
  const titleId = useId();
  const clipId = useId();
  const [zoom, setZoom] = useState(1);
  const view = studyChartViewport(demand, supply, zoom);
  const { eq } = view;
  const x = (q: number) =>
    60 + ((q - view.quantityMin) / (view.quantityMax - view.quantityMin)) * 650;
  const y = (price: number) =>
    255 - ((price - view.priceMin) / (view.priceMax - view.priceMin)) * 215;
  const points = (units: number[]) =>
    staircasePoints(units)
      .map(([q, price]) => `${x(q).toFixed(2)},${y(price).toFixed(2)}`)
      .join(" ");
  const xTicks = studyChartTicks(
    Math.max(0, view.quantityMin),
    Math.min(view.count, view.quantityMax),
  );
  const yTicks = studyChartTicks(Math.max(0, view.priceMin), view.priceMax);
  const format = (n: number) => Number(n.toFixed(1));
  const range = (low: number, high: number) =>
    low === high
      ? low
      : t(`${low}〜${high}`, `${low}–${high}`, `${low}–${high}`);
  const price = range(eq.low, eq.high);
  const equilibriumLabel = `${eq.quantityMax > eq.quantity ? t("重なり", "重叠", "Overlap") : t("均衡", "均衡", "Equilibrium")} ${range(eq.quantity, eq.quantityMax)} · ${t(`${price}円`, `${price} 日元`, `¥${price}`)}`;
  const displayedMin = format(Math.max(0, view.quantityMin));
  const displayedMax = format(Math.min(view.count, view.quantityMax));

  return (
    <figure className="study-condition-chart">
      <div
        className="study-condition-chart-controls"
        role="group"
        aria-label={t(
          "供需図の表示",
          "供需图视图",
          "Supply and demand chart controls",
        )}
      >
        <button
          type="button"
          className="button secondary"
          aria-label={t(
            "供需図を縮小",
            "缩小供需图",
            "Zoom out on the supply and demand chart",
          )}
          disabled={view.zoom <= view.minZoom}
          onClick={() =>
            setZoom((current) => Math.max(view.minZoom, current / 1.5))
          }
        >
          <Minus size={14} aria-hidden="true" /> {t("縮小", "缩小", "Zoom out")}
        </button>
        <button
          type="button"
          className="button secondary"
          aria-label={t(
            "供需図を拡大",
            "放大供需图",
            "Zoom in on the supply and demand chart",
          )}
          disabled={view.zoom >= 8}
          onClick={() => setZoom((current) => Math.min(8, current * 1.5))}
        >
          <Plus size={14} aria-hidden="true" /> {t("拡大", "放大", "Zoom in")}
        </button>
        <button
          type="button"
          className="button secondary"
          onClick={() => setZoom(view.minZoom)}
        >
          {t("全体", "全图", "Fit all")}
        </button>
        <button
          type="button"
          className="button secondary"
          onClick={() => setZoom(1)}
        >
          {t("初期表示", "重置", "Reset")}
        </button>
        <output className="study-chart-range" aria-live="polite">
          {t(
            `表示数量 ${displayedMin}〜${displayedMax} / ${view.count}単位`,
            `显示 ${displayedMin}–${displayedMax} / ${view.count} 单位`,
            `Showing ${displayedMin}–${displayedMax} of ${view.count} units`,
          )}
        </output>
      </div>
      <svg viewBox="0 0 760 310" role="img" aria-labelledby={titleId}>
        <title id={titleId}>
          {t(
            "数量に対応する買い手の限界価値と売り手の限界費用の階段供需図",
            "买方边际价值与卖方边际成本随数量变化的阶梯供需图",
            "Step chart of buyers’ marginal values and sellers’ marginal costs by quantity",
          )}
        </title>
        <defs>
          <clipPath id={clipId}>
            <rect x={60} y={40} width={650} height={215} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          {view.quantityMin < 0 && (
            <rect
              x={60}
              y={40}
              width={x(0) - 60}
              height={215}
              className="study-chart-outside-range"
            />
          )}
          {view.quantityMax > view.count && (
            <rect
              x={x(view.count)}
              y={40}
              width={710 - x(view.count)}
              height={215}
              className="study-chart-outside-range"
            />
          )}
        </g>
        {yTicks.map((price) => (
          <g key={price}>
            <line
              x1={60}
              x2={710}
              y1={y(price)}
              y2={y(price)}
              className="study-curve-grid"
            />
            <text x={50} y={y(price) + 4} textAnchor="end">
              {price}
            </text>
          </g>
        ))}
        {xTicks.map((q) => (
          <g key={q}>
            <line
              x1={x(q)}
              x2={x(q)}
              y1={40}
              y2={255}
              className="study-curve-grid"
            />
            <text x={x(q)} y={277} textAnchor="middle">
              {q}
            </text>
          </g>
        ))}
        <text x={60} y={23}>
          {t(
            "限界価値・費用（円）",
            "边际价值和成本（日元）",
            "Marginal value and cost (¥)",
          )}
        </text>
        <text x={710} y={301} textAnchor="end">
          {t("数量（単位）", "数量（单位）", "Quantity (units)")}
        </text>
        <g clipPath={`url(#${clipId})`}>
          <polyline points={points(demand)} className="study-demand-curve" />
          <polyline points={points(supply)} className="study-supply-curve" />
          <line
            x1={x(eq.quantity)}
            x2={x(eq.quantityMax)}
            y1={y(eq.low)}
            y2={y(eq.high)}
            className="study-overlap-curve"
          />
          <circle
            cx={x(view.quantityCenter)}
            cy={y(view.priceCenter)}
            r={4}
            className="study-equilibrium-point"
          />
        </g>
        <text
          x={x(view.quantityCenter)}
          y={Math.max(54, y(eq.high) - 13)}
          textAnchor="middle"
          className="study-overlap-label"
        >
          {equilibriumLabel}
        </text>
      </svg>
      <div className="study-curve-legend">
        <span className="demand">
          {t("買い手の価値 D(k)", "买方价值 D(k)", "Buyer value D(k)")}
        </span>
        <span className="supply">
          {t("売り手の費用 S(k)", "卖方成本 S(k)", "Seller cost S(k)")}
        </span>
        <span className="overlap">
          {t("均衡範囲", "均衡区间", "Equilibrium range")}
        </span>
      </div>
      <figcaption>
        {t(
          "均衡範囲の中心を表示します。第k単位は数量k−1〜kを覆います。参加者の実際の注文価格ではありません。",
          "图中标出均衡区间中心。第 k 个单位对应数量 k−1 到 k，价格来自供需条件。",
          "The dot marks the center of the equilibrium range. Unit k spans quantities k−1 to k. Prices come from the supply and demand schedules.",
        )}
      </figcaption>
    </figure>
  );
}
