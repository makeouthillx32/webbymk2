"use client";

import { useState, useEffect } from "react";
import WeekList from "@/components/WeekList";
import { fetchSchedule } from "@/components/fetchSchedule";
import { useTheme } from "@/app/provider";
import { Calendar, Loader2 } from "lucide-react";

interface Job {
  job_name: string;
  member_name: string;
}

interface ScheduleItem {
  business_name: string;
  jobs: Job[];
  before_open: boolean;
  address: string;
}

interface GroupedSchedule {
  [day: string]: ScheduleItem[];
}

const Hero2: React.FC = () => {
  const { themeType } = useTheme();
  const isDark = themeType === "dark";
  const [week, setWeek] = useState<number>(1);
  const [schedule, setSchedule] = useState<GroupedSchedule>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

  const loadWeeklySchedule = async () => {
    setLoading(true);
    try {
      const groupedSchedules: GroupedSchedule = {};

      for (const day of days) {
        const data = await fetchSchedule(week, day.toLowerCase());
        groupedSchedules[day] = data.schedule || [];
      }

      setSchedule(groupedSchedules);
      setError(null);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to fetch schedule.";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWeeklySchedule();
  }, [week]);

  return (
    <div className={`p-5 ${
      isDark 
        ? "bg-[hsl(var(--background))] text-[hsl(var(--foreground))]" 
        : "bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]"
    }`}>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Weekly Cleaning Schedule</h2>
        <p className="text-[hsl(var(--muted-foreground))]">
          View and manage your entire week's cleaning assignments
        </p>
      </div>
      
      {/* Week Selection */}
      <div className={`mb-6 p-4 rounded-lg ${
        isDark 
          ? "bg-[hsl(var(--card))] shadow-[var(--shadow-sm)]" 
          : "bg-[hsl(var(--background))] shadow-[var(--shadow-xs)]"
      }`}>
        <div className="flex items-center mb-4">
          <Calendar size={18} className="mr-2 text-[hsl(var(--sidebar-primary))]" />
          <label
            htmlFor="week-selector"
            className="font-medium"
          >
            Select Week:
          </label>
        </div>
        <select
          id="week-selector"
          title="Week Selector"
          value={week}
          onChange={(e) => setWeek(Number(e.target.value))}
          className={`p-2 border rounded w-full md:w-64 ${
            isDark 
              ? "bg-[hsl(var(--secondary))] border-[hsl(var(--border))]" 
              : "bg-[hsl(var(--muted))] border-[hsl(var(--border))]"
          } text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--sidebar-ring))]`}
        >
          <option value={1}>Week 1</option>
          <option value={2}>Week 2</option>
          <option value={3}>Week 3</option>
          <option value={4}>Week 4</option>
          <option value={5}>Week 5</option>
        </select>
      </div>

      {/* Conditional Rendering */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--sidebar-primary))]" />
          <p className="mt-4 text-[hsl(var(--muted-foreground))]">Loading schedule...</p>
        </div>
      ) : error ? (
        <div className={`p-4 rounded-lg ${
          isDark 
            ? "bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))]" 
            : "bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))]"
        }`}>
          <p className="font-medium">Error: {error}</p>
        </div>
      ) : (
        <div className={`rounded-lg ${
          isDark 
            ? "bg-[hsl(var(--card))] shadow-[var(--shadow-md)]" 
            : "bg-[hsl(var(--background))] shadow-[var(--shadow-sm)]"
        } p-4`}>
          <WeekList groupedSchedule={schedule} />
        </div>
      )}
    </div>
  );
};

export default Hero2;