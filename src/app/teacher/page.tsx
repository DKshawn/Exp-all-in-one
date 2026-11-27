import { DemoEntryLink } from "@/components/demo-entry-link";
import { H5_EXPERIMENT } from "@/lib/demo-navigation";
import { TeacherHub } from "@/components/teacher-hub";
import { EvolutionSetup } from "@/experiments/evolution/components/setup";
import { ExperimentText } from "@/components/experiment-language";
import { TeacherReentry } from "@/components/teacher-reentry";
import { EmhCreateForm } from "@/experiments/emh/components/create-form";
import { JudgmentCreateForm } from "@/experiments/judgment/components/create-form";
import { studies } from "@/experiments/judgment/server/core";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/shell";
import { TeacherForm } from "@/experiments/double-auction/components/teacher-form";
import { getServerStatus } from "@/lib/server/config";
import { pptStudySettings } from "@/experiments/double-auction/server/study";
import { teacherRoomHref } from "@/lib/room-navigation";
import { requireTeacherPage } from "@/lib/server/teacher-page-access";
import { TeacherLogout } from "@/components/teacher-login";
import { FORMAL_EXP2_OPTIONS } from "@/experiments/emh/server/default-config";

function TeacherSelectionNav({ returnRoom }: { returnRoom?: string }) {
  return (
    <nav className="header-leading-nav" aria-label="教員の操作">
      <Link
        className="button secondary small-button"
        href={returnRoom ? teacherRoomHref(returnRoom) : "/teacher"}
      >
        <ArrowLeft size={15} />
        {returnRoom ? (
          <ExperimentText
            ja={`ルーム ${returnRoom} に戻る`}
            zh={`返回房间 ${returnRoom}`}
            en={`Back to room ${returnRoom}`}
          />
        ) : (
          <ExperimentText ja="戻る" zh="返回" en="Back" />
        )}
      </Link>
    </nav>
  );
}

export default async function Teacher({
  searchParams,
}: {
  searchParams: Promise<{
    code?: string;
    legacy?: string;
    room?: string;
    experiment?: string;
  }>;
}) {
  const { code, legacy, room, experiment } = await searchParams;
  const status = getServerStatus();
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({ code, legacy, room, experiment }))
    if (value !== undefined) query.set(key, value);
  await requireTeacherPage(`/teacher${query.size ? `?${query}` : ""}`);
  const returnRoom = room && /^[A-Z2-9]{6}$/.test(room) ? room : undefined;
  if (code !== undefined && !returnRoom) {
    return (
      <>
        <Header leading={<TeacherSelectionNav />}>
          <Link className="button secondary small-button" href="/">
            <ExperimentText
              ja="学生の入室画面"
              zh="学生入室"
              en="Student entry"
            />
          </Link>
          {status.keyRequired && <TeacherLogout />}
        </Header>
        <main className="narrow-main teacher-setup-main">
          <div className="teacher-hub-main teacher-entry-content">
            <TeacherReentry key={code} initialCode={code} />
          </div>
        </main>
      </>
    );
  }
  if (returnRoom || (legacy !== "1" && experiment !== "institutions")) {
    const selectedExperiment =
      !returnRoom &&
      (experiment === "emh" ||
        experiment === "judgment" ||
        experiment === "evolution" ||
        experiment === H5_EXPERIMENT);
    return (
      <>
        <Header
          homeHref="/teacher"
          leading={
            selectedExperiment || returnRoom ? (
              <TeacherSelectionNav returnRoom={returnRoom} />
            ) : undefined
          }
        >
          {!selectedExperiment && <DemoEntryLink />}
          <Link className="button secondary small-button" href="/">
            <ExperimentText
              ja="学生の入室画面"
              zh="学生入室"
              en="Student entry"
            />
          </Link>
          {status.keyRequired && <TeacherLogout />}
        </Header>
        <main
          className={
            selectedExperiment
              ? "narrow-main teacher-setup-main"
              : "teacher-hub-main"
          }
        >
          {selectedExperiment ? (
            <div
              className={`teacher-hub-main teacher-entry-content${experiment === "judgment" ? " judgment-entry-content" : ""}`}
            >
              {experiment === "evolution" || experiment === H5_EXPERIMENT ? (
                <EvolutionSetup
                  key={experiment}
                  ready={status.ready}
                  neighbors={experiment === H5_EXPERIMENT}
                />
              ) : experiment === "judgment" ? (
                <JudgmentCreateForm status={status} studies={studies} />
              ) : (
                <EmhCreateForm
                  status={status}
                  exp2Defaults={FORMAL_EXP2_OPTIONS}
                />
              )}
            </div>
          ) : (
            <TeacherHub status={status} />
          )}
        </main>
      </>
    );
  }
  return (
    <>
      <Header homeHref="/teacher" leading={<TeacherSelectionNav />}>
        {status.keyRequired && <TeacherLogout />}
      </Header>
      <main
        className={
          legacy === "1" ? "narrow-main" : "narrow-main teacher-setup-main"
        }
      >
        <TeacherForm
          status={status}
          legacy={legacy === "1"}
          conditionPreset={{
            label: "Default",
            settings: pptStudySettings(),
          }}
        />
      </main>
    </>
  );
}
