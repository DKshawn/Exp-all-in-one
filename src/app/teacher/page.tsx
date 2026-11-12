import { DemoEntryLink } from "@/components/demo-entry-link";
import { TeacherHub } from "@/components/teacher-hub";
import { EvolutionSetup } from "@/experiments/evolution/components/setup";
import { EvolutionLanguage } from "@/experiments/evolution/components/language";
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

function TeacherSelectionNav({ children }: { children?: React.ReactNode }) {
  return (
    <nav className="header-leading-nav" aria-label="教員の操作">
      <Link className="button secondary small-button" href="/teacher">
        <ArrowLeft size={15} />
        戻る
      </Link>
      {children}
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
            学生の入室画面
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
  if (!code && !returnRoom && legacy !== "1" && experiment !== "institutions") {
    const selectedExperiment =
      experiment === "emh" ||
      experiment === "judgment" ||
      experiment === "evolution";
    return (
      <>
        <Header
          homeHref="/teacher"
          leading={selectedExperiment ? <TeacherSelectionNav /> : undefined}
        >
          {!selectedExperiment && <DemoEntryLink />}
          {experiment === "evolution" && <EvolutionLanguage />}
          <Link className="button secondary small-button" href="/">
            学生の入室画面
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
              {experiment === "evolution" ? (
                <EvolutionSetup ready={status.ready} />
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
      <Header
        homeHref="/teacher"
        leading={
          <TeacherSelectionNav>
            {returnRoom && (
              <Link
                className="button secondary small-button"
                href={teacherRoomHref(returnRoom)}
              >
                ルーム {returnRoom} に戻る
              </Link>
            )}
          </TeacherSelectionNav>
        }
      >
        {status.keyRequired && <TeacherLogout />}
      </Header>
      <main
        className={
          legacy === "1" ? "narrow-main" : "narrow-main teacher-setup-main"
        }
      >
        <TeacherForm
          initialCode={code}
          initialTab={returnRoom ? "manage" : undefined}
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
