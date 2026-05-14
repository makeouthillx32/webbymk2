// src/ink/components/LogoV2/WelcomeV2.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Welcome panel — shown to the left of the feed columns in LogoV2.
// Renders the animated star mark, the UNAXIS wordmark, and a context line
// (project path / version / user hint).
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import { Box, Text } from "ink";
import { AnimatedClawd } from "./AnimatedClawd.js";

// ── Types ─────────────────────────────────────────────────────────────────────

type Props = {
  version:     string;
  projectPath?: string;
  username?:   string;
  /** Max columns available to this panel */
  maxWidth:    number;
};

// ── Path helper ───────────────────────────────────────────────────────────────

function shortenPath(p: string, max: number): string {
  if (!p) return "";
  const parts = p.replace(/\\/g, "/").split("/").filter(Boolean);
  const full  = parts.join("/");
  if (full.length <= max) return full;
  const short = parts.slice(-2).join("/");
  return short.length < full.length ? `…/${short}` : short;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WelcomeV2({
  version,
  projectPath,
  username,
  maxWidth,
}: Props): React.ReactNode {
  const pathLabel = projectPath
    ? shortenPath(projectPath, Math.max(10, maxWidth - 2))
    : "";

  return (
    <Box flexDirection="column" gap={1} width={maxWidth}>
      {/* ── Animated star mark ──────────────────────────────────────────── */}
      <Box paddingLeft={1}>
        <AnimatedClawd />
      </Box>

      {/* ── Wordmark ────────────────────────────────────────────────────── */}
      <Box flexDirection="column" paddingLeft={1}>
        <Text bold color="white">UNAXIS</Text>
        <Text dimColor>v{version}</Text>
      </Box>

      {/* ── Context ─────────────────────────────────────────────────────── */}
      {(pathLabel || username) && (
        <Box flexDirection="column" paddingLeft={1}>
          {pathLabel && (
            <Text dimColor>{pathLabel}</Text>
          )}
          {username && (
            <Text dimColor>{username}</Text>
          )}
        </Box>
      )}

      {/* ── Hint ────────────────────────────────────────────────────────── */}
      <Box paddingLeft={1}>
        <Text dimColor>? for help</Text>
      </Box>
    </Box>
  );
}
