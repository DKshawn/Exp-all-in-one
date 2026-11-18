import type { Action, AuditEvent, RoomView } from "./types";
import type { EmhSettings } from "./settings";

export type Allocation = { id: number; size: number; typeCounts: number[] };
export type Member = {
  id: string;
  nickname: string;
  pinHash: string;
  tokenHash: string;
  joinedAt: number;
  marketId: number | null;
};
export type Session = {
  experiment?: "exp1" | "exp2";
  settings?: EmhSettings;
  settingsLockedAt?: number | null;
  code: string;
  protocol: "emh-v1";
  title: string;
  createdAt: number;
  revision: number;
  status: "open" | "assigned" | "running";
  teacherPasswordHash: string;
  teacherTokenHash: string;
  members: Member[];
  allocation: Allocation[];
  events: AuditEvent[];
};
export type SessionCommand = (
  | {
      kind:
        | "assign"
        | "reopen"
        | "start"
        | "pause-all"
        | "resume-all"
        | "finish-all"
        | "reveal-all";
    }
  | { kind: "update-settings"; settings: EmhSettings }
) & { expectedRevision: number };
export type RequestCommand = { requestId: string } & (
  | { scope: "session"; command: SessionCommand }
  | { scope: "market"; marketId: number; action: Action }
);
export type MarketSummary = Allocation & {
  status: RoomView["status"];
  year: number;
  period: RoomView["period"];
  paused: boolean;
  revealed: boolean;
  trades: number;
  meanPrice: number | null;
};
export type SessionView = {
  experiment?: "exp1" | "exp2";
  settings: EmhSettings | null;
  settingsLockedAt: number | null;
  code: string;
  title: string;
  revision: number;
  serverNow: number;
  role: "teacher" | "student";
  status: Session["status"] | "completed";
  participantCount: number;
  marketId: number | null;
  allocation: Allocation[];
  markets: MarketSummary[];
  participants: { id: string; name: string; marketId: number | null }[];
  market: RoomView | null;
};
