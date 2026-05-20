export type EndpointID = number;
export type EndpointGroupID = number;
export type EdgeGroupID = number;
export type EdgeStackID = number;
export type StackID = number;
export type TagID = number;

export const ContainerEngineDocker = "docker" as const;
export const ContainerEnginePodman = "podman" as const;
export type ContainerEngine = typeof ContainerEngineDocker | typeof ContainerEnginePodman;

export const PortainerAgentTargetHeader = "X-PortainerAgent-Target";
export const PortainerAgentSignatureHeader = "X-PortainerAgent-Signature";
export const PortainerAgentPublicKeyHeader = "X-PortainerAgent-PublicKey";
export const PortainerAgentSignatureMessage = "Portainer-App";
export const HTTPResponseAgentPlatform = "Portainer-Agent-Platform";
export const PortainerAgentHeader = "Portainer-Agent";
export const PortainerAgentEdgeIDHeader = "X-PortainerAgent-EdgeID";
export const PortainerAgentKubernetesSATokenHeader = "X-PortainerAgent-SA-Token";
export const HTTPAlertStateHeaderName = "X-PortainerAgent-AlertState";
export const DefaultSnapshotInterval = "5m";
export const DefaultEdgeAgentCheckinIntervalInSeconds = 5;

export enum EndpointStatus {
  Up = 1,
  Down = 2,
}

export enum EndpointType {
  DockerEnvironment = 1,
  AgentOnDockerEnvironment = 2,
  AzureEnvironment = 3,
  EdgeAgentOnDockerEnvironment = 4,
  KubernetesLocalEnvironment = 5,
  AgentOnKubernetesEnvironment = 6,
  EdgeAgentOnKubernetesEnvironment = 7,
}

export enum PlatformType {
  DockerPlatformType = 0,
  KubernetesPlatformType = 1,
  AzurePlatformType = 2,
  PodmanPlatformType = 3,
  UnknownPlatformType = 4,
}

export enum MembershipRole {
  TeamLeader = 1,
  TeamMember = 2,
}

export enum ResourceAccessLevel {
  ReadWriteAccessLevel = 1,
}

export enum ResourceControlType {
  ContainerResourceControl = 1,
  ServiceResourceControl = 2,
  VolumeResourceControl = 3,
  NetworkResourceControl = 4,
  SecretResourceControl = 5,
  StackResourceControl = 6,
  ConfigResourceControl = 7,
  CustomTemplateResourceControl = 8,
  ContainerGroupResourceControl = 9,
}

export enum StackType {
  DockerSwarmStack = 1,
  DockerComposeStack = 2,
  KubernetesStack = 3,
}

export enum StackStatus {
  Active = 1,
  Inactive = 2,
  Deploying = 3,
  Error = 4,
}

export enum TemplateType {
  ContainerTemplate = 1,
  SwarmStackTemplate = 2,
  ComposeStackTemplate = 3,
}

export enum TLSFileType {
  CA = 0,
  Cert = 1,
  Key = 2,
}

export enum EdgeStackDeploymentType {
  Compose = 0,
  Kubernetes = 1,
}

export enum EdgeStackStatusType {
  Pending = 0,
  DeploymentReceived = 1,
  Error = 2,
  Acknowledged = 3,
  Removed = 4,
  RemoteUpdateSuccess = 5,
  ImagesPulled = 6,
  Running = 7,
  Deploying = 8,
  Removing = 9,
  PausedDeploying = 10,
  RollingBack = 11,
  RolledBack = 12,
  Completed = 13,
}

const edgeStackStatusLabels: Record<EdgeStackStatusType, string> = {
  [EdgeStackStatusType.Pending]: "Pending",
  [EdgeStackStatusType.DeploymentReceived]: "DeploymentReceived",
  [EdgeStackStatusType.Error]: "Error",
  [EdgeStackStatusType.Acknowledged]: "Acknowledged",
  [EdgeStackStatusType.Removed]: "Removed",
  [EdgeStackStatusType.RemoteUpdateSuccess]: "RemoteUpdateSuccess",
  [EdgeStackStatusType.ImagesPulled]: "ImagesPulled",
  [EdgeStackStatusType.Running]: "Running",
  [EdgeStackStatusType.Deploying]: "Deploying",
  [EdgeStackStatusType.Removing]: "Removing",
  [EdgeStackStatusType.PausedDeploying]: "PausedDeploying",
  [EdgeStackStatusType.RollingBack]: "RollingBack",
  [EdgeStackStatusType.RolledBack]: "RolledBack",
  [EdgeStackStatusType.Completed]: "Completed",
};

