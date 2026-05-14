// src/ink/zone/compose-utils.ts
// ─────────────────────────────────────────────────────────────────────────────
// Safe YAML utilities for Docker Compose file manipulation.
//
// Uses the `yaml` package (eemeli/yaml) — documents round-trip cleanly,
// comments are preserved, and there is no regex.
//
// Public API:
//   readCompose(path)                           → Document
//   writeCompose(path, doc)                     → Promise<void>  (atomic)
//   removeService(doc, serviceName)             → boolean
//   ensureNetwork(doc, networkName, opts)       → void
//   ensureService(doc, serviceName, config)     → void
//   ensureLabels(doc, serviceName, labels)      → void
//   getServiceNames(doc)                        → string[]
//   serviceExists(doc, serviceName)             → boolean
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync, readFileSync } from "fs";
import { parseDocument, Document, YAMLMap } from "yaml";
import { writeFileAtomic } from "../../utils/zoneScaffolding.js";

// ── Read ──────────────────────────────────────────────────────────────────────

/**
 * Parse a docker-compose.yml into a yaml Document.
 * If the file does not exist, returns an empty document with a services stub
 * so callers can always safely call ensureService/ensureNetwork on the result.
 */
export function readCompose(path: string): Document {
  if (!existsSync(path)) {
    return parseDocument("services:\n\nnetworks:\n");
  }
  return parseDocument(readFileSync(path, "utf-8"));
}

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Serialise a Document back to YAML and write it atomically.
 * Uses the same PID-temp-rename pattern as writeFileAtomic so a crash
 * mid-write never leaves a corrupt compose file.
 */
export async function writeCompose(path: string, doc: Document): Promise<void> {
  await writeFileAtomic(path, doc.toString());
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function getServicesMap(doc: Document): YAMLMap | null {
  const s = doc.get("services");
  if (!s || !(s instanceof YAMLMap)) return null;
  return s;
}

function getOrCreateServicesMap(doc: Document): YAMLMap {
  let s = doc.get("services");
  if (!s || !(s instanceof YAMLMap)) {
    const map = new YAMLMap();
    doc.set("services", map);
    s = map;
  }
  return s as YAMLMap;
}

// ── Service operations ────────────────────────────────────────────────────────

/**
 * Remove a service from the compose document.
 * Returns true if found and removed, false if the service didn't exist.
 *
 * Replaces the fragile regex in the legacy docker-compose.ts patcher.
 */
export function removeService(doc: Document, serviceName: string): boolean {
  const services = getServicesMap(doc);
  if (!services) return false;
  if (!services.has(serviceName)) return false;
  services.delete(serviceName);
  return true;
}

/**
 * Returns true if a service with the given name exists in the document.
 */
export function serviceExists(doc: Document, serviceName: string): boolean {
  const services = getServicesMap(doc);
  return services?.has(serviceName) ?? false;
}

/**
 * Return all service names defined in the document.
 */
export function getServiceNames(doc: Document): string[] {
  const services = getServicesMap(doc);
  if (!services) return [];
  return services.items
    .map((pair) => {
      const key = (pair as { key: unknown }).key;
      return typeof key === "string" ? key :
             (key instanceof Object && "value" in key) ? String((key as { value: unknown }).value) : null;
    })
    .filter((k): k is string => k !== null);
}

/**
 * Add a service using the given config object if it does not already exist.
 * Existing services are never overwritten — use ensureLabels() for targeted
 * updates to an existing service.
 */
export function ensureService(
  doc:         Document,
  serviceName: string,
  config:      Record<string, unknown>,
): void {
  const services = getOrCreateServicesMap(doc);
  if (!services.has(serviceName)) {
    services.set(serviceName, doc.createNode(config));
  }
}

// ── Label operations ──────────────────────────────────────────────────────────

/**
 * Merge labels into an existing service's labels block.
 * Creates the `labels:` map if it doesn't exist yet.
 * Existing labels not in the provided map are left untouched.
 *
 * Usage:
 *   ensureLabels(doc, "rappers", {
 *     "unenter.zone.key":    "rappers",
 *     "unenter.proxy.enabled": "true",
 *   })
 */
export function ensureLabels(
  doc:         Document,
  serviceName: string,
  labels:      Record<string, string>,
): void {
  const services = getServicesMap(doc);
  if (!services) return;

  const service = services.get(serviceName);
  if (!service || !(service instanceof YAMLMap)) return;

  let labelMap = service.get("labels");
  if (!labelMap) {
    const newMap = new YAMLMap();
    service.set("labels", newMap);
    labelMap = newMap;
  }
  if (!(labelMap instanceof YAMLMap)) return;

  for (const [k, v] of Object.entries(labels)) {
    labelMap.set(k, v);
  }
}

// ── Network operations ────────────────────────────────────────────────────────

/**
 * Ensure a network entry exists in the top-level networks block.
 *
 * @param opts.external  If true, adds `external: true` to the network block.
 *                       Skipped if the network entry already exists.
 */
export function ensureNetwork(
  doc:         Document,
  networkName: string,
  opts:        { external?: boolean } = {},
): void {
  let networks = doc.get("networks");
  if (!networks) {
    const map = new YAMLMap();
    doc.set("networks", map);
    networks = map;
  }
  if (!(networks instanceof YAMLMap)) return;
  if (networks.has(networkName)) return;

  if (opts.external) {
    const netDef = new YAMLMap();
    netDef.set("external", true);
    networks.set(networkName, netDef);
  } else {
    networks.set(networkName, null);
  }
}
