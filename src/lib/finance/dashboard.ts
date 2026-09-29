import "server-only";

import { createAdminClient } from "@/utils/supabase/admin";
import type { CommerceStripeMode } from "@/lib/stripe/commerce";
import {
  summarizeFinancialRows,
  type FinancialModeSummary,
  type FinancialSummaryRow,
} from "./dashboardMath";

type DailyRow = {
  day: string;
  gross_cents: number | string;
  fee_cents: number | string;
  refund_cents: number | string;
  net_cents: number | string;
};

function numeric(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getFinancialSummary(
  mode: CommerceStripeMode,
  from?: Date,
  to?: Date,
): Promise<FinancialModeSummary> {
  const supabase = createAdminClient() as any;
  const { data, error } = await supabase.rpc("get_payment_financial_summary", {
    p_mode: mode,
    p_from: from?.toISOString() ?? null,
    p_to: to?.toISOString() ?? null,
  });
  if (error) throw new Error(`Financial summary unavailable: ${error.message}`);
  return summarizeFinancialRows(mode, data as FinancialSummaryRow[]);
}

export async function getFinancialDaily(
  mode: CommerceStripeMode,
  from: Date,
  to: Date,
): Promise<Array<{ day: string; grossCents: number; feeCents: number; refundCents: number; netCents: number }>> {
  const supabase = createAdminClient() as any;
  const { data, error } = await supabase.rpc("get_payment_financial_daily", {
    p_mode: mode,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  if (error) throw new Error(`Daily financial summary unavailable: ${error.message}`);
  return ((data ?? []) as DailyRow[]).map((row) => ({
    day: row.day,
    grossCents: numeric(row.gross_cents),
    feeCents: numeric(row.fee_cents),
    refundCents: numeric(row.refund_cents),
    netCents: numeric(row.net_cents),
  }));
}

export { financialGrowthRate, formatUsd } from "./dashboardMath";
