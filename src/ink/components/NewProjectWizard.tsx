import React, { useMemo, useState } from "react";
import { Box, Text, useInput } from "../runtimeInk.js";
import { Divider } from "./Divider.jsx";
import { Spinner } from "./Spinner.jsx";
import { TextInput } from "./TextInput.tsx";
import { inferDomainProvider, isValidDomainName, normalizeDomainName } from "../domain-providers.ts";
import type { DomainProvider, DomainRole } from "../control-db.ts";

const TEARDROP = "✻";
const TITLE = "UNAXIS CONTROL PLANE";
const PROVIDERS: DomainProvider[] = ["dns", "unstoppable", "ens", "web3"];
type Step = "intro" | "domain" | "workspace" | "review" | "saving" | "success";

interface Props {
  onCancel: () => void;
  onDone: (result: { slug: string; path: string; domain: string }) => void;
}

function slugifyDomain(domain: string): string {
  return domain.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "domain";
}

function defaultRole(provider: DomainProvider): DomainRole {
  return provider === "dns" ? "primary" : provider === "unstoppable" ? "identity" : "decentralized-site";
}

export function NewProjectWizard({ onCancel, onDone }: Props) {
  const [step, setStep] = useState<Step>("intro");
  const [domain, setDomain] = useState("");
  const [workspacePath, setWorkspacePath] = useState("");
  const [provider, setProvider] = useState<DomainProvider>("dns");
  const [error, setError] = useState<string | null>(null);
  const [savedStatus, setSavedStatus] = useState("");
  const slug = useMemo(() => slugifyDomain(domain), [domain]);
  const role = defaultRole(provider);
  const isTyping = step === "domain" || step === "workspace";

  const save = async () => {
    setStep("saving");
    setError(null);
    try {
      const cdb = await import("../control-db.ts");
      const { checkManagedDomain } = await import("../domain-providers.ts");
      const project = cdb.dbGetProjects()[0];
      const id = cdb.dbUpsertManagedDomain({
        projectId: project?.id ?? "", name: domain, provider, role,
        config: { workspacePath },
        chain: provider === "unstoppable" ? "MATIC" : "",
      });
      const controller = cdb.dbGetManagedDomain(id);
      if (!controller) throw new Error("controller was saved but could not be read back");
      const health = await checkManagedDomain(controller);
      cdb.dbSetManagedDomainHealth(id, health.status, health.detail);
      setSavedStatus(`${health.status} — ${health.detail}`);
      setStep("success");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setStep("review");
    }
  };

  useInput((input, key) => {
    if (isTyping || step === "saving") return;
    if (input === "q" || key.escape) { onCancel(); return; }
    if (step === "intro" && key.return) { setStep("domain"); return; }
    if (step === "review") {
      if (key.leftArrow || key.rightArrow || input === "p") {
        const index = PROVIDERS.indexOf(provider);
        const delta = key.leftArrow ? -1 : 1;
        setProvider(PROVIDERS[(index + delta + PROVIDERS.length) % PROVIDERS.length]);
        return;
      }
      if (key.return) { void save(); return; }
    }
    if (step === "success" && key.return) onDone({ slug, path: workspacePath, domain });
  });

  return (
    <Box flexDirection="column" paddingX={3} paddingY={1} width={86}>
      <Box justifyContent="space-between" marginBottom={1}>
        <Box gap={1}><Text color="cyan">{TEARDROP}</Text><Text bold color="white">{TITLE}</Text></Box>
        <Text dimColor>domain controller onboarding</Text>
      </Box>
      <Divider />

      {step === "intro" && (
        <Box flexDirection="column" gap={1} marginY={1}>
          <Text color="yellow" bold>⊕ ADD A PROVIDER-AWARE DOMAIN CONTROLLER</Text>
          <Text dimColor>Each domain is managed independently and can later bind to one or more zones.</Text>
          <Text dimColor>Supported controllers: conventional DNS · Unstoppable/Polygon · ENS · generic Web3.</Text>
          <Text dimColor>This does not change DNS, proxy hosts, IPFS records, or blockchain state.</Text>
          <Box marginTop={1} gap={2}><Text color="cyan" bold>[↵] Add Domain</Text><Text dimColor>[q/esc] Cancel</Text></Box>
        </Box>
      )}

      {step === "domain" && (
        <Box flexDirection="column" gap={1} marginY={1}>
          <Text color="yellow" bold>STEP 1: DOMAIN NAME</Text>
          <Text dimColor>Enter a DNS or Web3 domain. The provider is inferred from its suffix.</Text>
          <TextInput active width={58} placeholder="example.com or identity.brave" onCancel={onCancel}
            onSubmit={(value) => {
              const normalized = normalizeDomainName(value);
              if (!isValidDomainName(normalized)) { setError("Enter a valid domain name."); return; }
              setDomain(normalized); setProvider(inferDomainProvider(normalized)); setError(null); setStep("workspace");
            }} />
          {error && <Text color="red">✗ {error}</Text>}
          <Text dimColor>[esc] Cancel</Text>
        </Box>
      )}

      {step === "workspace" && (
        <Box flexDirection="column" gap={1} marginY={1}>
          <Text color="yellow" bold>STEP 2: CONTROLLER WORKSPACE</Text>
          <Text dimColor>Enter any absolute path, including a different Windows drive.</Text>
          <TextInput active width={70} placeholder={`F:\\WEBSITES\\${slug}`} onCancel={() => setStep("domain")}
            onSubmit={(value) => {
              if (!value || !/^(?:[a-zA-Z]:\\|\/)/.test(value)) {
                setError("Enter an absolute workspace path, such as F:\\WEBSITES\\example."); return;
              }
              setWorkspacePath(value); setError(null); setStep("review");
            }} />
          {error && <Text color="red">✗ {error}</Text>}
          <Text dimColor>[esc] Back</Text>
        </Box>
      )}

      {(step === "review" || step === "saving") && (
        <Box flexDirection="column" gap={1} marginY={1}>
          <Text color="yellow" bold>STEP 3: REVIEW CONTROLLER</Text>
          <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={2}>
            <Text>Domain:    <Text color="cyan">{domain}</Text></Text>
            <Text>Provider:  <Text color="yellow">{provider}</Text></Text>
            <Text>Role:      <Text color="magenta">{role}</Text></Text>
            <Text>Workspace: <Text color="white">{workspacePath}</Text></Text>
          </Box>
          {step === "saving" ? <Box gap={1}><Spinner /><Text color="yellow">Saving controller and checking provider…</Text></Box> :
            <Box flexDirection="column"><Text dimColor>[←/→ or p] Change provider</Text><Text color="cyan" bold>[↵] Save Controller</Text></Box>}
          {error && <Text color="red">✗ {error}</Text>}
        </Box>
      )}

      {step === "success" && (
        <Box flexDirection="column" gap={1} marginY={1}>
          <Text color="green" bold>✓ DOMAIN CONTROLLER REGISTERED</Text>
          <Text>{domain} · {provider} · {role}</Text>
          <Text dimColor>{workspacePath}</Text>
          <Text color={savedStatus.startsWith("healthy") ? "green" : "yellow"}>{savedStatus}</Text>
          <Text dimColor>Use domain bind to attach this controller to a zone.</Text>
          <Text color="cyan" bold>[↵] Return to UNAXIS</Text>
        </Box>
      )}
    </Box>
  );
}
