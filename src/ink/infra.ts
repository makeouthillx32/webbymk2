// tui/infra.ts
// ─────────────────────────────────────────────────────────────────────────────
// Static infrastructure map + live reachability checker.
//
// Routing chain (outermost → innermost):
//   GoDaddy DNS  →  ASUS DDNS  →  NPM (L0VE)  →  proxy (P0W3R)  →  zones
//
// DNS and DDNS are the two outermost links in the chain.  If either is down,
// every *.unenter.live address stops resolving and all applications become
// unreachable — regardless of whether the servers themselves are healthy.
// They are tracked here as first-class infrastructure resources.
//
// Machine groups:
//   INTERNET  —  GoDaddy DNS + ASUS DDNS  (public internet layer)
//   LOVE      —  NPM, Mail, AI  (192.168.50.75)
//   POWER     —  App stack, DB, services  (192.168.50.204)
//
// WINDMILL (192.168.50.178) was retired — that IP and project no longer exist.
//
// Sections exported:
//   INFRA_SERVICES  — checkable endpoints grouped by machine
//   DNS_RECORDS     — GoDaddy record reference for unenter.live
//   PORT_FORWARDS   — GT-BE98 Pro router port-forward rules
// ─────────────────────────────────────────────────────────────────────────────

import { DNS_PROVIDER, DDNS_PROVIDER } from "../config/stack.ts";

