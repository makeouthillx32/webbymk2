import { getFinancialDaily } from "@/lib/finance/dashboard";

const DAY_MS = 86_400_000;

export async function getWeeksProfitData(timeFrame?: string) {
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const currentWeekStart = todayUtc - now.getUTCDay() * DAY_MS;
  const startMs = timeFrame === "last week" ? currentWeekStart - 7 * DAY_MS : currentWeekStart;
  const endMs = startMs + 7 * DAY_MS;
  const start = new Date(startMs);
  const end = new Date(endMs);

  try {
    const daily = await getFinancialDaily("live", start, end);
    const byDay = new Map(daily.map((row) => [row.day, row]));
    const days = Array.from({ length: 7 }, (_, index) => new Date(startMs + index * DAY_MS));
    return {
      sales: days.map((day) => ({
        x: day.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
        y: (byDay.get(day.toISOString().slice(0, 10))?.grossCents ?? 0) / 100,
      })),
      revenue: days.map((day) => ({
        x: day.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
        y: (byDay.get(day.toISOString().slice(0, 10))?.netCents ?? 0) / 100,
      })),
    };
  } catch (error) {
    console.error("Weekly net proceeds unavailable:", error);
    return { sales: [], revenue: [] };
  }
}
