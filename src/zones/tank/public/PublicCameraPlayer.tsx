"use client";

import type { DiscoveredCamera } from "../contracts";

export function PublicCameraPlayer({
  camera,
  title,
}: {
  camera: DiscoveredCamera;
  title?: string;
}) {
  if (camera.playback.status !== "ready") return null;

  if (camera.playback.webrtcPageUrl) {
    const playerUrl = new URL(camera.playback.webrtcPageUrl);
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
  }

  if (camera.playback.hlsUrl) {
    return (
      <video
        className="absolute inset-0 h-full w-full bg-black object-contain"
        src={camera.playback.hlsUrl}
        autoPlay
        muted
        controls
        playsInline
      />
    );
  }

  return null;
}
