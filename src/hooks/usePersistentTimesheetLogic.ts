// hooks/usePersistentTimesheetLogic.ts
import { useState } from 'react';
import { WeekData, RowData } from '../types/timesheet';
import { createDefaultRow, daysOfWeek } from '../utils/timesheetUtils';
import { useSessionStorage } from './useSessionStorage';

export const usePersistentTimesheetLogic = () => {
  // Persistent state using sessionStorage
  const [weeks, setWeeks] = useSessionStorage<WeekData[]>('timesheet-weeks', [
    { id: 1, name: "Week 1", rows: [] }
  ]);
  
  const [activeWeekId, setActiveWeekId] = useSessionStorage<number>('timesheet-active-week', 1);
  const [hourlyRate, setHourlyRate] = useSessionStorage<number>('timesheet-hourly-rate', 15);
  const [showPayCalculation, setShowPayCalculation] = useSessionStorage<boolean>('timesheet-show-pay', false);
  
  // Non-persistent state (resets on reload)
  const [customDayName, setCustomDayName] = useState<string>("");
  const [nextWeekId, setNextWeekId] = useSessionStorage<number>('timesheet-next-week-id', 2);

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

  // Utility function to clear all data
  const clearAllData = () => {
    setWeeks([{ id: 1, name: "Week 1", rows: [] }]);
    setActiveWeekId(1);
    setHourlyRate(15);
    setShowPayCalculation(false);
    setNextWeekId(2);
    setCustomDayName("");
  };

  // Utility function to export data
  const exportData = () => {
    const data = {
      weeks,
      activeWeekId,
      hourlyRate,
      showPayCalculation,
      nextWeekId,
      exportedAt: new Date().toISOString()
    };
    return JSON.stringify(data, null, 2);
  };

  // Utility function to import data
  const importData = (jsonData: string) => {
    try {
      const data = JSON.parse(jsonData);
      if (data.weeks) setWeeks(data.weeks);
      if (data.activeWeekId) setActiveWeekId(data.activeWeekId);
      if (data.hourlyRate) setHourlyRate(data.hourlyRate);
      if (data.showPayCalculation !== undefined) setShowPayCalculation(data.showPayCalculation);
      if (data.nextWeekId) setNextWeekId(data.nextWeekId);
      return true;
    } catch (error) {
      console.error('Error importing data:', error);
      return false;
    }
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
    clearAllData,
    exportData,
    importData,
  };
};