// src/ink/panels/Services/index.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Services panel — displays platform and infrastructure services across
// distributed environments (e.g. Mail/Poste on L0V3, SRT Media Relay on POWER,
// Nginx Proxy Manager gateway, and UNAXIS Agent).
//
// Supports:
//   [1/2]      Switch between registered services and discovery candidates
//   [↑↓/jk]    Navigate services / candidates
//   [r]        Restart service container (remote via agent or local)
//   [R]        Refresh statuses
//   [o]        Onboard discovered candidate as a service
//   [x]        Remove service from registry
//   [q/←]      Go back
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Box, Text, useInput } from "../../runtimeInk.js";
import { KeyHints } from "../../components/KeyHint.tsx";
import {
  loadServices,
  saveService,
  removeService,
  discoverEnvironmentCandidates,
  type DiscoveredServiceCandidate,
} from "../../service-store.ts";
import type { UnaxisService } from "../../control-db.ts";
import { loadEnvironments, type UnaxisEnvironment } from "../../environment-store.ts";
import { loadZones } from "../../zone-store.ts";
import { containerAction, fetchContainers } from "../../agent-client.ts";
import { getStatus } from "../../docker.ts";
import { spawn } from "child_process";
import { DOCKER_ENV } from "../../utils/dockerEnv.ts";

interface ServicesPanelProps {
  onGoBack: () => void;
  activeEnv?: UnaxisEnvironment | null;
  addNotification?: (message: string, tone?: "success" | "error" | "info") => void;
}

const HINTS_SERVICES = [
  { k: "↑↓/jk", label: "navigate" },
  { k: "r",     label: "restart service" },
  { k: "R",     label: "refresh" },
  { k: "1/2",   label: "services/discovery" },
  { k: "x",     label: "remove" },
  { k: "q/←",   label: "back" },
];

const HINTS_DISCOVERY = [
  { k: "↑↓/jk", label: "navigate" },
  { k: "o",     label: "onboard service" },
  { k: "R",     label: "re-scan" },
  { k: "1/2",   label: "services/discovery" },
  { k: "q/←",   label: "back" },
];