export function formatEdgeStackStatus(status: EdgeStackStatusType): string {
  const label = edgeStackStatusLabels[status];
  return label ? `${status} (${label})` : `${status} (UNKNOWN)`;
}

export interface Pair {
  name: string;
  value: string;
}

export interface TLSConfiguration {
  TLS: boolean;
  TLSSkipVerify: boolean;
  TLSSkipClientVerify: boolean;
  TLSCACertPath: string;
  TLSCertPath: string;
  TLSKeyPath: string;
}

export interface AzureCredentials {
  ApplicationID: string;
  TenantID: string;
  AuthenticationKey: string;
}

export interface UserAccessPolicy {
  AccessLevel?: ResourceAccessLevel;
}

export type UserAccessPolicies = Record<number, UserAccessPolicy>;

export interface TeamAccessPolicy {
  Role?: MembershipRole;
  AccessLevel?: ResourceAccessLevel;
}

export type TeamAccessPolicies = Record<number, TeamAccessPolicy>;

export interface EndpointSecuritySettings {
  AllowBindMountsForRegularUsers: boolean;
  AllowContainerCapabilitiesForRegularUsers: boolean;
  AllowDeviceMappingForRegularUsers: boolean;
  AllowHostNamespaceForRegularUsers: boolean;
  AllowPrivilegedModeForRegularUsers: boolean;
  AllowSysctlSettingForRegularUsers: boolean;
  AllowSecurityOptForRegularUsers: boolean;
  AllowVolumeBrowserForRegularUsers: boolean;
  EnableHostManagementFeatures: boolean;
  AllowStackManagementForRegularUsers: boolean;
}

export function defaultEndpointSecuritySettings(): EndpointSecuritySettings {
  return {
    AllowBindMountsForRegularUsers: false,
    AllowContainerCapabilitiesForRegularUsers: false,
    AllowDeviceMappingForRegularUsers: false,
    AllowHostNamespaceForRegularUsers: false,
    AllowPrivilegedModeForRegularUsers: false,
    AllowSysctlSettingForRegularUsers: false,
    AllowSecurityOptForRegularUsers: false,
    AllowVolumeBrowserForRegularUsers: false,
    EnableHostManagementFeatures: false,
    AllowStackManagementForRegularUsers: true,
  };
}

export const DefaultEndpointSecuritySettings = defaultEndpointSecuritySettings;

export interface KubernetesConfiguration {
  RestrictDefaultNamespace: boolean;
  IngressClasses: string[];
  StorageClasses: string[];
}

export interface KubernetesFlags {
  EnableIngressClassLookup: boolean;
  EnableMetrics: boolean;
  EnableStorageClassLookup: boolean;
}

export interface KubernetesData {
  Configuration: KubernetesConfiguration;
  Flags: KubernetesFlags;
}

export function defaultKubernetesData(): KubernetesData {
  return {
    Configuration: {
      RestrictDefaultNamespace: false,
      IngressClasses: [],
      StorageClasses: [],
    },
    Flags: {
      EnableIngressClassLookup: false,
      EnableMetrics: false,
      EnableStorageClassLookup: false,
    },
  };
}

export const KubernetesDefault = defaultKubernetesData;

export interface AgentState {
  Version: string;
}

export interface EdgeState {
  AsyncMode: boolean;
  PingInterval: number;
  SnapshotInterval: number;
  CommandInterval: number;
}

export interface EndpointPostInitMigrations {
  [key: string]: boolean;
}

export interface DockerSnapshot {
  [key: string]: unknown;
}

