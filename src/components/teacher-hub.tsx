import Link from "next/link";
import { TeacherRooms } from "./teacher-rooms";
import type { ServerStatus } from "@/lib/server/config";
import { ExperimentCards } from "./experiment-cards";
import { aiSetup } from "@/lib/server/ai-console";
import { AiExperimentDialog } from "./ai-experiment-dialog";
import styles from "@/app/teacher/ai/console.module.css";
import { ExperimentText } from "./experiment-language";

export function TeacherHub({ status }: { status: ServerStatus }) {
  const ai = aiSetup();
  const reentry = (
    <Link className="button secondary small-button" href="/teacher?code=">
      <ExperimentText
        ja="教員として再入室"
        zh="教师重新入室"
        en="Re-enter as teacher"
      />
    </Link>
  );
  return (
    <>
      <div
        className={
          ai ? `teacher-rooms-heading ${styles.entry}` : "teacher-rooms-heading"
        }
      >
        <h1>
          <ExperimentText
            ja="実験を選ぶ"
            zh="选择实验"
            en="Choose an experiment"
          />
        </h1>
        {ai ? (
          <div className="teacher-room-actions">
            <AiExperimentDialog config={ai} />
            {reentry}
          </div>
        ) : (
          reentry
        )}
      </div>
      <ExperimentCards mode="teacher" />
      <TeacherRooms status={status} />
    </>
  );
}
