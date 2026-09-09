// src/lib/shield/waf.ts
// ─────────────────────────────────────────────────────────────────────────────
// High-speed, regex-optimized Web Application Firewall (WAF) rule inspector
// for Unenter Edge Shield.
// ─────────────────────────────────────────────────────────────────────────────

const SQLI_PATTERNS = [
  /(\b(UNION(\s+ALL)?)\s+SELECT)/i,
  /('\s*OR\s*['"\d]+\s*=\s*['"\d]+)/i,
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|EXEC|EXECUTE)\b.*\b(FROM|INTO|TABLE|DATABASE)\b)/i,
  /(\bSLEEP\(\s*\d+\s*\))/i,
  /(\bBENCHMARK\(\s*\d+\s*,)/i,
  /(--\s*$|\/\*!\d+)/m,
];

const TRAVERSAL_PATTERNS = [
  /(\.\.[\/\\])/,
  /(%2e%2e%2f|%2e%2e\/|%2e%2e%5c)/i,
  /(\/etc\/(passwd|shadow|hosts))/i,
  /(\/proc\/self\/environ)/i,
  /(\b(cmd|powershell|bash|sh)(\.exe)?\b)/i,
];

const SCANNER_AGENTS = [
  /sqlmap/i,
  /nikto/i,
  /masscan/i,
  /zgrab/i,
  /gobuster/i,
  /dirbuster/i,
  /wpscan/i,
  /nmap/i,
  /acunetix/i,
  /havij/i,
];

export interface WafInspectionResult {
  clean: boolean;
  threatType?: "sqli" | "traversal" | "malicious_bot" | "xss";
  matchedPattern?: string;
  reason?: string;
}

export function inspectRequest(
  url: string,
  userAgent: string | null,
  bodyText?: string | null
): WafInspectionResult {
  // 1. Scanner / Exploit Bot Detection
  if (userAgent) {
    for (const pattern of SCANNER_AGENTS) {
      if (pattern.test(userAgent)) {
        return {
          clean: false,
          threatType: "malicious_bot",
          matchedPattern: pattern.source,
          reason: `Blocked automated security scanner agent: ${userAgent.slice(0, 40)}`,
        };
      }
    }
  }

  // 2. Decode URL and Query
  let decodedUrl = url;
  try {
    decodedUrl = decodeURIComponent(url);
  } catch {
    // Malformed encoding can be an evasion attempt
    return {
      clean: false,
      threatType: "traversal",
      reason: "Malformed URI encoding detected",
    };
  }

  const payloadToInspect = `${decodedUrl} ${bodyText || ""}`;

  // 3. Path Traversal & File Inclusion
  for (const pattern of TRAVERSAL_PATTERNS) {
    if (pattern.test(payloadToInspect)) {
      return {
        clean: false,
        threatType: "traversal",
        matchedPattern: pattern.source,
        reason: "Path traversal / system file inclusion attempt detected",
      };
    }
  }

  // 4. SQL Injection Patterns
  for (const pattern of SQLI_PATTERNS) {
    if (pattern.test(payloadToInspect)) {
      return {
        clean: false,
        threatType: "sqli",
        matchedPattern: pattern.source,
        reason: "SQL injection signature detected in request query/payload",
      };
    }
  }

  return { clean: true };
}
