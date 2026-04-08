// hooks/useTimesheetLogic.ts
import { useState } from 'react';
import { WeekData, RowData } from '../types/timesheet';
import { createDefaultRow, daysOfWeek } from '../utils/timesheetUtils';

export const useTimesheetLogic = () => {
  const [weeks, setWeeks] = useState<WeekData[]>([
    { id: 1, name: "Week 1", rows: [] }
  ]);
  
  const [activeWeekId, setActiveWeekId] = useState<number>(1);
  const [hourlyRate, setHourlyRate] = useState<number>(15);
  const [showPayCalculation, setShowPayCalculation] = useState<boolean>(false);
  const [customDayName, setCustomDayName] = useState<string>("");
  const [nextWeekId, setNextWeekId] = useState<number>(2);

  const handleRowChange = <T extends keyof RowData>(
    weekId: number,
    rowIndex: number,
    field: T,
    value: RowData[T]
  ) => {
    const updatedWeeks = weeks.map((week) => {
      if (week.id === weekId) {
        const updatedRows = [...week.rows];
        updatedRows[rowIndex][field] = value;
        return { ...week, rows: updatedRows };
      }
      return week;
    });
    setWeeks(updatedWeeks);
  };

  const addDay = (weekId: number, dayName: string = "") => {
    let day = dayName;
    
    if (!day) {
      if (customDayName) {
        day = customDayName;
        setCustomDayName("");
      } else {
        const week = weeks.find(w => w.id === weekId);
        day = `Day ${week?.rows.length ? week.rows.length + 1 : 1}`;
      }
    }
    
    const updatedWeeks = weeks.map((week) => {
      if (week.id === weekId) {
        return { ...week, rows: [...week.rows, createDefaultRow(day)] };
      }
      return week;
    });
    
    setWeeks(updatedWeeks);
  };

  const addWeek = (copyFromWeekId?: number) => {
    const newWeekId = nextWeekId;
    setNextWeekId(nextWeekId + 1);
    
    let newRows: RowData[] = [];
    
    if (copyFromWeekId !== undefined) {
      const sourceWeek = weeks.find(w => w.id === copyFromWeekId);
      if (sourceWeek) {
        newRows = sourceWeek.rows.map(row => ({...row}));
      }
    }
    
    setWeeks([
      ...weeks,
      {
        id: newWeekId,
        name: `Week ${newWeekId}`,
        rows: newRows
      }
    ]);
    
    setActiveWeekId(newWeekId);
  };

  const addFullWeek = (weekId: number) => {
    const week = weeks.find(w => w.id === weekId);
    if (!week) return;
    
    const existingDays = new Set(week.rows.map(row => row.day));
    const daysToAdd = daysOfWeek.filter(day => !existingDays.has(day));
    
    if (daysToAdd.length === 0) return;
    
    const updatedWeeks = weeks.map((w) => {
      if (w.id === weekId) {
        return {
          ...w,
          rows: [
            ...w.rows,
            ...daysToAdd.map(day => createDefaultRow(day))
          ]
        };
      }
      return w;
    });
    
    setWeeks(updatedWeeks);
  };

  const removeRow = (weekId: number, rowIndex: number) => {
    const updatedWeeks = weeks.map((week) => {
      if (week.id === weekId) {
        const updatedRows = [...week.rows];
        updatedRows.splice(rowIndex, 1);
        return { ...week, rows: updatedRows };
      }
      return week;
    });
    setWeeks(updatedWeeks);
  };

  const removeWeek = (weekId: number) => {
    if (weeks.length <= 1) return;
    
    const updatedWeeks = weeks.filter(w => w.id !== weekId);
    setWeeks(updatedWeeks);
    
    if (activeWeekId === weekId) {
      setActiveWeekId(updatedWeeks[0].id);
    }
  };

  const renameWeek = (weekId: number, newName: string) => {
    const updatedWeeks = weeks.map((week) => {
      if (week.id === weekId) {
        return { ...week, name: newName };
      }
      return week;
    });
    setWeeks(updatedWeeks);
  };

  return {
    weeks,
    activeWeekId,
    hourlyRate,
    showPayCalculation,
    customDayName,
    setActiveWeekId,
    setHourlyRate,
    setShowPayCalculation,
    setCustomDayName,
    handleRowChange,
    addDay,
    addWeek,
    addFullWeek,
    removeRow,
    removeWeek,
    renameWeek,
  };
};