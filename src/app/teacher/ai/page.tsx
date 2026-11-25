import Link from "next/link";
import { notFound } from "next/navigation";
import { AiExperimentConsole } from "@/components/ai-experiment-console";
import { Header } from "@/components/shell";
import { aiConsoleEnabled } from "@/lib/server/ai-console";
import { requireTeacherPage } from "@/lib/server/teacher-page-access";
import styles from "./console.module.css";

export default async function TeacherAiPage() {
  if (!aiConsoleEnabled()) notFound();
  await requireTeacherPage("/teacher/ai");
  return (
    <>
      <Header homeHref="/teacher">
        <Link href="/teacher" className="button secondary small-button">
          教員画面に戻る
        </Link>
      </Header>
      <main className={styles.main}>
        <h1 className={styles.title}>AI 実験台</h1>
        <AiExperimentConsole
          localModel={process.env.AI_EXPERIMENTS_LOCAL_MODEL ?? ""}
          openaiAvailable={Boolean(process.env.OPENAI_API_KEY?.trim())}
        />
      </main>
    </>
  );
}
