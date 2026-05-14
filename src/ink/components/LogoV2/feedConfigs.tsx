// src/ink/components/LogoV2/feedConfigs.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Feed data builders for the UNAXIS welcome screen.
//
// Each function returns a FeedConfig (or null to hide the feed entirely).
// FeedColumn accepts an array of FeedConfigs and stacks them vertically.
// ─────────────────────────────────────────────────────────────────────────────

import type { FeedConfig, FeedLine } from "./Feed.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type RecentActivity = {
  label: string;
  timestamp?: string;
};

export type ReleaseNote = {
  version: string;
  summary: string;
};

export type ZoneStatus = {
  key: string;
  status: "running" | "stopped" | "building" | "error";
};

// ── Activity feed ─────────────────────────────────────────────────────────────

/**
 * Recent zone / scaffold activity — sourced from the caller so this file
 * stays I/O-free and easy to test.
 */
export function createRecentActivityFeed(
  activities: RecentActivity[],
): FeedConfig {
  const lines: FeedLine[] = activities.slice(0, 8).map((a) => ({
    text:      a.label,
    timestamp: a.timestamp,
  }));

  return {
    title:        "Recent Activity",
    lines,
    emptyMessage: "No recent activity",
    footer:       activities.length > 8 ? `+${activities.length - 8} more` : undefined,
  };
}

// ── What's new feed ───────────────────────────────────────────────────────────

/**
 * Latest release notes entries (pass the 3 most recent).
 */
export function createWhatsNewFeed(
  notes: ReleaseNote[],
  currentVersion: string,
): FeedConfig {
  const lines: FeedLine[] = notes.map((n) => ({
    text:      n.summary,
    timestamp: n.version,
  }));

  return {
    title:        "What's New",
    lines,
    emptyMessage: "Up to date",
    footer:       `v${currentVersion}`,
  };
}

// ── Zone status feed ─────────────────────────────────────────────────────────

const STATUS_GLYPHS: Record<ZoneStatus["status"], string> = {
  running:  "●",
  stopped:  "○",
  building: "◌",
  error:    "✖",
};

/**
 * Running/stopped status for each registered zone.
 */
export function createZoneStatusFeed(zones: ZoneStatus[]): FeedConfig {
  const lines: FeedLine[] = zones.map((z) => ({
    text: `${STATUS_GLYPHS[z.status]} ${z.key}`,
  }));

  return {
    title:        "Zones",
    lines,
    emptyMessage: "No zones scaffolded yet",
  };
}

// ── Project onboarding feed ───────────────────────────────────────────────────

export type OnboardingStep = {
  label: string;
  done: boolean;
};

/**
 * Checklist-style onboarding steps. Hidden once all steps are complete.
 */
export function createProjectOnboardingFeed(
  steps: OnboardingStep[],
): FeedConfig | null {
  if (steps.every((s) => s.done)) return null;

  const lines: FeedLine[] = steps.map((s) => ({
    text: `${s.done ? "✔" : "·"} ${s.label}`,
  }));

  return {
    title: "Getting Started",
    lines,
  };
}

// ── Guest passes / overage stubs (kept for LogoV2 compatibility) ─────────────

export function createGuestPassesFeed(): FeedConfig | null {
  return null;
}

export function createOverageCreditFeed(): FeedConfig | null {
  return null;
}
