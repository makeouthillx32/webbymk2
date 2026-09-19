import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import {
  handleDirectorOverrideGet,
  handleDirectorOverridePost,
  handleDirectorOverrideDelete,
} from "./directorOverrideHttp";
import { clearItemOverride } from "./directorPolicyHierarchy";

const originalFetch = globalThis.fetch;

beforeAll(() => {
  globalThis.fetch = async (input: any, init?: any) => {
    return new Response(JSON.stringify({ ok: true, data: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe("Director Override HTTP API", () => {
  test("GET returns catalog and empty active overrides initially", async () => {
    clearItemOverride();
    const res = await handleDirectorOverrideGet();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.catalog.length).toBeGreaterThan(0);
    expect(json.hasActiveOverride).toBe(false);
  });

  test("POST triggers catalog item and updates active overrides", async () => {
    clearItemOverride();
    const req = new Request("http://localhost/api/tank/director/override", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemSlug: "pet-whistle",
        triggeredBy: "TestViewer42",
        durationSeconds: 45,
      }),
    });

    const res = await handleDirectorOverridePost(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.override.itemSlug).toBe("pet-whistle");
    expect(json.policy.hasActiveOverride).toBe(true);
    expect(json.policy.effectiveDetectionMode).toBe("dog");

    // Clear after test
    clearItemOverride();
  });
});
