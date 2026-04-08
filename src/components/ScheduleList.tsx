import { useTheme } from "@/app/provider";
import { CheckCircle2 } from "lucide-react";

interface ScheduleItem {
  business_name: string;
  jobs: { job_name: string; member_name: string }[];
  before_open: boolean;
  address: string;
  isCompleted?: boolean; // Add completion status
  onClick: () => void;
}

interface ScheduleListProps {
  schedule: ScheduleItem[];
}

export default function ScheduleList({ schedule }: ScheduleListProps) {
  const { themeType } = useTheme();
  const isDark = themeType === "dark";

  return (
    <div className="space-y-6">
      {schedule.map((item, index) => (
        <div 
          key={index} 
          className={`p-4 rounded-lg transition-all duration-200 ${
            item.isCompleted 
              ? `opacity-50 ${
                  isDark 
                    ? "bg-[hsl(var(--muted))] shadow-none" 
                    : "bg-[hsl(var(--muted))] shadow-none"
                } grayscale` // Greyed out when completed
              : `${
                  isDark 
                    ? "bg-[hsl(var(--card))] shadow-[var(--shadow-sm)]" 
                    : "bg-[hsl(var(--background))] shadow-[var(--shadow-xs)]"
                } hover:shadow-[var(--shadow-md)]`
          }`}
        >
          <h4 
            className={`text-lg font-medium mb-3 cursor-pointer flex items-center ${
              item.isCompleted 
                ? "text-[hsl(var(--muted-foreground))]" 
                : "text-[hsl(var(--sidebar-primary))]"
            }`}
            onClick={item.onClick}
          >
            {/* Completion indicator */}
            {item.isCompleted && (
              <CheckCircle2 
                size={20} 
                className="mr-2 text-green-600 flex-shrink-0" 
              />
            )}
            
            <span className={`${
              item.isCompleted 
                ? "line-through" 
                : "hover:underline"
            }`}>
              {item.business_name}
            </span>
            
            {/* Status badges */}
            <span className={`ml-2 text-xs px-2 py-1 rounded-full ${
              item.isCompleted 
                ? "bg-green-100 text-green-700 border border-green-200" // Completed styling
                : item.before_open 
                  ? "bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))]" 
                  : "bg-[hsl(var(--chart-2))]/10 text-[hsl(var(--chart-2))]"
            }`}>
              {item.isCompleted 
                ? "✓ Completed" 
                : (item.before_open ? "Before Open" : "After Hours")
              }
            </span>
          </h4>
          
          <ul className="space-y-2">
            {item.jobs.map((job, jobIndex) => (
              <li 
                key={jobIndex}
                className={`flex justify-between p-2 rounded transition-all ${
                  item.isCompleted 
                    ? `${
                        isDark 
                          ? "bg-[hsl(var(--muted))]/50" 
                          : "bg-[hsl(var(--muted))]/50"
                      } opacity-75` // Muted job styling when completed
                    : `${
                        isDark 
                          ? "bg-[hsl(var(--secondary))]" 
                          : "bg-[hsl(var(--muted))]"
                      }`
                }`}
              >
                <span className={`font-medium ${
                  item.isCompleted 
                    ? "text-[hsl(var(--muted-foreground))] line-through" 
                    : "text-[hsl(var(--foreground))]"
                }`}>
                  {job.job_name}
                </span>
                <span className={`${
                  item.isCompleted 
                    ? "text-[hsl(var(--muted-foreground))]/70" 
                    : "text-[hsl(var(--muted-foreground))]"
                }`}>
                  {job.member_name}
                </span>
              </li>
            ))}
          </ul>
          
          {/* Completion overlay effect */}
          {item.isCompleted && (
            <div className="absolute inset-0 bg-gradient-to-r from-green-500/5 to-green-600/5 rounded-lg pointer-events-none" />
          )}
        </div>
      ))}
    </div>
  );
}