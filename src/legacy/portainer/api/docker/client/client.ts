import {
  ContainerEngineDocker,
  Endpoint,
  EndpointType,
  PortainerAgentPublicKeyHeader,
  PortainerAgentSignatureHeader,
  PortainerAgentSignatureMessage,
  PortainerAgentTargetHeader,
  TLSConfiguration,
} from "../../portainer";

export const defaultDockerRequestTimeoutMs = 60_000;
export const dockerClientVersion = "1.37";

export class UnsupportedEnvironmentError extends Error {
  constructor() {
    super("environment not supported");
    this.name = "UnsupportedEnvironmentError";
  }
}

export interface SignatureService {
  encodedPublicKey(): string;
  createSignature(message: string): string;
}

export interface ReverseTunnelService {
  tunnelAddr(endpoint: Endpoint): string;
}

export interface ClientPlan {
  kind: "local" | "tcp" | "agent";
  baseUrl: string;
  scheme: "http" | "https" | "unix" | "npipe";
  timeoutMs: number;
  headers: Record<string, string>;
  nodeName?: string;
  usesTls: boolean;
}

export interface ClientFactoryOptions {
  signatureService: SignatureService;
  reverseTunnelService?: ReverseTunnelService;
}

function isLocalSocketUrl(url: string): boolean {
  return url.startsWith("unix://") || url.startsWith("npipe://");
}

function tlsEnabled(config: TLSConfiguration): boolean {
  return config.TLS && !config.TLSSkipVerify;
}

function buildBaseScheme(endpoint: Endpoint): "http" | "https" | "unix" | "npipe" {
  if (endpoint.URL.startsWith("unix://")) {
    return "unix";
  }

  if (endpoint.URL.startsWith("npipe://")) {
    return "npipe";
  }

  return tlsEnabled(endpoint.TLSConfig) ? "https" : "http";
}

function buildLocalPlan(endpoint: Endpoint, timeoutMs: number): ClientPlan {
  return {
    kind: "local",
    baseUrl: endpoint.URL,
    scheme: buildBaseScheme(endpoint),
    timeoutMs,
    headers: {},
    usesTls: endpoint.TLSConfig.TLS,
  };
}

function buildTcpPlan(endpoint: Endpoint, timeoutMs: number): ClientPlan {
  const scheme = buildBaseScheme(endpoint);
  return {
    kind: "tcp",
    baseUrl: endpoint.URL,
    scheme,
    timeoutMs,
    headers: {},
    usesTls: scheme === "https",
  };
}

function buildAgentHeaders(signatureService: SignatureService, nodeName?: string): Record<string, string> {
  const headers: Record<string, string> = {
    [PortainerAgentPublicKeyHeader]: signatureService.encodedPublicKey(),
    [PortainerAgentSignatureHeader]: signatureService.createSignature(PortainerAgentSignatureMessage),
  };

  if (nodeName) {
    headers[PortainerAgentTargetHeader] = nodeName;
  }

  return headers;
}

function buildAgentPlan(endpoint: Endpoint, endpointUrl: string, timeoutMs: number, signatureService: SignatureService, nodeName?: string): ClientPlan {
  const usesTls = endpoint.TLSConfig.TLS || endpointUrl.startsWith("https://");
  return {
    kind: "agent",
    baseUrl: endpointUrl,
    scheme: usesTls ? "https" : "http",
    timeoutMs,
    headers: buildAgentHeaders(signatureService, nodeName),
    nodeName,
    usesTls,
  };
}

export class ClientFactory {
  constructor(private readonly options: ClientFactoryOptions) {}

  createClientPlan(endpoint: Endpoint, nodeName = "", timeoutMs = defaultDockerRequestTimeoutMs): ClientPlan {
    switch (endpoint.Type) {
      case EndpointType.AzureEnvironment:
        throw new UnsupportedEnvironmentError();
      case EndpointType.AgentOnDockerEnvironment:
      case EndpointType.AgentOnKubernetesEnvironment:
        return buildAgentPlan(endpoint, endpoint.URL, timeoutMs, this.options.signatureService, nodeName || undefined);
      case EndpointType.EdgeAgentOnDockerEnvironment:
      case EndpointType.EdgeAgentOnKubernetesEnvironment: {
        if (!this.options.reverseTunnelService) {
          throw new Error("reverse tunnel service is required for edge environments");
        }

        const tunnelAddr = this.options.reverseTunnelService.tunnelAddr(endpoint);
        return buildAgentPlan(endpoint, `http://${tunnelAddr}`, timeoutMs, this.options.signatureService, nodeName || undefined);
      }
      default:
        break;
    }

    if (isLocalSocketUrl(endpoint.URL)) {
      return buildLocalPlan(endpoint, timeoutMs);
    }

    return buildTcpPlan(endpoint, timeoutMs);
  }
}

export function createLocalClientPlan(endpoint: Endpoint, timeoutMs = defaultDockerRequestTimeoutMs): ClientPlan {
  return buildLocalPlan(endpoint, timeoutMs);
}

export function createTcpClientPlan(endpoint: Endpoint, timeoutMs = defaultDockerRequestTimeoutMs): ClientPlan {
  return buildTcpPlan(endpoint, timeoutMs);
}

export function createAgentClientPlan(
  endpoint: Endpoint,
  endpointUrl: string,
  signatureService: SignatureService,
  nodeName = "",
  timeoutMs = defaultDockerRequestTimeoutMs,
): ClientPlan {
  return buildAgentPlan(endpoint, endpointUrl, timeoutMs, signatureService, nodeName || undefined);
}

export function isDockerEngineContainer(endpoint: Endpoint): boolean {
  return endpoint.ContainerEngine === "" || endpoint.ContainerEngine === ContainerEngineDocker;
}
