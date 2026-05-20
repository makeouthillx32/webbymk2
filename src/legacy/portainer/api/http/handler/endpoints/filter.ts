import {
  defaultEdgeOnlinePolicy,
  EdgeGroup,
  EdgeOnlinePolicy,
  EdgeStackStatusLookup,
  EdgeStackStatusType,
  endpointPlatformType,
  Endpoint,
  EndpointGroup,
  EndpointStatus,
  EndpointType,
  getShortestAsyncInterval,
  isAgentEndpoint,
  isEdgeEndpoint,
  PlatformType,
  Settings,
  TagID,
  resolveEdgeEndpointStatus,
} from "../../../portainer";

export interface EnvironmentQuery {
  search: string;
  types: EndpointType[];
  platformTypes: PlatformType[];
  tagIds: TagID[];
  endpointIds: number[];
  tagsPartialMatch: boolean;
  groupIds: number[];
  status: EndpointStatus[];
  edgeAsync?: boolean;
  edgeDeviceUntrusted: boolean;
  excludeSnapshots: boolean;
  name: string;
  agentVersions: string[];
  outdated: boolean;
  edgeCheckInPassedSeconds: number;
  edgeStackId: number;
  edgeStackStatus?: EdgeStackStatusType;
  excludeIds: number[];
  excludeGroupIds: number[];
  edgeGroupIds: number[];
  excludeEdgeGroupIds: number[];
}

export interface EnvironmentFilterContext {
  settings: Settings;
  isAdmin?: boolean;
  now?: number;
  endpointGroups?: EndpointGroup[];
  edgeGroups?: EdgeGroup[];
  tagNameById?: Record<number, string>;
  edgeOnlinePolicy?: EdgeOnlinePolicy;
  isOutdatedEndpoint?: (endpoint: Endpoint) => boolean;
  edgeStackEndpointIdsByStackId?: Record<number, number[]>;
  edgeStackStatusByEndpointIdByStackId?: Record<number, EdgeStackStatusLookup>;
}

function parseBoolean(value: string | undefined): boolean {
  return value === "true";
}

function getValues(source: URLSearchParams | Record<string, string | string[] | undefined>, key: string): string[] {
  if (source instanceof URLSearchParams) {
    const plural = source.getAll(`${key}[]`);
    if (plural.length > 0) return plural;
    const single = source.getAll(key);
    if (single.length > 0) return single;
    const value = source.get(key);
    return value ? [value] : [];
  }

  const plural = source[`${key}[]`];
  if (Array.isArray(plural)) return plural;
  if (typeof plural === "string") return [plural];

  const value = source[key];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return [value];
  return [];
}

function getString(source: URLSearchParams | Record<string, string | string[] | undefined>, key: string): string {
  if (source instanceof URLSearchParams) {
    return source.get(key) ?? "";
  }

  const value = source[key];
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? "" : "";
}

function getBoolean(source: URLSearchParams | Record<string, string | string[] | undefined>, key: string): boolean {
  return parseBoolean(getString(source, key));
}

function getNumber(source: URLSearchParams | Record<string, string | string[] | undefined>, key: string): number {
  const raw = getString(source, key);
  if (!raw) return 0;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`failed parsing ${key}: invalid number`);
  }
  return parsed;
}

function getNumberArray(source: URLSearchParams | Record<string, string | string[] | undefined>, key: string): number[] {
  return getValues(source, key).map((item) => {
    const parsed = Number(item);
    if (!Number.isFinite(parsed)) {
      throw new Error(`Unable to parse parameter ${key}`);
    }
    return parsed;
  });
}

function getStringArray(source: URLSearchParams | Record<string, string | string[] | undefined>, key: string): string[] {
  return getValues(source, key);
}

