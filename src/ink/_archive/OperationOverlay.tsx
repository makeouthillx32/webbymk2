// tui/OperationOverlay.tsx
// Full-screen output/log stream overlay shown during build/restart/log ops.
import React        from "react";
import { Box, Text } from "ink";
import { Rule }     from "./ui/primitives.tsx";

export type OpView = "output" | "logs";

interface OperationOverlayProps {
  title: string;
  lines: string[];
  busy:  boolean;
  mode:  OpView;
}

export function OperationOverlay({ title, lines, busy, mode }: OperationOverlayProps) {
  const visible = lines.slice(-30);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      width={76}
    >
      {/* Header bar */}
      <Box justifyContent="space-between">
        <Text bold color="cyan">{title}</Text>
        <Box gap={2}>
          {busy                       && <Text color="yellow">● running</Text>}
          {!busy && mode === "output" && <Text color="green">✓ done</Text>}
          {mode === "logs"            && <Text color="blue">◉ live</Text>}
          <Text dimColor>[q/esc] back</Text>
        </Box>
      </Box>

      <Rule />

      {/* Output lines */}
      <Box flexDirection="column">
        {visible.map((line, i) => (
          <Text
            key={i}
            dimColor={mode === "output" && i < visible.length - 8}
            color={
              line.startsWith("✓") || line.startsWith("done") ? "green"  :
              line.startsWith("✗") || line.startsWith("error") || line.startsWith("exit") ? "red" :
              undefined
            }
          >
            {line}
          </Text>
        ))}
        {busy && <Text color="yellow">▌</Text>}
      </Box>
    </Box>
  );
}
