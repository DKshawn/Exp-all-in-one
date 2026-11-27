"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { GraduationCap } from "lucide-react";
import type { RoomConfig } from "@/experiments/double-auction/lib/types";
import type { StudyGeneratorConfig } from "@/experiments/double-auction/lib/study-types";
import { DEMO_SETTINGS } from "@/experiments/double-auction/lib/demo";
import { Header, Footer } from "../../../components/shell";
import { TeacherForm } from "./teacher-form";
import { DemoSelectionLink } from "@/components/demo-selection-link";
import { DEMO_TEACHER_HREFS } from "@/lib/demo-navigation";
import { useExperimentLanguage } from "@/components/experiment-language";
import { translator } from "@/lib/ui-language";

const DemoRoom = dynamic(() => import("./demo-room"), {
  ssr: false,
  loading: () => (
    <main className="narrow-main">
      <p role="status">DEMOモードを準備しています…</p>
    </main>
  ),
});

export function DemoEntry() {
  const language = useExperimentLanguage();
  const t = translator(language);
  const [config, setConfig] = useState<RoomConfig>();
  const [generator, setGenerator] = useState<StudyGeneratorConfig>();
  const [running, setRunning] = useState(false);
  if (running && config)
    return (
      <DemoRoom
        config={config}
        generator={generator}
        onConfigure={(updated, updatedGenerator) => {
          setConfig(updated);
          setGenerator(updatedGenerator);
          setRunning(false);
        }}
      />
    );
  return (
    <>
      <Header
        homeHref="/demo"
        demoLabel={t("DEMOモード", "演示模式", "Demo mode")}
        demoExitLabel={t("DEMOモードを終了", "退出演示", "Exit demo")}
        demoExitHref={DEMO_TEACHER_HREFS.institutions}
        leading={<DemoSelectionLink label={t("戻る", "返回", "Back")} />}
      />
      <main className="narrow-main teacher-setup-main" lang={language}>
        <h1 className="eyebrow teacher-entry-heading">
          <GraduationCap size={18} />
          {t(
            "DEMOモード · 教員の実験設定",
            "演示模式 · 教师实验设置",
            "Demo mode · Teacher setup",
          )}
        </h1>
        <TeacherForm
          status={{ mode: "local", ready: true, keyRequired: false }}
          initialConfig={config}
          initialGenerator={generator}
          conditionPreset={{
            label: "Default",
            settings: DEMO_SETTINGS,
          }}
          onCreateDemo={(created, adoptedGenerator) => {
            setConfig(created);
            setGenerator(adoptedGenerator);
            setRunning(true);
          }}
        />
      </main>
      <Footer />
    </>
  );
}
