import { TrendingUpIcon } from "@/assets/icons";
import { compactFormat } from "@/lib/format-number";
import { cn } from "@/lib/utils";
import { getCampaignVisitorsData } from "@/services/campaigns.service";
import { CampaignVisitorsChart } from "./chart";

export async function CampaignVisitors({ className }: { className?: string }) {
  const data = await getCampaignVisitorsData();

  return (
    <div
      className={cn(
        "rounded-[calc(var(--radius)*1.25)] bg-[hsl(var(--card))] shadow-[var(--shadow-sm)] dark:bg-[hsl(var(--card))] dark:shadow-[var(--shadow-md)]",
        className,
      )}
    >
      <div className="border-b border-[hsl(var(--border))] px-6 py-5.5 dark:border-[hsl(var(--border))]">
        <div className="flex justify-between">
          <h2 className="mb-1.5 text-2xl font-bold text-[hsl(var(--foreground))] dark:text-[hsl(var(--foreground))]">
            Campaign Visitors
          </h2>

          <div className="mb-0.5 text-2xl font-bold text-[hsl(var(--foreground))] dark:text-[hsl(var(--foreground))]">
            {compactFormat(data.total_visitors)}
          </div>
        </div>

        <div className="flex justify-between">
          <div className="text-sm font-medium text-[hsl(var(--muted-foreground))]">Last Campaign Performance</div>

          <div
            className={cn(
              "flex items-center gap-1.5",
              data.performance > 0 ? "text-[hsl(var(--chart-2))]" : "text-[hsl(var(--destructive))]",
            )}
          >
            <TrendingUpIcon
              className={`${data.performance > 0 ? "-rotate-6" : "scale-y-[-1]"}`}
            />

            <span className="text-sm font-medium">{data.performance}%</span>
          </div>
        </div>
      </div>

      <CampaignVisitorsChart data={data.chart} />
    </div>
  );
}