import { isDeepStrictEqual } from "node:util";

import {
  AzureCredentials,
  cloneAzureCredentials,
  cloneEndpoint,
  cloneKubernetesData,
  Endpoint,
  EndpointStatus,
  EndpointType,
  isEdgeEndpoint,
  isKubernetesEndpoint,
  isLocalEndpoint,
  KubernetesData,
  Pair,
  TeamAccessPolicies,
  UserAccessPolicies,
} from "../../../portainer";

export interface EndpointUpdatePayload {
  Name?: string;
  URL?: string;
  PublicURL?: string;
  Gpus?: Pair[] | null;
  GroupID?: number;
  TLS?: boolean;
  TLSSkipVerify?: boolean;
  TLSSkipClientVerify?: boolean;
  Status?: number;
  AzureApplicationID?: string;
  AzureTenantID?: string;
  AzureAuthenticationKey?: string;
  TagIDs?: number[] | null;
  UserAccessPolicies?: UserAccessPolicies | null;
  TeamAccessPolicies?: TeamAccessPolicies | null;
  EdgeCheckinInterval?: number;
  Kubernetes?: KubernetesData | null;
}

export interface TLSFileMutation {
  action: "delete" | "set";
  file: "ca" | "cert" | "key";
}

export interface EndpointUpdateContext {
  authenticateAzure?: (credentials: AzureCredentials) => void | Promise<void>;
}

export interface EndpointUpdateResult {
  endpoint: Endpoint;
  reloadProxy: boolean;
  updateRelations: boolean;
  updateAuthorizations: boolean;
  tlsFileMutations: TLSFileMutation[];
}

function deepEqual<T>(left: T, right: T): boolean {
  return isDeepStrictEqual(left, right);
}

function updateTlsPaths(
  endpoint: Endpoint,
  payload: EndpointUpdatePayload,
  tlsFileMutations: TLSFileMutation[],
): void {
  const folder = String(endpoint.ID);
  void folder;

  if (payload.TLS === undefined) {
    return;
  }

  if (payload.TLS) {
    endpoint.TLSConfig.TLS = true;

    if (payload.TLSSkipVerify !== undefined) {
      endpoint.TLSConfig.TLSSkipVerify = payload.TLSSkipVerify;
      if (payload.TLSSkipVerify) {
        endpoint.TLSConfig.TLSCACertPath = "";
        tlsFileMutations.push({ action: "delete", file: "ca" });
      }
    }

    if (payload.TLSSkipClientVerify !== undefined) {
      endpoint.TLSConfig.TLSSkipClientVerify = payload.TLSSkipClientVerify;
      if (payload.TLSSkipClientVerify) {
        endpoint.TLSConfig.TLSCertPath = "";
        endpoint.TLSConfig.TLSKeyPath = "";
        tlsFileMutations.push({ action: "delete", file: "cert" }, { action: "delete", file: "key" });
      }
    }
  } else {
    endpoint.TLSConfig.TLS = false;
    endpoint.TLSConfig.TLSSkipVerify = false;
    endpoint.TLSConfig.TLSSkipClientVerify = false;
    endpoint.TLSConfig.TLSCACertPath = "";
    endpoint.TLSConfig.TLSCertPath = "";
    endpoint.TLSConfig.TLSKeyPath = "";
    tlsFileMutations.push(
      { action: "delete", file: "ca" },
      { action: "delete", file: "cert" },
      { action: "delete", file: "key" },
    );
  }

  const isStandardKubeAgent = !isLocalEndpoint(endpoint) && isKubernetesEndpoint(endpoint) && !isEdgeEndpoint(endpoint);
  if (isStandardKubeAgent) {
    endpoint.TLSConfig.TLS = true;
    endpoint.TLSConfig.TLSSkipVerify = true;
  }
}

