// src/ink/components/LogoV2/FeedColumn.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Stacks multiple Feed components in a column, separated by dividers.
// Each feed auto-sizes to the narrowest width that fits all content,
// capped at maxWidth.
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import { Box, Text } from "ink";
import type { FeedConfig } from "./Feed.js";
import { calculateFeedWidth, Feed } from "./Feed.js";

type FeedColumnProps = {
  feeds: FeedConfig[];
  maxWidth: number;
};

export function FeedColumn({ feeds, maxWidth }: FeedColumnProps): React.ReactNode {
  const feedWidths  = feeds.map((f) => calculateFeedWidth(f));
  const maxOfAll    = Math.max(...feedWidths);
  const actualWidth = Math.min(maxOfAll, maxWidth);

  return (
    <Box flexDirection="column">
      {feeds.map((feed, i) => (
        <React.Fragment key={i}>
          <Feed config={feed} actualWidth={actualWidth} />
          {i < feeds.length - 1 && (
            <Text dimColor>{"─".repeat(actualWidth)}</Text>
          )}
        </React.Fragment>
      ))}
    </Box>
  );
}
