import { afterEach, describe, expect, test } from "bun:test";
import { provisionMediaMtxCamera } from "./mediaGateway";

// Regression cover for the MediaMTX control-API storm found on POWER
// 2026-09-10. `upsertMediaMtxPath` only applies its "unchanged" guard when the
// config GET succeeds, so a path that cannot be created skipped the guard and
// was rewritten on every receiver poll (2.5s) forever. Live, that was a steady
// ~110 failed calls/minute — `ERR [API] path not found` — from the two SRTLA
// cameras whose main/-hls/-archive paths 404 while their receivers cycle.

const saved = {
  api: process.env.MEDIAMTX_API_URL,
  low: process.env.TANK_HLS_LOW_RUNG,
};
const nativeFetch = globalThis.fetch;

afterEach(() => {
  process.env.MEDIAMTX_API_URL = saved.api;
  process.env.TANK_HLS_LOW_RUNG = saved.low;
  globalThis.fetch = nativeFetch;
});

describe("upsert cooldown for uncreatable paths", () => {
  test("stops re-attempting a path whose ADD keeps failing", async () => {
    process.env.MEDIAMTX_API_URL = "http://mediamtx.test:9997";
    delete process.env.TANK_HLS_LOW_RUNG;

    // A camera whose paths can never be created: every write is rejected, the
    // way MediaMTX behaves for these while the receiver is down.
    let calls = 0;
    globalThis.fetch = (async (input: string | URL | Request) => {
      calls += 1;
      const url = new URL(String(input instanceof Request ? input.url : input));
      if (url.pathname.includes("/config/paths/get/")) {
        return new Response("path not found", { status: 404 });
      }
      return new Response("path not found", { status: 400 });
    }) as typeof fetch;

    const first = await provisionMediaMtxCamera(
      "cam-cooldown-probe",
      "srt://receiver.test:9000?mode=caller",
      { transcodeAudio: true, forceVideoTranscode: true },
    );
    expect(first.ok).toBe(false);

    const afterFirst = calls;
    expect(afterFirst).toBeGreaterThan(0);

    // The next poll comes ~2.5s later in production. Inside the cooldown it
    // must not touch the control API again for those same paths.
    const second = await provisionMediaMtxCamera(
      "cam-cooldown-probe",
      "srt://receiver.test:9000?mode=caller",
      { transcodeAudio: true, forceVideoTranscode: true },
    );
    expect(second.ok).toBe(false);

    expect(calls).toBe(afterFirst);
  });

  test("a path that creates cleanly is never put in cooldown", async () => {
    process.env.MEDIAMTX_API_URL = "http://mediamtx.test:9997";
    delete process.env.TANK_HLS_LOW_RUNG;

    const configured = new Map<string, unknown>();
    let addCalls = 0;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      const path = decodeURIComponent(url.pathname.split("/").pop() ?? "");
      if (url.pathname.includes("/config/paths/get/")) {
        return configured.has(path)
          ? Response.json(configured.get(path))
          : new Response("missing", { status: 404 });
      }
      if (url.pathname.includes("/config/paths/patch/")) {
        return new Response("missing", { status: 404 });
      }
      if (url.pathname.includes("/config/paths/add/")) {
        addCalls += 1;
        configured.set(path, JSON.parse(String(init?.body ?? "{}")));
        return new Response(null, { status: 200 });
      }
      return new Response("unexpected", { status: 500 });
    }) as typeof fetch;

    const first = await provisionMediaMtxCamera(
      "cam-healthy-probe",
      "srt://receiver.test:9000?mode=caller",
      { transcodeAudio: true, forceVideoTranscode: true },
    );
    expect(first.ok).toBe(true);
    expect(addCalls).toBeGreaterThan(0);

    // Second poll: paths now exist and are unchanged, so the guard short-circuits
    // and nothing is re-added. A cooldown must not be what produced that.
    const addsAfterFirst = addCalls;
    const second = await provisionMediaMtxCamera(
      "cam-healthy-probe",
      "srt://receiver.test:9000?mode=caller",
      { transcodeAudio: true, forceVideoTranscode: true },
    );
    expect(second.ok).toBe(true);
    expect(addCalls).toBe(addsAfterFirst);
  });
});
