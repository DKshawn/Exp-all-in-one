"use client";

import { useEffect, useId, useRef, useState } from "react";
import { FlaskConical, Info } from "lucide-react";
import { api, errorMessage } from "@/lib/client";
import { TeacherPasswordHelp } from "@/components/teacher-password-help";
import {
  MAX_STUDY_MARKETS,
  MAX_STUDY_PARTICIPANTS,
  studyLayoutError,
  studyInstitutionOrders,
  DEFAULT_STUDY_PERIODS,
  studyTotalRounds,
  studyPeriodsError,
  studyInstitutions,
  studyMarketSize,
  studyTemplateSideCount,
  studyUnits,
  studyUnitCounts,
  studyUnitsError,
} from "@/experiments/double-auction/lib/study-config";
import type { ServerStatus } from "@/lib/server/config";
import { Spinner } from "../../../components/shell";
import { StudyProgramFields } from "./study-program-fields";
import { StudyDetailDialog } from "./study-detail-dialog";
import { StudySetupStep } from "./study-setup-step";
import {
  DEFAULT_STUDY_COMMISSION,
  studyCommission,
  studyCommissionError,
} from "@/experiments/double-auction/lib/study-commission";
import {
  DEFAULT_STUDY_TIMING,
  studyTimingError,
  studyTimingForInstitutions,
} from "@/experiments/double-auction/lib/study-timing";
import { INSTITUTIONS } from "@/experiments/double-auction/lib/study-rules";
import type {
  Institution,
  StudyPeriods,
  StudyGeneratorConfig,
  StudySettings,
  StudyUnitCounts,
  StudySchedules,
} from "@/experiments/double-auction/lib/study-types";
import type { RoomConfig } from "@/experiments/double-auction/lib/types";
import { studyRoomConfigSchema } from "@/experiments/double-auction/lib/study-room-config";
import {
  StudyPresetPicker,
  type StudyPresetPreview,
} from "./study-preset-picker";
import {
  conditionSchedules,
  presetStudyConditions,
} from "@/experiments/double-auction/lib/study-conditions";
import { studyAllocationPlan } from "@/experiments/double-auction/lib/study-allocation";
import { StudyUnitFields } from "./study-unit-settings";
import { StudyAllocationPreview } from "./study-allocation-preview";
import { teacherRoomHref } from "@/lib/room-navigation";
import {
  SetupLanguage,
  useExperimentLanguage,
} from "@/components/experiment-language";
import { translator } from "@/lib/ui-language";
import { studySetupError } from "@/experiments/double-auction/lib/study-setup-text";

