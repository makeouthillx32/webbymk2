import {
  OUTBOUND_BROADCAST_PLATFORMS,
  type MediaMtxForward,
  type OutboundBroadcastConfigResult,
  type OutboundBroadcastDestination,
  type OutboundBroadcastDestinationSummary,
  type OutboundBroadcastPlatform,
} from "./contracts";

const DESTINATION_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const MAX_DESTINATIONS = 8;
const MAX_STREAM_KEY_LENGTH = 512;

type DestinationInput = {
  id?: unknown;
  label?: unknown;
  platform?: unknown;
  enabled?: unknown;
  rtmpUrl?: unknown;
  streamKey?: unknown;
  allowInsecureRtmp?: unknown;
};

function isPlatform(value: unknown): value is OutboundBroadcastPlatform {
  return (
    typeof value === "string" &&
    (OUTBOUND_BROADCAST_PLATFORMS as readonly string[]).includes(value)
  );
}

function itemName(input: DestinationInput, index: number): string {
  return typeof input.id === "string" && input.id.trim()
    ? `destination "${input.id.trim().slice(0, 64)}"`
    : `destination ${index + 1}`;
}

function parseDestination(
  value: unknown,
  index: number,
): { destination?: OutboundBroadcastDestination; errors: string[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { errors: [`Destination ${index + 1} must be an object.`] };
  }

  const input = value as DestinationInput;
  const name = itemName(input, index);
  const errors: string[] = [];

  const id = typeof input.id === "string" ? input.id.trim() : "";
  const label = typeof input.label === "string" ? input.label.trim() : "";
  const platform = input.platform;
  const rtmpUrl = typeof input.rtmpUrl === "string" ? input.rtmpUrl.trim() : "";
  const streamKey = typeof input.streamKey === "string" ? input.streamKey.trim() : "";
  const enabled = input.enabled === undefined ? true : input.enabled;
  const allowInsecureRtmp = input.allowInsecureRtmp === true;

  if (!DESTINATION_ID.test(id)) {
    errors.push(`${name} has an invalid id.`);
  }
  if (!label || label.length > 80) {
    errors.push(`${name} must have a label between 1 and 80 characters.`);
  }
  if (!isPlatform(platform)) {
    errors.push(`${name} has an unsupported platform.`);
  }
  if (typeof enabled !== "boolean") {
    errors.push(`${name} enabled must be a boolean.`);
  }
  if (!streamKey || streamKey.length > MAX_STREAM_KEY_LENGTH) {
    errors.push(`${name} must have a stream key between 1 and ${MAX_STREAM_KEY_LENGTH} characters.`);
  } else if (/[#\r\n\0]/.test(streamKey)) {
    errors.push(`${name} stream key contains unsupported characters.`);
  }

  let parsedUrl: URL | null = null;
  try {
    parsedUrl = new URL(rtmpUrl);
  } catch {
    errors.push(`${name} has an invalid RTMP URL.`);
  }

  if (parsedUrl) {
    if (parsedUrl.protocol !== "rtmps:" && parsedUrl.protocol !== "rtmp:") {
      errors.push(`${name} must use rtmps:// or rtmp://.`);
    }
    if (parsedUrl.protocol === "rtmp:" && !allowInsecureRtmp) {
      errors.push(`${name} must use encrypted RTMPS unless allowInsecureRtmp is explicitly enabled.`);
    }
    if (!parsedUrl.hostname) {
      errors.push(`${name} RTMP URL must include a host.`);
    }
    if (parsedUrl.username || parsedUrl.password) {
      errors.push(`${name} must not put credentials in the RTMP URL.`);
    }
    if (parsedUrl.hash) {
      errors.push(`${name} must keep its stream key in streamKey, not in the RTMP URL.`);
    }
  }

  if (errors.length || !isPlatform(platform) || typeof enabled !== "boolean") {
    return { errors };
  }

  return {
    destination: {
      id,
      label,
      platform,
      enabled,
      rtmpUrl,
      streamKey,
      allowInsecureRtmp,
    },
    errors,
  };
}

/**
 * Parses the server environment contract without ever echoing secrets in an
 * error. One invalid destination rejects the whole set so a launch cannot
 * silently omit a platform.
 */
export function parseOutboundBroadcastConfig(
  raw: string | null | undefined,
): OutboundBroadcastConfigResult {
  if (!raw?.trim()) {
    return { ok: true, destinations: [], summaries: [] };
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      destinations: [],
      summaries: [],
      errors: ["Outbound destination configuration is not valid JSON."],
    };
  }

  if (!Array.isArray(decoded)) {
    return {
      ok: false,
      destinations: [],
      summaries: [],
      errors: ["Outbound destination configuration must be an array."],
    };
  }
  if (decoded.length > MAX_DESTINATIONS) {
    return {
      ok: false,
      destinations: [],
      summaries: [],
      errors: [`Outbound destination configuration supports at most ${MAX_DESTINATIONS} destinations.`],
    };
  }

  const destinations: OutboundBroadcastDestination[] = [];
  const errors: string[] = [];
  for (const [index, value] of decoded.entries()) {
    const parsed = parseDestination(value, index);
    errors.push(...parsed.errors);
    if (parsed.destination) destinations.push(parsed.destination);
  }

  const seenIds = new Set<string>();
  for (const destination of destinations) {
    if (seenIds.has(destination.id)) {
      errors.push(`Destination id "${destination.id}" is duplicated.`);
    }
    seenIds.add(destination.id);
  }

  if (errors.length) {
    return { ok: false, destinations: [], summaries: [], errors };
  }

  return {
    ok: true,
    destinations,
    summaries: destinations.map(summarizeDestination),
  };
}

export function summarizeDestination(
  destination: OutboundBroadcastDestination,
): OutboundBroadcastDestinationSummary {
  const url = new URL(destination.rtmpUrl);
  return {
    id: destination.id,
    label: destination.label,
    platform: destination.platform,
    enabled: destination.enabled,
    configured: true,
    host: url.host,
    encryptedInTransit: url.protocol === "rtmps:",
  };
}

/** MediaMTX uses the URL fragment as the RTMP stream key. */
export function buildMediaMtxForwards(
  destinations: OutboundBroadcastDestination[],
): MediaMtxForward[] {
  return destinations
    .filter((destination) => destination.enabled)
    .map((destination) => ({
      dest: `${destination.rtmpUrl}#${destination.streamKey}`,
    }));
}

/** Safe for diagnostic text if MediaMTX ever returns a destination URL. */
export function redactForwardDestination(value: string): string {
  const fragmentIndex = value.indexOf("#");
  return fragmentIndex === -1
    ? value
    : `${value.slice(0, fragmentIndex)}#[REDACTED]`;
}
