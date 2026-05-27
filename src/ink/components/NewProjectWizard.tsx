import React, { useState } from "react";
import { Box, Text, useInput } from "../runtimeInk.js";
import { Divider } from "./Divider.jsx";
import { Spinner } from "./Spinner.jsx";

// ── Constants ──────────────────────────────────────────────────────────────────

const TEARDROP     = "✻";
const TITLE        = "UNAXIS CONTROL PLANE";
const SETTLED_GREY = "#999999";

interface Presets {
  domain: string;
  slug: string;
  path: string;
}

const DOMAIN_PRESETS: Presets[] = [
  { domain: "unenter.live", slug: "unenter", path: "Z:\\WEBSITES\\webbymk2" },
  { domain: "makeouthill.xyz", slug: "makeouthill", path: "Z:\\WEBSITES\\makeouthill" },
  { domain: "unaxis.network", slug: "unaxis", path: "Z:\\WEBSITES\\unaxis" },
];

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  onCancel: () => void;
  onDone:   (result: { slug: string; path: string; domain: string }) => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function NewProjectWizard({ onCancel, onDone }: Props) {
  const [step, setStep] = useState<"intro" | "domain" | "dns" | "layout" | "success">("intro");
  const [presetIdx, setPresetIdx] = useState(0);
  const [dnsStatus, setDnsStatus] = useState<"idle" | "checking" | "verified">("idle");
  const [selectedModules, setSelectedModules] = useState({
    db: true,
    proxy: true,
    zones: true,
  });
  const [cursor, setCursor] = useState(0); // For module selection

  const current = DOMAIN_PRESETS[presetIdx] || DOMAIN_PRESETS[0];

  // ── Keyboard Navigation ────────────────────────────────────────────────────
  useInput((input, key) => {
    if (input === "q" || key.escape) {
      onCancel();
      return;
    }

    if (key.return) {
      if (step === "intro") {
        setStep("domain");
      } else if (step === "domain") {
        setStep("dns");
        setDnsStatus("idle");
      } else if (step === "dns") {
        if (dnsStatus === "idle") {
          setDnsStatus("checking");
          setTimeout(() => setDnsStatus("verified"), 1500);
        } else if (dnsStatus === "verified") {
          setStep("layout");
          setCursor(0);
        }
      } else if (step === "layout") {
        setStep("success");
      } else if (step === "success") {
        onDone({ slug: current.slug, path: current.path, domain: current.domain });
      }
    }

    if (step === "domain") {
      if (key.leftArrow) {
        setPresetIdx((idx) => (idx > 0 ? idx - 1 : DOMAIN_PRESETS.length - 1));
      }
      if (key.rightArrow) {
        setPresetIdx((idx) => (idx < DOMAIN_PRESETS.length - 1 ? idx + 1 : 0));
      }
    }

    if (step === "layout") {
      if (key.upArrow) setCursor((c) => (c > 0 ? c - 1 : 2));
      if (key.downArrow) setCursor((c) => (c < 2 ? c + 1 : 0));
      if (input === " ") {
        setSelectedModules((prev) => {
          const next = { ...prev };
          if (cursor === 0) next.db = !next.db;
          if (cursor === 1) next.proxy = !next.proxy;
          if (cursor === 2) next.zones = !next.zones;
          return next;
        });
      }
    }
  });

  return (
    <Box flexDirection="column" paddingX={3} paddingY={1} width={80}>
      
      {/* ── Wordmark Header ── */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Box gap={1}>
          <Text color="cyan">{TEARDROP}</Text>
          <Text bold color="white">{TITLE}</Text>
        </Box>
        <Text dimColor>project onboarding</Text>
      </Box>
      <Divider />

      {/* ── Step: Introduction ── */}
      {step === "intro" && (
        <Box flexDirection="column" gap={1} marginY={1}>
          <Text color="yellow" bold>⊕ DOMAIN-CENTRIC DOMAIN CONTROLLER WIZARD</Text>
          <Box flexDirection="column" gap={0} paddingLeft={2} borderStyle="round" borderColor="gray">
            <Text dimColor>In UNAXIS, a "Project" acts as a dedicated **Domain Controller**.</Text>
            <Text dimColor>Setting up a new project partitions your services, settings, and databases</Text>
            <Text dimColor>around a dedicated primary domain (e.g. unenter.live) and its wildcards.</Text>
          </Box>
          <Box flexDirection="column" gap={0} marginTop={1}>
            <Text color="white">This wizard guides you through:</Text>
            <Text dimColor>  1. Defining the core domain & automatic workspace mapping</Text>
            <Text dimColor>  2. Configuring wildcards (*.domain) for Next.js multi-zones</Text>
            <Text dimColor>  3. Generating decoupled Option A app-data directories</Text>
          </Box>
          <Box marginTop={1} gap={2}>
            <Text color="cyan" bold>[↵] Start Setup Process</Text>
            <Text dimColor>[q/esc] Cancel</Text>
          </Box>
        </Box>
      )}

      {/* ── Step: Domain Selection ── */}
      {step === "domain" && (
        <Box flexDirection="column" gap={1} marginY={1}>
          <Text color="yellow" bold>STEP 1: DEFINE DOMAIN CONTROLLER BOUNDARY</Text>
          <Text dimColor>Cycle through target domain presets to see project slug mapping:</Text>

          <Box flexDirection="column" gap={0} paddingX={2} marginY={1}>
            <Box gap={2} alignItems="center">
              <Text bold color="cyan">◀</Text>
              <Box borderStyle="single" borderColor="cyan" paddingX={4}>
                <Text bold color="yellow">{current.domain}</Text>
              </Box>
              <Text bold color="cyan">▶</Text>
            </Box>
            <Text dimColor textAlign="center" marginTop={0}>[Left/Right Arrow] to cycle presets</Text>
          </Box>

          <Box flexDirection="column" gap={1} paddingLeft={2} borderStyle="round" borderColor="gray">
            <Box gap={1}>
              <Text color="white" bold>Project Name (Slug):</Text>
              <Text color="cyan">{current.slug}</Text>
            </Box>
            <Box gap={1}>
              <Text color="white" bold>Target Project Path:</Text>
              <Text color="yellow">{current.path}</Text>
            </Box>
            <Box gap={1}>
              <Text color="white" bold>Decoupled AppData:</Text>
              <Text color="magenta">%APPDATA%\unaxis\{current.slug}\</Text>
            </Box>
          </Box>

          <Box marginTop={1} gap={2}>
            <Text color="cyan" bold>[↵] Save Domain & Configure DNS</Text>
            <Text dimColor>[q/esc] Cancel</Text>
          </Box>
        </Box>
      )}

      {/* ── Step: DNS Validation ── */}
      {step === "dns" && (
        <Box flexDirection="column" gap={1} marginY={1}>
          <Text color="yellow" bold>STEP 2: WILDCARD DNS & NETWORK CONTROLS</Text>
          <Text dimColor>Next.js multi-zones route automatically by hostname. Verify DNS wildcards:</Text>

          <Box flexDirection="column" gap={0} marginY={1} borderStyle="single" borderColor="gray" paddingX={1}>
            <Box justifyContent="space-between">
              <Text color="white" bold>Record Target</Text>
              <Text color="white" bold>Type</Text>
              <Text color="white" bold>Expected Value</Text>
              <Text color="white" bold>Status</Text>
            </Box>
            <Divider />
            <Box justifyContent="space-between">
              <Text dimColor>{current.domain}</Text>
              <Text dimColor>A</Text>
              <Text dimColor>127.0.0.1</Text>
              {dnsStatus === "idle" && <Text color="yellow">Pending</Text>}
              {dnsStatus === "checking" && <Spinner />}
              {dnsStatus === "verified" && <Text color="green" bold>✓ OK</Text>}
            </Box>
            <Box justifyContent="space-between">
              <Text dimColor>*.{current.domain}</Text>
              <Text dimColor>A</Text>
              <Text dimColor>127.0.0.1</Text>
              {dnsStatus === "idle" && <Text color="yellow">Pending</Text>}
              {dnsStatus === "checking" && <Spinner />}
              {dnsStatus === "verified" && <Text color="green" bold>✓ OK</Text>}
            </Box>
            <Box justifyContent="space-between">
              <Text dimColor>db.{current.domain}</Text>
              <Text dimColor>CNAME</Text>
              <Text dimColor>{current.domain}</Text>
              {dnsStatus === "idle" && <Text color="yellow">Pending</Text>}
              {dnsStatus === "checking" && <Spinner />}
              {dnsStatus === "verified" && <Text color="green" bold>✓ OK</Text>}
            </Box>
          </Box>

          {dnsStatus === "idle" && (
            <Text color="yellow">Press [↵] to run a mock DNS validation query</Text>
          )}
          {dnsStatus === "checking" && (
            <Text color="yellow">Pinging DNS resolvers for records...</Text>
          )}
          {dnsStatus === "verified" && (
            <Text color="green" bold>✓ DNS Wildcards matched. Router is ready to accept zones.</Text>
          )}

          <Box marginTop={1} gap={2}>
            {dnsStatus === "verified" ? (
              <Text color="cyan" bold>[↵] Proceed to Scaffolding</Text>
            ) : (
              <Text color="gray">[↵] Run Validation Check</Text>
            )}
            <Text dimColor>[q/esc] Cancel</Text>
          </Box>
        </Box>
      )}

      {/* ── Step: Layout/Modules ── */}
      {step === "layout" && (
        <Box flexDirection="column" gap={1} marginY={1}>
          <Text color="yellow" bold>STEP 3: ENFORCE CORE topOLOGY CONTRACT</Text>
          <Text dimColor>Select modular services to inherit inside {current.slug}'s domain space:</Text>

          <Box flexDirection="column" gap={0} marginY={1}>
            <Box gap={2}>
              <Text color={cursor === 0 ? "cyan" : "white"}>{cursor === 0 ? "▶" : " "} [ {selectedModules.db ? "X" : " " } ] Supabase Core DB Stack</Text>
              <Text dimColor>(Postgres 15, Auth, Realtime, REST)</Text>
            </Box>
            <Box gap={2}>
              <Text color={cursor === 1 ? "cyan" : "white"}>{cursor === 1 ? "▶" : " "} [ {selectedModules.proxy ? "X" : " " } ] Nginx Proxy Manager Gateway</Text>
              <Text dimColor>(SSL wildcard certs, proxy routes)</Text>
            </Box>
            <Box gap={2}>
              <Text color={cursor === 2 ? "cyan" : "white"}>{cursor === 2 ? "▶" : " "} [ {selectedModules.zones ? "X" : " " } ] Next.js Multi-Zone Runtime</Text>
              <Text dimColor>(Blog, Shop, Admin, Main App)</Text>
            </Box>
          </Box>

          <Text dimColor>[↑/↓] Navigate   ·   [Space] Toggle selection</Text>

          <Box marginTop={1} gap={2}>
            <Text color="cyan" bold>[↵] Scaffold Workspace Configuration</Text>
            <Text dimColor>[q/esc] Cancel</Text>
          </Box>
        </Box>
      )}

      {/* ── Step: Success Summary ── */}
      {step === "success" && (
        <Box flexDirection="column" gap={1} marginY={1}>
          <Text color="green" bold>✓ PROJECT SCATTER CONTRACT DECLARED!</Text>
          <Text dimColor>A new domain controller has been scaffolded under the Option A namespace.</Text>

          <Box flexDirection="column" gap={0} paddingLeft={2} borderStyle="double" borderColor="green" marginY={1}>
            <Text dimColor>Slug:      <Text color="white">{current.slug}</Text></Text>
            <Text dimColor>Domain:    <Text color="white">{current.domain}</Text></Text>
            <Text dimColor>Root:      <Text color="white">{current.path}</Text></Text>
            <Text dimColor>Registry:  <Text color="cyan">%APPDATA%\unaxis\{current.slug}\config.json</Text></Text>
          </Box>

          <Text color="yellow">Press [↵] to return and activate the new domain controller</Text>
        </Box>
      )}

    </Box>
  );
}

