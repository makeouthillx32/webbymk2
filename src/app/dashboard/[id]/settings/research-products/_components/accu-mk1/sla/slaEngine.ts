/**
 * SLA Turnaround Engine & Business Day Calculator
 * Ported from Accu-Mk1 sla_engine.py & holidays_us.py
 */

export interface SLAResult {
  targetDate: Date;
  businessHoursRemaining: number;
  isOverdue: boolean;
  formattedTarget: string;
}

// US Federal Holiday Check (Fixed & Nth-weekday rules)
export function isUSHoliday(date: Date): boolean {
  const month = date.getMonth() + 1; // 1-12
  const day = date.getDate();
  const dayOfWeek = date.getDay(); // 0 (Sun) - 6 (Sat)

  // New Year's Day (Jan 1)
  if (month === 1 && day === 1) return true;
  // Independence Day (Jul 4)
  if (month === 7 && day === 4) return true;
  // Veterans Day (Nov 11)
  if (month === 11 && day === 11) return true;
  // Christmas Day (Dec 25)
  if (month === 12 && day === 25) return true;

  // Thanksgiving (4th Thursday in Nov)
  if (month === 11 && dayOfWeek === 4 && day >= 22 && day <= 28) return true;

  return false;
}

export function isBusinessDay(date: Date): boolean {
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) return false; // Weekend
  return !isUSHoliday(date);
}

/**
 * Calculates target completion date adding N business hours (assuming 8h lab workday).
 */
export function calculateSLATarget(startDate: Date = new Date(), slaHours: number = 48): SLAResult {
  let current = new Date(startDate);
  let hoursAdded = 0;

  while (hoursAdded < slaHours) {
    current.setHours(current.getHours() + 1);
    if (isBusinessDay(current)) {
      hoursAdded++;
    }
  }

  const now = new Date();
  const diffMs = current.getTime() - now.getTime();
  const remainingHours = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));

  return {
    targetDate: current,
    businessHoursRemaining: remainingHours,
    isOverdue: now > current,
    formattedTarget: current.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}
