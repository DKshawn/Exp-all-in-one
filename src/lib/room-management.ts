import type { Phase } from "../experiments/double-auction/lib/types";
import type { Institution } from "../experiments/double-auction/lib/study-types";
import type { EMH_EXPERIMENT_LABELS } from "../experiments/emh/types";
import type { H5_PROTOCOL, Mode } from "../experiments/evolution/settings";
import type { Experiment } from "./server/experiment-registry";

type RoomExperiment =
  | { experiment: "emh"; variant: keyof typeof EMH_EXPERIMENT_LABELS }
  | { experiment: "evolution"; variant: Mode | typeof H5_PROTOCOL }
  | { experiment: Exclude<Experiment, "emh" | "evolution">; variant?: never };

export type RoomSummary = RoomExperiment & {
  code: string;
  title: string;
  createdAt: number;
  phase: Phase;
  round: number;
  totalRounds: number;
  participantCount: number;
  capacity: number;
  admissionRemaining?: number;
  flexibleAdmission?: boolean;
  marketCount: number;
  institutions: { institution: Institution; periods: number }[];
};
