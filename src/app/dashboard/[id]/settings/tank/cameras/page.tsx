"use client";

import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { RefreshCw, Save } from "lucide-react";

type DiscoveredCamera = {
  id: string;
  name: string;
  roomScope: string;
  presence: string;
  priority: number;
  description: string;
  accent: string;
  location: string;
};

type EditState = {
  description: string;
  accent: string;
  location: string;
  priority: string;
};

export default function TankCamerasPage() {
  const [cameras, setCameras] = useState<DiscoveredCamera[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tank/admin/cameras");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load cameras");
      const list: DiscoveredCamera[] = data.snapshot?.cameras ?? [];
      setCameras(list);
      setEdits(
        Object.fromEntries(
          list.map((camera) => [
            camera.id,
            {
              description: camera.description,
              accent: camera.accent,
              location: camera.location,
              priority: String(camera.priority),
            },
          ]),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load cameras");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async (cameraId: string) => {
    const edit = edits[cameraId];
    if (!edit) return;
    setSavingId(cameraId);
    try {
      const res = await fetch("/api/tank/admin/cameras", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cameraId,
          description: edit.description,
          accent: edit.accent,
          location: edit.location,
          priority: Number(edit.priority) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save camera");
      toast.success("Camera updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save camera");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[hsl(var(--foreground))]">Tank Cameras</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Presentation only — name, description, accent color, location, and sort order shown
            on the public Tank page. Presence, bitrate, and playback are all live from the
            receiver manager; nothing here can fake a camera being online.
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
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading cameras…</p>
      ) : cameras.length === 0 ? (
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          No cameras reported by the receiver manager yet.
        </p>
      ) : (
        <div className="space-y-3">
          {cameras.map((camera) => {
            const edit = edits[camera.id];
            if (!edit) return null;
            return (
              <div
                key={camera.id}
                className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm">{camera.name}</strong>
                  <span className="rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                    {camera.id}
                  </span>
                  <span className="rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                    {camera.roomScope}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      camera.presence === "online"
                        ? "bg-emerald-500/15 text-emerald-600"
                        : "bg-red-500/15 text-red-600"
                    }`}
                  >
                    {camera.presence}
                  </span>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">
                    Location
                    <input
                      value={edit.location}
                      onChange={(e) =>
                        setEdits((prev) => ({ ...prev, [camera.id]: { ...edit, location: e.target.value } }))
                      }
                      className="mt-1 w-full rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1.5 text-sm text-[hsl(var(--foreground))]"
                      placeholder="Game room, OC desk"
                    />
                  </label>
                  <label className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">
                    Sort priority (lower shows first)
                    <input
                      type="number"
                      value={edit.priority}
                      onChange={(e) =>
                        setEdits((prev) => ({ ...prev, [camera.id]: { ...edit, priority: e.target.value } }))
                      }
                      className="mt-1 w-full rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1.5 text-sm text-[hsl(var(--foreground))]"
                    />
                  </label>
                  <label className="text-xs font-semibold text-[hsl(var(--muted-foreground))] sm:col-span-2">
                    Description
                    <textarea
                      value={edit.description}
                      onChange={(e) =>
                        setEdits((prev) => ({ ...prev, [camera.id]: { ...edit, description: e.target.value } }))
                      }
                      rows={2}
                      className="mt-1 w-full rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1.5 text-sm text-[hsl(var(--foreground))]"
                    />
                  </label>
                  <label className="text-xs font-semibold text-[hsl(var(--muted-foreground))] sm:col-span-2">
                    Accent gradient classes (Tailwind, e.g. from-slate-700/60 via-slate-900/70 to-black)
                    <input
                      value={edit.accent}
                      onChange={(e) =>
                        setEdits((prev) => ({ ...prev, [camera.id]: { ...edit, accent: e.target.value } }))
                      }
                      className="mt-1 w-full rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1.5 text-sm text-[hsl(var(--foreground))]"
                    />
                  </label>
                </div>

                <button
                  type="button"
                  onClick={() => void save(camera.id)}
                  disabled={savingId === camera.id}
                  className="mt-3 inline-flex h-8 items-center gap-2 rounded-[var(--radius)] bg-[hsl(var(--primary))] px-3 text-xs font-semibold text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-60"
                >
                  <Save size={13} />
                  {savingId === camera.id ? "Saving…" : "Save"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
