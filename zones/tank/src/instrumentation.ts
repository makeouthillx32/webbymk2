// ─────────────────────────────────────────────────────────────────────────────
// Next.js Server Startup Instrumentation (Tank Zone)
// Automatically pre-warms backend services (Server Director, Camera Ingest, Virtual Atlas)
// as soon as the Node.js server starts up, without requiring any client or admin presence.
// ─────────────────────────────────────────────────────────────────────────────

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { warmupServerDirector } = await import(
        "@/zones/tank/server/serverDirectorEngine"
      );
      void warmupServerDirector().catch((err) => {
        console.error("[Instrumentation] Tank Director server warmup error:", err);
      });
    } catch (err) {
      console.warn("[Instrumentation] Skipping Tank Director warmup on non-tank runtime:", err);
    }

    try {
      const { startArchiveAggregationScheduler } = await import(
        "@/zones/tank/server/archiveAggregate"
      );
      startArchiveAggregationScheduler();
    } catch (err) {
      console.warn("[Instrumentation] Skipping Archive Aggregation Scheduler warmup on non-tank runtime:", err);
    }
  }
}
