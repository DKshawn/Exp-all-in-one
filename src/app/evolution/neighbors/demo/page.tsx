import { EvolutionDemo } from "@/experiments/evolution/components/demo";
import { H5_DEMO_HREF } from "@/lib/demo-navigation";
import { requireTeacherPage } from "@/lib/server/teacher-page-access";

export default async function Page() {
  await requireTeacherPage(H5_DEMO_HREF);
  return <EvolutionDemo neighbors />;
}
