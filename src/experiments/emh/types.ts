import type { OrderBookLevel } from "@/lib/order-book";

export type Period = "A" | "B";
export type Side = "bid" | "ask";
export type Status = "lobby" | "countdown" | "trading" | "break" | "completed";

export interface Config {
  experiment?: "exp1" | "exp2";
  states?: { prior: number[]; outcomes: number[]; dividends: number[][] };
  emptyUnitsLimit?: number;
  insiderStartRound?: number;
  insiderCountPerType?: number;
  initialUnits?: number;
  title: string;
  rounds: number;
  periodSeconds: number;
  unitSeconds: number;
  breakSeconds: number;
  dividends: { a: number; b: number }[];
}
export interface Participant {
  insider?: boolean;
  id: string;
  name: string;
  studentId: string;
  pinHash: string;
  tokenHash: string;
  seat: number | null;
  type: number | null;
  holdings: number;
  cash: number;
  dividend: number;
  totalProfit: number;
  joinedAt: number;
}
export interface Quote {
  id: string;
  participantId: string;
  seat: number;
  price: number;
  at: number;
}
export interface Trade {
  id: string;
  sequence: number;
  year: number;
  period: Period;
  unit: number;
  buyerId: string;
  sellerId: string;
  buyerSeat: number;
  sellerSeat: number;
  price: number;
  at: number;
}
/** Student payloads retain only the student's own identity. */
export type QuoteView = Omit<Quote, "participantId" | "seat"> & {
  participantId: string | null;
  seat: number | null;
};
export type TradeView = Omit<
  Trade,
  "buyerId" | "sellerId" | "buyerSeat" | "sellerSeat"
> & {
  buyerId: string | null;
  sellerId: string | null;
  buyerSeat: number | null;
  sellerSeat: number | null;
};
export interface OwnQuoteState {
  quoteId?: string;
  status: "none" | "active" | "replaced" | "cancelled" | "cleared" | "filled";
  price: number | null;
}
export interface Payout {
  participantId: string;
  seat: number;
  holdings: number;
  perUnit: number;
  dividend: number;
  cash: number;
  yearProfit: number;
}
export interface PeriodResult {
  state?: number;
  piPrice?: number;
  rePrice?: number;
  year: number;
  period: Period;
  endedAt: number;
  reason: "deadline" | "inactivity" | "teacher" | "teacher-finish";
  payouts: Payout[];
  volume: number;
  meanPrice: number | null;
  priceRatio: number | null;
  actualDividend: number;
  maxDividend: number;
  initialDividend: number;
  allocationEfficiency: number | null;
  gainEfficiency: number | null;
}
export interface AuditEvent {
  sequence: number;
  at: number;
  kind: string;
  actor: string;
  details: Record<string, unknown>;
}
export interface Room {
  typeCounts?: number[];
  code: string;
  schemaVersion: 1;
  config: Config;
  createdAt: number;
  revision: number;
  teacherPasswordHash: string;
  teacherTokenHash: string;
  participants: Participant[];
  status: Status;
  year: number;
  period: Period;
  unit: number;
  emptyUnits: number;
  nominatedSeat: number | null;
  countdownEndsAt?: number | null;
  periodEndsAt: number | null;
  unitEndsAt: number | null;
  breakEndsAt: number | null;
  pausedAt: number | null;
  bid: Quote | null;
  ask: Quote | null;
  // Best prices remain in bid/ask; these queues hold the remaining orders in matching order.
  // Older snapshots contain only the two best quotes.
  queuedQuotes?: Record<Side, Quote[]>;
  trades: Trade[];
  results: PeriodResult[];
  events: AuditEvent[];
  reveal: boolean;
}
export type Actor =
  { role: "teacher" } | { role: "student"; participantId: string };
export type StudentAction =
  | { kind: "quote"; side: Side; price: number; unitKey: string }
  | { kind: "accept"; side: Side; quoteId: string; unitKey: string }
  | { kind: "cancel"; side: Side; quoteId: string; unitKey: string };
export type TeacherAction = {
  kind:
    | "start"
    | "pause"
    | "resume"
    | "end-period"
    | "next-year"
    | "reveal"
    | "finish";
  expectedPhase: string;
};
export type Action = StudentAction | TeacherAction;

export interface PersonView {
  id: string;
  name: string;
  studentId: string;
  seat: number | null;
  type: number | null;
  holdings: number;
  cash: number;
  dividend: number;
  totalProfit: number;
  dividends: { a: number; b: number } | null;
}
export interface RoomView {
  experiment?: "exp1" | "exp2";
  exp2?: {
    prior: number[];
    dividends: number[] | null;
    clue: number | null;
    state: number | null;
    allDividends: number[][] | null;
  };
  initialUnits: number;
  marketId?: number;
  code: string;
  title: string;
  revision: number;
  serverNow: number;
  role: Actor["role"];
  status: Status;
  year: number;
  period: Period;
  unit: number;
  unitKey: string;
  phaseKey: string;
  rounds: number;
  periodSeconds: number;
  unitSeconds: number;
  breakSeconds: number;
  participantCount: number;
  nominatedSeat: number | null;
  emptyUnits: number;
  emptyUnitsLimit: number;
  countdownEndsAt: number | null;
  periodEndsAt: number | null;
  unitEndsAt: number | null;
  breakEndsAt: number | null;
  pausedAt: number | null;
  bid: QuoteView | null;
  ask: QuoteView | null;
  orderBook: Record<Side, OrderBookLevel[]>;
  trades: TradeView[];
  ownQuotes: { bid: OwnQuoteState; ask: OwnQuoteState };
  me: PersonView | null;
  participants: PersonView[];
  results: PeriodResult[];
  reveal: boolean;
  benchmarks: { naiveA: number; perfectA: number; perfectB: number } | null;
  conditions: Config["dividends"] | null;
}
