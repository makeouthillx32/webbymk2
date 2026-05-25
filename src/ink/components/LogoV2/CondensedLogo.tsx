// src/ink/components/LogoV2/CondensedLogo.tsx
// ─────────────────────────────────────────────────────────────────────────────
// One-line compact header shown when the terminal is too narrow for the full
// two-column LogoV2 layout. Shows: ✻ UNAXIS · v{version} · {project}
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import { Box, Text } from "../../runtimeInk.js";

type Props = {
  version: string;
  projectPath?: string;
  columns: number;
};

/** Trim a filesystem path to fit: keep last 2 segments, prefix with …/ */
function shortenPath(p: string, maxCols: number): string {
  if (!p) return "";
  const parts = p.replace(/\\/g, "/").split("/").filter(Boolean);
  const full  = parts.join("/");
  if (full.length <= maxCols) return full;
  const short = parts.slice(-2).join("/");
  return short.length < full.length ? `…/${short}` : short;
}

export function CondensedLogo({ version, projectPath, columns }: Props): React.ReactNode {
  const pathBudget = Math.max(0, columns - 20 - (projectPath ? 3 : 0));
  const pathLabel  = projectPath ? shortenPath(projectPath, pathBudget) : "";

  return (
    <Box gap={1}>
      <Text color="cyanBright" bold>✻ UNAXIS</Text>
      <Text dimColor>·</Text>
      <Text dimColor>v{version}</Text>
      {pathLabel && (
        <>
          <Text dimColor>·</Text>
          <Text dimColor>{pathLabel}</Text>
        </>
      )}
    </Box>
  );
}
