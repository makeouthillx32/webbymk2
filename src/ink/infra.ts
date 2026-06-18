// tui/infra.ts
// ─────────────────────────────────────────────────────────────────────────────
// Static infrastructure map + live reachability checker.
//
// Routing chain (outermost → innermost):
//   GoDaddy DNS  →  ASUS DDNS  →  NPM (EDGE)  →  proxy (CORE)  →  zones
//
// DNS and DDNS are the two outermost links in the chain.  If either is down,
// every *.unenter.live address stops resolving and all applications become
// unreachable — regardless of whether the servers themselves are healthy.
// They are tracked here as first-class infrastructure resources.
//
// Machine groups (generic role-based keys — no env nicknames in source,
// since this repo is public; cosmetic display labels still show the
// nicknames in the TUI via Machine.label):
//   INTERNET  —  GoDaddy DNS + ASUS DDNS  (public internet layer)
//   EDGE      —  NPM, Mail, AI  (IP read from config.json / Supabase env record)
//   CORE      —  App stack, DB, services  (IP read from config.json / Supabase env record)
//
// Sections exported:
//   INFRA_SERVICES  — checkable endpoints grouped by machine
//   DNS_RECORDS     — GoDaddy record reference for unenter.live
//   PORT_FORWARDS   — GT-BE98 Pro router port-forward rules
// ─────────────────────────────────────────────────────────────────────────────

import { DNS_PROVIDER, DDNS_PROVIDER, NPM_IP_SAFE, STACK_IP_SAFE } from "../config/stack.ts";
import type { UnaxisEnvironment }      from "./environment-store.ts";

export interface InfraService {
  label:     string;   // short display name
  subdomain: string;   // public hostname / subdomain
  internal:  string;   // URL that gets checked (HTTP or DoH probe)
  machine:   string;   // machine key (INTERNET | EDGE | CORE)
  port:      string;   // :NNN extracted from internal, or "" for standard ports
  checkType: "http" | "doh";  // how to probe this service
  /** For DoH checks: the hostname whose A/CNAME record we resolve */
  dohName?:  string;
}

export interface ServiceResult {
  status: "up" | "down" | "checking" | "unknown";
  ms:     number | null;
  code:   number | null;
}

export interface Machine {
  label: string;
  ip:    string;
  role:  string;
}

export const MACHINES: Record<string, Machine> = {
  INTERNET: { label: "INTERNET", ip: "public",       role: "DNS · DDNS · Routing" },
  EDGE:     { label: "L0VE",     ip: NPM_IP_SAFE,    role: "NPM · Mail · AI"      },
  CORE:     { label: "P0W3R",    ip: STACK_IP_SAFE,  role: "App · DB · Services"  },
};

// ── Service builder helpers ───────────────────────────────────────────────────

/** HTTP service — HEAD request to an internal URL */
function s(
  label:     string,
  subdomain: string,
  internal:  string,
  machine:   string
): InfraService {
  const m = internal.match(/:(\d+)$/);
  return { label, subdomain, internal, machine, port: m ? `:${m[1]}` : "", checkType: "http" };
}

/**
 * DNS-over-HTTPS service — resolves `dohName` via Google DoH.
 * "Up" means the hostname has at least one A or CNAME record.
 * This checks the actual DNS record without relying on local resolver
 * cache, so it reflects the real state of GoDaddy / ASUS DDNS.
 */
function doh(
  label:     string,
  subdomain: string,
  machine:   string,
  dohName:   string
): InfraService {
  return {
    label, subdomain, machine,
    internal:  `${DNS_PROVIDER.dohUrl}?name=${encodeURIComponent(dohName)}&type=A`,
    port:      "",
    checkType: "doh",
    dohName,
  };
}

