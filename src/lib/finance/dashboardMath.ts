import type { CommerceStripeMode, PaymentLane } from "@/lib/stripe/commerce";

export type FinancialLaneSummary = {
  lane: PaymentLane;
  grossCents: number;
  feeCents: number;
  refundCents: number;
  netCents: number;
  transactionCount: number;
};

export type FinancialModeSummary = {
  mode: CommerceStripeMode;
  grossCents: number;
  feeCents: number;
  refundCents: number;
  netCents: number;
  transactionCount: number;
  lanes: FinancialLaneSummary[];
};

export type FinancialSummaryRow = {
  mode: CommerceStripeMode;
  lane: PaymentLane;
  gross_cents: number | string;
  fee_cents: number | string;
  refund_cents: number | string;
  net_cents: number | string;
  transaction_count: number | string;
};

const PAYMENT_LANES: PaymentLane[] = ["shop", "labs", "pos", "tank"];

function numeric(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function summarizeFinancialRows(
  mode: CommerceStripeMode,
  rows: FinancialSummaryRow[] | null | undefined,
): FinancialModeSummary {
  const byLane = new Map((rows ?? []).filter((row) => row.mode === mode).map((row) => [row.lane, row]));
  const lanes = PAYMENT_LANES.map((lane) => {
    const row = byLane.get(lane);
    return {
      lane,
      grossCents: numeric(row?.gross_cents),
      feeCents: numeric(row?.fee_cents),
      refundCents: numeric(row?.refund_cents),
      netCents: numeric(row?.net_cents),
      transactionCount: numeric(row?.transaction_count),
    };
  });

  return {
    mode,
    grossCents: lanes.reduce((sum, lane) => sum + lane.grossCents, 0),
    feeCents: lanes.reduce((sum, lane) => sum + lane.feeCents, 0),
    refundCents: lanes.reduce((sum, lane) => sum + lane.refundCents, 0),
    netCents: lanes.reduce((sum, lane) => sum + lane.netCents, 0),
    transactionCount: lanes.reduce((sum, lane) => sum + lane.transactionCount, 0),
    lanes,
  };
}

export function financialGrowthRate(currentCents: number, previousCents: number): number {
  if (previousCents === 0) return currentCents === 0 ? 0 : 100;
  return Math.round(((currentCents - previousCents) / Math.abs(previousCents)) * 10_000) / 100;
}

export function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
