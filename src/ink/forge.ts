// src/ink/forge.ts
// ─────────────────────────────────────────────────────────────────────────────
// The self-hosted git forge (Forgejo) as a UNAXIS role. The forge is the
// source of truth for code: workspaces push to it, it push-mirrors public repos
// to GitHub, and builds come from its commits. Like the media roles it is
// placed on a host (`forge@<env>`), never assumed to live on one machine, so
// moving it is dump → restore on another host.
//
// Pure logic only; side effects live in forge-store.ts.
// ─────────────────────────────────────────────────────────────────────────────

import type { HostFacts } from "./media-topology.ts";

export const FORGE_DEFAULTS = {
  image: "codeberg.org/forgejo/forgejo:15.0.9",   // v15 = LTS line
  container: "unt_forgejo",
  volume: "unaxis_forgejo_data",
  /** Volume that receives copies on `env:<NAME>` backup targets. */
  sinkVolume: "unaxis_forge_backups",
  sinkImage: "alpine:3.20",
  httpPort: 3300,
  sshPort: 2222,
  appName: "unenter forge",
  /** Dumps kept inside the forge's own volume (copy #1). */
  keepInVolume: 7,
  /** Dumps kept in each extra backup target. */
  keepPerDir: 14,
} as const;

export type ForgeConfig = {
  image: string;
  container: string;
  volume: string;
  httpPort: number;
  sshPort: number;
  appName: string;
  keepInVolume: number;
  keepPerDir: number;
  /** Overrides the derived URL, e.g. once git.unenter.live exists. */
  rootUrl?: string;
  /**
   * Where copies of each dump go besides the forge's own volume. Either a
   * directory on the control-plane host, or `env:<NAME>` for a Docker volume
   * on another UNAXIS host (written through that host's agent).
   */
  backupTargets: string[];
};

export function forgeConfig(raw: Record<string, any> = {}): ForgeConfig {
  const num = (v: unknown, d: number) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : d);
  return {
    image: String(raw.image || FORGE_DEFAULTS.image),
    container: String(raw.container || FORGE_DEFAULTS.container),
    volume: String(raw.volume || FORGE_DEFAULTS.volume),
    httpPort: num(raw.httpPort, FORGE_DEFAULTS.httpPort),
    sshPort: num(raw.sshPort, FORGE_DEFAULTS.sshPort),
    appName: String(raw.appName || FORGE_DEFAULTS.appName),
    keepInVolume: num(raw.keepInVolume, FORGE_DEFAULTS.keepInVolume),
    keepPerDir: num(raw.keepPerDir, FORGE_DEFAULTS.keepPerDir),
    rootUrl: raw.rootUrl ? String(raw.rootUrl) : undefined,
    backupTargets: Array.isArray(raw.backupTargets) ? raw.backupTargets.map(String) : [],
  };
}

/**
 * The address people and agents use. Not public at first: the tailnet address
 * works from every host and from outside the house; the LAN address is the
 * fallback for hosts that aren't on the tailnet.
 */
export function forgeHost(facts: HostFacts, agentUrl: string): string | null {
  if (facts.tailnetIp) return facts.tailnetIp;
  if (facts.lanIp) return facts.lanIp;
  try {
    const h = new URL(agentUrl).hostname;
    return h === "127.0.0.1" || h === "localhost" ? null : h;
  } catch {
    return null;
  }
}

export function forgeRootUrl(c: ForgeConfig, host: string): string {
  if (c.rootUrl) return c.rootUrl.endsWith("/") ? c.rootUrl : `${c.rootUrl}/`;
  return `http://${host}:${c.httpPort}/`;
}

/**
 * Forgejo settings as FORGEJO__section__KEY variables (dots in section names
 * are written _0x2E_). Private by default: no self-registration, sign-in to
 * view anything, new repos private, no calls out to update checkers or
 * avatar services.
 */
