import type { RoomConfig, Role } from "./types";
import type { Institution, StudyPeriods, StudySettings } from "./study-types";
import { STUDY_RULES } from "./study-rules";

export const DEFAULT_STUDY_INSTITUTIONS: readonly Institution[] = [
  "cda",
  "call",
  "posted",
];
// Rooms created before institution selection keep all three institutions.
export const studyInstitutions = (
  config: Pick<RoomConfig, "studyInstitutions">,
): readonly Institution[] =>
  config.studyInstitutions ?? DEFAULT_STUDY_INSTITUTIONS;

export const DEFAULT_STUDY_PERIODS: Readonly<StudyPeriods> = {
  cda: 5,
  call: 5,
  posted: 5,
};
export const MAX_INSTITUTION_PERIODS = 20;
export const MAX_STUDY_ROUNDS = MAX_INSTITUTION_PERIODS * 3;
type PeriodConfig = Pick<RoomConfig, "studyPeriods">;
// Existing rooms retain five periods per institution.
export const studyPeriodCount = (
  config: PeriodConfig,
  institution: Institution,
) => config.studyPeriods?.[institution] ?? DEFAULT_STUDY_PERIODS[institution];
export const studyTotalRounds = (
  config: PeriodConfig & Pick<RoomConfig, "studyInstitutions">,
) =>
  studyInstitutions(config).reduce(
    (sum, i) => sum + studyPeriodCount(config, i),
    0,
  );

export function studyPeriodsError(
  periods: Partial<StudyPeriods>,
  institutions: readonly Institution[],
) {
  return institutions.some((i) => {
    const count = studyPeriodCount({ studyPeriods: periods }, i);
    return (
      !Number.isInteger(count) || count < 1 || count > MAX_INSTITUTION_PERIODS
    );
  })
    ? `各制度の期数は1〜${MAX_INSTITUTION_PERIODS}期の整数で設定してください。`
    : "";
}

export function studyPeriodRanges(
  config: PeriodConfig,
  order: readonly Institution[],
) {
  let first = 1;
  return order.map((institution) => {
    const periods = studyPeriodCount(config, institution);
    const range = { institution, first, last: first + periods - 1, periods };
    first += periods;
    return range;
  });
}

export function studyPeriodAt(
  config: PeriodConfig,
  order: readonly Institution[],
  round: number,
) {
  const ranges = studyPeriodRanges(config, order);
  const current = Math.max(1, round);
  const range = ranges.find((r) => current <= r.last) ?? ranges.at(-1)!;
  return { ...range, period: current - range.first + 1 };
}

export function studyInstitutionOrders(
  institutions: readonly Institution[],
): Institution[][] {
  if (institutions.length <= 1) return [[...institutions]];
  return institutions.flatMap((first) =>
    studyInstitutionOrders(institutions.filter((i) => i !== first)).map(
      (rest) => [first, ...rest],
    ),
  );
}

export const DEFAULT_MARKET_SIZE = 16;
export const DEFAULT_STUDY_UNITS = 2;
export const MAX_STUDY_UNITS = 5;
// Per-institution unit settings mark the current, single-unit protocol. Saved
// rooms without them retain the simultaneous orders they were created with.
export const studySingleUnitOrders = (
  config: Pick<RoomConfig, "studyUnitCounts">,
) => config.studyUnitCounts !== undefined;
export const studyCallsPerPeriod = (
  config: Pick<RoomConfig, "studyUnitCounts" | "studyCdaUnits">,
) =>
  studySingleUnitOrders(config)
    ? Math.max(STUDY_RULES.callsPerPeriod, studyUnits(config, "call"))
    : STUDY_RULES.callsPerPeriod;
// Saved rooms without this setting retain the original two units per person.
export const studyUnits = (
  config: Pick<RoomConfig, "studyCdaUnits" | "studyUnitCounts">,
  institution: Institution = "cda",
) =>
  config.studyUnitCounts?.[institution] ??
  (institution === "cda"
    ? (config.studyCdaUnits ?? DEFAULT_STUDY_UNITS)
    : DEFAULT_STUDY_UNITS);
export const studyUnitCounts = (
  config: Pick<RoomConfig, "studyCdaUnits" | "studyUnitCounts">,
) => ({
  cda: studyUnits(config, "cda"),
  call: studyUnits(config, "call"),
  posted: studyUnits(config, "posted"),
});
export const studyUnitsPerSide = (
  config: Pick<RoomConfig, "studyCdaUnits" | "studyUnitCounts" | "marketSize">,
  institution: Institution = "cda",
) => studyTemplateSideCount(config) * studyUnits(config, institution);
export const studyUnitsError = (units: number) =>
  !Number.isInteger(units) || units < 1 || units > MAX_STUDY_UNITS
    ? `1人あたりの単位数は1〜${MAX_STUDY_UNITS}の整数で設定してください。`
    : "";

