import { requireTeacherPage } from "@/lib/server/teacher-page-access";
import { EvolutionDemo } from "@/experiments/evolution/components/demo";
export default async function Page() {
  await requireTeacherPage("/evolution/demo");
  return <EvolutionDemo />;
}