export function renderForgeEnv(c: ForgeConfig, host: string): string[] {
  const root = forgeRootUrl(c, host);
  const domain = new URL(root).hostname;
  const s: Record<string, string> = {
    "DEFAULT__APP_NAME": c.appName,
    "database__DB_TYPE": "sqlite3",
    "server__ROOT_URL": root,
    "server__DOMAIN": domain,
    "server__SSH_DOMAIN": domain,
    "server__SSH_PORT": String(c.sshPort),
    "server__HTTP_PORT": "3000",
    "server__LFS_START_SERVER": "true",
    "server__OFFLINE_MODE": "true",
    "security__INSTALL_LOCK": "true",
    "service__DISABLE_REGISTRATION": "true",
    "service__REQUIRE_SIGNIN_VIEW": "true",
    "service__DEFAULT_KEEP_EMAIL_PRIVATE": "true",
    "repository__DEFAULT_PRIVATE": "private",
    "picture__DISABLE_GRAVATAR": "true",
    "cron_0x2E_update_checker__ENABLED": "false",
    "actions__ENABLED": "false",
  };
  return ["USER_UID=1000", "USER_GID=1000", ...Object.entries(s).map(([k, v]) => `FORGEJO__${k}=${v}`)];
}

export function dumpFileName(now: Date): string {
  return `forge-${now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}.tar.gz`;
}

/** Names to delete so only the newest `keep` dumps remain. */
export function prunePlan(names: string[], keep: number): string[] {
  const dumps = names.filter((n) => /^forge-\d{8}T\d{6}Z\.tar\.gz$/.test(n)).sort();
  return dumps.slice(0, Math.max(0, dumps.length - keep));
}

export type BackupTarget = { kind: "dir"; path: string } | { kind: "env"; env: string };

/**
 * Parses a backup target. Directories must be absolute; a Windows path is
 * translated to its WSL mount when the control plane runs under Linux.
 */
export function parseBackupTarget(raw: string, platform: string = process.platform): BackupTarget | string {
  const t = raw.trim();
  const env = /^env:(.+)$/i.exec(t);
  if (env) return { kind: "env", env: env[1].trim() };
  const unc = t.startsWith("\\\\") || t.startsWith("//");
  if (unc) {
    return platform === "win32"
      ? { kind: "dir", path: t }
      : "network shares aren't visible here — mount the share and give its mount path, or use env:<NAME>";
  }
  // The TUI runs under WSL or native Windows; stored paths work from either.
  const mnt = /^\/mnt\/([a-z])(?:\/(.*))?$/.exec(t);
  if (mnt && platform === "win32") {
    return { kind: "dir", path: `${mnt[1].toUpperCase()}:\\${(mnt[2] ?? "").replace(/\//g, "\\")}`.replace(/\\+$/, "") };
  }
  const win = /^([A-Za-z]):[\\/](.*)$/.exec(t);
  if (win && platform !== "win32") {
    return { kind: "dir", path: `/mnt/${win[1].toLowerCase()}/${win[2].replace(/\\/g, "/")}`.replace(/\/+$/, "") };
  }
  if (win || t.startsWith("/")) return { kind: "dir", path: t };
  return "give an absolute directory, or env:<NAME> for another UNAXIS host";
}

export function formatBackupTarget(t: BackupTarget): string {
  return t.kind === "env" ? `env:${t.env}` : t.path;
}

/** A tar holding one file, for Docker's archive upload endpoint. */
export function tarSingle(name: string, data: Buffer, mtime = Date.now()): Buffer {
  const h = Buffer.alloc(512);
  const field = (value: string, at: number) => h.write(`${value}\0`, at, "latin1");
  h.write(name, 0, "utf8");
  field("0000644", 100); field("0000000", 108); field("0000000", 116);
  field(data.length.toString(8).padStart(11, "0"), 124);
  field(Math.floor(mtime / 1000).toString(8).padStart(11, "0"), 136);
  h.write("        ", 148); h.write("0", 156); field("ustar", 257); h.write("00", 263);
  let sum = 0;
  for (const b of h) sum += b;
  h.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, "latin1");
  return Buffer.concat([h, data, Buffer.alloc((512 - (data.length % 512)) % 512), Buffer.alloc(1024)]);
}

/** Pulls the one file out of a Docker archive-endpoint tar stream. */
export function untarSingle(tar: Buffer): { name: string; data: Buffer } | null {
  if (tar.length < 512) return null;
  const name = tar.subarray(0, 100).toString("utf8").replace(/\0[\s\S]*$/, "");
  const size = parseInt(tar.subarray(124, 136).toString("utf8").replace(/\0[\s\S]*$/, "").trim(), 8);
  if (!name || !Number.isFinite(size) || 512 + size > tar.length) return null;
  return { name, data: tar.subarray(512, 512 + size) };
}
