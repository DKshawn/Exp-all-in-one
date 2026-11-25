import Link from "next/link";
import { TeacherRooms } from "./teacher-rooms";
import type { ServerStatus } from "@/lib/server/config";
import { ExperimentCards } from "./experiment-cards";
import { ExperimentText } from "./experiment-language";

export function TeacherHub({ status }: { status: ServerStatus }) {
  return (
    <>
      <div className="teacher-rooms-heading">
        <h1>
          <ExperimentText
            ja="実験を選ぶ"
            zh="选择实验"
            en="Choose an experiment"
          />
        </h1>
        <Link className="button secondary small-button" href="/teacher?code=">
          <ExperimentText
            ja="教員として再入室"
            zh="教师重新入室"
            en="Re-enter as teacher"
          />
        </Link>
      </div>
      <ExperimentCards mode="teacher" />
      <TeacherRooms status={status} />
    </>
  );
}