export function parseEnvironmentQuery(source: URLSearchParams | Record<string, string | string[] | undefined>): EnvironmentQuery {
  const search = getString(source, "search").toLowerCase();
  const status = getNumberArray(source, "status") as EndpointStatus[];
  const groupIds = getNumberArray(source, "groupIds");
  const types = getNumberArray(source, "types") as EndpointType[];
  const platformTypes = getNumberArray(source, "platformTypes") as PlatformType[];
  const tagIds = getNumberArray(source, "tagIds") as TagID[];
  const endpointIds = getNumberArray(source, "endpointIds");
  const excludeIds = getNumberArray(source, "excludeIds");
  const excludeGroupIds = getNumberArray(source, "excludeGroupIds");
  const edgeGroupIds = getNumberArray(source, "edgeGroupIds");
  const excludeEdgeGroupIds = getNumberArray(source, "excludeEdgeGroupIds");
  const tagsPartialMatch = getBoolean(source, "tagsPartialMatch");
  const agentVersions = getStringArray(source, "agentVersions");
  const outdated = getBoolean(source, "outdated");
  const name = getString(source, "name");
  const edgeAsyncRaw = getString(source, "edgeAsync");
  const edgeAsync = edgeAsyncRaw === "" ? undefined : edgeAsyncRaw === "true";
  const edgeDeviceUntrusted = getBoolean(source, "edgeDeviceUntrusted");
  const excludeSnapshots = getBoolean(source, "excludeSnapshots");
  const edgeCheckInPassedSeconds = getNumber(source, "edgeCheckInPassedSeconds");
  const edgeStackId = getNumber(source, "edgeStackId");
  const edgeStackStatusRaw = getString(source, "edgeStackStatus");
  const edgeStackStatus = edgeStackStatusRaw === "" ? undefined : Number(edgeStackStatusRaw) as EdgeStackStatusType;

  if (edgeStackStatus !== undefined && !Number.isFinite(edgeStackStatus)) {
    throw new Error("failed parsing edgeStackStatus: invalid number");
  }

  return {
    search,
    types,
    platformTypes,
    tagIds,
    endpointIds,
    tagsPartialMatch,
    groupIds,
    status,
    edgeAsync,
    edgeDeviceUntrusted,
    excludeSnapshots,
    name,
    agentVersions,
    outdated,
    edgeCheckInPassedSeconds,
    edgeStackId,
    edgeStackStatus,
    excludeIds,
    excludeGroupIds,
    edgeGroupIds,
    excludeEdgeGroupIds,
  };
}

function filterByIds<T extends { ID: number }>(items: T[], ids: number[]): T[] {
  if (ids.length === 0) return items;
  const idSet = new Set(ids);
  return items.filter((item) => idSet.has(item.ID));
}

function filterByField<T>(items: T[], predicate: (item: T) => boolean): T[] {
  return items.filter(predicate);
}

function matchIgnoreCase(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle);
}

function endpointMatchSearchCriteria(endpoint: Endpoint, tagNameById: Record<number, string>, searchCriteria: string): boolean {
  if (matchIgnoreCase(endpoint.Name, searchCriteria)) return true;
  if (matchIgnoreCase(endpoint.URL, searchCriteria)) return true;
  if (endpoint.Status === EndpointStatus.Up && searchCriteria === "up") return true;
  if (endpoint.Status === EndpointStatus.Down && searchCriteria === "down") return true;

  for (const tagID of endpoint.TagIDs) {
    if (matchIgnoreCase(tagNameById[tagID] ?? "", searchCriteria)) return true;
  }

  return false;
}

function endpointGroupMatchSearchCriteria(endpoint: Endpoint, endpointGroups: EndpointGroup[], tagNameById: Record<number, string>, searchCriteria: string): boolean {
  const group = endpointGroups.find((candidate) => candidate.ID === endpoint.GroupID);
  if (!group) return false;

  if (matchIgnoreCase(group.Name, searchCriteria)) return true;

  for (const tagID of group.TagIDs) {
    if (matchIgnoreCase(tagNameById[tagID] ?? "", searchCriteria)) return true;
  }

  return false;
}

function edgeGroupMatchSearchCriteria(endpoint: Endpoint, edgeGroups: EdgeGroup[], searchCriteria: string): boolean {
  for (const edgeGroup of edgeGroups) {
    if (!edgeGroup.EndpointIDs[endpoint.ID]) continue;
    if (matchIgnoreCase(edgeGroup.Name, searchCriteria)) return true;
  }
  return false;
}

function filterEndpointsBySearchCriteria(endpoints: Endpoint[], endpointGroups: EndpointGroup[], edgeGroups: EdgeGroup[], tagNameById: Record<number, string>, searchCriteria: string): Endpoint[] {
  return endpoints.filter((endpoint) => {
    return (
      endpointMatchSearchCriteria(endpoint, tagNameById, searchCriteria) ||
      endpointGroupMatchSearchCriteria(endpoint, endpointGroups, tagNameById, searchCriteria) ||
      edgeGroupMatchSearchCriteria(endpoint, edgeGroups, searchCriteria)
    );
  });
}

function filterEndpointsByStatuses(endpoints: Endpoint[], statuses: EndpointStatus[], settings: Settings, now: number, policy: EdgeOnlinePolicy): Endpoint[] {
  const statusSet = new Set(statuses);
  return endpoints.filter((endpoint) => {
    const status = resolveEdgeEndpointStatus(endpoint, settings, now, policy);
    return statusSet.has(status);
  });
}

function filterEndpointsByGroupIDs(endpoints: Endpoint[], endpointGroupIDs: number[]): Endpoint[] {
  return filterByField(endpoints, (endpoint) => endpointGroupIDs.includes(endpoint.GroupID));
}

