import Link from "next/link";
import { TeacherRooms } from "./teacher-rooms";
import type { ServerStatus } from "@/lib/server/config";
import { ExperimentCards } from "./experiment-cards";
import { aiSetup } from "@/lib/server/ai-console";
import { AiExperimentDialog } from "./ai-experiment-dialog";
import styles from "@/app/teacher/ai/console.module.css";

export function TeacherHub({ status }: { status: ServerStatus }) {
  const ai = aiSetup();
  const reentry = (
    <Link className="button secondary small-button" href="/teacher?code=">
      教員として再入室
    </Link>
  );
  return (
    <>
      <div
        className={
          ai ? `teacher-rooms-heading ${styles.entry}` : "teacher-rooms-heading"
        }
      >
        <h1>実験を選ぶ</h1>
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
