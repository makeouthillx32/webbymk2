"use client";

import type { DiscoveredCamera } from "../contracts";

export function PublicCameraPlayer({
  camera,
  title,
}: {
  camera: DiscoveredCamera;
  title?: string;
}) {
  if (!camera.playbackUrl || camera.playbackProtocol === "none") return null;

  if (camera.playbackProtocol === "whep") {
    try {
      const playerUrl = new URL(camera.playbackUrl);
      playerUrl.searchParams.set("autoplay", "true");
      playerUrl.searchParams.set("muted", "true");
      playerUrl.searchParams.set("controls", "true");

      return (
        <iframe
          title={title ?? `${camera.name} live stream`}
          src={playerUrl.toString()}
          className="absolute inset-0 h-full w-full border-0 bg-black"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
      );
    } catch {
      // Fall through to plain iframe if playbackUrl is relative or custom scheme
      return (
        <iframe
          title={title ?? `${camera.name} live stream`}
          src={camera.playbackUrl}
          className="absolute inset-0 h-full w-full border-0 bg-black"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
      );
    }
  }

  if (camera.playbackProtocol === "hls") {
    return (
      <video
        className="absolute inset-0 h-full w-full bg-black object-contain"
        src={camera.playbackUrl}
        autoPlay
        muted
        controls
        playsInline
      />
    );
  }

  return null;
}
