import { PeriodPicker } from "@/components/period-picker";
import { cn } from "@/lib/utils";
import { getDevicesUsedData } from "@/services/device.service";
import { DonutChart } from "./chart";

type PropsType = {
  timeFrame?: string;
  className?: string;
};

export async function UsedDevices({
  timeFrame = "monthly",
  className,
}: PropsType) {
  const data = await getDevicesUsedData(timeFrame);

  return (
    <div
      className={cn(
        "grid grid-cols-1 grid-rows-[auto_1fr] gap-9 rounded-[calc(var(--radius)*1.25)] bg-[hsl(var(--card))] p-7.5 shadow-[var(--shadow-sm)] dark:bg-[hsl(var(--card))] dark:shadow-[var(--shadow-md)]",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-body-2xlg font-bold text-[hsl(var(--foreground))] dark:text-[hsl(var(--foreground))]">
          Used Devices
        </h2>

        <PeriodPicker defaultValue={timeFrame} sectionKey="used_devices" />
      </div>

      <div className="grid place-items-center">
        {data.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 dark:text-gray-500 mb-2">
              <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-[hsl(var(--foreground))] dark:text-[hsl(var(--foreground))] mb-2">
              No Device Data Available
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs mx-auto">
              Device analytics will appear here once the daily aggregation process runs.
            </p>
          </div>
        ) : (
          <DonutChart data={data} />
        )}
      </div>
    </div>
  );
}