export function resizeStudySettings(
  settings: StudySettings,
  marketSize: number,
  unitsPerParticipant = DEFAULT_STUDY_UNITS,
) {
  const perSide = studyTemplateSideCount({ marketSize });
  const unitsError = studyUnitsError(unitsPerParticipant);
  if (unitsError) throw new Error(unitsError);
  // Preserve the original profile sampling when the unit count is unchanged.
  // Otherwise sample the sorted marginal schedule and pair units by role index.
  const resize = (profiles: number[][], buyer: boolean) => {
    if (profiles.every((p) => p.length === unitsPerParticipant))
      return Array.from({ length: perSide }, (_, i) => [
        ...profiles[Math.floor(((i + 0.5) * profiles.length) / perSide)],
      ]);
    const sorted = profiles.flat().sort((a, b) => (buyer ? b - a : a - b));
    const total = perSide * unitsPerParticipant;
    const sampled = Array.from(
      { length: total },
      (_, i) => sorted[Math.floor(((i + 0.5) * sorted.length) / total)],
    );
    return Array.from({ length: perSide }, (_, i) =>
      Array.from(
        { length: unitsPerParticipant },
        (_, unit) => sampled[i + unit * perSide],
      ),
    );
  };
  return {
    values: resize(settings.values, true),
    costs: resize(settings.costs, false),
  };
}
export const MAX_STUDY_PARTICIPANTS = 9_999;
export const MAX_STUDY_MARKETS = Math.floor(MAX_STUDY_PARTICIPANTS / 2);
// An odd largest market needs one unused profile on its smaller side.
export const MAX_STUDY_PROFILES = Math.ceil(MAX_STUDY_PARTICIPANTS / 2);
export const MAX_STUDY_TEMPLATE_SIZE = MAX_STUDY_PROFILES * 2;

export function studyAdmissionSeatsRemaining(registered: number) {
  return Math.max(0, MAX_STUDY_PARTICIPANTS - registered);
}

// Missing size belongs to an existing room with the original 8 + 8 design.
export const studyMarketSize = (config: Pick<RoomConfig, "marketSize">) =>
  config.marketSize ?? DEFAULT_MARKET_SIZE;
// Keep a balanced condition template large enough for either side of an odd
// market. Actual roles and schedules use the integer counts below or the cutoff layout.
export const studyTemplateSideCount = (
  config: Pick<RoomConfig, "marketSize">,
) => Math.ceil(studyMarketSize(config) / 2);
export function studyMarketCounts(config: RoomConfig, market: number) {
  return (
    config.studyLayout?.[market - 1] ?? {
      buyers: studyTemplateSideCount(config),
      sellers: Math.floor(studyMarketSize(config) / 2),
    }
  );
}
export function studyMarketId(config: RoomConfig, seat: number) {
  if (seat < 0) return 0;
  if (!config.studyLayout)
    return Math.floor(seat / studyMarketSize(config)) + 1;
  let end = 0;
  return (
    config.studyLayout.findIndex((m) => {
      end += m.buyers + m.sellers;
      return seat < end;
    }) + 1
  );
}
function studyLocalSeat(config: RoomConfig, seat: number) {
  if (!config.studyLayout) return seat % studyMarketSize(config);
  return (
    seat -
    config.studyLayout
      .slice(0, studyMarketId(config, seat) - 1)
      .reduce((sum, m) => sum + m.buyers + m.sellers, 0)
  );
}
export function studyRole(config: RoomConfig, seat: number): Role {
  return studyLocalSeat(config, seat) <
    studyMarketCounts(config, studyMarketId(config, seat)).buyers
    ? "buyer"
    : "seller";
}
export function studyRoleIndex(config: RoomConfig, seat: number) {
  const local = studyLocalSeat(config, seat);
  return (
    local -
    (studyRole(config, seat) === "buyer"
      ? 0
      : studyMarketCounts(config, studyMarketId(config, seat)).buyers)
  );
}

// The existing condition template is sampled evenly per side, as in resizeStudySettings.
// This keeps prices/parameters intact and permits a different number of traders per market.
export function studyProfileIndex(
  config: RoomConfig,
  seat: number,
  profiles: number,
) {
  // Preserve direct profile indexing in saved balanced rooms.
  if (!config.studyLayout && studyMarketSize(config) % 2 === 0)
    return studyRoleIndex(config, seat);
  const counts = studyMarketCounts(config, studyMarketId(config, seat));
  const count =
    studyRole(config, seat) === "buyer" ? counts.buyers : counts.sellers;
  return Math.floor(((studyRoleIndex(config, seat) + 0.5) * profiles) / count);
}

export function studyMarketSettings(
  config: RoomConfig,
  settings: StudySettings,
  market: number,
): StudySettings {
  if (!config.studyLayout && studyMarketSize(config) % 2 === 0) return settings;
  const counts = studyMarketCounts(config, market);
  if (
    counts.buyers === settings.values.length &&
    counts.sellers === settings.costs.length
  )
    return settings;
  const sample = (profiles: number[][], count: number) =>
    Array.from({ length: count }, (_, i) => [
      ...profiles[Math.floor(((i + 0.5) * profiles.length) / count)],
    ]);
  return {
    values: sample(settings.values, counts.buyers),
    costs: sample(settings.costs, counts.sellers),
  };
}

export function studyLayoutError(
  markets: number,
  marketSize: number,
  flexible = false,
  template = false,
) {
  const maxSize = template ? MAX_STUDY_TEMPLATE_SIZE : MAX_STUDY_PARTICIPANTS;
  if (!Number.isInteger(marketSize) || marketSize < 2 || marketSize > maxSize)
    return `${template ? "供需テンプレート" : "1市場"}の人数は2〜${maxSize}人の整数で設定してください。`;
  if (!Number.isInteger(markets) || markets < 1 || markets > MAX_STUDY_MARKETS)
    return `市場数は1〜${MAX_STUDY_MARKETS}の整数で設定してください。`;
  if (!flexible && markets * marketSize > MAX_STUDY_PARTICIPANTS)
    return `合計人数は${MAX_STUDY_PARTICIPANTS}人以内にしてください。`;
  return "";
}