export function ServicesPanel({ onGoBack, activeEnv, addNotification }: ServicesPanelProps) {
  const [subView, setSubView] = useState<"services" | "discovery">("services");
  const [services, setServices] = useState<UnaxisService[]>([]);
  const [envs, setEnvs] = useState<UnaxisEnvironment[]>([]);
  const [candidates, setCandidates] = useState<DiscoveredServiceCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [candidateIdx, setCandidateIdx] = useState(0);
  const [restartingKey, setRestartingKey] = useState<string | null>(null);

  const envMap = useMemo(() => {
    const map = new Map<string, UnaxisEnvironment>();
    for (const e of envs) map.set(e.id, e);
    return map;
  }, [envs]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      const [allServices, allEnvs, allZones] = await Promise.all([
        loadServices(true),
        loadEnvironments(),
        loadZones(),
      ]);
      setServices(allServices);
      setEnvs(allEnvs);

      // Collect candidate containers across environments
      const zoneContainers = new Set(allZones.map((z) => z.container));
      const discPromises = allEnvs
        .filter((e) => e.agentUrl && e.type !== "local-docker")
        .map((e) => discoverEnvironmentCandidates(e, zoneContainers));
      const discovered = (await Promise.all(discPromises)).flat();
      setCandidates(discovered);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Handle restarting a service
  const handleRestartService = useCallback(async (svc: UnaxisService) => {
    if (!svc.container) return;
    setRestartingKey(svc.key);
    addNotification?.(`Restarting service ${svc.name}…`, "info");

    try {
      const targetEnv = svc.environmentId ? envMap.get(svc.environmentId) : null;
      if (targetEnv && targetEnv.agentUrl && targetEnv.type !== "local-docker") {
        // Remote container restart via agent
        await containerAction(targetEnv, svc.container, "restart");
      } else {
        // Local Docker container restart
        await new Promise<void>((resolve, reject) => {
          const proc = spawn("docker", ["restart", svc.container], {
            env: DOCKER_ENV,
            stdio: ["ignore", "ignore", "ignore"],
          });
          proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`Exit ${code}`))));
          proc.on("error", reject);
        });
      }
      addNotification?.(`✓ Service ${svc.name} restarted`, "success");
    } catch (err: any) {
      addNotification?.(`✗ Failed to restart ${svc.name}: ${err.message}`, "error");
    } finally {
      setRestartingKey(null);
      refreshAll();
    }
  }, [envMap, addNotification, refreshAll]);

  // Handle onboarding a discovered container into Services
  const handleOnboardCandidate = useCallback(async (cand: DiscoveredServiceCandidate) => {
    const key = cand.containerName.toLowerCase().replace(/[^a-z0-9-_]/g, "-");
    const label = cand.containerName.replace(/^[-_]+/, "").replace(/[-_]/g, " ");
    const name = label.charAt(0).toUpperCase() + label.slice(1);
    const targetEnv = envMap.get(cand.environmentId);
    const host = targetEnv?.agentUrl ? new URL(targetEnv.agentUrl).hostname : "";

    saveService({
      key,
      name,
      container: cand.containerName,
      environmentId: cand.environmentId,
      host,
      port: cand.ports[0] ?? 0,
      adminPort: cand.ports[1] ?? cand.ports[0] ?? 0,
      serviceType: "custom",
      status: "running",
      description: `Discovered on ${cand.environmentName} (${cand.image})`,
    });

    addNotification?.(`✓ Onboarded ${name} as a platform service`, "success");
    setSubView("services");
    await refreshAll();
  }, [envMap, addNotification, refreshAll]);

  // Keyboard navigation
  useInput((input, key) => {
    if (key.escape || input === "q" || key.leftArrow) {
      onGoBack();
      return;
    }

    if (input === "1") {
      setSubView("services");
      return;
    }
    if (input === "2") {
      setSubView("discovery");
      return;
    }

    if (subView === "services") {
      if (key.upArrow || input === "k") {
        setSelectedIdx((prev) => (prev > 0 ? prev - 1 : services.length - 1));
        return;
      }
      if (key.downArrow || input === "j") {
        setSelectedIdx((prev) => (prev < services.length - 1 ? prev + 1 : 0));
        return;
      }
      if (input === "r" && services[selectedIdx]) {
        handleRestartService(services[selectedIdx]);
        return;
      }
      if (input === "R") {
        refreshAll();
        return;
      }
      if (input === "x" && services[selectedIdx]) {
        const toRemove = services[selectedIdx];
        removeService(toRemove.key);
        addNotification?.(`Removed service ${toRemove.name}`, "info");
        refreshAll();
        return;
      }
    } else {
      if (key.upArrow || input === "k") {
        setCandidateIdx((prev) => (prev > 0 ? prev - 1 : candidates.length - 1));
        return;
      }
      if (key.downArrow || input === "j") {
        setCandidateIdx((prev) => (prev < candidates.length - 1 ? prev + 1 : 0));
        return;
      }
      if (input === "o" && candidates[candidateIdx]) {
        handleOnboardCandidate(candidates[candidateIdx]);
        return;
      }
      if (input === "R") {
        refreshAll();
        return;
      }
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Subview Toggle */}
      <Box marginBottom={1} gap={2}>
        <Text
          bold={subView === "services"}
          color={subView === "services" ? "cyan" : undefined}
          dimColor={subView !== "services"}
        >
          [1] Registered Services ({services.length})
        </Text>
        <Text
          bold={subView === "discovery"}
          color={subView === "discovery" ? "cyan" : undefined}
          dimColor={subView !== "discovery"}
        >
          [2] Discovered Containers ({candidates.length})
        </Text>
      </Box>

      {subView === "services" ? (
        <Box flexDirection="column">
          {services.length === 0 ? (
            <Text dimColor>No platform services configured.</Text>
          ) : (
            services.map((svc, idx) => {
              const focused = idx === selectedIdx;
              const env = svc.environmentId ? envMap.get(svc.environmentId) : null;
              const envName = env?.name ?? "POWER";
              const isRemote = envName.toUpperCase() !== "POWER" && envName.toUpperCase() !== "LOCAL";
              const isRestarting = restartingKey === svc.key;

              return (
                <Box key={svc.key} flexDirection="column" marginBottom={focused ? 1 : 0}>
                  <Box gap={2}>
                    <Text color={focused ? "cyan" : undefined} bold={focused}>
                      {focused ? "▶" : " "}
                    </Text>
                    <Box width={22}>
                      <Text color={focused ? "cyan" : undefined} bold={focused}>
                        {svc.name}
                      </Text>
                    </Box>
                    <Box width={9}>
                      <Text color={isRemote ? "magenta" : "blue"} bold={isRemote}>
                        [{envName.toUpperCase()}]
                      </Text>
                    </Box>
                    <Box width={10}>
                      <Text color="yellow">[{svc.serviceType.toUpperCase()}]</Text>
                    </Box>
                    <Box width={20}>
                      <Text dimColor={!focused}>{svc.container || "—"}</Text>
                    </Box>
                    <Box width={22}>
                      <Text dimColor={!focused}>
                        {svc.host ? `${svc.host}:${svc.adminPort || svc.port}` : "—"}
                      </Text>
                    </Box>
                    <Text color={isRestarting ? "yellow" : "green"}>
                      {isRestarting ? "⟳ restarting…" : "● running"}
                    </Text>
                  </Box>
                  {focused && svc.description && (
                    <Box marginLeft={4} marginTop={0}>
                      <Text dimColor>↳ {svc.description}</Text>
                      {svc.adminUrl ? <Text dimColor> · UI: {svc.adminUrl}</Text> : null}
                    </Box>
                  )}
                </Box>
              );
            })
          )}
          <Box marginTop={1}>
            <KeyHints hints={HINTS_SERVICES} />
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text dimColor>
              Containers detected on environments that can be onboarded into Platform Services:
            </Text>
          </Box>
          {candidates.length === 0 ? (
            <Text dimColor>No unmanaged containers detected across connected environments.</Text>
          ) : (
            candidates.map((cand, idx) => {
              const focused = idx === candidateIdx;
              return (
                <Box key={`${cand.environmentId}-${cand.containerName}`} gap={2}>
                  <Text color={focused ? "cyan" : undefined} bold={focused}>
                    {focused ? "▶" : " "}
                  </Text>
                  <Box width={22}>
                    <Text color={focused ? "cyan" : undefined} bold={focused}>
                      {cand.containerName}
                    </Text>
                  </Box>
                  <Box width={9}>
                    <Text color="magenta">[{cand.environmentName.toUpperCase()}]</Text>
                  </Box>
                  <Box width={18}>
                    <Text dimColor>
                      {cand.ports.length > 0 ? `ports: ${cand.ports.join(", ")}` : "no ports"}
                    </Text>
                  </Box>
                  <Box width={28}>
                    <Text dimColor>{cand.status || cand.state}</Text>
                  </Box>
                </Box>
              );
            })
          )}
          <Box marginTop={1}>
            <KeyHints hints={HINTS_DISCOVERY} />
          </Box>
        </Box>
      )}
    </Box>
  );
}
