import { config } from "./config";
import { HouseObserver } from "./observer";
import { createSupabase } from "./roster";
import { createVisionSession } from "./session";

// tank-vision-worker — the house's eyes, running whether or not anyone is looking.
//
// Detection used to live in PeopleDetectionEngine, inside a React effect, against
// hidden <video> elements it appended to document.body. That worked, but it meant
// the director could only see while a staff member happened to have the
// configuration page open in a browser. Close the tab and the house went blind:
// nothing accumulated, tracking lost the thread, and there was no event history
// to build memory out of. This process is the fix — the same decoder, the same
// identity catalog, no browser.
//
// Deliberately a sibling service rather than a hook inside the tank zone's
// instrumentation.ts: a Next.js server can run several processes and is recycled
// on deploy, neither of which suits a single continuous observer. This is one
// supervised process that restarts on its own, the same shape tank-audio-worker
// already proved.

async function main() {
  console.log(`[tank-vision] ${config.workerId} starting`);
  console.log(`[tank-vision] model: ${config.modelPath}`);
  console.log(`[tank-vision] mediamtx: ${config.mediamtxApiUrl} (hls ${config.mediamtxHlsUrl})`);
  console.log(`[tank-vision] reporting to: ${config.tankBaseUrl}`);

  const session = await createVisionSession();
  console.log(`[tank-vision] YOLOv8n session ready (wasm, ${config.wasmThreads} thread(s))`);

  const supabase = createSupabase();
  const observer = new HouseObserver(supabase, session);

  await observer.syncRoster();
  if (observer.describe().watching === 0) {
    console.warn(
      "[tank-vision] no cameras matched: every enrolled camera is either offline in MediaMTX, unscoped, or filtered out by TANK_VISION_ROOMS.",
    );
  }

  let rosterTimer: ReturnType<typeof setInterval> | null = setInterval(() => {
    void observer.syncRoster();
  }, config.rosterRefreshMs);

  const shutdown = (signal: string) => {
    console.log(`[tank-vision] ${signal} received, shutting down`);
    if (rosterTimer) {
      clearInterval(rosterTimer);
      rosterTimer = null;
    }
    observer.stop();
    // Give the ffmpeg children a moment to die before the process exits, so
    // they are not reaped as orphans holding MediaMTX readers open.
    setTimeout(() => process.exit(0), 250);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  let lastStatusAt = 0;

  while (!observer.stopped) {
    const startedAt = Date.now();
    try {
      await observer.inferNext();
      await observer.postReadings();
    } catch (error) {
      console.error(
        `[tank-vision] pass failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (startedAt - lastStatusAt > 60_000) {
      lastStatusAt = startedAt;
      const status = observer.describe();
      console.log(
        `[tank-vision] watching ${status.watching} camera(s), ${status.passes} passes, ${status.posts} posts` +
          (status.lastPostError ? ` — last post error: ${status.lastPostError}` : ""),
      );
      for (const cam of status.cameras) {
        // `framesSeen > 0` alone is cumulative and hides the worst failure: a
        // puller that produced frames and then went quiet. The foyer camera sat
        // like that for eight hours reporting as healthy, so staleness is now
        // part of the health test rather than just the frame count.
        const healthy = cam.running && cam.framesSeen > 0 && !cam.stalled;
        if (healthy) continue;
        const age = cam.lastFrameAgeMs === null ? "never" : `${Math.round(cam.lastFrameAgeMs / 1000)}s ago`;
        console.warn(
          `[tank-vision]   ${cam.cameraId}: running=${cam.running} frames=${cam.framesSeen}` +
            ` lastFrame=${age}${cam.stalled ? " STALLED" : ""}` +
            (cam.lastError ? ` lastError=${cam.lastError}` : ""),
        );
      }
    }

    // Pace from the start of the pass, so a slow inference does not compound
    // into an ever-growing gap between passes.
    const elapsed = Date.now() - startedAt;
    const wait = Math.max(25, config.inferenceIntervalMs - elapsed);
    await Bun.sleep(wait);
  }
}

await main();
