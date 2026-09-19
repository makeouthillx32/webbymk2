import { describe, expect, test } from "bun:test";
import { getSubjectRuntimeReadiness } from "./runtimeReadiness";

describe("Staff Room subject runtime readiness", () => {
  test("requires both a stored profile and proof the live worker loaded it", () => {
    const runtime = {
      workerOnline: true,
      appearance: { targets: { tyler: 1 } },
    };

    expect(getSubjectRuntimeReadiness("tyler", 1, runtime)).toMatchObject({
      ready: true,
      runtimeLoaded: 1,
      label: "READY IN AXIS",
    });
    expect(getSubjectRuntimeReadiness("joe", 1, runtime)).toMatchObject({
      ready: false,
      runtimeLoaded: 0,
      label: "NOT LOADED",
    });
  });

  test("distinguishes missing profiles from an offline worker", () => {
    expect(getSubjectRuntimeReadiness("malia", 0, null).label).toBe(
      "NEEDS PROFILE",
    );
    expect(
      getSubjectRuntimeReadiness("malia", 1, {
        workerOnline: false,
        appearance: null,
      }).label,
    ).toBe("WORKER OFFLINE");
  });

  test("keeps all subject lookups keyed by the exact slug", () => {
    const runtime = {
      workerOnline: true,
      appearance: { targets: { kitty: 1, molly: 7 } },
    };
    expect(getSubjectRuntimeReadiness("kitty", 1, runtime).runtimeLoaded).toBe(1);
    expect(getSubjectRuntimeReadiness("molly", 7, runtime).runtimeLoaded).toBe(7);
    expect(getSubjectRuntimeReadiness("olly", 4, runtime).runtimeLoaded).toBe(0);
  });
});