// ── Service list builder ──────────────────────────────────────────────────────
//
// buildInfraServices() derives the checkable endpoints from an active
// UnaxisEnvironment record.  This makes the infra panel automatically
// retarget whenever the user switches environments via `unaxis env use`.
//
// The INTERNET tier (GoDaddy + DDNS) is always built from the environment's
// domain and ddnsHostname fields.
//
// The EDGE tier (NPM host) and CORE tier (proxy/app host) are built from
// the environment's npmHost and proxyHost fields respectively.
//
// Fixed well-known ports (Supabase :8000, DB UI :8001, etc.) are kept as
// constants since they are architectural constants of the stack, not
// per-environment variables.  If you need to vary them per-env, add
// additional columns to the environments table and extend this builder.

export function buildInfraServices(env: UnaxisEnvironment): InfraService[] {
  const domain   = env.domain       || DNS_PROVIDER.domain;
  const ddnsHost = env.ddnsHostname || DDNS_PROVIDER.hostname;
  const npmIp    = env.npmHost      || NPM_IP_SAFE;
  const npmPort  = env.npmPort      || 81;
  const proxyIp  = env.proxyHost    || STACK_IP_SAFE;

  return [
    // ── INTERNET — DNS + DDNS (outermost routing layer) ─────────────────────
    doh("GoDaddy",   domain,   "INTERNET", domain),
    doh("ASUS DDNS", ddnsHost, "INTERNET", ddnsHost),

    // ── NPM host (EDGE tier by default, configurable per env) ───────────────
    s("NPM",       `npm.${domain}`,        `http://${npmIp}:${npmPort}`,  "EDGE"),
    s("Supabase",  `supa.${domain}`,       `http://${npmIp}:8000`,        "EDGE"),
    s("AI",        `ai.${domain}`,         `http://${npmIp}:3010`,        "EDGE"),
    s("Mail",      `mail.${domain}`,       `http://${npmIp}:8082`,        "EDGE"),
    s("Cool",      `cool.${domain}`,       `http://${npmIp}:9080`,        "EDGE"),

    // ── Proxy/app host (CORE tier by default, configurable per env) ─────────
    s("App",       `www.${domain}`,         `http://${proxyIp}:3000`,  "CORE"),
    s("DB UI",     `db.${domain}`,          `http://${proxyIp}:8001`,  "CORE"),
    s("Portainer", `port.${domain}`,        `http://${proxyIp}:9000`,  "CORE"),
    s("n8n",       `n8n.${domain}`,         `http://${proxyIp}:5678`,  "CORE"),
    s("MC",        `mc.${domain}`,          `http://${proxyIp}:5012`,  "CORE"),
    s("Acct",      `accounting.${domain}`,  `http://${proxyIp}:5007`,  "CORE"),
    s("Retro",     `retro.${domain}`,       `http://${proxyIp}:3050`,  "CORE"),
    s("Aud",       `aud.${domain}`,         `http://${proxyIp}:3000`,  "CORE"),
    s("LinuxHelp", `linuxhelp.${domain}`,   `http://${proxyIp}:18088`, "CORE"),
  ];
}

/**
 * Static fallback used when no active environment is loaded from Supabase.
 * Derives all coordinates from config.json via NPM_IP_SAFE / STACK_IP_SAFE /
 * DNS_PROVIDER — no private IPs are hardcoded here.
 * Prefer buildInfraServices(activeEnv) for environment-aware code.
 */
