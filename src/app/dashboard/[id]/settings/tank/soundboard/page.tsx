"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { Music, Play, Trash2, Upload } from "lucide-react";
import { cn } from "@/utils/cn";
import DragDropUpload from "@/components/documents/DragDropUpload";
import { uploadToFolder, listFolder, removeObjects, type StoredObject } from "@/lib/storage/upload";
import { STORAGE_BUCKETS } from "@/lib/storage/buckets";

const FOLDER = "clips";

export default function TankSoundboardPage() {
  const [clips, setClips] = useState<StoredObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [playingPath, setPlayingPath] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      setClips(await listFolder({ bucket: STORAGE_BUCKETS.tankSoundboard, folder: FOLDER }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const uploaded = await uploadToFolder({ bucket: STORAGE_BUCKETS.tankSoundboard, folder: FOLDER, file, validateImage: false });
      const response = await fetch("/api/tank/admin/sfx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: uploaded.path, name: file.name, category: "general" }),
      });
      const payload = await response.json();
      if (!response.ok) {
        await removeObjects({ bucket: STORAGE_BUCKETS.tankSoundboard, paths: [uploaded.path] });
        throw new Error(payload.error ?? "Could not register clip in the sound library.");
      }
      toast.success("Clip uploaded and added to the Tank sound library");
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (path: string) => {
    if (!confirm("Delete this clip?")) return;
    try {
      const clip = clips.find((entry) => entry.path === path);
      const response = await fetch("/api/tank/admin/sfx", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, name: clip?.name ?? path }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not remove clip from the sound library.");
      await removeObjects({ bucket: STORAGE_BUCKETS.tankSoundboard, paths: [path] });
      toast.success("Clip deleted");
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Delete failed");
    }
  };

  const trigger = async (clip: StoredObject) => {
    setPlayingPath(clip.path);
    try {
      const res = await fetch("/api/tank/admin/soundboard/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clipUrl: clip.publicUrl, clipName: clip.name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to trigger clip");
      toast.success(`Playing "${clip.name}" for every connected viewer`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Failed to trigger clip");
    } finally {
      setTimeout(() => setPlayingPath(null), 600);
    }
  };

  const handleFiles = (files: File[]) => {
    const audio = files.find((file) => file.type.startsWith("audio/"));
    if (audio) void upload(audio);
    else toast.error("No audio file in the dropped files");
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-[hsl(var(--foreground))]">Tank Soundboard</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Uploaded clips are registered in the Tank sound library and become available to the
          viewer soundboard. Clicking Play still broadcasts an immediate producer preview to
          connected browsers; room-targeted playback goes through the moderated audio queue.
        </p>
      </div>

      <DragDropUpload onFilesDropped={handleFiles}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[hsl(var(--border))] px-4 py-8 text-center transition",
            "hover:border-primary hover:bg-primary/5",
            busy && "opacity-60",
          )}
        >
          <Upload size={24} className="text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
          <span className="text-sm text-[hsl(var(--muted-foreground))]">
            {busy ? "Uploading…" : "Drag & drop an audio clip, or click to browse (MP3, WAV, OGG, up to 5 MB)"}
          </span>
        </button>
      </DragDropUpload>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void upload(file);
        }}
      />

      {loading ? (
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading…</p>
      ) : clips.length === 0 ? (
        <p className="text-sm text-[hsl(var(--muted-foreground))]">No clips uploaded yet.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {clips.map((clip) => (
            <div
              key={clip.path}
              className="flex items-center justify-between gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Music size={16} className="shrink-0 text-[hsl(var(--muted-foreground))]" />
                <span className="truncate text-sm font-medium">{clip.name.replace(/\.[^.]+$/, "")}</span>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => void trigger(clip)}
                  disabled={playingPath === clip.path}
                  className="inline-flex h-8 items-center gap-1 rounded bg-[hsl(var(--primary))] px-2 text-xs font-semibold text-[hsl(var(--primary-foreground))] disabled:opacity-60"
                >
                  <Play size={12} />
                  {playingPath === clip.path ? "Playing…" : "Play"}
                </button>
                <button
                  type="button"
                  onClick={() => void remove(clip.path)}
                  className="inline-flex h-8 items-center rounded border border-red-500/30 px-2 text-xs text-red-600 hover:bg-red-500/10"
                  aria-label={`Delete ${clip.name}`}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
