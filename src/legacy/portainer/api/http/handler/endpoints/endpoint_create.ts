import {
  cloneKubernetesData,
  defaultEndpointSecuritySettings,
  defaultKubernetesData,
  DockerSnapshot,
  Endpoint,
  EndpointGroupID,
  EndpointID,
  EndpointRelation,
  EndpointStatus,
  EndpointType,
  KubernetesData,
  Pair,
  Settings,
  TagID,
  UserAccessPolicies,
  TeamAccessPolicies,
  ContainerEngine,
  ContainerEngineDocker,
  ContainerEnginePodman,
} from "../../../portainer";

export enum EndpointCreationTypeEnum {
  LocalDockerEnvironment = 1,
  AgentEnvironment = 2,
  AzureEnvironment = 3,
  EdgeAgentEnvironment = 4,
  LocalKubernetesEnvironment = 5,
}

export interface EndpointCreatePayload {
  Name: string;
  URL: string;
  EndpointCreationType: EndpointCreationTypeEnum;
  PublicURL: string;
  Gpus: Pair[];
  GroupID: number;
  TLS: boolean;
  TLSSkipVerify: boolean;
  TLSSkipClientVerify: boolean;
  TLSCACertFile: Uint8Array | string | null;
  TLSCertFile: Uint8Array | string | null;
  TLSKeyFile: Uint8Array | string | null;
  AzureApplicationID: string;
  AzureTenantID: string;
  AzureAuthenticationKey: string;
  TagIDs: TagID[];
  EdgeCheckinInterval: number;
  ContainerEngine: ContainerEngine | "";
}

export interface AgentDiscovery {
  platform: "docker" | "kubernetes";
  version: string;
}

export interface EndpointCreationContext {
  nextEndpointId: EndpointID;
  runtimePlatform?: NodeJS.Platform;
  settings?: Settings;
  agent?: AgentDiscovery;
  generateEdgeKey?: (input: { endpointId: EndpointID; url: string; host: string }) => string;
  generateEdgeID?: () => string;
  authenticateAzure?: (credentials: { ApplicationID: string; TenantID: string; AuthenticationKey: string }) => void | Promise<void>;
  defaultKubernetesData?: () => KubernetesData;
}

export interface EndpointCreationResult {
  endpoint: Endpoint;
  relation: EndpointRelation;
}

function assertContainerEngine(containerEngine: string): asserts containerEngine is ContainerEngine | "" {
  if (containerEngine !== "" && containerEngine !== ContainerEngineDocker && containerEngine !== ContainerEnginePodman) {
    throw new Error("invalid container engine value. Value must be one of: 'docker' or 'podman'");
  }
}

function defaultDockerUrl(runtimePlatform: NodeJS.Platform = process.platform): string {
  return runtimePlatform === "win32" ? "npipe:////./pipe/docker_engine" : "unix:///var/run/docker.sock";
}

function normalizePublicURL(publicURL: string, url: string): string {
  return publicURL || url;
}

function parseEdgeHost(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("URL cannot be empty");
  }

  try {
    const withScheme = trimmed.includes("://") ? trimmed : `http://${trimmed}`;
    return new URL(withScheme).host || trimmed;
  } catch {
    return trimmed.replace(/^https?:\/\//i, "").split("/")[0];
  }
}

function baseEndpoint(endpoint: Omit<Endpoint, "SecuritySettings" | "ComposeSyntaxMaxVersion" | "Heartbeat" | "PostInitMigrations" | "EnableGPUManagement">): Endpoint {
  return {
    ...endpoint,
    SecuritySettings: defaultEndpointSecuritySettings(),
    ComposeSyntaxMaxVersion: "",
    Heartbeat: false,
    PostInitMigrations: {},
    EnableGPUManagement: false,
  };
}

function createRelation(endpointID: EndpointID): EndpointRelation {
  return {
    EndpointID: endpointID,
    EdgeStacks: {},
  };
}

