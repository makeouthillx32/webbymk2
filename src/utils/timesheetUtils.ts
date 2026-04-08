// utils/timesheetUtils.ts
import { RowData, WeekData } from '../types/timesheet';

export const daysOfWeek = [
  "Monday",
  "Tuesday", 
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export const convertTo24Hour = (hour: number, ampm: string): number => {
  if (ampm === "PM" && hour !== 12) return hour + 12;
  if (ampm === "AM" && hour === 12) return 0;
  return hour;
};

export const calculateTotal = (row: RowData): number => {
  const startHour = convertTo24Hour(row.starthour, row.startampm);
  const endHour = convertTo24Hour(row.endhour, row.endampm);
  const totalMinutes =
    endHour * 60 +
    row.endminute -
    (startHour * 60 + row.startminute) -
    row.breaktime;
  return totalMinutes > 0 ? totalMinutes / 60 : 0;
};

export const createDefaultRow = (day: string): RowData => {
  return {
    day,
    starthour: 8,
    startminute: 0,
    startampm: "AM",
    endhour: 5,
    endminute: 0,
    endampm: "PM",
    breaktime: 60,
  };
};

export const calculateWeekTotal = (week: WeekData): number => {
  return week.rows.reduce((sum, row) => sum + calculateTotal(row), 0);
};

export const calculateAllWeeksTotal = (weeks: WeekData[]): number => {
  return weeks.reduce((sum, week) => sum + calculateWeekTotal(week), 0);
};