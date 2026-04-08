// types/timesheet.ts
export interface RowData {
  day: string;
  starthour: number;
  startminute: number;
  startampm: string;
  endhour: number;
  endminute: number;
  endampm: string;
  breaktime: number;
}

export interface WeekData {
  id: number;
  name: string;
  rows: RowData[];
}