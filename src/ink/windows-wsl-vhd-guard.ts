import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type DockerWslVhd = {
  path: string;
  exists: boolean;
  owner: string | null;
  sizeBytes: number | null;
};

export type DockerWslVhdReport = {
  supported: boolean;
  settingsPath: string | null;
  configuredRoot: string | null;
  resolvedRoot: string | null;
  rootLinkType: string | null;
  expectedOwner: string | null;
  recentAccessDenied: boolean;
  accessDeniedLog: string | null;
  vhds: DockerWslVhd[];
  error?: string;
};

export type DockerWslVhdAssessment = {
  severity: "ok" | "warning" | "critical" | "unsupported";
  ownerMismatch: boolean;
  missingVhd: boolean;
  junctionBacked: boolean;
};

const WINDOWS_DIAGNOSTIC = String.raw`
$ErrorActionPreference = 'Stop'
$settingsPath = Join-Path $env:APPDATA 'Docker\settings-store.json'
$configuredRoot = $null
if (Test-Path -LiteralPath $settingsPath) {
  $settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
  $configuredRoot = [string]$settings.CustomWslDistroDir
}

$rootItem = $null
$resolvedRoot = $configuredRoot
if ($configuredRoot -and (Test-Path -LiteralPath $configuredRoot)) {
  $rootItem = Get-Item -LiteralPath $configuredRoot -Force
  if ($rootItem.LinkType -and $rootItem.Target) {
    $target = @($rootItem.Target)[0]
    if ($target) { $resolvedRoot = [string]$target }
  }
}

$expectedOwner = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$vhdPaths = @()
if ($resolvedRoot) {
  $vhdPaths = @(
    (Join-Path $resolvedRoot 'main\ext4.vhdx'),
    (Join-Path $resolvedRoot 'disk\docker_data.vhdx')
  )
}

$vhds = @($vhdPaths | ForEach-Object {
  $exists = Test-Path -LiteralPath $_
  $owner = $null
  $size = $null
  if ($exists) {
    $acl = [System.IO.File]::GetAccessControl($_)
    $owner = $acl.GetOwner([System.Security.Principal.NTAccount]).Value
    $size = (Get-Item -LiteralPath $_ -Force).Length
  }
  [pscustomobject]@{
    path = [string]$_
    exists = [bool]$exists
    owner = $owner
    sizeBytes = $size
  }
})

$recentAccessDenied = $false
$accessDeniedLog = $null
$logRoot = Join-Path $env:LOCALAPPDATA 'Docker\log'
if (Test-Path -LiteralPath $logRoot) {
  $cutoff = (Get-Date).AddHours(-24)
  $logs = Get-ChildItem -LiteralPath $logRoot -File -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -ge $cutoff } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 8
  foreach ($log in $logs) {
    $tail = Get-Content -LiteralPath $log.FullName -Tail 300 -ErrorAction SilentlyContinue
    if ($tail -match 'MountDisk/HCS/E_ACCESSDENIED|Failed to attach disk.+Access is denied') {
      $recentAccessDenied = $true
      $accessDeniedLog = $log.FullName
      break
    }
  }
}

[pscustomobject]@{
  supported = $true
  settingsPath = $settingsPath
  configuredRoot = $configuredRoot
  resolvedRoot = $resolvedRoot
  rootLinkType = if ($rootItem) { [string]$rootItem.LinkType } else { $null }
  expectedOwner = $expectedOwner
  recentAccessDenied = $recentAccessDenied
  accessDeniedLog = $accessDeniedLog
  vhds = $vhds
} | ConvertTo-Json -Depth 5 -Compress
`;

function normalizeReport(value: any): DockerWslVhdReport {
  return {
    supported: value?.supported === true,
    settingsPath: typeof value?.settingsPath === "string" ? value.settingsPath : null,
    configuredRoot: typeof value?.configuredRoot === "string" && value.configuredRoot ? value.configuredRoot : null,
    resolvedRoot: typeof value?.resolvedRoot === "string" && value.resolvedRoot ? value.resolvedRoot : null,
    rootLinkType: typeof value?.rootLinkType === "string" && value.rootLinkType ? value.rootLinkType : null,
    expectedOwner: typeof value?.expectedOwner === "string" && value.expectedOwner ? value.expectedOwner : null,
    recentAccessDenied: value?.recentAccessDenied === true,
    accessDeniedLog: typeof value?.accessDeniedLog === "string" && value.accessDeniedLog ? value.accessDeniedLog : null,
    vhds: Array.isArray(value?.vhds)
      ? value.vhds.map((vhd: any) => ({
          path: String(vhd?.path ?? ""),
          exists: vhd?.exists === true,
          owner: typeof vhd?.owner === "string" && vhd.owner ? vhd.owner : null,
          sizeBytes: typeof vhd?.sizeBytes === "number" ? vhd.sizeBytes : null,
        }))
      : [],
  };
}