export function shouldReloadTLSConfiguration(endpoint: Endpoint, payload: EndpointUpdatePayload): boolean {
  if (payload.TLS !== undefined && endpoint.TLSConfig.TLS !== payload.TLS) {
    return true;
  }

  if (
    endpoint.Type !== EndpointType.DockerEnvironment ||
    (payload.URL !== undefined && !payload.URL.startsWith("tcp://")) ||
    payload.TLS === undefined ||
    !payload.TLS
  ) {
    return false;
  }

  if (payload.TLSSkipVerify !== undefined && !payload.TLSSkipVerify) {
    return true;
  }

  return payload.TLSSkipClientVerify !== undefined && !payload.TLSSkipClientVerify;
}

export function applyEndpointUpdate(endpoint: Endpoint, payload: EndpointUpdatePayload, ctx: EndpointUpdateContext = {}): EndpointUpdateResult {
  const next = cloneEndpoint(endpoint);
  const tlsFileMutations: TLSFileMutation[] = [];

  let reloadProxy = shouldReloadTLSConfiguration(next, payload);
  let updateRelations = false;
  let updateAuthorizations = false;

  if (payload.Name !== undefined) {
    next.Name = payload.Name;
  }

  if (payload.URL !== undefined && payload.URL !== next.URL) {
    next.URL = payload.URL;
    reloadProxy = true;
  }

  if (payload.Gpus !== undefined && payload.Gpus !== null) {
    next.Gpus = [...payload.Gpus];
  }

  if (payload.PublicURL !== undefined) {
    next.PublicURL = payload.PublicURL;
  }

  if (payload.EdgeCheckinInterval !== undefined) {
    next.EdgeCheckinInterval = payload.EdgeCheckinInterval;
  }

  if (payload.GroupID !== undefined) {
    const groupID = payload.GroupID;
    updateRelations = updateRelations || groupID !== next.GroupID;
    next.GroupID = groupID;
  }

  if (payload.TagIDs !== undefined && payload.TagIDs !== null) {
    updateRelations = updateRelations || !deepEqual(payload.TagIDs, next.TagIDs);
    next.TagIDs = [...payload.TagIDs];
  }

  if (payload.Kubernetes !== undefined && payload.Kubernetes !== null) {
    if (payload.Kubernetes.Configuration.RestrictDefaultNamespace !== next.Kubernetes.Configuration.RestrictDefaultNamespace) {
      updateAuthorizations = true;
    }

    next.Kubernetes = cloneKubernetesData(payload.Kubernetes);
  }

  if (payload.UserAccessPolicies !== undefined && payload.UserAccessPolicies !== null && !deepEqual(payload.UserAccessPolicies, next.UserAccessPolicies)) {
    updateAuthorizations = true;
    next.UserAccessPolicies = { ...payload.UserAccessPolicies };
  }

  if (payload.TeamAccessPolicies !== undefined && payload.TeamAccessPolicies !== null && !deepEqual(payload.TeamAccessPolicies, next.TeamAccessPolicies)) {
    updateAuthorizations = true;
    next.TeamAccessPolicies = { ...payload.TeamAccessPolicies };
  }

  if (payload.Status !== undefined) {
    if (payload.Status === 1) {
      next.Status = EndpointStatus.Up;
    } else if (payload.Status === 2) {
      next.Status = EndpointStatus.Down;
    }
  }

  if (next.Type === EndpointType.AzureEnvironment) {
    reloadProxy = true;
    const credentials = cloneAzureCredentials(next.AzureCredentials);

    if (payload.AzureApplicationID !== undefined) {
      credentials.ApplicationID = payload.AzureApplicationID;
    }
    if (payload.AzureTenantID !== undefined) {
      credentials.TenantID = payload.AzureTenantID;
    }
    if (payload.AzureAuthenticationKey !== undefined) {
      credentials.AuthenticationKey = payload.AzureAuthenticationKey;
    }

    void ctx.authenticateAzure?.(credentials);
    next.AzureCredentials = credentials;
  }

  if (payload.TLS !== undefined) {
    updateTlsPaths(next, payload, tlsFileMutations);
  }

  return {
    endpoint: next,
    reloadProxy,
    updateRelations,
    updateAuthorizations,
    tlsFileMutations,
  };
}

export function cloneEndpointForUpdate(endpoint: Endpoint): Endpoint {
  return cloneEndpoint(endpoint);
}
