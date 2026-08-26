"use client";

import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { Plus, RefreshCw, Save, Trash2, X } from "lucide-react";

type AudioSourceKind = "ip-mic" | "line-in" | "house-mic";

type TankAudioSource = {
  id: string;
  name: string;
  roomScope: string;
  online: boolean;
  kind?: AudioSourceKind;
  connectionHint?: string | null;
  tags: string[];
};

const KIND_OPTIONS: AudioSourceKind[] = ["ip-mic", "line-in", "house-mic"];

const EMPTY_FORM = { id: "", name: "", roomScope: "", kind: "ip-mic" as AudioSourceKind, connectionHint: "" };

export default function TankAudioSourcesPage() {
  const [sources, setSources] = useState<TankAudioSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tank/admin/audio-sources");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load audio sources");
      setSources(data.sources ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load audio sources");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const create = async () => {
    if (!form.id.trim() || !form.name.trim() || !form.roomScope.trim()) {
      toast.error("id, name, and room scope are required");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/tank/admin/audio-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, connectionHint: form.connectionHint || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create audio source");
      toast.success("Audio source created");
      setForm(EMPTY_FORM);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create audio source");
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (source: TankAudioSource) => {
    setEditingId(source.id);
    setEditForm({
      id: source.id,
      name: source.name,
      roomScope: source.roomScope,
      kind: source.kind ?? "ip-mic",
      connectionHint: source.connectionHint ?? "",
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setBusyId(editingId);
    try {
      const res = await fetch("/api/tank/admin/audio-sources", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editForm, connectionHint: editForm.connectionHint || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save audio source");
      toast.success("Audio source updated");
      setEditingId(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save audio source");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    if (!confirm(`Delete audio source "${id}"? Cameras assigned to it will need a new source.`)) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/tank/admin/audio-sources?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete audio source");
      toast.success("Audio source deleted");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete audio source");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[hsl(var(--foreground))]">Tank Audio Sources</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            The real catalog cameras assign external audio to (house mics, mixer line-ins).
            Previously SQL-only — this is the admin UI that was missing.
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

      <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
        <h2 className="text-sm font-semibold">Add a source</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-5">
          <input
            value={form.id}
            onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))}
            placeholder="id (e.g. house-side-mic)"
            className="rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1.5 text-sm"
          />
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Name"
            className="rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1.5 text-sm"
          />
          <input
            value={form.roomScope}
            onChange={(e) => setForm((f) => ({ ...f, roomScope: e.target.value }))}
            placeholder="room-scope (kebab-case)"
            className="rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1.5 text-sm"
          />
          <select
            value={form.kind}
            onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as AudioSourceKind }))}
            className="rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1.5 text-sm"
          >
            {KIND_OPTIONS.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
          <input
            value={form.connectionHint}
            onChange={(e) => setForm((f) => ({ ...f, connectionHint: e.target.value }))}
            placeholder="Connection hint (optional)"
            className="rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1.5 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => void create()}
          disabled={creating}
          className="mt-3 inline-flex h-9 items-center gap-2 rounded-[var(--radius)] bg-[hsl(var(--primary))] px-3 text-sm font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-60"
        >
          <Plus size={14} />
          {creating ? "Adding…" : "Add source"}
        </button>
      </div>

      <div className="space-y-2">
        {sources.map((source) => (
          <div key={source.id} className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3">
            {editingId === source.id ? (
              <div className="grid gap-2 sm:grid-cols-5">
                <input
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  className="rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1.5 text-sm"
                />
                <input
                  value={editForm.roomScope}
                  onChange={(e) => setEditForm((f) => ({ ...f, roomScope: e.target.value }))}
                  className="rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1.5 text-sm"
                />
                <select
                  value={editForm.kind}
                  onChange={(e) => setEditForm((f) => ({ ...f, kind: e.target.value as AudioSourceKind }))}
                  className="rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1.5 text-sm"
                >
                  {KIND_OPTIONS.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
                <input
                  value={editForm.connectionHint}
                  onChange={(e) => setEditForm((f) => ({ ...f, connectionHint: e.target.value }))}
                  className="rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1.5 text-sm"
                />
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => void saveEdit()}
                    disabled={busyId === source.id}
                    className="inline-flex h-8 items-center gap-1 rounded bg-[hsl(var(--primary))] px-2 text-xs font-semibold text-[hsl(var(--primary-foreground))]"
                  >
                    <Save size={12} /> Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="inline-flex h-8 items-center gap-1 rounded border border-[hsl(var(--border))] px-2 text-xs"
                  >
                    <X size={12} /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm">{source.name}</strong>
                  <span className="rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                    {source.id}
                  </span>
                  <span className="rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                    {source.roomScope}
                  </span>
                  <span className="rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                    {source.kind}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      source.online ? "bg-emerald-500/15 text-emerald-600" : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"
                    }`}
                  >
                    {source.online ? "online" : "offline"}
                  </span>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => startEdit(source)}
                    className="inline-flex h-8 items-center rounded border border-[hsl(var(--border))] px-2 text-xs"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(source.id)}
                    disabled={busyId === source.id}
                    className="inline-flex h-8 items-center gap-1 rounded border border-red-500/30 px-2 text-xs text-red-600 hover:bg-red-500/10"
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {!loading && sources.length === 0 && (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">No audio sources yet.</p>
        )}
      </div>
    </div>
  );
}
