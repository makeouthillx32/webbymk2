import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { parseRouterLogArgs, readRouterLog } from "./router-log";

const dir = mkdtempSync(join(tmpdir(), "router-log-"));
writeFileSync(join(dir, "2026-01-01.log"), "a kernel: old\n");
writeFileSync(join(dir, "2026-01-02.log"), "b kernel: DROP x\nc rc_service: restart_firewall\n");
writeFileSync(join(dir, "2026-01-03.log"), "d kernel: DROP y\ne dnsmasq: ok\n");
writeFileSync(join(dir, "notes.txt"), "ignored\n");
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("readRouterLog", () => {
  test("reads the two newest days by default, newest lines last", () => {
    const r = readRouterLog(dir, { tail: 10 });
    expect(r.days).toEqual(["2026-01-02", "2026-01-03"]);
    expect(r.lines.map((l) => l[0])).toEqual(["b", "c", "d", "e"]);
  });

  test("grep, tail, and a single date", () => {
    expect(readRouterLog(dir, { tail: 1, grep: "drop", days: 5 }).lines).toEqual(["d kernel: DROP y"]);
    expect(readRouterLog(dir, { tail: 10, date: "2026-01-01" }).lines).toEqual(["a kernel: old"]);
  });

  test("a missing directory is empty, not an error", () => {
    expect(readRouterLog(join(dir, "nope"), { tail: 10 })).toEqual({ lines: [], days: [] });
  });
});

describe("parseRouterLogArgs", () => {
  test("rejects bad input with a message", () => {
    expect(parseRouterLogArgs(["--days", "0"], 10)).toBeTypeOf("string");
    expect(parseRouterLogArgs(["--date", "yesterday"], 10)).toBeTypeOf("string");
    expect(parseRouterLogArgs(["--grep", "("], 10)).toBeTypeOf("string");
    expect(parseRouterLogArgs(["--grep", "DPT=3478", "--days", "7"], 10)).toEqual({ tail: 10, grep: "DPT=3478", date: undefined, days: 7 });
  });
});
