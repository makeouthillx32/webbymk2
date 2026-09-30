import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";
import { isPublicHost, removals, selectOverlayFiles } from "./workspace-overlay";

const root = mkdtempSync(join(tmpdir(), "overlay-"));
const put = (rel: string, body = "x") => {
  mkdirSync(join(root, rel, ".."), { recursive: true });
  writeFileSync(join(root, rel), body);
};
spawnSync("git", ["init", "-q"], { cwd: root });
put(".gitignore", [
  ".env", "vault/", "node_modules/", ".next/", "logs/", "backups/", "supabase-instances/",
  ".obsidian/", "*.tsbuildinfo", ".claude/worktrees/", "big.bin",
].join("\n"));
put("src/app.ts");                                   // tracked by the main repo → never in overlay
put(".env", "SECRET=1");
put("vault/Notes/a.md");
put("node_modules/pkg/index.js");
put(".next/cache/x");
put("logs/syslog/today.log");
put("backups/db.dump");
put("supabase-instances/one/docker/.env", "PG=1");
put("supabase-instances/one/docker/volumes/db/data/PG_VERSION");
put("supabase-instances/one/docker/volumes/api/kong.yml");
put(".obsidian/app.json");
put(".obsidian/plugins/tasks/main.js");
put(".obsidian/plugins/tasks/data.json");
put("tsconfig.tsbuildinfo");
put(".claude/worktrees/w1/file.ts");
writeFileSync(join(root, "big.bin"), Buffer.alloc(51 * 1024 * 1024));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("selectOverlayFiles", () => {
  const { files, tooBig } = selectOverlayFiles(root);

  test("keeps secrets, notes, and instance config", () => {
    for (const want of [".env", "vault/Notes/a.md", "supabase-instances/one/docker/.env",
      "supabase-instances/one/docker/volumes/api/kong.yml", ".obsidian/app.json", ".obsidian/plugins/tasks/data.json"]) {
      expect(files).toContain(want);
    }
  });

  test("leaves out tracked code, regenerable output, data, and plugin code", () => {
    for (const not of ["src/app.ts", "node_modules/pkg/index.js", ".next/cache/x", "logs/syslog/today.log",
      "backups/db.dump", "supabase-instances/one/docker/volumes/db/data/PG_VERSION",
      ".obsidian/plugins/tasks/main.js", "tsconfig.tsbuildinfo", ".claude/worktrees/w1/file.ts", ".gitignore"]) {
      expect(files).not.toContain(not);
    }
  });

  test("files over the size cap are reported, not added", () => {
    expect(files).not.toContain("big.bin");
    expect(tooBig.map((b) => b.path)).toEqual(["big.bin"]);
  });
});

describe("guards", () => {
  test("public hosts are recognised in any URL form", () => {
    expect(isPublicHost("git@github.com:me/x.git")).toBe(true);
    expect(isPublicHost("ssh://git@github.com/me/x.git")).toBe(true);
    expect(isPublicHost("https://gitlab.com/me/x")).toBe(true);
    expect(isPublicHost("ssh://git@100.64.0.2:2222/unenter/x-workspace.git")).toBe(false);
  });

  test("removals are what's tracked but no longer selected", () => {
    expect(removals(["a", "b", "c"], ["a", "c", "d"])).toEqual(["b"]);
  });
});