function filterEndpointsByEdgeGroupIDs(endpoints: Endpoint[], edgeGroups: EdgeGroup[], edgeGroupIDs: number[]): [Endpoint[], EdgeGroup[]] {
  const edgeGroupIDSet = new Set(edgeGroupIDs);
  const filteredEdgeGroups = edgeGroups.filter((group) => edgeGroupIDSet.has(group.ID));
  const endpointIDs = new Set<number>();

  for (const edgeGroup of filteredEdgeGroups) {
    for (const endpointID of Object.keys(edgeGroup.EndpointIDs)) {
      if (edgeGroup.EndpointIDs[Number(endpointID)]) {
        endpointIDs.add(Number(endpointID));
      }
    }
  }

  return [endpoints.filter((endpoint) => endpointIDs.has(endpoint.ID)), filteredEdgeGroups];
}

function filterEndpointsByExcludeEdgeGroupIDs(endpoints: Endpoint[], edgeGroups: EdgeGroup[], excludeEdgeGroupIds: number[]): [Endpoint[], EdgeGroup[]] {
  const excludeEdgeGroupIDSet = new Set(excludeEdgeGroupIds);
  const excludedEndpointIDs = new Set<number>();
  const filteredEdgeGroups = edgeGroups.filter((group) => {
    if (excludeEdgeGroupIDSet.has(group.ID)) {
      for (const endpointID of Object.keys(group.EndpointIDs)) {
        if (group.EndpointIDs[Number(endpointID)]) {
          excludedEndpointIDs.add(Number(endpointID));
        }
      }
      return false;
    }

    return true;
  });

  return [endpoints.filter((endpoint) => !excludedEndpointIDs.has(endpoint.ID)), filteredEdgeGroups];
}

function endpointFullMatchTags(endpoint: Endpoint, endpointGroup: EndpointGroup | undefined, tagIDs: number[]): boolean {
  const missing = new Set(tagIDs);
  for (const tagID of endpoint.TagIDs) missing.delete(tagID);
  for (const tagID of endpointGroup?.TagIDs ?? []) missing.delete(tagID);
  return missing.size === 0;
}

function endpointPartialMatchTags(endpoint: Endpoint, endpointGroup: EndpointGroup | undefined, tagIDs: number[]): boolean {
  const tagSet = new Set(tagIDs);
  for (const tagID of endpoint.TagIDs) if (tagSet.has(tagID)) return true;
  for (const tagID of endpointGroup?.TagIDs ?? []) if (tagSet.has(tagID)) return true;
  return false;
}

function filteredEndpointsByTags(endpoints: Endpoint[], tagIDs: number[], endpointGroups: EndpointGroup[], partialMatch: boolean): Endpoint[] {
  return endpoints.filter((endpoint) => {
    const endpointGroup = endpointGroups.find((group) => group.ID === endpoint.GroupID);
    return partialMatch
      ? endpointPartialMatchTags(endpoint, endpointGroup, tagIDs)
      : endpointFullMatchTags(endpoint, endpointGroup, tagIDs);
  });
}

function filterEndpointsByTypes(endpoints: Endpoint[], endpointTypes: EndpointType[]): Endpoint[] {
  const typeSet = new Set(endpointTypes);
  return endpoints.filter((endpoint) => typeSet.has(endpoint.Type));
}

function filterEndpointsByPlatform(endpoints: Endpoint[], platformTypes: PlatformType[]): Endpoint[] {
  const typeSet = new Set(platformTypes);
  return endpoints.filter((endpoint) => typeSet.has(endpointPlatformType(endpoint)));
}

function filterEndpointsByName(endpoints: Endpoint[], name: string): Endpoint[] {
  if (!name) return endpoints;
  return endpoints.filter((endpoint) => endpoint.Name === name);
}

function filterEndpointsByAgentVersions(endpoints: Endpoint[], agentVersions: string[]): Endpoint[] {
  const versionSet = new Set(agentVersions);
  return endpoints.filter((endpoint) => !isAgentEndpoint(endpoint) || versionSet.has(endpoint.Agent.Version));
}

function filterEndpointsByEdgeStack(
  endpoints: Endpoint[],
  edgeStackId: number,
  statusFilter: EdgeStackStatusType | undefined,
  context: EnvironmentFilterContext,
): Endpoint[] {
  const endpointIDs = context.edgeStackEndpointIdsByStackId?.[edgeStackId];
  if (!endpointIDs) {
    return endpoints;
  }

  const idSet = new Set(endpointIDs);
  const statusMap = context.edgeStackStatusByEndpointIdByStackId?.[edgeStackId];
  let filtered = endpoints.filter((endpoint) => idSet.has(endpoint.ID));

  if (statusFilter === undefined) {
    return filtered;
  }

  return filtered.filter((endpoint) => {
    const stackStatus = statusMap?.[endpoint.ID];
    if (statusFilter === EdgeStackStatusType.Pending) {
      return stackStatus === undefined || stackStatus.Status.length === 0;
    }

    if (!stackStatus) return false;
    return stackStatus.Status.some((status) => status.Type === statusFilter);
  });
}

