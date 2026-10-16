import { describe, expect, test } from "bun:test";
import { archiveHealth, archiveSettings, parseArchiverRow, parseKeyCreate, parseNodeId, renderGarageToml, renderWalgConfig } from "./object-store.ts";

describe("production data gets a live copy on another machine", () => {
  test("garage config carries the secrets and binds the S3 API", () => {
    const toml = renderGarageToml({ rpcSecret: "a".repeat(64), adminToken: "tok" });
    expect(toml).toContain(`rpc_secret = "${"a".repeat(64)}"`);
    expect(toml).toContain('api_bind_addr = "[::]:3900"');
    expect(toml).toContain("replication_factor = 1");
  });

  test("WAL-G points at the bucket with path-style S3 over trusted loopback", () => {
    const c = JSON.parse(renderWalgConfig({ endpoint: "http://100.118.17.36:3900", keyId: "GKx", secret: "s", prefix: "unenter" }));
    expect(c.WALG_S3_PREFIX).toBe("s3://pg-wal/unenter");
    expect(c.AWS_S3_FORCE_PATH_STYLE).toBe("true");
    expect(c.PGUSER).toBe("supabase_admin");
    expect(c.PGHOST).toBe("127.0.0.1");
  });

  test("garage CLI output is parsed", () => {
    expect(parseNodeId("563e1ac825ee3323aa441e72c26d1030d6d4414aeb3dd25287c531e7fc2bc95d@127.0.0.1:3901")).toBe("563e1ac825ee3323aa441e72c26d1030d6d4414aeb3dd25287c531e7fc2bc95d");
    const k = parseKeyCreate("==== ACCESS KEY INFORMATION ====\nKey ID:              GK31c2f218a2e44f485b94239e\nKey name:            unenter-pg\nSecret key:          b892c0665f0ada8a4755dae98baa3b133590e11dae3bcc1f9d769d67f16c3835\n");
    expect(k).toEqual({ keyId: "GK31c2f218a2e44f485b94239e", secret: "b892c0665f0ada8a4755dae98baa3b133590e11dae3bcc1f9d769d67f16c3835" });
    expect(parseKeyCreate("nope")).toBeNull();
  });

  test("archive health reads pg_stat_archiver and flags failures and a backlog", () => {
    const now = Date.parse("2026-10-16T17:00:00Z");
    const store = { key: "objects@l0v3", envName: "L0V3", url: "http://x:3900", state: "running" };
    const row = parseArchiverRow("on|12|000000010000000600000075|2026-10-16 16:58:00+00|0|-|0");
    expect(row).toEqual({ mode: "on", archived: 12, lastWal: "000000010000000600000075", lastAt: "2026-10-16 16:58:00+00", failed: 0, lastFailAt: null, pending: 0 });
    const ok = archiveHealth({ store, ...row, baseBackups: 1, newestBase: "base_1" }, now);
    expect(ok.tone).toBe("ok");
    expect(ok.text).toContain("last 2m ago");
    const failing = archiveHealth({ store, ...row, failed: 3, lastFailAt: "2026-10-16 16:59:00+00", baseBackups: 1, newestBase: null }, now);
    expect(failing.tone).toBe("warn");
    // A quiet database ships nothing for an hour — fine; a backlog is not.
    expect(archiveHealth({ store, ...row, lastAt: "2026-10-16 16:00:00+00", baseBackups: null, newestBase: null }, now).tone).toBe("ok");
    const backlog = archiveHealth({ store, ...row, pending: 8, baseBackups: null, newestBase: null }, now);
    expect(backlog.tone).toBe("warn");
    expect(backlog.text).toContain("8 waiting");
    expect(archiveHealth({ store: null, ...row, baseBackups: null, newestBase: null }, now).tone).toBe("off");
    expect(archiveHealth({ store, ...row, mode: "off", baseBackups: 1, newestBase: null }, now).tone).toBe("off");
  });

  test("archiving ships WAL at least every minute", () => {
    const s = Object.fromEntries(archiveSettings("/var/lib/postgresql/data/walg.json"));
    expect(s.archive_mode).toBe("on");
    expect(s.archive_timeout).toBe("60s");
    expect(s.archive_command).toContain("wal-push %p");
  });
});