export interface Endpoint {
  ID: EndpointID;
  Name: string;
  URL: string;
  Type: EndpointType;
  ContainerEngine: ContainerEngine | "";
  GroupID: EndpointGroupID;
  PublicURL: string;
  Gpus: Pair[];
  TLSConfig: TLSConfiguration;
  AzureCredentials: AzureCredentials;
  TagIDs: TagID[];
  Status: EndpointStatus;
  Snapshots: DockerSnapshot[];
  UserAccessPolicies: UserAccessPolicies;
  TeamAccessPolicies: TeamAccessPolicies;
  EdgeID: string;
  EdgeKey: string;
  EdgeCheckinInterval: number;
  Kubernetes: KubernetesData;
  ComposeSyntaxMaxVersion: string;
  SecuritySettings: EndpointSecuritySettings;
  LastCheckInDate: number;
  Heartbeat: boolean;
  UserTrusted: boolean;
  PostInitMigrations: EndpointPostInitMigrations;
  Edge: EdgeState;
  Agent: AgentState;
  EnableGPUManagement: boolean;
}

export interface EndpointGroup {
  ID: EndpointGroupID;
  Name: string;
  TagIDs: TagID[];
  UserAccessPolicies: UserAccessPolicies;
  TeamAccessPolicies: TeamAccessPolicies;
}

export interface EdgeGroup {
  ID: EdgeGroupID;
  Name: string;
  Dynamic: boolean;
  TagIDs: TagID[];
  PartialMatch: boolean;
  EndpointIDs: Record<EndpointID, boolean>;
}

export interface EdgeStackDeploymentStatus {
  Type: EdgeStackStatusType;
}

export interface EdgeStackStatusForEnv {
  Status: EdgeStackDeploymentStatus[];
}

export interface EdgeStack {
  ID: EdgeStackID;
  Name: string;
  EdgeGroups: EdgeGroupID[];
}

export interface EndpointRelation {
  EndpointID: EndpointID;
  EdgeStacks: Record<EdgeStackID, boolean>;
}

export interface ResourceControl {
  ID: number;
  ResourceID: string;
  Type: ResourceControlType;
}

export interface StackGitAuthentication {
  Password: string;
}

export interface StackGitConfig {
  Authentication?: StackGitAuthentication | null;
}

export interface Stack {
  ID: StackID;
  Name: string;
  EndpointID: EndpointID;
  SwarmID: string;
  Type: StackType;
  Status: StackStatus;
  CreationDate: number;
  CreatedBy: string;
  UpdateDate: number;
  UpdatedBy: string;
  ResourceControl?: ResourceControl | null;
  GitConfig?: StackGitConfig | null;
}

export interface EdgeStackStatusLookup {
  [endpointID: number]: EdgeStackStatusForEnv | undefined;
}

export interface Settings {
  EnforceEdgeID: boolean;
  EdgeAgentCheckinInterval: number;
  Edge: {
    PingInterval: number;
    SnapshotInterval: number;
    CommandInterval: number;
  };
}

export const defaultEdgeOnlinePolicy = {
  multiplier: 1,
  offsetSeconds: 0,
} as const;

export interface EdgeOnlinePolicy {
  multiplier: number;
  offsetSeconds: number;
}

export function isEdgeEndpoint(endpoint: Pick<Endpoint, "Type">): boolean {
  return (
    endpoint.Type === EndpointType.EdgeAgentOnDockerEnvironment ||
    endpoint.Type === EndpointType.EdgeAgentOnKubernetesEnvironment
  );
}

export function isAgentEndpoint(endpoint: Pick<Endpoint, "Type">): boolean {
  return (
    endpoint.Type === EndpointType.AgentOnDockerEnvironment ||
    endpoint.Type === EndpointType.AgentOnKubernetesEnvironment
  );
}

export function isKubernetesEndpoint(endpoint: Pick<Endpoint, "Type">): boolean {
  return (
    endpoint.Type === EndpointType.KubernetesLocalEnvironment ||
    endpoint.Type === EndpointType.AgentOnKubernetesEnvironment ||
    endpoint.Type === EndpointType.EdgeAgentOnKubernetesEnvironment
  );
}

export function isLocalEndpoint(endpoint: Pick<Endpoint, "Type">): boolean {
  return (
    endpoint.Type === EndpointType.DockerEnvironment ||
    endpoint.Type === EndpointType.KubernetesLocalEnvironment
  );
}