export const INFRA_SERVICES: InfraService[] = [
  doh("GoDaddy",   DNS_PROVIDER.domain,    "INTERNET", DNS_PROVIDER.checkDomain),
  doh("ASUS DDNS", DDNS_PROVIDER.hostname, "INTERNET", DDNS_PROVIDER.hostname),
  s("NPM",       `npm.${DNS_PROVIDER.domain}`,        `http://${NPM_IP_SAFE}:81`,    "EDGE"),
  s("Supabase",  `supa.${DNS_PROVIDER.domain}`,       `http://${NPM_IP_SAFE}:8000`,  "EDGE"),
  s("AI",        `ai.${DNS_PROVIDER.domain}`,         `http://${NPM_IP_SAFE}:3010`,  "EDGE"),
  s("Mail",      `mail.${DNS_PROVIDER.domain}`,       `http://${NPM_IP_SAFE}:8082`,  "EDGE"),
  s("Cool",      `cool.${DNS_PROVIDER.domain}`,       `http://${NPM_IP_SAFE}:9080`,  "EDGE"),
  s("App",       `www.${DNS_PROVIDER.domain}`,        `http://${STACK_IP_SAFE}:3000`, "CORE"),
  s("DB UI",     `db.${DNS_PROVIDER.domain}`,         `http://${STACK_IP_SAFE}:8001`, "CORE"),
  s("Portainer", `port.${DNS_PROVIDER.domain}`,       `http://${STACK_IP_SAFE}:9000`, "CORE"),
  s("n8n",       `n8n.${DNS_PROVIDER.domain}`,        `http://${STACK_IP_SAFE}:5678`, "CORE"),
  s("MC",        `mc.${DNS_PROVIDER.domain}`,         `http://${STACK_IP_SAFE}:5012`, "CORE"),
  s("Acct",      `accounting.${DNS_PROVIDER.domain}`, `http://${STACK_IP_SAFE}:5007`, "CORE"),
  s("Retro",     `retro.${DNS_PROVIDER.domain}`,      `http://${STACK_IP_SAFE}:3050`, "CORE"),
  s("Aud",       `aud.${DNS_PROVIDER.domain}`,        `http://${STACK_IP_SAFE}:3000`, "CORE"),
  s("LinuxHelp", `linuxhelp.${DNS_PROVIDER.domain}`,  `http://${STACK_IP_SAFE}:18088`, "CORE"),
];

// ── DNS (GoDaddy) record reference ───────────────────────────────────────────
//
// NOTE: actual addresses, verification codes, and DKIM targets are NOT
// hardcoded here — this repo is public on GitHub, and pinning live DNS
// values (anycast IPs, home public IP, Brevo verification tokens, etc.)
// in source is exactly the kind of infra fingerprinting we want to avoid.
// This table documents record *shape* (type/name → provider/purpose) for
// reference; check `dig <domain>` or the GoDaddy dashboard for live values.

export const DNS_RECORDS: { type: string; name: string; value: string }[] = [
  { type: "A",     name: "@",                   value: "<GoDaddy domain-forward anycast — see dig/dashboard>"   },
  { type: "A",     name: "@",                   value: "<GoDaddy domain-forward anycast — see dig/dashboard>"   },
  { type: "A",     name: "*.cool",              value: "<home public IP — tracks DDNS, see dig/dashboard>"      },
  { type: "CNAME", name: "*",                   value: `${DDNS_PROVIDER.hostname}.`             },
  { type: "CNAME", name: "www",                 value: `${DDNS_PROVIDER.hostname}.`             },
  { type: "CNAME", name: "npm / mail / ai",     value: `${DDNS_PROVIDER.hostname}.`             },
  { type: "CNAME", name: "mc / db",             value: `${DDNS_PROVIDER.hostname}.`             },
  { type: "CNAME", name: "brevo1._domainkey",   value: "<Brevo DKIM target — see dashboard>"     },
  { type: "CNAME", name: "brevo2._domainkey",   value: "<Brevo DKIM target — see dashboard>"     },
  { type: "MX",    name: "@",                   value: "mail.unenter.live.  (pri 10)"           },
  { type: "TXT",   name: "@",                   value: "v=spf1 mx a include:<ddns-provider-domain> ~all" },
  { type: "TXT",   name: "_dmarc",              value: "p=none  rua=admin@mail.unenter.live"    },
  { type: "TXT",   name: "@",                   value: "<Brevo domain-verification code — see dashboard>" },
  { type: "NS",    name: "@",                   value: "ns53 / ns54.domaincontrol.com."         },
];

// ── Port Forwards (GT-BE98 Pro) ───────────────────────────────────────────────

// PORT_FORWARDS: reference table for the GT-BE98 Pro router rules.
// Destinations use NPM_IP_SAFE / STACK_IP_SAFE so no private IPs are
// hardcoded in the repo.  The school SSH rule's target is a separate
// device — configure its IP in config.json or leave the placeholder.
const _L = NPM_IP_SAFE   || "<NPM_HOST_IP>";
const _P = STACK_IP_SAFE || "<PROXY_HOST_IP>";

