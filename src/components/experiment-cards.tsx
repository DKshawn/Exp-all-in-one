import Link from "next/link";
import { EXPERIMENT_CATALOG } from "@/lib/experiment-catalog";

export function ExperimentCards({ mode }: { mode: "teacher" | "demo" }) {
  return (
    <div
      className={`experiment-grid${mode === "demo" ? " demo-experiment-grid" : ""}`}
    >
      {EXPERIMENT_CATALOG.map((experiment) => (
        <Link
          key={experiment.id}
          className="experiment-card"
          href={mode === "demo" ? experiment.demoHref : experiment.teacherHref}
        >
          <h2>{experiment.title}</h2>
          <p>{experiment.description}</p>
          {"detail" in experiment && <span>{experiment.detail}</span>}
        </Link>
      ))}
    </div>
  );
}
