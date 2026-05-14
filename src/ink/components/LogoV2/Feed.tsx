// src/ink/components/LogoV2/Feed.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Generic feed column — renders a titled list of text rows with optional
// timestamps and a footer. Used by FeedColumn to stack multiple feeds.
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import { Box, Text } from "ink";
import { stringWidth } from "../../stringWidth.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type FeedLine = {
  text: string;
  timestamp?: string;
};

export type FeedConfig = {
  title: string;
  lines: FeedLine[];
  footer?: string;
  emptyMessage?: string;
  customContent?: {
    content: React.ReactNode;
    width: number;
  };
};

type FeedProps = {
  config: FeedConfig;
  actualWidth: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Truncate a string to fit within `maxWidth` terminal columns. */
function truncate(str: string, maxWidth: number): string {
  if (stringWidth(str) <= maxWidth) return str;
  let w = 0;
  let i = 0;
  for (const ch of str) {
    const cw = stringWidth(ch);
    if (w + cw > maxWidth - 1) break;
    w += cw;
    i += ch.length;
  }
  return str.slice(0, i) + "…";
}

/** Measure the natural width needed to display a feed without truncation. */
export function calculateFeedWidth(config: FeedConfig): number {
  const { title, lines, footer, emptyMessage, customContent } = config;
  const gap = "  ";
  let max = stringWidth(title);

  if (customContent !== undefined) {
    max = Math.max(max, customContent.width);
  } else if (lines.length === 0 && emptyMessage) {
    max = Math.max(max, stringWidth(emptyMessage));
  } else {
    const maxTsW = Math.max(
      0,
      ...lines.map((l) => (l.timestamp ? stringWidth(l.timestamp) : 0)),
    );
    for (const line of lines) {
      const tsW = maxTsW > 0 ? maxTsW : 0;
      const lw = stringWidth(line.text) + (tsW > 0 ? tsW + gap.length : 0);
      max = Math.max(max, lw);
    }
  }

  if (footer) max = Math.max(max, stringWidth(footer));
  return max;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function Feed({ config, actualWidth }: FeedProps): React.ReactNode {
  const { title, lines, footer, emptyMessage, customContent } = config;
  const gap = "  ";
  const maxTsW = Math.max(
    0,
    ...lines.map((l) => (l.timestamp ? stringWidth(l.timestamp) : 0)),
  );

  let body: React.ReactNode;

  if (customContent) {
    body = (
      <>
        {customContent.content}
        {footer && (
          <Text dimColor italic>
            {truncate(footer, actualWidth)}
          </Text>
        )}
      </>
    );
  } else if (lines.length === 0 && emptyMessage) {
    body = <Text dimColor>{truncate(emptyMessage, actualWidth)}</Text>;
  } else {
    body = (
      <>
        {lines.map((line, i) => {
          const textW = Math.max(10, actualWidth - (maxTsW > 0 ? maxTsW + gap.length : 0));
          return (
            <Text key={i}>
              {maxTsW > 0 && (
                <>
                  <Text dimColor>{(line.timestamp ?? "").padEnd(maxTsW)}</Text>
                  {gap}
                </>
              )}
              <Text>{truncate(line.text, textW)}</Text>
            </Text>
          );
        })}
        {footer && (
          <Text dimColor italic>
            {truncate(footer, actualWidth)}
          </Text>
        )}
      </>
    );
  }

  return (
    <Box flexDirection="column" width={actualWidth}>
      <Text bold color="cyanBright">
        {title}
      </Text>
      {body}
    </Box>
  );
}