export function filterEndpointsByQuery(endpoints: Endpoint[], query: EnvironmentQuery, context: EnvironmentFilterContext): { endpoints: Endpoint[]; totalAvailableEndpoints: number } {
  const totalAvailableEndpoints = endpoints.length;
  let filtered = [...endpoints];
  const endpointGroups = context.endpointGroups ?? [];
  let edgeGroups = context.edgeGroups ? [...context.edgeGroups] : [];
  const tagNameById = context.tagNameById ?? {};
  const now = context.now ?? Math.floor(Date.now() / 1000);
  const policy = context.edgeOnlinePolicy ?? defaultEdgeOnlinePolicy;

  filtered = filterByIds(filtered, query.endpointIds);
  if (query.excludeIds.length > 0) {
    const excludeIdSet = new Set(query.excludeIds);
    filtered = filtered.filter((endpoint) => !excludeIdSet.has(endpoint.ID));
  }
  if (query.excludeGroupIds.length > 0) {
    const excludeGroupSet = new Set(query.excludeGroupIds);
    filtered = filtered.filter((endpoint) => !excludeGroupSet.has(endpoint.GroupID));
  }
  filtered = query.groupIds.length > 0 ? filterEndpointsByGroupIDs(filtered, query.groupIds) : filtered;

  if (query.edgeGroupIds.length > 0) {
    [filtered, edgeGroups] = filterEndpointsByEdgeGroupIDs(filtered, edgeGroups, query.edgeGroupIds);
  }

  if (query.excludeEdgeGroupIds.length > 0) {
    [filtered, edgeGroups] = filterEndpointsByExcludeEdgeGroupIDs(filtered, edgeGroups, query.excludeEdgeGroupIds);
  }

  filtered = filterEndpointsByName(filtered, query.name);

  if (query.edgeAsync !== undefined) {
    filtered = filtered.filter((endpoint) => !isEdgeEndpoint(endpoint) || endpoint.Edge.AsyncMode === query.edgeAsync);
  }

  filtered = filtered.filter((endpoint) => {
    if (!isEdgeEndpoint(endpoint)) return true;
    if (query.edgeDeviceUntrusted) {
      return !endpoint.UserTrusted && Boolean(context.isAdmin);
    }
    return endpoint.UserTrusted === !query.edgeDeviceUntrusted;
  });

  if (query.edgeCheckInPassedSeconds > 0) {
    filtered = filtered.filter((endpoint) => {
      if (!isEdgeEndpoint(endpoint)) return true;
      if (endpoint.LastCheckInDate === 0) return false;
      return now - endpoint.LastCheckInDate < query.edgeCheckInPassedSeconds;
    });
  }

  if (query.status.length > 0) {
    filtered = filterEndpointsByStatuses(filtered, query.status, context.settings, now, policy);
  }

  if (query.search) {
    filtered = filterEndpointsBySearchCriteria(filtered, endpointGroups, edgeGroups, tagNameById, query.search);
  }

  if (query.types.length > 0) {
    filtered = filterEndpointsByTypes(filtered, query.types);
  }

  if (query.platformTypes.length > 0) {
    filtered = filterEndpointsByPlatform(filtered, query.platformTypes);
  }

  if (query.tagIds.length > 0) {
    filtered = filteredEndpointsByTags(filtered, query.tagIds, endpointGroups, query.tagsPartialMatch);
  }

  if (query.agentVersions.length > 0) {
    filtered = filterEndpointsByAgentVersions(filtered, query.agentVersions);
  }

  if (query.outdated && context.isOutdatedEndpoint) {
    filtered = filtered.filter((endpoint) => context.isOutdatedEndpoint?.(endpoint) ?? false);
  }

  if (query.edgeStackId !== 0) {
    filtered = filterEndpointsByEdgeStack(filtered, query.edgeStackId, query.edgeStackStatus, context);
  }

  return { endpoints: filtered, totalAvailableEndpoints };
}

export function computeEndpointStatusForFilter(endpoint: Endpoint, settings: Settings, now = Math.floor(Date.now() / 1000), policy: EdgeOnlinePolicy = defaultEdgeOnlinePolicy): EndpointStatus {
  return resolveEdgeEndpointStatus(endpoint, settings, now, policy);
}

export function getEdgeAsyncInterval(endpoint: Endpoint, settings: Settings): number {
  return getShortestAsyncInterval(endpoint, settings);
}
