"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { AiSetup } from "@/lib/ai-console";
import { DetailDialog } from "./detail-dialog";

const AiExperimentConsole = dynamic(
  () =>
    import("./ai-experiment-console").then((mod) => mod.AiExperimentConsole),
  { loading: () => <p role="status">読み込み中…</p> },
);

export function AiExperimentDialog({
  config,
  label = "AI 実験台",
  closeLabel,
  initialRoom,
  initialRun,
}: {
  config: AiSetup;
  label?: string;
  closeLabel?: string;
  initialRoom?: string;
  initialRun?: string;
}) {
  const [state, setState] = useState<"initial" | "open" | "closed">("initial");
  const close = () => setState("closed");
  return (
    <DetailDialog
      label={label}
      closeLabel={closeLabel}
      triggerClassName="button secondary small-button"
      className="ai-console-dialog"
      open={state === "open"}
      onOpen={() => setState("open")}
      onClose={close}
    >
      {state !== "initial" && (
        <AiExperimentConsole
          {...config}
          initialRoom={initialRoom}
          initialRun={initialRun}
          active={state === "open"}
          onNavigate={close}
        />
      )}
    </DetailDialog>
  );
}
