import { getFinancialDaily } from "@/lib/finance/dashboard";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export async function getPaymentsOverviewData(
  timeFrame?: "monthly" | "yearly" | (string & {}),
) {
  const now = new Date();
  const yearly = timeFrame === "yearly";
  const start = yearly
    ? new Date(Date.UTC(now.getUTCFullYear() - 4, 0, 1))
    : new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1));

  try {
    const daily = await getFinancialDaily("live", start, end);
    const buckets = new Map<string, { gross: number; deductions: number }>();
    for (const row of daily) {
      const date = new Date(`${row.day}T00:00:00Z`);
      const key = yearly ? String(date.getUTCFullYear()) : String(date.getUTCMonth());
      const bucket = buckets.get(key) ?? { gross: 0, deductions: 0 };
      bucket.gross += row.grossCents;
      bucket.deductions += row.feeCents + row.refundCents;
      buckets.set(key, bucket);
    }

    const labels = yearly
      ? Array.from({ length: 5 }, (_, index) => now.getUTCFullYear() - 4 + index)
      : MONTHS.map((_, index) => index);
    return {
      received: labels.map((value) => ({
        x: yearly ? value : MONTHS[value],
        y: (buckets.get(String(value))?.gross ?? 0) / 100,
      })),
      due: labels.map((value) => ({
        x: yearly ? value : MONTHS[value],
        y: (buckets.get(String(value))?.deductions ?? 0) / 100,
      })),
    };
  } catch (error) {
    console.error("Payments overview unavailable:", error);
    return { received: [], due: [] };
  }
}
