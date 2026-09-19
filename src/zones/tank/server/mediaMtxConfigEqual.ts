// MediaMTX serializes durations canonically (for example 600s -> 10m0s).
// Compare their values so directory reconciliation does not restart recorders.
function durationSeconds(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parts = [...value.matchAll(/(\d+(?:\.\d+)?)(ns|us|µs|μs|ms|s|m|h|d)/g)];
  if (!parts.length || parts.map((part) => part[0]).join("") !== value) return null;
  const units: Record<string, number> = { ns: 1e-9, us: 1e-6, "µs": 1e-6, "μs": 1e-6, ms: .001, s: 1, m: 60, h: 3600, d: 86400 };
  return parts.reduce((total, part) => total + Number(part[1]) * units[part[2]], 0);
}

export function mediaMtxConfigEqual(current: Record<string, unknown>, desired: Record<string, unknown>): boolean {
  return Object.keys(desired).every((key) => {
    const actual = current[key];
    const target = desired[key];
    if (/Duration$|After$/.test(key)) {
      const a = durationSeconds(actual);
      const b = durationSeconds(target);
      if (a !== null && b !== null) return Math.abs(a - b) < 1e-9;
    }
    if (typeof actual === "string" || typeof target === "string") return (actual ?? "") === (target ?? "");
    return actual === target;
  });
}
