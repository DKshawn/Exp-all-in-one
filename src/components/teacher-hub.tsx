import Link from "next/link";
import { TeacherRooms } from "./teacher-rooms";
import type { ServerStatus } from "@/lib/server/config";
import { ExperimentCards } from "./experiment-cards";
import { aiConsoleEnabled } from "@/lib/server/ai-console";
import styles from "@/app/teacher/ai/console.module.css";

export function TeacherHub({ status }: { status: ServerStatus }) {
  const aiEnabled = aiConsoleEnabled();
  const reentry = (
    <Link className="button secondary small-button" href="/teacher?code=">
      教員として再入室
    </Link>
  );
  return (
    <>
      <div
        className={
          aiEnabled
            ? `teacher-rooms-heading ${styles.entry}`
            : "teacher-rooms-heading"
        }
      >
        <h1>実験を選ぶ</h1>
        {aiEnabled ? (
          <div className="teacher-room-actions">
            <Link className="button secondary small-button" href="/teacher/ai">
              AI 実験台
            </Link>
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