function createAzureEndpoint(payload: EndpointCreatePayload, ctx: EndpointCreationContext): EndpointCreationResult {
  const credentials = {
    ApplicationID: payload.AzureApplicationID,
    TenantID: payload.AzureTenantID,
    AuthenticationKey: payload.AzureAuthenticationKey,
  };

  void ctx.authenticateAzure?.(credentials);

  const endpoint = baseEndpoint({
    ID: ctx.nextEndpointId,
    Name: payload.Name,
    URL: "https://management.azure.com",
    Type: EndpointType.AzureEnvironment,
    ContainerEngine: payload.ContainerEngine,
    GroupID: payload.GroupID as EndpointGroupID,
    PublicURL: normalizePublicURL(payload.PublicURL, "https://management.azure.com"),
    Gpus: [...payload.Gpus],
    TLSConfig: {
      TLS: false,
      TLSSkipVerify: false,
      TLSSkipClientVerify: false,
      TLSCACertPath: "",
      TLSCertPath: "",
      TLSKeyPath: "",
    },
    AzureCredentials: credentials,
    TagIDs: [...payload.TagIDs],
    Status: EndpointStatus.Up,
    Snapshots: [] as DockerSnapshot[],
    UserAccessPolicies: {} as UserAccessPolicies,
    TeamAccessPolicies: {} as TeamAccessPolicies,
    EdgeID: "",
    EdgeKey: "",
    EdgeCheckinInterval: 0,
    Kubernetes: cloneKubernetesData((ctx.defaultKubernetesData ?? defaultKubernetesData)()),
    LastCheckInDate: 0,
    UserTrusted: false,
    Edge: { AsyncMode: false, PingInterval: -1, SnapshotInterval: -1, CommandInterval: -1 },
    Agent: { Version: "" },
  });

  return { endpoint, relation: createRelation(endpoint.ID) };
}

function createEdgeEndpoint(payload: EndpointCreatePayload, ctx: EndpointCreationContext): EndpointCreationResult {
  if (!payload.URL.trim()) {
    throw new Error("URL cannot be empty");
  }

  const host = parseEdgeHost(payload.URL);
  const edgeKey = ctx.generateEdgeKey?.({ endpointId: ctx.nextEndpointId, url: payload.URL, host }) ?? `edge-${ctx.nextEndpointId}`;
  const isKubernetes = payload.ContainerEngine === "";
  const endpointType = isKubernetes ? EndpointType.EdgeAgentOnKubernetesEnvironment : EndpointType.EdgeAgentOnDockerEnvironment;
  const settings = ctx.settings;

  const endpoint = baseEndpoint({
    ID: ctx.nextEndpointId,
    Name: payload.Name,
    URL: host,
    Type: endpointType,
    ContainerEngine: payload.ContainerEngine,
    GroupID: payload.GroupID as EndpointGroupID,
    PublicURL: "",
    Gpus: [...payload.Gpus],
    TLSConfig: {
      TLS: false,
      TLSSkipVerify: false,
      TLSSkipClientVerify: false,
      TLSCACertPath: "",
      TLSCertPath: "",
      TLSKeyPath: "",
    },
    AzureCredentials: {
      ApplicationID: "",
      TenantID: "",
      AuthenticationKey: "",
    },
    TagIDs: [...payload.TagIDs],
    Status: EndpointStatus.Up,
    Snapshots: [] as DockerSnapshot[],
    UserAccessPolicies: {} as UserAccessPolicies,
    TeamAccessPolicies: {} as TeamAccessPolicies,
    EdgeID: settings?.EnforceEdgeID ? (ctx.generateEdgeID?.() ?? "") : "",
    EdgeKey: edgeKey,
    EdgeCheckinInterval: payload.EdgeCheckinInterval,
    Kubernetes: cloneKubernetesData((ctx.defaultKubernetesData ?? defaultKubernetesData)()),
    LastCheckInDate: 0,
    UserTrusted: true,
    Edge: { AsyncMode: false, PingInterval: -1, SnapshotInterval: -1, CommandInterval: -1 },
    Agent: { Version: "" },
  });

  return { endpoint, relation: createRelation(endpoint.ID) };
}

