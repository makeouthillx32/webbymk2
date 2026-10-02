import { describe, expect, test } from "bun:test";
import { commitMatches, commitTag, scopeOfPath, scopesOfCommit } from "./changelog-scopes.ts";
import { formatByDay, parseLog, shaFromSourceRef } from "./changelog.ts";

describe("scopeOfPath", () => {
  test("a zone's own source belongs to that zone", () => {
    expect(scopeOfPath("src/zones/tank/TankChat.tsx")).toEqual({ kind: "zone", name: "tank" });
    expect(scopeOfPath("zones/docs/Dockerfile")).toEqual({ kind: "zone", name: "docs" });
  });

  test("shared site code is core", () => {
    expect(scopeOfPath("src/lib/cookieUtils.ts").kind).toBe("core");
    expect(scopeOfPath("src/app/layout.tsx").kind).toBe("core");
    expect(scopeOfPath("next.config.js").kind).toBe("core");
    expect(scopeOfPath("public/favicon.ico").kind).toBe("core");
    expect(scopeOfPath("src/zones/zoneOverlayDrift.test.ts").kind).toBe("core");
  });

  test("control-plane code is unaxis", () => {
    expect(scopeOfPath("src/ink/zone-build.ts").kind).toBe("unaxis");
    expect(scopeOfPath("src/screens/WelcomeScreen.tsx").kind).toBe("unaxis");
    expect(scopeOfPath("src/main.tsx").kind).toBe("unaxis");
    expect(scopeOfPath("scripts/dev-bare.ts").kind).toBe("unaxis");
  });

  test("folders the site and TUI share go by the commit's scope", () => {
    expect(scopeOfPath("src/components/KeyHint.tsx", "unaxis").kind).toBe("unaxis");
    expect(scopeOfPath("src/components/KeyHint.tsx", "tank").kind).toBe("core");
    expect(scopeOfPath("src/utils/supabase/server.ts", null).kind).toBe("core");
  });

  test("services are named", () => {
    expect(scopeOfPath("services/tank-vision-worker/main.py")).toEqual({ kind: "services", name: "tank-vision-worker" });
    expect(scopeOfPath("packages/agent/src/index.ts")).toEqual({ kind: "services", name: "agent" });
    expect(scopeOfPath("proxy/agent.js")).toEqual({ kind: "services", name: "proxy" });
    expect(scopeOfPath("mediamtx/mediamtx.yml")).toEqual({ kind: "services", name: "mediamtx" });
    expect(scopeOfPath("docker-compose.yml")).toEqual({ kind: "services", name: "compose" });
  });

  test("docs and notes are in no changelog", () => {
    expect(scopeOfPath("CLAUDE.md").kind).toBe("other");
    expect(scopeOfPath("docs/dev-log.md").kind).toBe("other");
    expect(scopeOfPath("proxy-config/routes.json").kind).toBe("other");
  });

  test("Windows separators", () => {
    expect(scopeOfPath("src\\zones\\shop\\page.tsx")).toEqual({ kind: "zone", name: "shop" });
  });
});

describe("commits", () => {
  test("commitTag reads the conventional scope", () => {
    expect(commitTag("fix(unaxis): x")).toBe("unaxis");
    expect(commitTag("feat(Tank)!: x")).toBe("tank");
    expect(commitTag("chore: x")).toBeNull();
    expect(commitTag("Merge PR #1")).toBeNull();
  });

  test("a zone's log includes its own commits and core, not other zones or unaxis", () => {
    const tank = { kind: "zone" as const, name: "tank" };
    expect(commitMatches(tank, scopesOfCommit("feat(tank): x", ["src/zones/tank/a.tsx"]))).toBe(true);
    expect(commitMatches(tank, scopesOfCommit("fix(storage): x", ["src/lib/cookieUtils.ts"]))).toBe(true);
    expect(commitMatches(tank, scopesOfCommit("docs(landing): x", ["src/zones/docs/Landing.tsx"]))).toBe(false);
    expect(commitMatches(tank, scopesOfCommit("fix(unaxis): x", ["src/ink/release.ts"]))).toBe(false);
  });

  test("services can be filtered to one", () => {
    const scopes = scopesOfCommit("feat(tank): relay", ["services/tank-program-relay/x.ts", "src/zones/tank/a.ts"]);
    expect(commitMatches({ kind: "services" }, scopes)).toBe(true);
    expect(commitMatches({ kind: "services", name: "tank-program-relay" }, scopes)).toBe(true);
    expect(commitMatches({ kind: "services", name: "mediamtx" }, scopes)).toBe(false);
  });
});

describe("changelog parsing", () => {
  test("parseLog reads git log --name-only output", () => {
    const out = "\x01aaaaaaaa11\x022026-10-01\x02fix(storage): keep values\nsrc/lib/cookieUtils.ts\n\n" +
                "\x01bbbbbbbb22\x022026-09-30\x02chore: notes\nCLAUDE.md\n";
    const commits = parseLog(out);
    expect(commits.map((c) => c.sha)).toEqual(["aaaaaaaa11", "bbbbbbbb22"]);
    expect(commits[0].scopes).toEqual([{ kind: "core" }]);
    expect(commits[1].scopes).toEqual([{ kind: "other" }]);
  });

  test("shaFromSourceRef only accepts real commits", () => {
    expect(shaFromSourceRef("g1bf47e16")).toBe("1bf47e16");
    expect(shaFromSourceRef("g1bf47e16-dirty")).toBe("1bf47e16");
    expect(shaFromSourceRef("gnogit")).toBe("");
    expect(shaFromSourceRef("gnogit-dirty")).toBe("");
  });

  test("formatByDay groups under dates", () => {
    const lines = formatByDay([
      { sha: "a1", date: "2026-10-01", subject: "one" },
      { sha: "b2", date: "2026-10-01", subject: "two", viaCore: true },
      { sha: "c3", date: "2026-09-30", subject: "three", services: ["proxy"] },
    ]);
    expect(lines).toEqual([
      "  2026-10-01", "    a1  one", "    b2  two  [core]",
      "  2026-09-30", "    c3  three  [proxy]",
    ]);
  });
});
