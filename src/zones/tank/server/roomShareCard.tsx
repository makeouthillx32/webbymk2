import { ImageResponse } from "next/og";
import { resolveRoomShareImage } from "./roomShareImage";

export const ROOM_SHARE_SIZE = { width: 1200, height: 630 };

function cleanSlug(raw: string) {
  const slug = decodeURIComponent(raw).trim().toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : "director";
}

async function existingFrame(url: string | null) {
  if (!url) return null;
  try {
    const response = await fetch(url, { method: "HEAD", cache: "no-store" });
    return response.ok ? url : null;
  } catch {
    return null;
  }
}

export async function createRoomShareCard(rawSlug: string, headers?: HeadersInit) {
  const slug = cleanSlug(rawSlug);
  const room = await resolveRoomShareImage(slug).catch(() => ({
    title: slug === "director" ? "Director" : slug.replace(/-/g, " "),
    description: "Watch live on Tank.",
    live: false,
    frameUrl: null,
  }));
  const frameUrl = await existingFrame(room.frameUrl);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        overflow: "hidden",
        background: "#101a1a",
        color: "#f4efe2",
        fontFamily: "Arial, sans-serif",
      }}
    >
      {frameUrl ? (
        <img
          src={frameUrl}
          alt=""
          width="1200"
          height="630"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : null}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          background: "linear-gradient(180deg, rgba(5,12,12,.12) 0%, rgba(5,12,12,.38) 52%, rgba(5,12,12,.96) 100%)",
        }}
      />
      <div style={{ position: "absolute", top: 42, left: 48, display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ width: 20, height: 20, borderRadius: 999, background: room.live ? "#39e77d" : "#88918c", boxShadow: room.live ? "0 0 22px #39e77d" : "none" }} />
        <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: 2 }}>{room.live ? "LIVE NOW" : "NO SIGNAL"}</div>
      </div>
      <div style={{ position: "absolute", top: 38, right: 48, display: "flex", color: "#ff4f1f", fontSize: 34, fontWeight: 900, letterSpacing: 2 }}>
        TANK LIVE
      </div>
      <div style={{ position: "absolute", left: 48, right: 48, bottom: 42, display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 78, lineHeight: 1, fontWeight: 900, textTransform: "capitalize", textShadow: "0 4px 18px rgba(0,0,0,.7)" }}>
          {room.title}
        </div>
        <div style={{ marginTop: 18, maxWidth: 900, fontSize: 28, color: "#d8ded8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {room.description}
        </div>
      </div>
    </div>,
    { ...ROOM_SHARE_SIZE, headers },
  );
}
