"use client";

// The director's game cams, side by side: every room's Blender scene seen
// through its "TANK — <room>" camera, the same angle as the real feed. In
// GAME mode the server director tours these (gameCams.ts) and the one on the
// programme is marked; click a tile to take it, "Back to tour" to let go.
//
// Six WebGL canvases is fine on a staff desktop but not free, so the matrix
// only mounts its scenes while it's open (open by default in GAME).

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Gamepad2, RotateCcw } from "lucide-react";
import {
  detectWebgl,
  parseRoomSceneManifest,
  roomSceneManifestUrl,
  roomSceneUrl,
  type RoomSceneManifest,
} from "../../../public/roomScenes";

const RoomScene3D = dynamic(() => import("../../../public/components/RoomScene3D"), { ssr: false });

const titleCase = (key: string) =>
  key
    .split("-")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");

export function GameCamMatrix({
  mode,
  gameCamKey,
  reason,
  dwellSecondsRemaining,
}: {
  mode: string;
  gameCamKey: string | null;
  reason: string;
  dwellSecondsRemaining: number;
}) {
  const game = mode === "GAME";
  const [open, setOpen] = useState(game);
  const [manifest, setManifest] = useState<RoomSceneManifest | null>(null);
  const [webgl, setWebgl] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Opens itself when the house goes dark; never closes itself on the operator.
  useEffect(() => {
    if (game) setOpen(true);
  }, [game]);

  useEffect(() => {
    setWebgl(detectWebgl());
    let cancelled = false;
    fetch(roomSceneManifestUrl(), { cache: "no-cache" })
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => {
        if (!cancelled) setManifest(parseRoomSceneManifest(json));
      })
      .catch(() => {
        if (!cancelled) setManifest({ rooms: {}, house: null, cast: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const send = useCallback(async (method: "POST" | "DELETE", roomKey?: string) => {
    setBusy(roomKey ?? "tour");
    setError(null);
    try {
      const response = await fetch("/api/tank/staff/director/game-cam", {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "POST" ? JSON.stringify({ roomKey }) : undefined,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body?.error ?? `Request failed (${response.status})`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(null);
    }
  }, []);

  const keys = manifest ? Object.keys(manifest.rooms).sort() : [];
  const held = game && /took the/.test(reason);

  return (
    <div className="rounded-xl border border-fuchsia-500/30 bg-[#120a1a] p-4 space-y-3 text-white">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-fuchsia-300"
          aria-expanded={open}
        >
          <Gamepad2 className="h-4 w-4" />
          Game cams ({keys.length})
          <span className="text-[10px] font-mono text-white/50">{open ? "hide" : "show"}</span>
        </button>
        <div className="flex items-center gap-2 text-[10px] font-mono">
          {game ? (
            <span className="rounded bg-fuchsia-600 px-2 py-0.5 font-black uppercase tracking-wider">
              On programme · {held ? "held" : "touring"} · {dwellSecondsRemaining}s
            </span>
          ) : (
            <span className="rounded bg-white/10 px-2 py-0.5 font-bold uppercase tracking-wider text-white/60">
              Standby · a room is on air
            </span>
          )}
          {game && held && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void send("DELETE")}
              className="flex items-center gap-1 rounded border border-white/20 px-2 py-0.5 font-bold uppercase hover:bg-white/10 disabled:opacity-50"
            >
              <RotateCcw className="h-3 w-3" /> Back to tour
            </button>
          )}
        </div>
      </div>

      {game && <p className="text-[11px] font-mono text-white/60">{reason}</p>}
      {error && <p className="text-[11px] font-mono text-red-400">{error}</p>}

      {open && !webgl && <p className="text-xs text-white/60">This browser has no WebGL, so the game cams can't render here.</p>}
      {open && webgl && manifest && keys.length === 0 && (
        <p className="text-xs text-white/60">No room scenes are published yet (rooms3d/rooms.json is empty).</p>
      )}

      {open && webgl && keys.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {keys.map((key) => {
            const url = roomSceneUrl(manifest, key);
            const onProgramme = game && gameCamKey === key;
            return (
              <button
                key={key}
                type="button"
                disabled={!game || busy !== null}
                onClick={() => void send("POST", key)}
                title={game ? `Take the ${titleCase(key)} game cam` : "Game cams go on the programme only while no room is on air"}
                className={`relative aspect-video overflow-hidden rounded-lg border-2 bg-black text-left transition ${
                  onProgramme ? "border-fuchsia-500 shadow-[0_0_18px_rgba(217,70,239,0.55)]" : "border-white/10 hover:border-fuchsia-400/60"
                } disabled:cursor-default`}
              >
                {url && <RoomScene3D url={url} roomKey={key} className="pointer-events-none" />}
                <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider">
                  {titleCase(key)}
                </span>
                {onProgramme && (
                  <span className="absolute right-2 top-2 rounded bg-fuchsia-600 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider">
                    Program
                  </span>
                )}
                {busy === key && (
                  <span className="absolute inset-0 grid place-items-center bg-black/50 text-xs font-bold">Taking…</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
