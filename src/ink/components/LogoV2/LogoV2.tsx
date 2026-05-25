// src/ink/components/LogoV2/LogoV2.tsx
// ─────────────────────────────────────────────────────────────────────────────
// UNAXIS welcome block — the first thing the user sees after the startup
// animation completes.
//
// Layout (full-width):
//   ┌──────────────┬───────────────────────────────┐
//   │  WelcomeV2   │  FeedColumn (1–3 feeds)       │
//   │  (left panel)│                               │
//   └──────────────┴───────────────────────────────┘
//
// Narrow terminal (<= CONDENSED_THRESHOLD cols): falls back to CondensedLogo.
//
// Props come from the App layer so this component stays I/O-free; it only
// holds layout and wiring logic.
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import { Box, Text } from "../../runtimeInk.js";
import { FeedColumn }     from "./FeedColumn.js";
import { WelcomeV2 }      from "./WelcomeV2.js";
import { CondensedLogo }  from "./CondensedLogo.js";
import {
  createRecentActivityFeed,
  createWhatsNewFeed,
  createZoneStatusFeed,
  createProjectOnboardingFeed,
  type RecentActivity,
  type ReleaseNote,
  type ZoneStatus,
  type OnboardingStep,
} from "./feedConfigs.js";
import type { FeedConfig } from "./Feed.js";

// ── Layout constants ──────────────────────────────────────────────────────────

const CONDENSED_THRESHOLD = 60;   // cols — below this, use CondensedLogo
const LEFT_PANEL_MIN      = 18;
const LEFT_PANEL_MAX      = 28;
const GAP                 = 3;    // cols between left panel and feeds

// ── Types ─────────────────────────────────────────────────────────────────────

export type LogoV2Props = {
  /** Terminal column count (from useTerminalSize). */
  columns: number;
  version: string;
  projectPath?: string;
  username?: string;
  activities?: RecentActivity[];
  releaseNotes?: ReleaseNote[];
  zones?: ZoneStatus[];
  onboardingSteps?: OnboardingStep[];
  /** Extra feeds appended after the built-in ones. */
  extraFeeds?: FeedConfig[];
};

// ── Component ─────────────────────────────────────────────────────────────────

export function LogoV2({
  columns,
  version,
  projectPath,
  username,
  activities  = [],
  releaseNotes = [],
  zones        = [],
  onboardingSteps,
  extraFeeds   = [],
}: LogoV2Props): React.ReactNode {

  // ── Condensed fallback ─────────────────────────────────────────────────────
  if (columns <= CONDENSED_THRESHOLD) {
    return (
      <CondensedLogo
        version={version}
        projectPath={projectPath}
        columns={columns}
      />
    );
  }

  // ── Left panel width ───────────────────────────────────────────────────────
  const leftW   = Math.min(LEFT_PANEL_MAX, Math.max(LEFT_PANEL_MIN, Math.floor(columns * 0.28)));
  const rightW  = columns - leftW - GAP;

  // ── Feed assembly ──────────────────────────────────────────────────────────
  const feeds: FeedConfig[] = [];

  // Onboarding (highest priority — shown until all steps done)
  if (onboardingSteps) {
    const f = createProjectOnboardingFeed(onboardingSteps);
    if (f) feeds.push(f);
  }

  // Zone status
  if (zones.length > 0) {
    feeds.push(createZoneStatusFeed(zones));
  }

  // Recent activity
  if (activities.length > 0) {
    feeds.push(createRecentActivityFeed(activities));
  }

  // What's new
  if (releaseNotes.length > 0) {
    feeds.push(createWhatsNewFeed(releaseNotes, version));
  }

  // Caller-supplied extras
  feeds.push(...extraFeeds);

  return (
    <Box flexDirection="column">
      {/* ── Main row ────────────────────────────────────────────────────── */}
      <Box flexDirection="row">
        {/* Left — welcome panel */}
        <Box width={leftW} flexShrink={0}>
          <WelcomeV2
            version={version}
            projectPath={projectPath}
            username={username}
            maxWidth={leftW}
          />
        </Box>

        {/* Gap */}
        <Box width={GAP} flexShrink={0} />

        {/* Right — feeds */}
        <Box width={rightW}>
          {feeds.length > 0 ? (
            <FeedColumn feeds={feeds} maxWidth={rightW} />
          ) : (
            <Text dimColor>No feeds to display</Text>
          )}
        </Box>
      </Box>

      {/* ── Bottom border ───────────────────────────────────────────────── */}
      <Box marginTop={1}>
        <Text dimColor>{"─".repeat(Math.min(columns, 80))}</Text>
      </Box>
    </Box>
  );
}
