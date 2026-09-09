// src/lib/shield/waf.test.ts
import { describe, it, expect } from "bun:test";
import { inspectRequest } from "./waf";

describe("Edge Shield WAF Threat Inspector", () => {
  it("allows normal legitimate requests", () => {
    const res = inspectRequest("https://labs.unenter.live/products?search=peptide", "Mozilla/5.0 Chrome/120");
    expect(res.clean).toBe(true);
  });

  it("detects and blocks SQL injection in query params", () => {
    const res = inspectRequest("https://labs.unenter.live/products?id=1%20UNION%20SELECT%20password%20FROM%20users", "Mozilla/5.0");
    expect(res.clean).toBe(false);
    expect(res.threatType).toBe("sqli");
  });

  it("detects and blocks directory traversal attempts", () => {
    const res = inspectRequest("https://labs.unenter.live/../../etc/passwd", "Mozilla/5.0");
    expect(res.clean).toBe(false);
    expect(res.threatType).toBe("traversal");
  });

  it("detects automated vulnerability scanners by User-Agent", () => {
    const res = inspectRequest("https://labs.unenter.live/", "sqlmap/1.7#stable (https://sqlmap.org)");
    expect(res.clean).toBe(false);
    expect(res.threatType).toBe("malicious_bot");
  });
});
