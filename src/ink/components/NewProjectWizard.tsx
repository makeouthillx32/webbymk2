import React, { useState } from "react";
import { Box, Text, useInput } from "../runtimeInk.js";

// ── Constants ──────────────────────────────────────────────────────────────────

const TEARDROP     = "✻";
const TITLE        = "UNAXIS";
const SETTLED_GREY = "#999999";

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  onCancel: () => void;
  onDone:   (dummy: { slug: string; path: string }) => void;
}

// ── Dummy Component ───────────────────────────────────────────────────────────

export function NewProjectWizard({ onCancel, onDone }: Props) {
  const [step, setStep] = useState<"intro" | "path" | "layout" | "mock-success">("intro");
  const [pathVal, setPathVal] = useState("Z:\\WEBSITES\\new-project");
  
  // ── Keyboard Navigation ────────────────────────────────────────────────────
  useInput((input, key) => {
    if (input === "q" || key.escape) {
      onCancel();
      return;
    }

    if (key.return) {
      if (step === "intro") {
        setStep("path");
      } else if (step === "path") {
        setStep("layout");
      } else if (step === "layout") {
        setStep("mock-success");
      } else if (step === "mock-success") {
        onDone({ slug: "new-project", path: pathVal });
      }
    }
  });

  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" paddingY={2}>

      {/* ── Wordmark ── */}
      <Box marginBottom={1}>
        <Text color={SETTLED_GREY}>{TEARDROP}</Text>
      </Box>
      <Box marginBottom={2}>
        <Text bold color="white">{TITLE}</Text>
      </Box>

      {/* ── Title ── */}
      <Box gap={2} marginBottom={2}>
        <Text bold color="yellow">⊕  new project wizard (stub)</Text>
      </Box>

      {/* ── Step: Intro ── */}
      {step === "intro" && (
        <Box flexDirection="column" alignItems="center">
          <Text dimColor>Welcome to the New Project Setup wizard.</Text>
          <Text dimColor>This mock guides you through configuring a new multi-zone workspace.</Text>
          <Box marginTop={2}>
            <Text color="cyan">[↵] continue</Text>
            <Text dimColor>  ·  </Text>
            <Text dimColor>[q/esc] cancel</Text>
          </Box>
        </Box>
      )}

      {/* ── Step: Path Input ── */}
      {step === "path" && (
        <Box flexDirection="column" alignItems="center">
          <Box gap={1} marginBottom={1}>
            <Text dimColor>Target Path:</Text>
            <Text color="white">{pathVal}</Text>
          </Box>
          <Text dimColor>(Non-functional: Input is stubbed to default path)</Text>
          <Box marginTop={2}>
            <Text color="cyan">[↵] validate & continue</Text>
            <Text dimColor>  ·  </Text>
            <Text dimColor>[q/esc] cancel</Text>
          </Box>
        </Box>
      )}

      {/* ── Step: Layout Type Selection ── */}
      {step === "layout" && (
        <Box flexDirection="column" alignItems="center">
          <Text dimColor>Select Core Topology:</Text>
          <Box borderStyle="single" borderColor="cyan" paddingX={2} marginY={1}>
            <Text color="cyan">▶ [1] Supabase Core + Multi-Zone (Default)</Text>
          </Box>
          <Box marginTop={2}>
            <Text color="cyan">[↵] scaffold configuration</Text>
            <Text dimColor>  ·  </Text>
            <Text dimColor>[q/esc] cancel</Text>
          </Box>
        </Box>
      )}

      {/* ── Step: Success Mock ── */}
      {step === "mock-success" && (
        <Box flexDirection="column" alignItems="center">
          <Text color="green" bold>✓ Mock Project Configured!</Text>
          <Box borderStyle="double" borderColor="green" paddingX={2} marginY={1} flexDirection="column">
            <Text dimColor>Project slug: <Text color="white">new-project</Text></Text>
            <Text dimColor>Project root: <Text color="white">{pathVal}</Text></Text>
          </Box>
          <Box marginTop={1}>
            <Text color="yellow">[↵] complete & return</Text>
          </Box>
        </Box>
      )}

    </Box>
  );
}
