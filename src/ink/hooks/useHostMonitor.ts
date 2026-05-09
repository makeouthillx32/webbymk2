// src/ink/hooks/useHostMonitor.ts
// ─────────────────────────────────────────────────────────────────────────────
// System performance monitoring hook.
// Samples CPU and Memory usage via the 'os' module and maintains a history
// for real-time sparkline trend visualization.
// ─────────────────────────────────────────────────────────────────────────────

import os from "os";
import { useState, useEffect, useRef, useMemo } from "react";

const HISTORY_LENGTH = 20;
const SAMPLE_INTERVAL_MS = 2000;

export interface HostSnapshot {
  systemCpu:      number; // 0-100 percentage
  memoryPressure: number; // 0-1 percentage (used/total)
  usedMemory:     number; // bytes
  totalMemory:    number; // bytes
  freeMemory:     number; // bytes
  uptime:         number; // seconds
  cpuHistory:     number[]; // normalized [0, 1]
  memHistory:     number[]; // normalized [0, 1]
}

function readCpuTotals(): { idle: number; total: number } {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    idle += cpu.times.idle;
    total +=
      cpu.times.user +
      cpu.times.nice +
      cpu.times.sys +
      cpu.times.idle +
      cpu.times.irq;
  }
  return { idle, total };
}

export function useHostMonitor(): HostSnapshot {
  const totalMemory = useMemo(() => os.totalmem(), []);
  
  const [snapshot, setSnapshot] = useState<HostSnapshot>(() => {
    const memory = totalMemory - os.freemem();
    return {
      systemCpu:      0,
      memoryPressure: memory / totalMemory,
      usedMemory:     memory,
      totalMemory,
      freeMemory:     os.freemem(),
      uptime:         os.uptime(),
      cpuHistory:     new Array(HISTORY_LENGTH).fill(0),
      memHistory:     new Array(HISTORY_LENGTH).fill(memory / totalMemory),
    };
  });

  const prevCpuRef = useRef(readCpuTotals());

  useEffect(() => {
    const sample = () => {
      const currentCpu = readCpuTotals();
      const idleDelta = currentCpu.idle - prevCpuRef.current.idle;
      const totalDelta = currentCpu.total - prevCpuRef.current.total;
      prevCpuRef.current = currentCpu;

      const systemCpu = totalDelta > 0 ? (1 - idleDelta / totalDelta) * 100 : 0;
      const freeMemory = os.freemem();
      const usedMemory = totalMemory - freeMemory;
      const memoryPressure = usedMemory / totalMemory;

      setSnapshot((prev) => {
        const nextCpuHistory = [...prev.cpuHistory, systemCpu / 100].slice(-HISTORY_LENGTH);
        const nextMemHistory = [...prev.memHistory, memoryPressure].slice(-HISTORY_LENGTH);

        return {
          systemCpu,
          memoryPressure,
          usedMemory,
          totalMemory,
          freeMemory,
          uptime: os.uptime(),
          cpuHistory: nextCpuHistory,
          memHistory: nextMemHistory,
        };
      });
    };

    const timer = setInterval(sample, SAMPLE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [totalMemory]);

  return snapshot;
}
