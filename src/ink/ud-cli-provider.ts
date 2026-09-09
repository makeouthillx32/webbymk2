import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface UdCliStatus {
  installed: boolean;
  version: string;
  authenticated: boolean;
  detail: string;
  executable: string;
}

interface UdCliInvocation {
  command: string;
  prefix: string[];
  display: string;
}

function operatorHome(): string {
  const current = homedir();
  if (existsSync(join(current, "AppData", "Roaming", "ud-cli-nodejs", "Config"))) return current;
  if (process.platform === "win32") {
    const usersRoot = `${process.env["SystemDrive"] ?? "C:"}\\Users`;
    try {
      const match = readdirSync(usersRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(usersRoot, entry.name))
        .find((home) => existsSync(join(home, "AppData", "Roaming", "ud-cli-nodejs", "Config")));
      if (match) return match;
    } catch { /* fall through to the runtime home */ }
  }
  return current;
}

function executable(): string {
  if (process.platform !== "win32") return "ud";
  const candidates = [
    process.env["ProgramFiles"] ? join(process.env["ProgramFiles"], "nodejs", "ud.cmd") : "",
    process.env["APPDATA"] ? join(process.env["APPDATA"], "npm", "ud.cmd") : "",
    `${process.env["SystemDrive"] ?? "C:"}\\Program Files\\nodejs\\ud.cmd`,
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) ?? "ud.cmd";
}

function invocation(): UdCliInvocation {
  const display = executable();
  if (process.platform !== "win32") return { command: display, prefix: [], display };

  // Bun's spawn implementation does not consistently execute Windows .cmd
  // shims in a long-running/hot-reloaded process. Invoke the installed CLI's
  // JavaScript entrypoint with Node so the live TUI sees the same auth profile
  // as an interactive `ud` command.
  const programFiles = process.env["ProgramFiles"] ?? `${process.env["SystemDrive"] ?? "C:"}\\Program Files`;
  const node = join(programFiles, "nodejs", "node.exe");
  const entry = join(programFiles, "nodejs", "node_modules", "@unstoppabledomains", "ud-cli", "dist", "index.js");
  if (existsSync(node) && existsSync(entry)) {
    return { command: node, prefix: [entry], display };
  }
  return { command: display, prefix: [], display };
}

function run(args: string[]): { status: number; stdout: string; stderr: string } {
  try {
    const cli = invocation();
    // The official CLI switches to an isolated `ud-cli-test-*` credential
    // store whenever NODE_ENV=test. UNAXIS dev/test runners may set that flag,
    // but domain operations must use the operator's normal `ud-cli` profile.
    const userHome = operatorHome();
    const env: Record<string, string | undefined> = {
      ...process.env,
      NODE_ENV: "production",
      ...(process.platform === "win32" ? {
        USERPROFILE: userHome,
        APPDATA: join(userHome, "AppData", "Roaming"),
        LOCALAPPDATA: join(userHome, "AppData", "Local"),
      } : {}),
    };
    // Do not let a dev runner's isolated XDG profile shadow the operator's
    // authenticated Windows profile.
    delete env.XDG_CONFIG_HOME;
    delete env.XDG_CONFIG_DIRS;
    if (typeof Bun !== "undefined") {
      const result = Bun.spawnSync({
        cmd: [cli.command, ...cli.prefix, ...args],
        env,
        stdout: "pipe",
        stderr: "pipe",
        windowsHide: true,
      });
      return {
        status: result.exitCode,
        stdout: result.stdout.toString().trim(),
        stderr: result.stderr.toString().trim(),
      };
    }
    const result = spawnSync(cli.command, [...cli.prefix, ...args], {
      env,
      encoding: "utf8",
      windowsHide: true,
      timeout: 15_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    return {
      status: result.status ?? (result.error ? 1 : 0),
      stdout: String(result.stdout ?? "").trim(),
      stderr: String(result.stderr ?? result.error?.message ?? "").trim(),
    };
  } catch (error) {
    return { status: 1, stdout: "", stderr: error instanceof Error ? error.message : String(error) };
  }
}

export function getUdCliStatus(): UdCliStatus {
  const command = executable();
  const versionResult = run(["--version"]);
  if (versionResult.status !== 0 || !versionResult.stdout) {
    const reason = versionResult.stderr ? ` (${versionResult.stderr})` : "";
    return { installed: false, version: "", authenticated: false,
      detail: `official @unstoppabledomains/ud-cli is unavailable${reason}`, executable: command };
  }
  const authResult = run(["auth", "status", "--format", "json"]);
  const authText = `${authResult.stdout}\n${authResult.stderr}`.toLowerCase();
  const authRejected = authText.includes("not authenticated")
    || authText.includes("authentication failed")
    || authText.includes("ud auth login");
  const authenticated = authResult.status === 0 && !authRejected;
  const authDiagnostic = `${authResult.stdout}\n${authResult.stderr}`.trim().replace(/\s+/g, " ").slice(0, 240);
  return {
    installed: true,
    version: versionResult.stdout.split(/\r?\n/)[0],
    authenticated,
    detail: authenticated
      ? "official Unstoppable CLI is authenticated"
      : `official Unstoppable CLI is installed but requires \`ud auth login\`${authDiagnostic ? ` (${authDiagnostic})` : ""}`,
    executable: command,
  };
}

export function inspectUdDomain(domain: string): { ok: boolean; output: unknown; detail: string } {
  const status = getUdCliStatus();
  if (!status.installed || !status.authenticated) return { ok: false, output: null, detail: status.detail };
  const result = run(["domains", "get", domain, "--format", "json"]);
  if (result.status !== 0) return { ok: false, output: null, detail: result.stderr || result.stdout || "official CLI request failed" };
  try { return { ok: true, output: JSON.parse(result.stdout), detail: "domain returned by official Unstoppable CLI" }; }
  catch { return { ok: true, output: result.stdout, detail: "domain returned by official Unstoppable CLI" }; }
}

export function applyUdRedirect(domain: string, targetUrl: string): { ok: boolean; output: unknown; detail: string } {
  const status = getUdCliStatus();
  if (!status.installed || !status.authenticated) return { ok: false, output: null, detail: status.detail };
  const result = run(["domains", "hosting", "redirects", "add", "--name", domain,
    "--type", "REDIRECT_302", "--target-url", targetUrl, "--format", "json"]);
  if (result.status !== 0) return { ok: false, output: null, detail: result.stderr || result.stdout || "official redirect command failed" };
  try { return { ok: true, output: JSON.parse(result.stdout), detail: "official redirect operation submitted" }; }
  catch { return { ok: true, output: result.stdout, detail: "official redirect operation submitted" }; }
}

export function applyUdDnsRecord(domain: string, record: {
  type: string; subName: string; value: string; ttl: number; upsertMode: string;
}): { ok: boolean; output: unknown; detail: string } {
  const status = getUdCliStatus();
  if (!status.installed || !status.authenticated) return { ok: false, output: null, detail: status.detail };
  const result = run(["domains", "dns", "records", "add", domain,
    "--type", record.type, "--sub-name", record.subName, "--values", record.value,
    "--ttl", String(record.ttl), "--upsert-mode", record.upsertMode, "--format", "json"]);
  if (result.status !== 0) return { ok: false, output: null, detail: result.stderr || result.stdout || "official DNS command failed" };
  try { return { ok: true, output: JSON.parse(result.stdout), detail: "official DNS operation submitted" }; }
  catch { return { ok: true, output: result.stdout, detail: "official DNS operation submitted" }; }
}
