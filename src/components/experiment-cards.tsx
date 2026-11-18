import Link from "next/link";
import { EXPERIMENT_CATALOG } from "@/lib/experiment-catalog";

export function ExperimentCards({ mode }: { mode: "teacher" | "demo" }) {
  return (
    <div
      className={`experiment-grid${mode === "demo" ? " demo-experiment-grid" : ""}`}
    >
      {Object.entries(EXPERIMENT_CATALOG).map(([id, experiment]) => (
        <Link
          key={id}
          className="experiment-card"
          href={mode === "demo" ? experiment.demoHref : experiment.teacherHref}
        >
          <h2>{experiment.title}</h2>
          <p>{experiment.description}</p>
          {experiment.detail && <span>{experiment.detail}</span>}
        </Link>
      ))}
    </div>
  );
}