export function TeacherForm({
  status,
  legacy = false,
  initialConfig,
  initialGenerator,
  conditionPreset,
  onCreateDemo,
}: {
  status: ServerStatus;
  legacy?: boolean;
  initialConfig?: RoomConfig;
  initialGenerator?: StudyGeneratorConfig;
  conditionPreset?: { label: string; settings: StudySettings };
  onCreateDemo?: (config: RoomConfig, generator?: StudyGeneratorConfig) => void;
}) {
  const language = useExperimentLanguage();
  const t = translator(language);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [titleDraft, setTitle] = useState(initialConfig?.title);
  const title =
    titleDraft ??
    (onCreateDemo
      ? t("ひとりデモ", "单人演示", "Solo demo")
      : legacy
        ? t(
            "ダブルオークション実験",
            "双向拍卖实验",
            "Double Auction experiment",
          )
        : t(
            "実験1：市場制度の比較",
            "实验 1：市场制度比较",
            "Experiment 1: Comparing market institutions",
          ));
  const [configureFirst, setConfigureFirst] = useState(false);
  const [detailsSaved, setDetailsSaved] = useState(
    initialConfig?.studySetupConfirmed === true,
  );
  const [configurationStep, setConfigurationStep] = useState(0);
  const [configurationProgress, setConfigurationProgress] = useState(0);
  const configurationId = useId();
  useEffect(() => {
    if (configureFirst) {
      document
        .getElementById(`${configurationId}-heading-${configurationStep}`)
        ?.focus({ preventScroll: true });
    }
  }, [configureFirst, configurationId, configurationStep]);
  const settingsDisabled = pending;
  const [preset, setPreset] = useState(() =>
    !initialConfig
      ? "1"
      : studyMarketSize(initialConfig) === 16 &&
          [1, 6, 12].includes(initialConfig.markets!)
        ? String(initialConfig.markets)
        : "custom",
  );
  const [marketCount, setMarketCount] = useState(
    String(initialConfig?.markets ?? 1),
  );
  const [marketSize, setMarketSize] = useState(
    String(initialConfig?.capacity ?? 16),
  );
  const [marketMode, setMarketMode] = useState<"auto" | "manual">(
    initialConfig?.studyMarketMode ?? (initialConfig ? "manual" : "auto"),
  );
  const [unitsDraft, setUnitsDraft] = useState<Record<Institution, string>>(
    () => ({
      cda: String(studyUnits(initialConfig ?? {}, "cda")),
      call: String(studyUnits(initialConfig ?? {}, "call")),
      posted: String(studyUnits(initialConfig ?? {}, "posted")),
    }),
  );
  const [timing, setTiming] = useState(() => ({
    ...DEFAULT_STUDY_TIMING,
    ...initialConfig?.studyTiming,
  }));
  const [commission, setCommission] = useState(() =>
    initialConfig ? studyCommission(initialConfig) : DEFAULT_STUDY_COMMISSION,
  );
  const [institutions, setInstitutions] = useState<Institution[]>(() => [
    ...studyInstitutions(initialConfig ?? {}),
  ]);
  const [periods, setPeriods] = useState<StudyPeriods>(() => ({
    ...DEFAULT_STUDY_PERIODS,
    ...initialConfig?.studyPeriods,
  }));
  const [adoptedConditions, setAdoptedConditions] = useState<{
    marketSize: number;
    units: number;
    unitsByInstitution: StudyUnitCounts;
    settingsByInstitution?: StudySchedules;
    generator?: StudyGeneratorConfig;
    settings?: StudySettings;
    otherSettings?: StudySettings;
  } | null>(() => {
    const config = initialConfig ?? {
      title: "",
      capacity: 16,
      rounds: 15,
      duration: 180,
    };
    const primary = studyInstitutions(config)[0];
    const schedules = conditionPreset
      ? conditionSchedules(
          presetStudyConditions(
            config,
            conditionPreset.settings,
            initialGenerator,
          ),
        )
      : undefined;
    return {
      marketSize: studyMarketSize(config),
      units: studyUnits(config, primary),
      unitsByInstitution: studyUnitCounts(config),
      settings: schedules?.[primary],
      settingsByInstitution: schedules,
      ...(initialGenerator
        ? { generator: structuredClone(initialGenerator) }
        : {}),
    };
  });
  function configurationSnapshot() {
    return {
      preset,
      marketCount,
      marketSize,
      marketMode,
      unitsDraft,
      timing,
      commission,
      institutions,
      periods,
      adoptedConditions,
    };
  }
  const savedConfiguration = useRef<ReturnType<
    typeof configurationSnapshot
  > | null>(null);
  function openConfiguration() {
    savedConfiguration.current = structuredClone(configurationSnapshot());
    setError("");
    setConfigurationStep(0);
    setConfigurationProgress(detailsSaved ? 2 : 0);
    setConfigureFirst(true);
  }
  function cancelConfiguration() {
    const saved = savedConfiguration.current;
    if (saved) {
      setPreset(saved.preset);
      setMarketCount(saved.marketCount);
      setMarketSize(saved.marketSize);
      setMarketMode(saved.marketMode);
      setUnitsDraft(saved.unitsDraft);
      setTiming(saved.timing);
      setCommission(saved.commission);
      setInstitutions(saved.institutions);
      setPeriods(saved.periods);
      setAdoptedConditions(saved.adoptedConditions);
    }
    savedConfiguration.current = null;
    setError("");
    setConfigureFirst(false);
  }
  const institutionError = institutions.length
    ? ""
    : "実施する制度を1つ以上選択してください。";
  const periodsError = studyPeriodsError(periods, institutions);
  const rounds = studyTotalRounds({
    studyInstitutions: institutions,
    studyPeriods: periods,
  });
  const orderCount = institutions.length
    ? studyInstitutionOrders(institutions).length
    : 0;
  const attendance = Number(marketSize);
  const allocation = studyAllocationPlan(
    Number.isInteger(attendance) &&
      attendance >= 2 &&
      attendance <= MAX_STUDY_PARTICIPANTS
      ? attendance
      : 0,
    Number.isInteger(Number(marketCount)) &&
      Number(marketCount) >= 1 &&
      Number(marketCount) <= MAX_STUDY_MARKETS
      ? Number(marketCount)
      : 1,
    marketMode,
  );
  const count = allocation.requestedMarkets;
  const size = allocation.templateSize;
  const largestMarket = Math.max(
    0,
    ...allocation.layout.map((m) => m.buyers + m.sellers),
  );
  const unitsByInstitution = Object.fromEntries(
    Object.entries(unitsDraft).map(([key, value]) => [key, Number(value)]),
  ) as StudyUnitCounts;
  const units = unitsByInstitution[institutions[0] ?? "cda"];
  const unitsError =
    institutions
      .map((i) => studyUnitsError(unitsByInstitution[i]))
      .find(Boolean) ?? "";
  const layoutError = studyLayoutError(
    marketMode === "auto" ? count : Number(marketCount),
    attendance,
    true,
  );
  const timingError = studyTimingError(timing, institutions);
  const commissionError =
    Object.values(adoptedConditions?.settingsByInstitution ?? {})
      .map((settings) => studyCommissionError(commission, settings))
      .find(Boolean) ||
    studyCommissionError(
      commission,
      adoptedConditions?.settings,
      institutions.some((i) => i !== "cda")
        ? adoptedConditions?.otherSettings
        : undefined,
    );
  const conditionsPending =
    !adoptedConditions ||
    adoptedConditions.marketSize !== size ||
    adoptedConditions.units !== units ||
    institutions.some(
      (i) => adoptedConditions?.unitsByInstitution[i] !== unitsByInstitution[i],
    );
  const configurationError =
    layoutError ||
    unitsError ||
    institutionError ||
    periodsError ||
    timingError ||
    commissionError;
  const stepError = [
    institutionError || periodsError || timingError,
    layoutError,
    configurationError,
  ][configurationStep];
  function nextConfigurationStep() {
    if (stepError) return;
    const next = Math.min(2, configurationStep + 1);
    setConfigurationProgress((previous) => Math.max(previous, next));
    setConfigurationStep(next);
    setError("");
  }
  function saveConfiguration(preview: StudyPresetPreview, amount: number) {
    const invalid =
      (!title.trim() ? "実験名を入力してください。" : "") ||
      layoutError ||
      unitsError ||
      institutionError ||
      periodsError ||
      timingError ||
      Object.values(preview.settingsByInstitution ?? {})
        .map((settings) => studyCommissionError(amount, settings))
        .find(Boolean) ||
      studyCommissionError(amount, preview.settings, preview.otherSettings);
    if (invalid) {
      setError(invalid);
      return false;
    }
    setAdoptedConditions({
      marketSize: size,
      units,
      unitsByInstitution,
      settingsByInstitution: preview.settingsByInstitution,
      generator: preview.generator,
      settings: preview.settings,
      otherSettings: preview.otherSettings,
    });
    setCommission(amount);
    savedConfiguration.current = null;
    setDetailsSaved(true);
    setError("");
    setConfigureFirst(false);
    return true;
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !legacy &&
      (layoutError ||
        unitsError ||
        institutionError ||
        periodsError ||
        timingError ||
        commissionError ||
        conditionsPending)
    ) {
      setError(
        layoutError ||
          unitsError ||
          institutionError ||
          periodsError ||
          timingError ||
          commissionError,
      );
      return;
    }
    setError("");
    setPending(true);
    const form = new FormData(event.currentTarget);
    try {
      const selectedTiming = studyTimingForInstitutions(timing, institutions);
      const config: RoomConfig = legacy
        ? {
            title: String(form.get("title")),
            capacity: Number(form.get("capacity")),
            rounds: Number(form.get("rounds")),
            duration: Number(form.get("duration")),
          }
        : {
            protocol: "institutions-v1",
            studyAdmission: "flexible",
            studyMarketMode: marketMode,
            ...(detailsSaved ? { studySetupConfirmed: true } : {}),
            title,
            markets: count,
            marketSize: size,
            capacity: attendance,
            rounds,
            duration: selectedTiming.cdaSeconds,
            studyTiming: selectedTiming,
            studyCommission: commission,
            studyCdaUnits: unitsByInstitution.cda,
            studyUnitCounts: unitsByInstitution,
            studyInstitutions: institutions,
            studyPeriods: Object.fromEntries(
              institutions.map((i) => [i, periods[i]]),
            ),
          };
      if (onCreateDemo) {
        const parsed = studyRoomConfigSchema.safeParse(config);
        if (!parsed.success) {
          setError("実験名・人数・期数・時間の入力内容を確認してください。");
          return;
        }
        onCreateDemo(parsed.data, adoptedConditions?.generator);
        return;
      }
      const result = await api<{ code: string }>("/api/rooms", {
        config,
        password: form.get("password"),
        ...(!legacy && adoptedConditions?.generator
          ? { generator: adoptedConditions.generator }
          : {}),
      });
      // Open the teacher credential slot without changing the student session.
      window.location.assign(teacherRoomHref(result.code));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  const studyCreation = !legacy;
  const conditionHeading = (
    <h2 id="teacher-condition-heading">
      {t("供需プリセット", "供需预设", "Supply and demand preset")}
    </h2>
  );
  const conditionSection = (
    <div className="teacher-condition-layout">
      <StudyPresetPicker
        existingPreset={conditionPreset}
        units={studyTemplateSideCount({ marketSize: size }) * units}
        unitsPerParticipant={units}
        unitsByInstitution={unitsByInstitution}
        institutions={institutions}
        marketLayout={allocation.layout}
        initialGenerator={adoptedConditions?.generator}
        disabled={pending}
        validationError={
          layoutError ||
          unitsError ||
          institutionError ||
          periodsError ||
          timingError
        }
        renderUnitFields={(fieldsDisabled) => (
          <StudyUnitFields
            units={unitsDraft}
            onChange={(institution, value) => {
              setUnitsDraft((previous) => ({
                ...previous,
                [institution]: value,
              }));
              setAdoptedConditions(null);
              setError("");
            }}
            disabled={fieldsDisabled}
            institutions={institutions}
          />
        )}
        commission={commission}
        onCommissionChange={setCommission}
        settingsPanel={{
          heading: conditionHeading,
          labelledBy: "teacher-condition-heading",
        }}
        actionLabel={t(
          "設定を保存して閉じる",
          "保存设置并关闭",
          "Save and close",
        )}
        renderAllocation={(preview, other) => (
          <StudyAllocationPreview
            plan={allocation}
            config={{
              title,
              capacity: attendance,
              rounds,
              duration: timing.cdaSeconds,
              studyInstitutions: institutions,
            }}
            settings={preview.settings}
            settingsByInstitution={preview.settingsByInstitution}
            otherSettings={other}
            commission={commission}
          />
        )}
        onDraftChange={() => {
          setAdoptedConditions(null);
          setError("");
        }}
        onConfirm={saveConfiguration}
      />
    </div>
  );
  const configurationActions = (
    <div className="teacher-configuration-step-actions">
      {stepError && (
        <p
          id={configurationStep === 1 ? "study-layout-help" : undefined}
          className="error-message"
          role="alert"
        >
          {studySetupError(t, stepError)}
        </p>
      )}
      {error && error !== stepError && (
        <p className="error-message" role="alert">
          {studySetupError(t, error)}
        </p>
      )}
      <div className="study-actions">
        <button
          type="button"
          className="button primary"
          disabled={pending || Boolean(stepError)}
          onClick={nextConfigurationStep}
        >
          {t("確定して次へ", "确认并继续", "Confirm and continue")}
        </button>
      </div>
    </div>
  );
  return (
    <SetupLanguage.Provider value={language}>
      <div
        className="panel teacher-form-card localized-room-setup"
        lang={language}
      >
        <form
          method="post"
          onSubmit={submit}
          className={
            studyCreation
              ? "teacher-create-layout teacher-create-quick"
              : undefined
          }
        >
          <div className="teacher-primary-settings">
            <section
              className={
                studyCreation ? "teacher-settings-section panel" : undefined
              }
            >
              {studyCreation && (
                <h2>{t("ルームの設定", "房间设置", "Room settings")}</h2>
              )}
              <label className="field">
                {t("実験名", "实验名称", "Room title")}
                <input
                  name="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={pending}
                  maxLength={60}
                  required
                />
              </label>
              {studyCreation && (
                <button
                  type="button"
                  className="button secondary"
                  aria-haspopup="dialog"
                  onClick={openConfiguration}
                >
                  {t(
                    "作成前に詳細を設定",
                    "创建前设置详情",
                    "Configure before creating",
                  )}
                </button>
              )}
            </section>
            {legacy ? (
              <>
                <div className="form-grid">
                  <label className="field">
                    {t("参加人数", "参加人数", "Participants")}
                    <input
                      name="capacity"
                      type="number"
                      defaultValue={initialConfig?.capacity ?? 12}
                      min={12}
                      step={2}
                      max={MAX_STUDY_PARTICIPANTS}
                      required
                    />
                  </label>
                  <label className="field">
                    {t("ラウンド数", "轮数", "Rounds")}
                    <input
                      type="number"
                      name="rounds"
                      defaultValue={6}
                      min={1}
                      max={12}
                      required
                    />
                  </label>
                </div>
                <label className="field">
                  {t(
                    "1ラウンドの取引時間",
                    "每轮交易时长",
                    "Trading time per round",
                  )}
                  <select name="duration" defaultValue="180">
                    {[1, 2, 3, 5, 10].map((minutes) => (
                      <option key={minutes} value={minutes * 60}>
                        {t(`${minutes}分`, `${minutes} 分钟`, `${minutes} min`)}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}
            {!onCreateDemo && (
              <section
                className={
                  studyCreation ? "teacher-settings-section panel" : undefined
                }
              >
                <label className="field">
                  {t("教員パスワード", "教师房间密码", "Room password")}
                  <input
                    type="password"
                    name="password"
                    placeholder={t(
                      "8文字以上で設定",
                      "至少 8 个字符",
                      "At least 8 characters",
                    )}
                    minLength={8}
                    maxLength={128}
                    required
                    autoComplete="new-password"
                  />
                  <TeacherPasswordHelp language={language} />
                </label>
              </section>
            )}
          </div>
          <div className="teacher-form-actions">
            {!onCreateDemo && !status.ready && (
              <p className="error-message" role="alert">
                {t(
                  "アプリの接続設定が完了していません。管理者がデータベースと教員用キーを設定してください。",
                  "连接尚未配置。请管理员设置数据库和教师密钥。",
                  "Connection setup is incomplete. Ask the administrator to configure the database and teacher key.",
                )}
              </p>
            )}
            {error && (
              <p className="error-message" role="alert">
                {studySetupError(t, error)}
              </p>
            )}
            <button
              className="button primary full"
              disabled={
                pending ||
                (!onCreateDemo && !status.ready) ||
                (studyCreation &&
                  Boolean(
                    layoutError ||
                    unitsError ||
                    institutionError ||
                    periodsError ||
                    timingError ||
                    commissionError ||
                    conditionsPending,
                  ))
              }
            >
              {pending ? (
                <Spinner />
              ) : (
                t("ルーム作成", "创建房间", "Create room")
              )}
            </button>
            {legacy && !onCreateDemo && (
              <div className="callout">
                <Info size={17} />
                <p>
                  {t(
                    "ルーム作成後、教員用画面で各商品の価値と費用を変更できます。参加人数がそろうと開始でき、実験開始後は条件が固定されます。",
                    "创建后可在教师房间修改各商品的价值和成本。人数到齐后可以开始，开始后条件锁定。",
                    "After creation, edit each good’s values and costs in the teacher room. Start when attendance is complete. Settings lock when the experiment starts.",
                  )}
                </p>
              </div>
            )}
            {(onCreateDemo || status.mode === "local") && (
              <p className="local-note">
                <FlaskConical size={14} />
                {onCreateDemo
                  ? t(
                      "デモの進行はこの画面内で保持されます。再読み込みすると実験設定からやり直せます。",
                      "演示进度保留在此页面。刷新后会回到实验设置。",
                      "Demo progress stays on this page. Reloading returns to experiment setup.",
                    )
                  : t(
                      "ローカル環境で実行中。データはこのコンピューターに保存されます。",
                      "正在本地运行，数据保存在此电脑上。",
                      "Running locally. Data is saved on this computer.",
                    )}
              </p>
            )}
          </div>
        </form>
        {studyCreation && configureFirst && (
          <StudyDetailDialog
            label={t("実験の詳細設定", "实验详细设置", "Experiment settings")}
            className="teacher-configuration-dialog study-compact-settings"
            open
            onClose={cancelConfiguration}
          >
            <div className="panel study-setup">
              <header className="study-setup-heading">
                <h2>{t("実験の準備", "实验准备", "Experiment setup")}</h2>
                <span>
                  {t("ステップ", "步骤", "Step")} {configurationStep + 1} / 3
                </span>
              </header>
              <StudySetupStep
                id={configurationId}
                index={0}
                label={t(
                  "制度と進行",
                  "交易制度与流程",
                  "Institutions and timing",
                )}
                summary={institutions
                  .map(
                    (i) =>
                      `${INSTITUTIONS[i].short} ${t(`${periods[i]}期`, `${periods[i]} 期`, `${periods[i]} periods`)}`,
                  )
                  .join(" · ")}
                expanded={configurationStep === 0}
                complete={configurationProgress > 0}
                disabled={pending}
                onOpen={() => setConfigurationStep(0)}
              >
                <StudyProgramFields
                  institutions={institutions}
                  periods={periods}
                  timing={timing}
                  onInstitutionsChange={setInstitutions}
                  onPeriodsChange={setPeriods}
                  onTimingChange={setTiming}
                  disabled={settingsDisabled}
                  marketSize={size}
                />
                {configurationStep === 0 && configurationActions}
              </StudySetupStep>
              <StudySetupStep
                id={configurationId}
                index={1}
                label={t(
                  "市場・人数",
                  "市场与人数",
                  "Markets and participants",
                )}
                summary={t(
                  `${attendance}人 · ${count}市場 · 供需テンプレート${size}人`,
                  `${attendance} 人 · ${count} 个市场 · ${size} 人供需模板`,
                  `${attendance} participants · ${count} market(s) · ${size}-person template`,
                )}
                expanded={configurationStep === 1}
                complete={configurationProgress > 1}
                disabled={pending || configurationProgress < 1}
                onOpen={() => setConfigurationStep(1)}
              >
                <label className="field">
                  {t("市場数・人数", "市场数与人数", "Market layout")}
                  <select
                    name="marketPreset"
                    value={preset}
                    disabled={settingsDisabled}
                    onChange={(event) => {
                      setPreset(event.target.value);
                      if (event.target.value !== "custom") {
                        setMarketCount(event.target.value);
                        setMarketSize(String(Number(event.target.value) * 16));
                        setMarketMode(
                          event.target.value === "1" ? "auto" : "manual",
                        );
                      }
                    }}
                  >
                    {[1, 6, 12].map((markets) => (
                      <option key={markets} value={markets}>
                        {t(
                          `${markets}市場・${markets * 16}人`,
                          `${markets} 个市场 · ${markets * 16} 人`,
                          `${markets} market(s) · ${markets * 16} participants`,
                        )}
                      </option>
                    ))}
                    <option value="custom">
                      {t("カスタム", "自定义", "Custom")}
                    </option>
                  </select>
                </label>
                {preset === "custom" && (
                  <div className="form-grid">
                    <label className="field">
                      {t("予定人数", "预计人数", "Expected participants")}
                      <input
                        type="number"
                        name="marketSize"
                        min={2}
                        max={MAX_STUDY_PARTICIPANTS}
                        step={1}
                        required
                        value={marketSize}
                        disabled={settingsDisabled}
                        onChange={(e) => setMarketSize(e.target.value)}
                        aria-describedby={
                          layoutError ? "study-layout-help" : undefined
                        }
                      />
                    </label>
                    <label className="field">
                      {t("市場数", "市场数", "Markets")}
                      <input
                        type="number"
                        name="markets"
                        min={1}
                        max={MAX_STUDY_MARKETS}
                        step={1}
                        required
                        value={marketMode === "auto" ? count : marketCount}
                        disabled={settingsDisabled}
                        onChange={(e) => {
                          setMarketMode("manual");
                          setMarketCount(e.target.value);
                        }}
                        aria-describedby={
                          layoutError ? "study-layout-help" : undefined
                        }
                      />
                    </label>
                  </div>
                )}
                {preset === "custom" && (
                  <p className="field-help">
                    {marketMode === "auto"
                      ? t(
                          "自動：1市場16人ずつ順に割り当てます。",
                          "自动模式按每个市场 16 人分配。",
                          "Auto assignment uses 16 participants per market. ",
                        )
                      : t(
                          "手動で指定した市場数を優先します。",
                          "手动模式优先使用指定的市场数。",
                          "Manual assignment uses the specified market count. ",
                        )}
                    {t(
                      `実際の参加者は最大${MAX_STUDY_PARTICIPANTS}人まで受け付け、奇数でも全員を割り当てます。市場数は入室受付中も変更できます。`,
                      `最多允许 ${MAX_STUDY_PARTICIPANTS} 人，人数为奇数也能全部分配。入室期间仍可调整市场数。`,
                      `Up to ${MAX_STUDY_PARTICIPANTS} participants can join. Everyone is assigned, including with odd attendance. The market count can change while admission is open. `,
                    )}
                    {!layoutError &&
                      t(
                        `最大市場${largestMarket}人 → 供需テンプレート${size}人（買い手・売り手各${size / 2}人）。`,
                        `最大市场 ${largestMarket} 人，采用 ${size} 人供需模板，买卖双方各 ${size / 2} 人。`,
                        `Largest market: ${largestMarket}. The template uses ${size} participants, ${size / 2} on each side. `,
                      )}
                    {size !== 16 &&
                      t(
                        "16人以外では、既定の価値・費用を全範囲から均等に抽出・複製します。",
                        "人数不为 16 时，从默认价值和成本的完整范围均匀抽取或复制。",
                        "For sizes other than 16, default values and costs are sampled or replicated across the entire range. ",
                      )}
                    {count > 1 &&
                      orderCount > 1 &&
                      count % orderCount !== 0 &&
                      t(
                        `市場数が${orderCount}の倍数以外では、制度順序の割当数に差が出ます。`,
                        `市场数不是 ${orderCount} 的倍数时，各制度顺序的分配数会不同。`,
                        `The institution orders are assigned unevenly when the market count is not a multiple of ${orderCount}.`,
                      )}
                  </p>
                )}
                {preset === "custom" && marketMode === "manual" && (
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setMarketMode("auto")}
                    disabled={settingsDisabled}
                  >
                    {t(
                      "自動（1市場16人）に戻す",
                      "恢复自动分配（每市场 16 人）",
                      "Restore auto (16 per market)",
                    )}
                  </button>
                )}
                {configurationStep === 1 && configurationActions}
              </StudySetupStep>
              <StudySetupStep
                id={configurationId}
                index={2}
                label={t("供需条件", "供需条件", "Supply and demand")}
                summary={`${adoptedConditions?.generator ? t("カスタム", "自定义", "Custom") : conditionPreset?.label === "Default" || !conditionPreset ? t("Default", "默认", "Default") : conditionPreset.label} · ${institutions.map((i) => `${INSTITUTIONS[i].short} ${t(`${unitsByInstitution[i]}単位`, `${unitsByInstitution[i]} 单位`, `${unitsByInstitution[i]} units`)}`).join(" · ")} · ${t(`Commission ${commission}円`, `佣金 ${commission} 日元`, `Commission ¥${commission}`)}`}
                expanded={configurationStep === 2}
                complete={
                  detailsSaved && !configurationError && !conditionsPending
                }
                disabled={pending || configurationProgress < 2}
                onOpen={() => setConfigurationStep(2)}
              >
                {conditionSection}
                {configurationStep === 2 && error && (
                  <p className="error-message" role="alert">
                    {studySetupError(t, error)}
                  </p>
                )}
              </StudySetupStep>
            </div>
          </StudyDetailDialog>
        )}
      </div>
    </SetupLanguage.Provider>
  );
}