function createKubernetesEndpoint(payload: EndpointCreatePayload, ctx: EndpointCreationContext): EndpointCreationResult {
  const url = payload.URL.trim() || "https://kubernetes.default.svc";

  const endpoint = baseEndpoint({
    ID: ctx.nextEndpointId,
    Name: payload.Name,
    URL: url,
    Type: EndpointType.KubernetesLocalEnvironment,
    ContainerEngine: payload.ContainerEngine,
    GroupID: payload.GroupID as EndpointGroupID,
    PublicURL: normalizePublicURL(payload.PublicURL, url),
    Gpus: [...payload.Gpus],
    TLSConfig: {
      TLS: payload.TLS,
      TLSSkipVerify: payload.TLSSkipVerify,
      TLSSkipClientVerify: payload.TLSSkipClientVerify,
      TLSCACertPath: "",
      TLSCertPath: "",
      TLSKeyPath: "",
    },
    AzureCredentials: {
      ApplicationID: "",
      TenantID: "",
      AuthenticationKey: "",
    },
    TagIDs: [...payload.TagIDs],
    Status: EndpointStatus.Up,
    Snapshots: [] as DockerSnapshot[],
    UserAccessPolicies: {} as UserAccessPolicies,
    TeamAccessPolicies: {} as TeamAccessPolicies,
    EdgeID: "",
    EdgeKey: "",
    EdgeCheckinInterval: 0,
    Kubernetes: cloneKubernetesData((ctx.defaultKubernetesData ?? defaultKubernetesData)()),
    LastCheckInDate: 0,
    UserTrusted: false,
    Edge: { AsyncMode: false, PingInterval: -1, SnapshotInterval: -1, CommandInterval: -1 },
    Agent: { Version: "" },
  });

  return { endpoint, relation: createRelation(endpoint.ID) };
}

function createLocalDockerEndpoint(payload: EndpointCreatePayload, ctx: EndpointCreationContext): EndpointCreationResult {
  const url = payload.URL.trim() || defaultDockerUrl(ctx.runtimePlatform);
  const endpoint = baseEndpoint({
    ID: ctx.nextEndpointId,
    Name: payload.Name,
    URL: url,
    Type: EndpointType.DockerEnvironment,
    ContainerEngine: payload.ContainerEngine,
    GroupID: payload.GroupID as EndpointGroupID,
    PublicURL: normalizePublicURL(payload.PublicURL, url),
    Gpus: [...payload.Gpus],
    TLSConfig: {
      TLS: false,
      TLSSkipVerify: false,
      TLSSkipClientVerify: false,
      TLSCACertPath: "",
      TLSCertPath: "",
      TLSKeyPath: "",
    },
    AzureCredentials: {
      ApplicationID: "",
      TenantID: "",
      AuthenticationKey: "",
    },
    TagIDs: [...payload.TagIDs],
    Status: EndpointStatus.Up,
    Snapshots: [] as DockerSnapshot[],
    UserAccessPolicies: {} as UserAccessPolicies,
    TeamAccessPolicies: {} as TeamAccessPolicies,
    EdgeID: "",
    EdgeKey: "",
    EdgeCheckinInterval: 0,
    Kubernetes: cloneKubernetesData((ctx.defaultKubernetesData ?? defaultKubernetesData)()),
    LastCheckInDate: 0,
    UserTrusted: false,
    Edge: { AsyncMode: false, PingInterval: -1, SnapshotInterval: -1, CommandInterval: -1 },
    Agent: { Version: "" },
  });

  return { endpoint, relation: createRelation(endpoint.ID) };
}

