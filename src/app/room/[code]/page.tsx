import { experimentFor } from "@/lib/server/experiment-registry";
import { EvolutionRoom } from "@/experiments/evolution/components/room";
import { SessionClient } from "@/experiments/emh/components/session-client";
import { JudgmentTeacherRoom } from "@/experiments/judgment/components/teacher-room";
import { StudentApp } from "@/experiments/judgment/components/student-app";
import { studies } from "@/experiments/judgment/server/core";
import { notFound } from "next/navigation";
import { Room } from "@/experiments/double-auction/components/room";
import { requireTeacherPage } from "@/lib/server/teacher-page-access";
import { aiRoomRun, aiSetup } from "@/lib/server/ai-console";
import { isAiExperiment } from "@/lib/ai-console";

export const dynamic = "force-dynamic";

export default async function RoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ entry?: string }>;
}) {
  const { code } = await params;
  if (!/^[A-Za-z2-9]{6}$/.test(code)) notFound();
  const { entry } = await searchParams;
  if (entry === "teacher")
    await requireTeacherPage(`/room/${code.toUpperCase()}?entry=teacher`);
  const experiment = await experimentFor(code.toUpperCase());
  const aiConfig =
    entry === "teacher" && experiment && isAiExperiment(experiment)
      ? aiSetup()
      : undefined;
  const aiRun = aiConfig
    ? ((await aiRoomRun(code.toUpperCase()).catch(() => null)) ?? undefined)
    : undefined;
  if (experiment === "evolution")
    return (
      <EvolutionRoom
        key={`${code}-${entry === "teacher" ? "teacher" : "student"}`}
        code={code.toUpperCase()}
        role={entry === "teacher" ? "teacher" : "student"}
        aiRun={aiRun}
        aiConfig={aiConfig}
      />
    );
  if (experiment === "judgment")
    return entry === "teacher" ? (
      <JudgmentTeacherRoom code={code.toUpperCase()} studies={studies} />
    ) : (
      <StudentApp code={code.toUpperCase()} />
    );
  if (experiment === "emh")
    return (
      <SessionClient
        code={code.toUpperCase()}
        role={entry === "teacher" ? "teacher" : "student"}
        aiRun={aiRun}
        aiConfig={aiConfig}
      />
    );
  return (
    <Room
      key={`${code.toUpperCase()}-${entry === "teacher" ? "teacher" : "student"}`}
      code={code.toUpperCase()}
      entry={entry}
      aiRun={aiRun}
      aiConfig={aiConfig}
    />
  );
}
