// src/ink/zone/validate.ts
// ─────────────────────────────────────────────────────────────────────────────
// Scaffold output validator — runs after file generation, before Docker build.
//
// Each check targets a known failure mode that would otherwise surface as a
// cryptic build error or silent runtime routing bug:
//
//   middleware-copy      Missing COPY middleware.ts in Dockerfile → build fails
//                        with "Module not found: Can't resolve '../middleware'"
//
//   env-file-absolute    Relative env_file in compose artifact → deploy fails
//                        because ../../.env resolves to %APPDATA%\unenter\.env
//                        instead of the project root .env
//
//   dynamic-zone-guard   getCanonicalHost missing *.CORE_DOMAIN fallback →
//                        middleware 301-redirects every new zone to www on first
//                        request (browser permanently caches the bad redirect)
//
// Usage:
//   const issues = validateScaffoldOutput(z);
//   if (issues.length > 0) { ... rollback ... }
// ─────────────────────────────────────────────────────────────────────────────

import { join }        from "path";
import { existsSync, readFileSync } from "fs";
import { PROJECT_DIR, ARTIFACT_STORE_DIR } from "../../config/stack.ts";
import type { DerivedZone } from "./types.ts";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ValidationIssue {
  /** Short machine-readable rule identifier */
  rule:   string;
  /** Human path shown in TUI output */
  file:   string;
  /** Full explanation — what is wrong and why it matters */
  detail: string;
}

// ── Internal checks ───────────────────────────────────────────────────────────

function checkDockerfile(z: DerivedZone): ValidationIssue[] {
  const path   = join(PROJECT_DIR, "zones", z.key, "Dockerfile");
  const issues: ValidationIssue[] = [];

  if (!existsSync(path)) {
    return [{
      rule:   "file-exists",
      file:   `zones/${z.key}/Dockerfile`,
      detail: "Dockerfile was not created — scaffold write may have failed silently.",
    }];
  }

  const content = readFileSync(path, "utf-8");

  if (!content.includes("COPY middleware.ts ./")) {
    issues.push({
      rule:   "middleware-copy",
      file:   `zones/${z.key}/Dockerfile`,
      detail: [
        `Missing "COPY middleware.ts ./" in builder stage.`,
        `src/middleware.ts re-exports from "../middleware" (the project-root middleware.ts).`,
        `Without this COPY the build context has no /app/middleware.ts and Next.js`,
        `fails with: Module not found: Can't resolve '../middleware'`,
      ].join(" "),
    });
  }

  if (!content.includes("COPY src/ ./src/")) {
    issues.push({
      rule:   "src-copy",
      file:   `zones/${z.key}/Dockerfile`,
      detail: `Missing "COPY src/ ./src/" — zone source code won't be in the image.`,
    });
  }

  return issues;
}

function checkComposeArtifact(z: DerivedZone): ValidationIssue[] {
  const path   = join(ARTIFACT_STORE_DIR, "unenter-zones", "docker-compose.yml");
  const issues: ValidationIssue[] = [];

  if (!existsSync(path)) {
    return [{
      rule:   "file-exists",
      file:   `stacks/unenter-zones/docker-compose.yml`,
      detail: "Unified compose artifact was not written to the artifact store.",
    }];
  }

  const content = readFileSync(path, "utf-8");

  // Catch the relative-path bug: ../../.env from %APPDATA%\unenter\stacks\<key>\
  // resolves to %APPDATA%\unenter\.env — not the project root .
  if (/env_file:\s*\.\./.test(content)) {
    issues.push({
      rule:   "env-file-absolute",
      file:   `stacks/unenter-zones/docker-compose.yml`,
      detail: [
        `env_file uses a relative path (../../.env).`,
        `The compose artifact lives in the UNAXIS artifact store, not the repo root.`,
        `Relative paths resolve to %APPDATA%\\unenter\\.env which does not exist.`,
        `env_file must be an absolute path to the project .env.`,
      ].join(" "),
    });
  }

  if (!content.includes(z.service)) {
    issues.push({
      rule:   "service-name",
      file:   `stacks/unenter-zones/docker-compose.yml`,
      detail: `Expected Docker service name "${z.service}" not found in compose file.`,
    });
  }

  if (!content.includes(z.image)) {
    issues.push({
      rule:   "image-name",
      file:   `stacks/unenter-zones/docker-compose.yml`,
      detail: `Expected image "${z.image}" not referenced in compose file.`,
    });
  }

  return issues;
}

function checkMultiZoneGuard(): ValidationIssue[] {
  const path = join(PROJECT_DIR, "src", "lib", "multiZone.ts");
  if (!existsSync(path)) return [];

  const content = readFileSync(path, "utf-8");

  // The dynamic subdomain fallback was added to getCanonicalHost to prevent
  // middleware from 301-redirecting new zones to www.unenter.live.
  // Verify it's still present — guards against accidental revert.
  const hasFallback =
    content.includes("endsWith") &&
    content.includes("CORE_DOMAIN") &&
    content.includes("getCanonicalHost");

  if (!hasFallback) {
    return [{
      rule:   "dynamic-zone-guard",
      file:   "src/lib/multiZone.ts",
      detail: [
        `getCanonicalHost is missing the dynamic subdomain fallback.`,
        `Without it, any zone not in the static ZONES map will receive a 301`,
        `redirect to www.unenter.live on first request — and browsers cache it permanently.`,
        `Check that getCanonicalHost ends with: if (h.endsWith(\`.\${CORE_DOMAIN}\`)) return h;`,
      ].join(" "),
    }];
  }

  return [];
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Validate all scaffold outputs for a new zone.
 *
 * Returns an empty array on success.  A non-empty result means at least one
 * critical invariant is broken — the caller should abort and rollback.
 *
 * Call this AFTER scaffoldZone() writes files, BEFORE buildZone() starts.
 * Catching problems here saves 20–30s of Docker build time on every failure.
 */
export function validateScaffoldOutput(z: DerivedZone): ValidationIssue[] {
  return [
    ...checkDockerfile(z),
    ...checkComposeArtifact(z),
    ...checkMultiZoneGuard(),
  ];
}

/**
 * Format issues for display in the TUI operation log.
 * Each issue becomes two lines: a header and an indented detail.
 */
export function formatValidationIssues(issues: ValidationIssue[]): string[] {
  const lines: string[] = [];
  lines.push(`\n✗ Scaffold validation failed (${issues.length} issue${issues.length !== 1 ? "s" : ""})`);
  lines.push(`  Fix the template and retry — no Docker build was attempted.\n`);
  for (const issue of issues) {
    lines.push(`  [${issue.rule}]  ${issue.file}`);
    lines.push(`    ${issue.detail}\n`);
  }
  return lines;
}
