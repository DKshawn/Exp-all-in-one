import type { Phase } from "../experiments/double-auction/lib/types";
import type { Institution } from "../experiments/double-auction/lib/study-types";

export type RoomSummary = {
  experiment?: import("./server/experiment-registry").Experiment;
  code: string;
  title: string;
  createdAt: number;
  phase: Phase;
  round: number;
  totalRounds: number;
  participantCount: number;
  capacity: number;
  flexibleAdmission?: boolean;
  marketCount: number;
  institutions: { institution: Institution; periods: number }[];
};
