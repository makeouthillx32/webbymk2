import { describe, expect, test } from "bun:test";
import { currentZoneEnv, findEnv } from "./zone-move.ts";

const envs: any[] = [
  { id: "p", name: "POWER", type: "local-docker" },
  { id: "l", name: "L0V3", type: "remote-agent", agentUrl: "http://l:8888" },
  { id: "o", name: "OPT1", type: "remote-agent", agentUrl: "http://o:8888" },
];

describe("zone move", () => {
  test("finds environments by name, case-insensitive, or id", () => {
    expect(findEnv(envs, "l0v3")?.id).toBe("l");
    expect(findEnv(envs, "o")?.name).toBe("OPT1");
    expect(findEnv(envs, "mars")).toBeNull();
  });

  test("a zone with no environment runs on the local host", () => {
    expect(currentZoneEnv({ key: "x" } as any, envs)?.name).toBe("POWER");
    expect(currentZoneEnv({ key: "x", environmentId: "o" } as any, envs)?.name).toBe("OPT1");
  });
});
