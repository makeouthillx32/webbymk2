"use client";

import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { RefreshCw, Save } from "lucide-react";

type VisibilityPolicy = "always-show" | "live-only";

type DerivedRoom = {
  roomKey: string;
  title: string;
  eyebrow: string;
  description: string;
  tags: string[];
  visibilityPolicy: VisibilityPolicy;
  cameraIds: string[];
  featuredCameraId: string;
  anyOnline: boolean;
  audioInputSourceId: string | null;
};

type CameraOption = { id: string; name: string; roomScope: string };

type EditState = {
  title: string;
  eyebrow: string;
  description: string;
  tags: string;
  visibilityPolicy: "" | VisibilityPolicy;
  audioInputSourceId: string;
};

export default function TankRoomsPage() {
  const [rooms, setRooms] = useState<DerivedRoom[]>([]);
  const [cameras, setCameras] = useState<CameraOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tank/admin/rooms");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load rooms");
      const list: DerivedRoom[] = data.rooms ?? [];
      setRooms(list);
      setCameras(data.cameras ?? []);
      setEdits(
        Object.fromEntries(
          list.map((room) => [
            room.roomKey,
            {
              title: room.title,
              eyebrow: room.eyebrow,
              description: room.description,
              tags: room.tags.join(", "),
              visibilityPolicy: "" as const,
              audioInputSourceId: room.audioInputSourceId ?? "",
            },
          ]),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load rooms");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async (roomKey: string) => {
    const edit = edits[roomKey];
    if (!edit) return;
    setSavingKey(roomKey);
    try {
      const res = await fetch("/api/tank/admin/rooms", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomKey,
          title: edit.title,
          eyebrow: edit.eyebrow,
          description: edit.description,
          tags: edit.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
          visibilityPolicy: edit.visibilityPolicy || null,
          audioInputSourceId: edit.audioInputSourceId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save room");
      toast.success("Room updated");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save room");
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[hsl(var(--foreground))]">Tank Rooms</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Rooms are derived live from camera roomScope groupings — nothing here creates or
            deletes a room, it only curates how a real room is labeled. IP/SRT-backed rooms
            persist offline as &quot;no signal&quot;; OBS/RTMP-only rooms disappear entirely when
            nothing is publishing. Override the inferred policy per room if needed.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex h-9 items-center gap-2 rounded-[var(--radius)] border border-[hsl(var(--border))] px-3 text-sm font-medium hover:bg-[hsl(var(--muted))]"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading rooms…</p>
      ) : rooms.length === 0 ? (
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          No rooms yet — a room appears here as soon as a publicly-visible camera reports a
          roomScope.
        </p>
      ) : (
        <div className="space-y-3">
          {rooms.map((room) => {
            const edit = edits[room.roomKey];
            if (!edit) return null;
            const roomCameras = cameras.filter((camera) => room.cameraIds.includes(camera.id));
            return (
              <div
                key={room.roomKey}
                className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm">{room.title}</strong>
                  <span className="rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                    {room.roomKey}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      room.anyOnline ? "bg-emerald-500/15 text-emerald-600" : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"
                    }`}
                  >
                    {room.anyOnline ? "live" : "no signal"}
                  </span>
                  <span className="rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                    {room.visibilityPolicy}
                  </span>
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">
                    {room.cameraIds.length} camera{room.cameraIds.length === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">
                    Title
                    <input
                      value={edit.title}
                      onChange={(e) => setEdits((prev) => ({ ...prev, [room.roomKey]: { ...edit, title: e.target.value } }))}
                      className="mt-1 w-full rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1.5 text-sm text-[hsl(var(--foreground))]"
                    />
                  </label>
                  <label className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">
                    Eyebrow
                    <input
                      value={edit.eyebrow}
                      onChange={(e) => setEdits((prev) => ({ ...prev, [room.roomKey]: { ...edit, eyebrow: e.target.value } }))}
                      className="mt-1 w-full rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1.5 text-sm text-[hsl(var(--foreground))]"
                    />
                  </label>
                  <label className="text-xs font-semibold text-[hsl(var(--muted-foreground))] sm:col-span-2">
                    Description
                    <textarea
                      value={edit.description}
                      onChange={(e) => setEdits((prev) => ({ ...prev, [room.roomKey]: { ...edit, description: e.target.value } }))}
                      rows={2}
                      className="mt-1 w-full rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1.5 text-sm text-[hsl(var(--foreground))]"
                    />
                  </label>
                  <label className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">
                    Tags (comma-separated)
                    <input
                      value={edit.tags}
                      onChange={(e) => setEdits((prev) => ({ ...prev, [room.roomKey]: { ...edit, tags: e.target.value } }))}
                      className="mt-1 w-full rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1.5 text-sm text-[hsl(var(--foreground))]"
                    />
                  </label>
                  <label className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">
                    Visibility override (blank = auto-infer from cameras)
                    <select
                      value={edit.visibilityPolicy}
                      onChange={(e) =>
                        setEdits((prev) => ({
                          ...prev,
                          [room.roomKey]: { ...edit, visibilityPolicy: e.target.value as EditState["visibilityPolicy"] },
                        }))
                      }
                      className="mt-1 w-full rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1.5 text-sm text-[hsl(var(--foreground))]"
                    >
                      <option value="">Auto (currently {room.visibilityPolicy})</option>
                      <option value="always-show">Always show (persist offline)</option>
                      <option value="live-only">Live only (hide when offline)</option>
                    </select>
                  </label>
                  {roomCameras.length > 1 && (
                    <label className="text-xs font-semibold text-[hsl(var(--muted-foreground))] sm:col-span-2">
                      Audio input (this room has {roomCameras.length} cameras — pick exactly one
                      as the room&apos;s audio source so they don&apos;t mix)
                      <select
                        value={edit.audioInputSourceId}
                        onChange={(e) =>
                          setEdits((prev) => ({
                            ...prev,
                            [room.roomKey]: { ...edit, audioInputSourceId: e.target.value },
                          }))
                        }
                        className="mt-1 w-full rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1.5 text-sm text-[hsl(var(--foreground))]"
                      >
                        <option value="">Not chosen yet (every camera's audio stays live)</option>
                        {roomCameras.map((camera) => (
                          <option key={camera.id} value={camera.id}>
                            {camera.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => void save(room.roomKey)}
                  disabled={savingKey === room.roomKey}
                  className="mt-3 inline-flex h-8 items-center gap-2 rounded-[var(--radius)] bg-[hsl(var(--primary))] px-3 text-xs font-semibold text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-60"
                >
                  <Save size={13} />
                  {savingKey === room.roomKey ? "Saving…" : "Save"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
