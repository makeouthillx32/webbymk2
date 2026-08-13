// src/ink/npm/index.ts
// Barrel — single import point for all NPM operations.
//
// Layer map (bottom → top):
//   types.ts   pure shapes, no deps
//   client.ts  npmFetch + timeouts
//   auth.ts    token cache, getToken, logout, ping, status
//   hosts.ts   proxy host CRUD
//   certs.ts   cert listing + domain lookup
//   zone.ts    production zone registration (uses hosts + certs)
//   dev.ts     dev host registration     (uses hosts + certs)

export type {
  OnLine,
  NpmTokenResponse,
  NpmProxyHost,
  NpmCertificate,
  NpmConnectStatus,
  NpmStatus,
} from "./types.ts";

export { npmGetToken, npmLogout, npmPing, npmGetStatus } from "./auth.ts";

export {
  npmListHosts,
  npmFindHost,
  npmEnableHost,
  npmDisableHost,
  npmDeleteHost,
} from "./hosts.ts";

export { npmListCerts, npmFindCertForDomain } from "./certs.ts";

export { npmAddZone, deriveNpmUpstream } from "./zone.ts";
export { npmAddDevHost } from "./dev.ts";