export interface InfraService {
  label:     string;   // short display name
  subdomain: string;   // public hostname / subdomain
  internal:  string;   // URL that gets checked (HTTP or DoH probe)
  machine:   string;   // machine key (INTERNET | LOVE | POWER)
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
  INTERNET: { label: "INTERNET", ip: "public",         role: "DNS · DDNS · Routing"   },
  LOVE:     { label: "L0VE",     ip: "192.168.50.75",  role: "NPM · Mail · AI"        },
  POWER:    { label: "P0W3R",    ip: "192.168.50.204", role: "App · DB · Services"    },
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

// ── Service list ──────────────────────────────────────────────────────────────

export const INFRA_SERVICES: InfraService[] = [
  // ── INTERNET — DNS + DDNS (outermost routing layer) ───────────────────────
  //
  // GoDaddy DNS: resolves npm.unenter.live via DoH — proves the wildcard
  // CNAME record is active.  If this fails, *.unenter.live is broken.
  //
  // ASUS DDNS: resolves unenter.asuscomm.com via DoH — proves the router's
  // DDNS service is updating the record.  If this fails, the CNAME target
  // returns NXDOMAIN and the entire domain chain collapses.
  doh("GoDaddy",   DNS_PROVIDER.domain,        "INTERNET", DNS_PROVIDER.checkDomain),
  doh("ASUS DDNS", DDNS_PROVIDER.hostname,     "INTERNET", DDNS_PROVIDER.hostname),

  // ── L0VE  192.168.50.75 ──────────────────────────────────────────────────
  s("NPM",       "npm.unenter.live",        "http://192.168.50.75:81",    "LOVE"),
  s("Supabase",  "supa.unenter.live",       "http://192.168.50.75:8000",  "LOVE"),
  s("AI",        "ai.unenter.live",         "http://192.168.50.75:3010",  "LOVE"),
  s("Mail",      "mail.unenter.live",       "http://192.168.50.75:8082",  "LOVE"),
  s("Cool",      "cool.unenter.live",       "http://192.168.50.75:9080",  "LOVE"),

  // ── P0W3R  192.168.50.204 ─────────────────────────────────────────────────
  s("App",       "unenter.live",            "http://192.168.50.204:3000", "POWER"),
  s("DB UI",     "db.unenter.live",         "http://192.168.50.204:8001", "POWER"),
  s("Portainer", "port.unenter.live",       "http://192.168.50.204:9000", "POWER"),
  s("n8n",       "n8n.unenter.live",        "http://192.168.50.204:5678", "POWER"),
  s("MC",        "mc.unenter.live",         "http://192.168.50.204:5012", "POWER"),
  s("Acct",      "accounting.unenter.live", "http://192.168.50.204:5007", "POWER"),
  s("Retro",     "retro.unenter.live",      "http://192.168.50.204:3050", "POWER"),
  s("Aud",       "aud.unenter.live",        "http://192.168.50.204:3000", "POWER"),
  s("LinuxHelp", "linuxhelp.unenter.live",  "http://192.168.50.204:18088","POWER"),
];

// ── DNS (GoDaddy) record reference ───────────────────────────────────────────

export const DNS_RECORDS: { type: string; name: string; value: string }[] = [
  { type: "A",     name: "@",                   value: "15.197.225.128  (Anycast)"              },
  { type: "A",     name: "@",                   value: "3.33.251.168    (Anycast)"              },
  { type: "A",     name: "*.cool",              value: "173.24.124.104"                         },
  { type: "CNAME", name: "*",                   value: `${DDNS_PROVIDER.hostname}.`             },
  { type: "CNAME", name: "www",                 value: `${DDNS_PROVIDER.hostname}.`             },
  { type: "CNAME", name: "npm / mail / love",   value: `${DDNS_PROVIDER.hostname}.`             },
  { type: "CNAME", name: "mc / power",          value: `${DDNS_PROVIDER.hostname}.`             },
  { type: "CNAME", name: "brevo1._domainkey",   value: "b1.unenter-live.dkim.brevo.com."        },
  { type: "CNAME", name: "brevo2._domainkey",   value: "b2.unenter-live.dkim.brevo.com."        },
  { type: "MX",    name: "@",                   value: "mail.unenter.live.  (pri 10)"           },
  { type: "TXT",   name: "@",                   value: "v=spf1 mx a include:asuscomm.com ~all"  },
  { type: "TXT",   name: "_dmarc",              value: "p=none  rua=admin@mail.unenter.live"    },
  { type: "TXT",   name: "@",                   value: "brevo-code:3fecd41fe10238d96..."        },
  { type: "NS",    name: "@",                   value: "ns53 / ns54.domaincontrol.com."         },
];

// ── Port Forwards (GT-BE98 Pro) ───────────────────────────────────────────────

export const PORT_FORWARDS: {
  label: string; ports: string; dest: string; proto: string;
}[] = [
  { label: "NPM HTTPS",       ports: "443",        dest: "192.168.50.75:443",   proto: "TCP"  },
  { label: "NPM HTTP",        ports: "80",         dest: "192.168.50.75:80",    proto: "TCP"  },
  { label: "unenter.live",    ports: "3000",       dest: "192.168.50.204:3000", proto: "TCP"  },
  { label: "n8n",             ports: "5678",       dest: "192.168.50.204:5678", proto: "BOTH" },
  { label: "Mission Control", ports: "5012",       dest: "192.168.50.204:5012", proto: "TCP"  },
  { label: "MC DB",           ports: "8000",       dest: "192.168.50.204:8000", proto: "TCP"  },
  { label: "DB Studio",       ports: "8081",       dest: "192.168.50.204:8081", proto: "BOTH" },
  { label: "Portainer",       ports: "9000,9100",  dest: "192.168.50.204",      proto: "TCP"  },
  { label: "Power SSH",       ports: "2222",       dest: "192.168.50.204:22",   proto: "TCP"  },
  { label: "Power RDP",       ports: "3390",       dest: "192.168.50.204:3389", proto: "TCP"  },
  { label: "Love SSH",        ports: "2223",       dest: "192.168.50.75:22",    proto: "TCP"  },
  { label: "Love RDP",        ports: "3391",       dest: "192.168.50.75:3389",  proto: "TCP"  },
  { label: "SMTP",            ports: "25 / 587",   dest: "192.168.50.75",       proto: "TCP"  },
  { label: "IMAPS / Sieve",   ports: "993 / 4190", dest: "192.168.50.75",       proto: "TCP"  },
  { label: "Cool",            ports: "8002",       dest: "192.168.50.75:8002",  proto: "BOTH" },
  { label: "FTP",             ports: "20 / 21",    dest: "192.168.50.204:21",   proto: "TCP"  },
  { label: "ssh-school",      ports: "18088",      dest: "192.168.50.48:8080",  proto: "TCP"  },
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
