import { PeriodPicker } from "@/components/period-picker";
import { standardFormat } from "@/lib/format-number";
import { cn } from "@/lib/utils";
import { getPaymentsOverviewData } from "@/services/payment.service";
import { PaymentsOverviewChart } from "./chart";

type PropsType = {
  timeFrame?: string;
  className?: string;
};

export async function PaymentsOverview({
  timeFrame = "monthly",
  className,
}: PropsType) {
  const data = await getPaymentsOverviewData(timeFrame);

  return (
    <div
      className={cn(
        "grid gap-2 rounded-[var(--radius)] bg-[hsl(var(--background))] px-7.5 pb-6 pt-7.5 shadow-[var(--shadow-sm)] dark:bg-[hsl(var(--card))] dark:shadow-[var(--shadow-md)]",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-body-2xlg font-bold text-[hsl(var(--foreground))] dark:text-[hsl(var(--card-foreground))]">
          Payments Overview
        </h2>

        <PeriodPicker defaultValue={timeFrame} sectionKey="payments_overview" />
      </div>

      <PaymentsOverviewChart data={data} />

      <dl className="grid divide-[hsl(var(--border))] text-center dark:divide-[hsl(var(--sidebar-border))] sm:grid-cols-2 sm:divide-x [&>div]:flex [&>div]:flex-col-reverse [&>div]:gap-1">
        <div className="dark:border-[hsl(var(--sidebar-border))] max-sm:mb-3 max-sm:border-b max-sm:pb-3">
          <dt className="text-xl font-bold text-[hsl(var(--foreground))] dark:text-[hsl(var(--card-foreground))]">
            ${standardFormat(data.received.reduce((acc, { y }) => acc + y, 0))}
          </dt>
          <dd className="font-medium text-[hsl(var(--muted-foreground))] dark:text-[hsl(var(--muted-foreground))]">Received Amount</dd>
        </div>

        <div>
          <dt className="text-xl font-bold text-[hsl(var(--foreground))] dark:text-[hsl(var(--card-foreground))]">
            ${standardFormat(data.due.reduce((acc, { y }) => acc + y, 0))}
          </dt>
          <dd className="font-medium text-[hsl(var(--muted-foreground))] dark:text-[hsl(var(--muted-foreground))]">Due Amount</dd>
        </div>
      </dl>
    </div>
  );
}