export const PORT_FORWARDS: {
  label: string; ports: string; dest: string; proto: string;
}[] = [
  { label: "NPM HTTPS",       ports: "443",        dest: `${_L}:443`,    proto: "TCP"  },
  { label: "NPM HTTP",        ports: "80",         dest: `${_L}:80`,     proto: "TCP"  },
  { label: `${DNS_PROVIDER.domain}`, ports: "3000", dest: `${_P}:3000`,  proto: "TCP"  },
  { label: "n8n",             ports: "5678",       dest: `${_P}:5678`,   proto: "BOTH" },
  { label: "Mission Control", ports: "5012",       dest: `${_P}:5012`,   proto: "TCP"  },
  { label: "MC DB",           ports: "8000",       dest: `${_P}:8000`,   proto: "TCP"  },
  { label: "DB Studio",       ports: "8081",       dest: `${_P}:8081`,   proto: "BOTH" },
  { label: "Portainer",       ports: "9000,9100",  dest: _P,             proto: "TCP"  },
  { label: "Power SSH",       ports: "2222",       dest: `${_P}:22`,     proto: "TCP"  },
  { label: "Power RDP",       ports: "3390",       dest: `${_P}:3389`,   proto: "TCP"  },
  { label: "Love SSH",        ports: "2223",       dest: `${_L}:22`,     proto: "TCP"  },
  { label: "Love RDP",        ports: "3391",       dest: `${_L}:3389`,   proto: "TCP"  },
  { label: "SMTP",            ports: "25 / 587",   dest: _L,             proto: "TCP"  },
  { label: "IMAPS / Sieve",   ports: "993 / 4190", dest: _L,             proto: "TCP"  },
  { label: "Cool",            ports: "8002",       dest: `${_L}:8002`,   proto: "BOTH" },
  { label: "FTP",             ports: "20 / 21",    dest: `${_P}:21`,     proto: "TCP"  },
  { label: "ssh-school",      ports: "18088",      dest: "<SSH_SCHOOL_IP>:8080", proto: "TCP" },
];

// ── Live reachability checks ──────────────────────────────────────────────────

/**
 * HTTP check — HEAD request to svc.internal.
 * Any non-5xx response is considered "up" (many services return 301/401).
 */
async function checkHttp(svc: InfraService): Promise<ServiceResult> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4_000);
    const res = await fetch(svc.internal, {
      method:   "HEAD",
      signal:   controller.signal,
      redirect: "manual" as RequestRedirect,
    });
    clearTimeout(timer);
    return {
      status: res.status < 500 ? "up" : "down",
      ms:     Date.now() - start,
      code:   res.status,
    };
  } catch {
    return { status: "down", ms: null, code: null };
  }
}

/**
 * DNS-over-HTTPS check — asks Google's resolver whether svc.dohName has
 * an A record.  "Up" = at least one answer with status 0 (NOERROR).
 *
 * Using Google DoH avoids local DNS cache and gives a ground-truth view
 * of whether GoDaddy / ASUS DDNS have published the record.
 */
async function checkDoh(svc: InfraService): Promise<ServiceResult> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    const res = await fetch(svc.internal, {
      headers: { Accept: "application/dns-json" },
      signal:  controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { status: "down", ms: null, code: res.status };
    const data = await res.json() as { Status: number; Answer?: unknown[] };
    const ms = Date.now() - start;
    // Status 0 = NOERROR, Answer array non-empty = record exists
    const up = data.Status === 0 && Array.isArray(data.Answer) && data.Answer.length > 0;
    return { status: up ? "up" : "down", ms, code: data.Status };
  } catch {
    return { status: "down", ms: null, code: null };
  }
}

/** Dispatch to the correct check strategy based on svc.checkType. */
export async function checkService(svc: InfraService): Promise<ServiceResult> {
  return svc.checkType === "doh" ? checkDoh(svc) : checkHttp(svc);
}
