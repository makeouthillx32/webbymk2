// src/ink/npm/types.ts
// Pure NPM API shapes — no side effects, no imports from our own code.
// Every other module in this folder imports from here.

export type OnLine = (line: string) => void;

export interface NpmTokenResponse {
  token:   string;
  expires: string;  // ISO-8601
}

export interface NpmProxyHost {
  id:                     number;
  created_on:             string;
  modified_on:            string;
  domain_names:           string[];
  forward_scheme:         "http" | "https";
  forward_host:           string;
  forward_port:           number;
  forward_path:           string;
  enabled:                number;   // 1 | 0
  ssl_forced:             number;
  http2_support:          number;
  hsts_enabled:           number;
  allow_websocket_upgrade:number;
  block_exploits:         number;
  caching_enabled:        number;
  certificate_id:         number | string | null;
  certificate?:           NpmCertificate | null;
  access_list_id:         number | string;
  advanced_config:        string;
  meta:                   Record<string, unknown>;
  locations:              unknown[];
}

export interface NpmCertificate {
  id:           number;
  created_on:   string;
  modified_on:  string;
  provider:     "letsencrypt" | "other";
  nice_name:    string;
  domain_names: string[];
  expires_on:   string | null;
  meta:         Record<string, unknown>;
}

export type NpmConnectStatus =
  | "connected"
  | "auth_error"
  | "api_error"
  | "unreachable"
  | "no_credentials";

export interface NpmStatus {
  status:    NpmConnectStatus;
  hostCount: number;
  token:     string | null;
  error?:    string;
}