export function endpointPlatformType(endpoint: Pick<Endpoint, "Type" | "ContainerEngine">): PlatformType {
  if (endpoint.Type === EndpointType.AzureEnvironment) {
    return PlatformType.AzurePlatformType;
  }

  if (isKubernetesEndpoint(endpoint)) {
    return PlatformType.KubernetesPlatformType;
  }

  if (endpoint.ContainerEngine === ContainerEnginePodman) {
    return PlatformType.PodmanPlatformType;
  }

  if (
    endpoint.Type === EndpointType.DockerEnvironment ||
    endpoint.Type === EndpointType.AgentOnDockerEnvironment ||
    endpoint.Type === EndpointType.EdgeAgentOnDockerEnvironment
  ) {
    return PlatformType.DockerPlatformType;
  }

  return PlatformType.UnknownPlatformType;
}

export function resourceControlId(endpointID: EndpointID, name: string): string {
  return `${endpointID}_${name}`;
}

export function getShortestAsyncInterval(endpoint: Pick<Endpoint, "Edge">, settings: Pick<Settings, "Edge">): number {
  const useDefault = -1;
  const pingInterval = endpoint.Edge.PingInterval === useDefault ? settings.Edge.PingInterval : endpoint.Edge.PingInterval;
  const snapshotInterval = endpoint.Edge.SnapshotInterval === useDefault ? settings.Edge.SnapshotInterval : endpoint.Edge.SnapshotInterval;
  const commandInterval = endpoint.Edge.CommandInterval === useDefault ? settings.Edge.CommandInterval : endpoint.Edge.CommandInterval;
  return Math.min(pingInterval, snapshotInterval, commandInterval);
}

export function resolveEdgeEndpointStatus(
  endpoint: Pick<Endpoint, "Type" | "EdgeCheckinInterval" | "LastCheckInDate" | "Edge">,
  settings: Pick<Settings, "EdgeAgentCheckinInterval" | "Edge">,
  nowEpochSeconds = Math.floor(Date.now() / 1000),
  policy: EdgeOnlinePolicy = defaultEdgeOnlinePolicy,
): EndpointStatus {
  if (!isEdgeEndpoint(endpoint)) {
    return EndpointStatus.Up;
  }

  let edgeCheckinInterval = endpoint.EdgeCheckinInterval;
  if (edgeCheckinInterval === 0) {
    edgeCheckinInterval = settings.EdgeAgentCheckinInterval;
  }

  if (endpoint.Edge.AsyncMode) {
    edgeCheckinInterval = getShortestAsyncInterval(endpoint, settings);
  }

  if (edgeCheckinInterval === 0 || endpoint.LastCheckInDate === 0) {
    return EndpointStatus.Down;
  }

  const threshold = edgeCheckinInterval * policy.multiplier + policy.offsetSeconds;
  return nowEpochSeconds - endpoint.LastCheckInDate <= threshold ? EndpointStatus.Up : EndpointStatus.Down;
}

export function cloneTlsConfiguration(config: TLSConfiguration): TLSConfiguration {
  return { ...config };
}

export function cloneAzureCredentials(credentials: AzureCredentials): AzureCredentials {
  return { ...credentials };
}

export function cloneKubernetesData(data: KubernetesData): KubernetesData {
  return {
    Configuration: {
      RestrictDefaultNamespace: data.Configuration.RestrictDefaultNamespace,
      IngressClasses: [...data.Configuration.IngressClasses],
      StorageClasses: [...data.Configuration.StorageClasses],
    },
    Flags: { ...data.Flags },
  };
}

export function cloneEndpoint(endpoint: Endpoint): Endpoint {
  return {
    ...endpoint,
    Gpus: [...endpoint.Gpus],
    TLSConfig: cloneTlsConfiguration(endpoint.TLSConfig),
    AzureCredentials: cloneAzureCredentials(endpoint.AzureCredentials),
    TagIDs: [...endpoint.TagIDs],
    Snapshots: [...endpoint.Snapshots],
    UserAccessPolicies: { ...endpoint.UserAccessPolicies },
    TeamAccessPolicies: { ...endpoint.TeamAccessPolicies },
    Kubernetes: cloneKubernetesData(endpoint.Kubernetes),
    SecuritySettings: { ...endpoint.SecuritySettings },
    PostInitMigrations: { ...endpoint.PostInitMigrations },
    Edge: { ...endpoint.Edge },
    Agent: { ...endpoint.Agent },
  };
}
