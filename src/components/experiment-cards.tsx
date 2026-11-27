"use client";

import Link from "next/link";
import { EXPERIMENT_CATALOG } from "@/lib/experiment-catalog";
import { H5_DEMO_HREF, H5_TEACHER_HREF } from "@/lib/demo-navigation";
import { label } from "@/experiments/evolution/locale";
import { translator } from "@/lib/ui-language";
import { useExperimentLanguage } from "./experiment-language";

const descriptions = {
  institutions: [
    "交换商品，比较市场制度与价格形成。",
    "Trade goods and compare market institutions and price formation.",
  ],
  emh: [
    "交易股息不同的证券，观察信息与资产价格的关系。",
    "Trade securities with different dividends and observe how information relates to prices.",
  ],
  judgment: [
    "通过概率判断和决策观察认知偏差。",
    "Explore cognitive biases through probability judgments and decisions.",
  ],
  evolution: [
    "每轮更换配对，观察选择和收益的变化。",
    "Draw a partner each round and observe how choices and payoffs change.",
  ],
} satisfies Record<keyof typeof EXPERIMENT_CATALOG, [string, string]>;

export function ExperimentCards({ mode }: { mode: "teacher" | "demo" }) {
  const language = useExperimentLanguage();
  const t = translator(language);
  const ids = Object.keys(
    EXPERIMENT_CATALOG,
  ) as (keyof typeof EXPERIMENT_CATALOG)[];
  return (
    <div
      className={`experiment-grid${mode === "demo" ? " demo-experiment-grid" : ""}`}
      lang={language}
    >
      {ids.map((id) => {
        const experiment = EXPERIMENT_CATALOG[id];
        return (
          <Link
            key={id}
            className="experiment-card"
            href={
              mode === "demo" ? experiment.demoHref : experiment.teacherHref
            }
          >
            <h2 lang="en">{experiment.title}</h2>
            <p>{t(experiment.description, ...descriptions[id])}</p>
            {id === "emh" ? (
              <span>
                {t(
                  experiment.detail ?? "",
                  "资产市场实验",
                  "Asset market experiment",
                )}
              </span>
            ) : (
              experiment.detail && <span lang="en">{experiment.detail}</span>
            )}
          </Link>
        );
      })}
      <Link
        className="experiment-card"
        href={mode === "demo" ? H5_DEMO_HREF : H5_TEACHER_HREF}
      >
        <h2>{label(language, "h5Title")}</h2>
        <p>{label(language, "h5Description")}</p>
      </Link>
    </div>
  );
}
