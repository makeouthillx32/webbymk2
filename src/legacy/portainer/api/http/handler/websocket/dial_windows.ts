import { createConnection, Socket } from "node:net";

export function normalizeWindowsNamedPipePath(pipeUrl: string): string {
  if (!pipeUrl) {
    return pipeUrl;
  }

  return pipeUrl.replace(/^npipe:\/\//i, "").replace(/\//g, "\\");
}

export function parseSocketTarget(target: string): { host: string; port: number } {
  if (target.includes("://")) {
    const parsed = new URL(target);
    return {
      host: parsed.hostname,
      port: Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80)),
    };
  }

  const [host, port] = target.split(":");
  return {
    host,
    port: Number(port || 80),
  };
}

export function createDial(scheme: string, host: string): Socket {
  if (scheme === "npipe") {
    return createConnection({ path: normalizeWindowsNamedPipePath(host) });
  }

  if (scheme === "unix") {
    return createConnection({ path: host });
  }

  const target = parseSocketTarget(host);
  return createConnection({ host: target.host, port: target.port });
}
