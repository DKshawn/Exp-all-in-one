import { requireTeacherPage } from "@/lib/server/teacher-page-access";
import { Header } from "@/components/shell";
import { ExperimentCards } from "@/components/experiment-cards";
import { ExperimentText } from "@/components/experiment-language";

export default async function DemoSelectionPage() {
  await requireTeacherPage("/demo/select");
  return (
    <>
      <Header demoLabel="DEMOモード" />
      <main className="teacher-hub-main">
        <h1>
          <ExperimentText
            ja="デモする実験を選ぶ"
            zh="选择演示实验"
            en="Choose a demo"
          />
        </h1>
        <ExperimentCards mode="demo" />
      </main>
    </>
  );
}
