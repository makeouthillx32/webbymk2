// ─────────────────────────────────────────────────────────────────────────────
// Next.js Server Startup Instrumentation
// Automatically pre-warms backend services (Server Director, Camera Ingest, Virtual Atlas)
// as soon as the Node.js server starts up, without requiring any client or admin presence.
// ─────────────────────────────────────────────────────────────────────────────

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Only warm up the Tank Director if running the tank zone or local monolith
    const isTankZone =
      process.env.NEXT_PUBLIC_ZONE === "tank" ||
      process.env.ZONE === "tank" ||
      (!process.env.NEXT_PUBLIC_ZONE && process.env.NODE_ENV !== "production");

    if (isTankZone) {
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
        const { startYouTubeChatPoller } = await import(
          "@/zones/tank/server/youtubeChatPoller"
        );
        startYouTubeChatPoller();
      } catch (err) {
        console.warn("[Instrumentation] Skipping YouTube Chat Poller warmup on non-tank runtime:", err);
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

    // Process-level backstop, confirmed necessary live 2026-09-02: a
    // malformed stored session can make @supabase/auth-js's internal
    // session-recovery path throw inside a promise this app never held a
    // reference to (fired from middleware.ts's `supabase.auth.getUser()`,
    // via a detached internal timer/retry the library owns, not us). The
    // middleware's own timeout race stops that ONE request from hanging, but
    // the abandoned internal promise can still reject moments later, and an
    // unhandled rejection with no listener anywhere in the process crashes
    // the entire Node/Bun server — every concurrent request, every visitor,
    // not just whoever's cookie triggered it. That's the actual shape of
    // tonight's "everything intermittently 502s" symptom: a fraction of
    // requests silently killing the whole process, which then restarts and
    // looks "healthy" again until the next one. This handler is the
    // difference between "one visitor's request degrades gracefully" and
    // "the whole platform periodically falls over" — log and move on,
    // never let a stray rejection anywhere take the process down.
    process.on("unhandledRejection", (reason) => {
      console.error("[Instrumentation] Unhandled rejection (process kept alive):", reason);
    });
    process.on("uncaughtException", (err) => {
      console.error("[Instrumentation] Uncaught exception (process kept alive):", err);
    });
  }
}
