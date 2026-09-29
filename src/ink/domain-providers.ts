import { resolve4, resolve6, resolveCname, resolveNs } from "node:dns/promises";
import type { DomainProvider, ManagedDomain } from "./control-db.ts";
import { getCredential } from "../utils/secureStorage/index.js";
import { getUdCliStatus } from "./ud-cli-provider.ts";

export interface DomainHealthResult {
  ok: boolean;
  status: "healthy" | "degraded" | "unconfigured" | "unsupported" | "error";
  detail: string;
  records?: Record<string, unknown>;
}

export interface DomainProviderCapabilities {
  provider: DomainProvider;
  inspect: boolean;
  mutate: boolean;
  publishIpfs: boolean;
  walletSigning: boolean;
  detail: string;
}

const WEB3_SUFFIXES = new Set([
  "brave", "crypto", "x", "polygon", "nft", "blockchain", "bitcoin",
  "dao", "888", "wallet", "zil", "unstoppable", "web3",
]);

export function normalizeDomainName(input: string): string {
  return input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function isValidDomainName(input: string): boolean {
  const name = normalizeDomainName(input);
  if (name.length < 3 || name.length > 253 || name.includes("..")) return false;
  return name.split(".").every((label) =>
    label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
  );
}

export function inferDomainProvider(input: string): DomainProvider {
  const suffix = normalizeDomainName(input).split(".").pop() ?? "";
  if (suffix === "eth") return "ens";
  if (WEB3_SUFFIXES.has(suffix)) return "unstoppable";
  return "dns";
}

export async function getDomainProviderCapabilities(provider: DomainProvider): Promise<DomainProviderCapabilities> {
  if (provider === "dns") {
    return { provider, inspect: true, mutate: false, publishIpfs: false, walletSigning: false,
      detail: "public DNS inspection is active; provider-specific DNS writes are not configured" };
  }
  if (provider === "unstoppable") {
    const hasKey = Boolean(process.env["UNSTOPPABLE_API_KEY"]?.trim() || await getCredential("unstoppable_api_key"));
    const official = getUdCliStatus();
    const inspect = hasKey || official.authenticated;
    return { provider, inspect, mutate: false, publishIpfs: false, walletSigning: false,
      detail: official.authenticated
        ? `official Unstoppable CLI v${official.version} is authenticated; account operations are available, wallet-signed onchain writes remain gated`
        : hasKey
          ? `Resolution API inspection is active; official CLI v${official.version || "not installed"} is not authenticated`
          : official.detail };
  }
  if (provider === "ens") {
    return { provider, inspect: false, mutate: false, publishIpfs: false, walletSigning: false,
      detail: "ENS adapter is registered but no RPC resolver or signer is configured" };
  }
  return { provider, inspect: false, mutate: false, publishIpfs: false, walletSigning: false,
    detail: "generic Web3 domains require a concrete provider adapter" };
}

async function settled<T>(promise: Promise<T>): Promise<T | null> {
  try { return await promise; } catch { return null; }
}

async function checkDns(domain: ManagedDomain): Promise<DomainHealthResult> {
  const [a, aaaa, cname, ns] = await Promise.all([
    settled(resolve4(domain.name)),
    settled(resolve6(domain.name)),
    settled(resolveCname(domain.name)),
    settled(resolveNs(domain.name)),
  ]);
  const records = { A: a ?? [], AAAA: aaaa ?? [], CNAME: cname ?? [], NS: ns ?? [] };
  const addressCount = (a?.length ?? 0) + (aaaa?.length ?? 0) + (cname?.length ?? 0);
  if (addressCount > 0) {
    return { ok: true, status: "healthy", detail: `${addressCount} address record(s); ${ns?.length ?? 0} nameserver(s)`, records };
  }
  if ((ns?.length ?? 0) > 0) {
    return { ok: false, status: "unconfigured", detail: `nameservers resolve, but no A/AAAA/CNAME record is published`, records };
  }
  return { ok: false, status: "unconfigured", detail: `domain does not currently resolve in public DNS`, records };
}

async function checkUnstoppable(domain: ManagedDomain): Promise<DomainHealthResult> {
  const apiKey = process.env["UNSTOPPABLE_API_KEY"]?.trim()
    || await getCredential("unstoppable_api_key")
    || undefined;
  if (!apiKey) {
    const owner = domain.ownerAddress ? `; owner ${domain.ownerAddress}` : "";
    return {
      ok: false,
      status: "degraded",
      detail: `registered as an Unstoppable/Web3 controller${owner}; store unstoppable_api_key for live record resolution`,
    };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const response = await fetch(
      `https://api.unstoppabledomains.com/resolve/domains/${encodeURIComponent(domain.name)}`,
      { headers: { Authorization: `Bearer ${apiKey}` }, signal: controller.signal },
    ).finally(() => clearTimeout(timer));
    if (response.status === 404) {
      return { ok: false, status: "unconfigured", detail: `domain was not found by the Unstoppable Resolution Service` };
    }
    if (!response.ok) {
      return { ok: false, status: "error", detail: `Unstoppable Resolution Service returned HTTP ${response.status}` };
    }
    const payload = await response.json() as any;
    const records = payload?.records ?? {};
    const redirect = records["browser.redirect_url"] ?? records["ipfs.redirect_domain.value"];
    const ipfs = records["dweb.ipfs.hash"] ?? records["ipfs.html.value"];
    const recordCount = Object.keys(records).length;
    const target = redirect ? `redirect ${redirect}` : ipfs ? `IPFS ${ipfs}` : `${recordCount} record(s)`;
    const chain = payload?.meta?.blockchain ?? domain.chain ?? "Web3";
    return { ok: true, status: "healthy", detail: `resolved on ${chain || "Web3"}; ${target}`, records };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, status: "error", detail: `Unstoppable resolution failed: ${detail}` };
  }
}

export async function checkManagedDomain(domain: ManagedDomain): Promise<DomainHealthResult> {
  if (domain.provider === "dns") return checkDns(domain);
  if (domain.provider === "unstoppable") return checkUnstoppable(domain);
  if (domain.provider === "ens") {
    return { ok: false, status: "unsupported", detail: `ENS controller is registered; live resolver support is not installed yet` };
  }
  return { ok: false, status: "unsupported", detail: `generic Web3 controller requires a provider adapter` };
}