function createTlsDockerOrAgentEndpoint(payload: EndpointCreatePayload, ctx: EndpointCreationContext): EndpointCreationResult {
  const agent = ctx.agent;
  let endpointType = EndpointType.DockerEnvironment;
  let url = payload.URL.trim();
  let agentVersion = "";

  if (payload.EndpointCreationType === EndpointCreationTypeEnum.AgentEnvironment) {
    if (!agent) {
      throw new Error("agent discovery result is required for agent environments");
    }

    endpointType = agent.platform === "kubernetes" ? EndpointType.AgentOnKubernetesEnvironment : EndpointType.AgentOnDockerEnvironment;
    agentVersion = agent.version;
    if (endpointType === EndpointType.AgentOnKubernetesEnvironment) {
      url = url.replace(/^tcp:\/\//i, "");
    }
  }

  const endpoint = baseEndpoint({
    ID: ctx.nextEndpointId,
    Name: payload.Name,
    URL: url,
    Type: endpointType,
    ContainerEngine: payload.ContainerEngine,
    GroupID: payload.GroupID as EndpointGroupID,
    PublicURL: normalizePublicURL(payload.PublicURL, url),
    Gpus: [...payload.Gpus],
    TLSConfig: {
      TLS: payload.TLS,
      TLSSkipVerify: payload.TLSSkipVerify,
      TLSSkipClientVerify: payload.TLSSkipClientVerify,
      TLSCACertPath: payload.TLSCACertFile ? "<uploaded-ca>" : "",
      TLSCertPath: payload.TLSCertFile ? "<uploaded-cert>" : "",
      TLSKeyPath: payload.TLSKeyFile ? "<uploaded-key>" : "",
    },
    AzureCredentials: {
      ApplicationID: "",
      TenantID: "",
      AuthenticationKey: "",
    },
    TagIDs: [...payload.TagIDs],
    Status: EndpointStatus.Up,
    Snapshots: [] as DockerSnapshot[],
    UserAccessPolicies: {} as UserAccessPolicies,
    TeamAccessPolicies: {} as TeamAccessPolicies,
    EdgeID: "",
    EdgeKey: "",
    EdgeCheckinInterval: 0,
    Kubernetes: cloneKubernetesData((ctx.defaultKubernetesData ?? defaultKubernetesData)()),
    LastCheckInDate: 0,
    UserTrusted: false,
    Edge: { AsyncMode: false, PingInterval: -1, SnapshotInterval: -1, CommandInterval: -1 },
    Agent: { Version: agentVersion },
  });

  return { endpoint, relation: createRelation(endpoint.ID) };
}

export function normalizeEndpointCreatePayload(payload: EndpointCreatePayload, runtimePlatform: NodeJS.Platform = process.platform): EndpointCreatePayload {
  assertContainerEngine(payload.ContainerEngine);

  const normalized: EndpointCreatePayload = {
    ...payload,
    Name: payload.Name.trim(),
    URL: payload.URL.trim(),
    PublicURL: payload.PublicURL.trim(),
    GroupID: payload.GroupID || 1,
    TagIDs: payload.TagIDs ?? [],
    Gpus: payload.Gpus ?? [],
    TLS: Boolean(payload.TLS),
    TLSSkipVerify: Boolean(payload.TLSSkipVerify),
    TLSSkipClientVerify: Boolean(payload.TLSSkipClientVerify),
    TLSCACertFile: payload.TLSCACertFile ?? null,
    TLSCertFile: payload.TLSCertFile ?? null,
    TLSKeyFile: payload.TLSKeyFile ?? null,
    AzureApplicationID: payload.AzureApplicationID ?? "",
    AzureTenantID: payload.AzureTenantID ?? "",
    AzureAuthenticationKey: payload.AzureAuthenticationKey ?? "",
    EdgeCheckinInterval: payload.EdgeCheckinInterval || 0,
    ContainerEngine: payload.ContainerEngine,
  };

  if (!normalized.Name) {
    throw new Error("invalid environment name");
  }

  if (normalized.EndpointCreationType === EndpointCreationTypeEnum.EdgeAgentEnvironment && normalized.TLS) {
    throw new Error("TLS is not supported for Edge Agent environments");
  }

  if (normalized.EndpointCreationType === EndpointCreationTypeEnum.EdgeAgentEnvironment) {
    normalized.URL = normalized.URL || "";
  } else if (!normalized.URL) {
    normalized.URL = normalized.EndpointCreationType === EndpointCreationTypeEnum.LocalKubernetesEnvironment
      ? "https://kubernetes.default.svc"
      : defaultDockerUrl(runtimePlatform);
  }

  if (normalized.EndpointCreationType === EndpointCreationTypeEnum.AzureEnvironment) {
    normalized.URL = normalized.URL || "https://management.azure.com";
  }

  if (normalized.EndpointCreationType === EndpointCreationTypeEnum.EdgeAgentEnvironment) {
    if (!normalized.URL) {
      throw new Error("URL cannot be empty");
    }
    normalized.URL = normalized.URL.trim();
  }

  return normalized;
}

export function createEndpointFromPayload(payload: EndpointCreatePayload, ctx: EndpointCreationContext): EndpointCreationResult {
  const normalized = normalizeEndpointCreatePayload(payload, ctx.runtimePlatform);

  switch (normalized.EndpointCreationType) {
    case EndpointCreationTypeEnum.AzureEnvironment:
      return createAzureEndpoint(normalized, ctx);
    case EndpointCreationTypeEnum.EdgeAgentEnvironment:
      return createEdgeEndpoint(normalized, ctx);
    case EndpointCreationTypeEnum.LocalKubernetesEnvironment:
      return createKubernetesEndpoint(normalized, ctx);
    case EndpointCreationTypeEnum.AgentEnvironment:
      if (normalized.TLS) {
        return createTlsDockerOrAgentEndpoint(normalized, ctx);
      }
      return createLocalDockerEndpoint(normalized, ctx);
    default:
      if (normalized.TLS) {
        return createTlsDockerOrAgentEndpoint(normalized, ctx);
      }
      return createLocalDockerEndpoint(normalized, ctx);
  }
}

export function buildEndpointRelation(endpointID: EndpointID): EndpointRelation {
  return createRelation(endpointID);
}