export function assessDockerWslVhd(report: DockerWslVhdReport): DockerWslVhdAssessment {
  if (!report.supported) {
    return { severity: "unsupported", ownerMismatch: false, missingVhd: false, junctionBacked: false };
  }

  const ownerMismatch = Boolean(
    report.expectedOwner && report.vhds.some((vhd) => vhd.exists && vhd.owner && vhd.owner !== report.expectedOwner),
  );
  const missingVhd = report.vhds.length !== 2 || report.vhds.some((vhd) => !vhd.exists);
  const junctionBacked = Boolean(report.rootLinkType);
  const severity = report.recentAccessDenied && ownerMismatch
    ? "critical"
    : ownerMismatch || missingVhd || junctionBacked
      ? "warning"
      : "ok";

  return { severity, ownerMismatch, missingVhd, junctionBacked };
}

export async function inspectDockerWslVhd(): Promise<DockerWslVhdReport> {
  if (process.platform !== "win32") {
    return {
      supported: false,
      settingsPath: null,
      configuredRoot: null,
      resolvedRoot: null,
      rootLinkType: null,
      expectedOwner: null,
      recentAccessDenied: false,
      accessDeniedLog: null,
      vhds: [],
    };
  }

  try {
    const encoded = Buffer.from(WINDOWS_DIAGNOSTIC, "utf16le").toString("base64");
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
      { windowsHide: true, timeout: 20_000, maxBuffer: 1024 * 1024 },
    );
    return normalizeReport(JSON.parse(stdout.trim()));
  } catch (error) {
    const processError = error as { code?: string | number; stderr?: string };
    const detail = typeof processError.stderr === "string" && processError.stderr.trim()
      ? processError.stderr.trim().slice(-1200)
      : `PowerShell inspection failed${processError.code ? ` (${processError.code})` : ""}`;
    return {
      supported: true,
      settingsPath: null,
      configuredRoot: null,
      resolvedRoot: null,
      rootLinkType: null,
      expectedOwner: null,
      recentAccessDenied: false,
      accessDeniedLog: null,
      vhds: [],
      error: detail,
    };
  }
}

function gib(bytes: number | null): string {
  return bytes == null ? "unknown size" : `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GiB`;
}

export function formatDockerWslVhdReport(report: DockerWslVhdReport): string[] {
  if (!report.supported) return ["Docker WSL VHD guard: not applicable on this host"];
  if (report.error) return [`⚠ Docker WSL VHD guard could not inspect the host: ${report.error}`];

  const assessment = assessDockerWslVhd(report);
  const lines = [
    `Docker WSL VHD guard: ${assessment.severity.toUpperCase()}`,
    `  configured root  ${report.configuredRoot ?? "not configured"}`,
  ];
  if (report.resolvedRoot && report.resolvedRoot !== report.configuredRoot) {
    lines.push(`  resolved target  ${report.resolvedRoot}`);
  }
  if (report.rootLinkType) lines.push(`  path mode        ${report.rootLinkType} (prefer Docker's direct data-root path)`);
  lines.push(`  expected owner   ${report.expectedOwner ?? "unknown"}`);
  for (const vhd of report.vhds) {
    lines.push(`  ${vhd.exists ? "✓" : "✗"} ${vhd.path || "unknown VHD"} · ${gib(vhd.sizeBytes)} · owner ${vhd.owner ?? "unknown"}`);
  }
  if (report.recentAccessDenied) {
    lines.push(`  ⚠ recent MountDisk/HCS/E_ACCESSDENIED evidence${report.accessDeniedLog ? ` in ${report.accessDeniedLog}` : ""}`);
  }

  if (assessment.ownerMismatch) {
    const owner = report.expectedOwner ?? "<current Windows user>";
    lines.push("", "SAFE RECOVERY BOUNDARY (planned downtime required):");
    lines.push("  1. Close Docker Desktop, then run: wsl --shutdown");
    lines.push(`  2. Back up ACLs: icacls "${report.resolvedRoot}" /save "%APPDATA%\\Docker\\docker-wsl-acl-backup.txt" /t /c`);
    lines.push("  3. Set the owner only on the Docker WSL root, main/, disk/, and the two VHDX files:");
    for (const path of [
      report.resolvedRoot,
      report.resolvedRoot ? `${report.resolvedRoot}\\main` : null,
      report.resolvedRoot ? `${report.resolvedRoot}\\disk` : null,
      ...report.vhds.map((vhd) => vhd.path),
    ].filter((path): path is string => Boolean(path))) {
      lines.push(`     icacls "${path}" /setowner "${owner}" /c`);
    }
    lines.push("  4. Start Docker Desktop normally; then run: unaxis unenter.live up");
    lines.push("  Never delete, recreate, reset, or compact either VHDX during incident recovery.");
  } else if (assessment.missingVhd) {
    lines.push("  ⚠ One or both expected VHDX files are missing. Stop here; do not reset Docker or create replacement disks.");
  } else if (assessment.junctionBacked) {
    lines.push("  ⚠ Docker's configured data root is a reparse point. Prefer the resolved drive path directly in Docker settings.");
  } else {
    lines.push("  ✓ Direct data-root path and VHD ownership match the current Windows operator.");
  }

  return lines;
}
