import { describe, expect, test } from "bun:test";
import { inferDomainProvider, isValidDomainName, normalizeDomainName } from "./domain-providers.ts";
import { getUdCliStatus } from "./ud-cli-provider.ts";

describe("domain provider inference", () => {
  test("normalizes URLs and conventional DNS names", () => {
    expect(normalizeDomainName("HTTPS://Unenter.PW/")).toBe("unenter.pw");
    expect(isValidDomainName("unenter.pw")).toBe(true);
    expect(inferDomainProvider("unenter.pw")).toBe("dns");
  });

  test("routes Brave and common Unstoppable suffixes to the Web3 adapter", () => {
    expect(inferDomainProvider("unenter.brave")).toBe("unstoppable");
    expect(inferDomainProvider("name.crypto")).toBe("unstoppable");
    expect(inferDomainProvider("name.polygon")).toBe("unstoppable");
  });

  test("keeps ENS distinct and rejects malformed names", () => {
    expect(inferDomainProvider("name.eth")).toBe("ens");
    expect(isValidDomainName("bad..domain")).toBe(false);
    expect(isValidDomainName("-bad.example")).toBe(false);
  });
});

describe("official Unstoppable provider adapter", () => {
  test("detects the installed CLI without exposing credentials", () => {
    const status = getUdCliStatus();
    expect(status.installed).toBe(true);
    expect(status.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(status.detail.toLowerCase()).not.toContain("token=");
  });
});
