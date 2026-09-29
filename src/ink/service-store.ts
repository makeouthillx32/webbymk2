// src/ink/service-store.ts
// ─────────────────────────────────────────────────────────────────────────────
// Platform services store — tracks background system, routing, media, and
// utility services supporting unenter.live (e.g. Poste Mail on L0V3, SRT Gateway
// on POWER, Nginx Proxy Manager, Agent).
// ─────────────────────────────────────────────────────────────────────────────

import {
  dbGetServices,
  dbGetAllServices,
  dbGetServiceByKey,
  dbUpsertService,
  dbDeleteService,
  type UnaxisService,
} from "./control-db.ts";
import type { UnaxisEnvironment } from "./environment-store.ts";
import { fetchContainers } from "./agent-client.ts";

let _cache: UnaxisService[] | null = null;
let _fetchedAt = 0;
const CACHE_TTL_MS = 5_000;

export async function loadServices(force = false): Promise<UnaxisService[]> {
  const now = Date.now();
  if (!force && _cache !== null && now - _fetchedAt < CACHE_TTL_MS) {
    return _cache;
  }
  try {
    const services = dbGetServices();
    _cache = services;
    _fetchedAt = Date.now();
    return services;
  } catch {
    return _cache ?? [];
  }
}

export function invalidateServicesCache(): void {
  _cache = null;
  _fetchedAt = 0;
}

export function saveService(service: Partial<UnaxisService> & { key: string; name: string }): void {
  dbUpsertService(service);
  invalidateServicesCache();
}

export function removeService(key: string): void {
  dbDeleteService(key);
  invalidateServicesCache();
}

export interface DiscoveredServiceCandidate {
  containerName:   string;
  image:           string;
  state:           string;
  status:          string;
  ports:           number[];
  environmentId:   string;
  environmentName: string;
}

/**
 * Scan an environment for running containers that are not yet registered
 * as a zone or a service, making onboarding seamless.
 */
export async function discoverEnvironmentCandidates(
  env: UnaxisEnvironment,
  existingZoneContainers: Set<string>,
): Promise<DiscoveredServiceCandidate[]> {
  if (!env.agentUrl || env.type === "local-docker") return [];

  const [containers, services] = await Promise.all([
    fetchContainers(env).catch(() => null),
    loadServices(),
  ]);

  if (!containers) return [];

  const registeredContainers = new Set<string>();
  for (const s of services) {
    if (s.container) {
      registeredContainers.add(s.container.replace(/^\//, ""));
    }
  }

  const EXCLUDED_INFRA_CONTAINERS = new Set([
    "unaxis_agent",
    "portainer_agent",
    "nginx-proxy-manager",
    "probe_kong",
  ]);

  const candidates: DiscoveredServiceCandidate[] = [];
  for (const c of containers) {
    const rawName = c.Names?.[0] ?? "";
    const cleanName = rawName.replace(/^\//, "");
    if (!cleanName) continue;

    // Skip known zones, already-registered services, and dedicated infra containers
    if (
      existingZoneContainers.has(cleanName) ||
      registeredContainers.has(cleanName) ||
      EXCLUDED_INFRA_CONTAINERS.has(cleanName)
    ) {
      continue;
    }

    const publicPorts: number[] = [];
    if (Array.isArray(c.Ports)) {
      for (const p of c.Ports) {
        if (p.PublicPort && !publicPorts.includes(p.PublicPort)) {
          publicPorts.push(p.PublicPort);
        }
      }
    }

    candidates.push({
      containerName:   cleanName,
      image:           c.Image ?? "",
      state:           c.State ?? "unknown",
      status:          c.Status ?? "",
      ports:           publicPorts,
      environmentId:   env.id,
      environmentName: env.name,
    });
  }

  return candidates;
}
