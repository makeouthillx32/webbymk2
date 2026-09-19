export const OUTBOUND_BROADCAST_PLATFORMS = [
  "youtube",
  "twitch",
  "kick",
  "custom",
] as const;

export type OutboundBroadcastPlatform =
  (typeof OUTBOUND_BROADCAST_PLATFORMS)[number];

/**
 * Server-only destination configuration. streamKey must never be returned by
 * an API, serialized into a client component, or included in a log message.
 */
export type OutboundBroadcastDestination = {
  id: string;
  label: string;
  platform: OutboundBroadcastPlatform;
  enabled: boolean;
  rtmpUrl: string;
  streamKey: string;
  allowInsecureRtmp: boolean;
};

/** Safe shape for a future staff-only status endpoint. */
export type OutboundBroadcastDestinationSummary = {
  id: string;
  label: string;
  platform: OutboundBroadcastPlatform;
  enabled: boolean;
  configured: true;
  host: string;
  encryptedInTransit: boolean;
};

export type MediaMtxForward = {
  dest: string;
};

export type OutboundBroadcastConfigResult =
  | {
      ok: true;
      destinations: OutboundBroadcastDestination[];
      summaries: OutboundBroadcastDestinationSummary[];
    }
  | {
      ok: false;
      destinations: [];
      summaries: [];
      errors: string[];
    };
