"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Music,
  Play,
  Square,
  Trash2,
  Upload,
  RefreshCw,
  Search,
  Volume2,
  Radio,
  Sparkles,
  Filter,
  Edit2,
  Image as ImageIcon,
  Check,
  X,
  Plus,
} from "lucide-react";
import DragDropUpload from "@/components/documents/DragDropUpload";
import { uploadToFolder, removeObjects } from "@/lib/storage/upload";
import { STORAGE_BUCKETS } from "@/lib/storage/buckets";
import { ACTIVE_THEME } from "../theme";
import type { TankSfxLibraryEntry } from "../contracts";

const FOLDER = "clips";

export function SoundboardAdminPanel() {
  const [clips, setClips] = useState<TankSfxLibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Edit Modal State
  const [editingClip, setEditingClip] = useState<TankSfxLibraryEntry | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editIconUrl, setEditIconUrl] = useState("");
  const [editTokenCost, setEditTokenCost] = useState<number>(75);
  const [editSaving, setEditSaving] = useState(false);

  // New Sound Form State
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [newSoundName, setNewSoundName] = useState("");
  const [newCategory, setNewCategory] = useState("general");
  const [newIconUrl, setNewIconUrl] = useState("");
  const [newTokenCost, setNewTokenCost] = useState(75);
  const [selectedAudioFile, setSelectedAudioFile] = useState<File | null>(null);
  const [selectedIconFile, setSelectedIconFile] = useState<File | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);
  const editIconInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sfx", { cache: "no-store" });
      if (res.ok) {
        const payload = (await res.json()) as { sfx?: TankSfxLibraryEntry[] };
        setClips(Array.isArray(payload.sfx) ? payload.sfx : []);
      }
    } catch {
      setActionMessage("❌ Failed to load sound library");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const c of clips) {
      if (c.category) set.add(c.category);
    }
    return ["all", ...Array.from(set).sort()];
  }, [clips]);

  const filteredClips = useMemo(() => {
    return clips.filter((c) => {
      const matchCat = selectedCategory === "all" || c.category === selectedCategory;
      const matchSearch =
        !searchQuery.trim() ||
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.soundKey.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.category.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [clips, selectedCategory, searchQuery]);

  const playPreviewLocal = (clip: TankSfxLibraryEntry) => {
    if (playingKey === clip.soundKey) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlayingKey(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    try {
      const audio = new Audio(clip.fileUrl);
      audio.volume = clip.defaultVolume ?? 0.85;
      audio.onended = () => setPlayingKey(null);
      audio.onerror = () => {
        setPlayingKey(null);
        setActionMessage(`❌ Could not play audio preview for "${clip.name}"`);
      };
      audioRef.current = audio;
      setPlayingKey(clip.soundKey);
      void audio.play();
    } catch {
      setPlayingKey(null);
    }
  };

  const triggerLivePreview = async (clip: TankSfxLibraryEntry) => {
    try {
      const res = await fetch("/api/tank/admin/soundboard/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clipUrl: clip.fileUrl, clipName: clip.name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to broadcast clip");
      setActionMessage(`🔊 Broadcasted "${clip.name}" to all live viewers.`);
    } catch (cause) {
      setActionMessage(`❌ ${cause instanceof Error ? cause.message : "Failed to broadcast clip"}`);
    }
  };

  const openEditModal = (clip: TankSfxLibraryEntry) => {
    setEditingClip(clip);
    setEditName(clip.name);
    setEditCategory(clip.category || "general");
    setEditIconUrl(clip.iconUrl || "");
    setEditTokenCost(clip.tokenCost ?? 75);
  };

  const handleSaveEdit = async () => {
    if (!editingClip) return;
    setEditSaving(true);
    try {
      const response = await fetch("/api/tank/admin/sfx", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingClip.id,
          name: editName.trim(),
          category: editCategory.trim(),
          iconUrl: editIconUrl.trim() || null,
          tokenCost: Number(editTokenCost) || 0,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not update sound.");
      setActionMessage(`✅ "${editName}" updated successfully with assigned icon & text.`);
      setEditingClip(null);
      await load();
    } catch (cause) {
      setActionMessage(`❌ ${cause instanceof Error ? cause.message : "Update failed"}`);
    } finally {
      setEditSaving(false);
    }
  };

  const handleUploadEditIcon = async (file: File) => {
    setEditSaving(true);
    try {
      const uploaded = await uploadToFolder({
        bucket: STORAGE_BUCKETS.tankArt,
        folder: "soundboard",
        file,
        validateImage: true,
      });
      setEditIconUrl(uploaded.publicUrl);
      setActionMessage(`✅ Icon "${file.name}" uploaded. Click Save to assign.`);
    } catch (cause) {
      setActionMessage(`❌ ${cause instanceof Error ? cause.message : "Icon upload failed"}`);
    } finally {
      setEditSaving(false);
    }
  };

  const handleCreateNewSound = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAudioFile) {
      setActionMessage("❌ Please select an audio file first.");
      return;
    }
    setBusy(true);
    try {
      let iconUrl = newIconUrl.trim() || null;
      if (selectedIconFile) {
        const uploadedIcon = await uploadToFolder({
          bucket: STORAGE_BUCKETS.tankArt,
          folder: "soundboard",
          file: selectedIconFile,
          validateImage: true,
        });
        iconUrl = uploadedIcon.publicUrl;
      }

      const uploadedAudio = await uploadToFolder({
        bucket: STORAGE_BUCKETS.tankSoundboard,
        folder: FOLDER,
        file: selectedAudioFile,
        validateImage: false,
      });

      const response = await fetch("/api/tank/admin/sfx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: uploadedAudio.path,
          name: newSoundName.trim() || selectedAudioFile.name.replace(/\.[^.]+$/, ""),
          category: newCategory.trim() || "general",
          iconUrl,
          tokenCost: Number(newTokenCost) || 75,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        await removeObjects({ bucket: STORAGE_BUCKETS.tankSoundboard, paths: [uploadedAudio.path] });
        throw new Error(payload.error ?? "Could not register clip in the sound library.");
      }

      setActionMessage(`✅ Sound "${newSoundName || selectedAudioFile.name}" registered with assigned icon and text!`);
      setSelectedAudioFile(null);
      setSelectedIconFile(null);
      setNewSoundName("");
      setNewIconUrl("");
      setShowUploadForm(false);
      await load();
    } catch (cause) {
      setActionMessage(`❌ ${cause instanceof Error ? cause.message : "Registration failed"}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (clip: TankSfxLibraryEntry) => {
    if (!confirm(`Delete "${clip.name}"? This removes it from the library and every place that can trigger it.`)) return;
    try {
      const fileName = clip.fileUrl.split("/").pop() || "";
      const path = `${FOLDER}/${fileName}`;
      const response = await fetch("/api/tank/admin/sfx", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, id: clip.id, name: clip.name }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not remove clip from the sound library.");
      setActionMessage(`🗑️ "${clip.name}" deleted.`);
      await load();
    } catch (cause) {
      setActionMessage(`❌ ${cause instanceof Error ? cause.message : "Delete failed"}`);
    }
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-orange-500/30 bg-gradient-to-r from-orange-950/40 via-black/40 to-orange-950/40 p-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-orange-500/20 border border-orange-500/40 text-orange-400 shadow">
            <Volume2 className="h-6 w-6" />
          </div>
          <div>
            <h2
              className="text-base font-black uppercase tracking-wider text-white md:text-lg"
              style={{ fontFamily: ACTIVE_THEME.fonts.label }}
            >
              SOUNDBOARD & SFX LIBRARY
            </h2>
            <p className="text-xs font-semibold text-slate-400">
              {clips.length} official sounds with assigned Discord icons & text · Upload · edit · preview · broadcast
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowUploadForm(!showUploadForm)}
            className="flex items-center gap-1.5 rounded-lg border border-orange-500/50 bg-orange-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-500 transition shadow"
          >
            <Plus className="h-3.5 w-3.5" />
            {showUploadForm ? "Close Form" : "Add New Sound & Icon"}
          </button>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-black/50 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-800 transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="flex items-center justify-between rounded-lg border border-orange-500/40 bg-black/80 px-4 py-2 text-xs font-bold text-orange-300">
          <span>{actionMessage}</span>
          <button type="button" onClick={() => setActionMessage(null)} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* Add New Sound Form */}
      {showUploadForm && (
        <form
          onSubmit={handleCreateNewSound}
          className="rounded-xl border border-orange-500/40 bg-[#14161b] p-4 shadow-2xl space-y-4"
        >
          <div className="border-b border-white/10 pb-2 flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-wider text-orange-400 flex items-center gap-2">
              <Plus className="h-4 w-4" /> Register New Sound Clip with Assigned Icon
            </h3>
            <span className="text-[10px] font-bold text-slate-400">Assigns audio + icon + custom display text</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Audio File Selection */}
            <div>
              <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                Audio File (MP3, WAV, OGG) *
              </label>
              <input
                type="file"
                ref={audioInputRef}
                accept="audio/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setSelectedAudioFile(f);
                    if (!newSoundName) setNewSoundName(f.name.replace(/\.[^.]+$/, ""));
                  }
                }}
              />
              <button
                type="button"
                onClick={() => audioInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-slate-700 bg-black/50 p-3 text-xs font-bold text-slate-300 hover:border-orange-500"
              >
                <Music className="h-4 w-4 text-orange-400" />
                {selectedAudioFile ? selectedAudioFile.name : "Select Audio File"}
              </button>
            </div>

            {/* Icon File Selection */}
            <div>
              <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                Icon Image (PNG, SVG, WebP)
              </label>
              <input
                type="file"
                ref={iconInputRef}
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setSelectedIconFile(f);
                }}
              />
              <button
                type="button"
                onClick={() => iconInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-slate-700 bg-black/50 p-3 text-xs font-bold text-slate-300 hover:border-orange-500"
              >
                <ImageIcon className="h-4 w-4 text-orange-400" />
                {selectedIconFile ? selectedIconFile.name : "Select Custom Icon (Optional)"}
              </button>
            </div>

            {/* Sound Name / Label Text */}
            <div>
              <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                Sound Name / Text Label *
              </label>
              <input
                type="text"
                required
                value={newSoundName}
                onChange={(e) => setNewSoundName(e.target.value)}
                placeholder="e.g. Air Horn Blast"
                className="w-full rounded-lg border border-slate-700 bg-black/60 px-3 py-2 text-xs font-bold text-white focus:border-orange-500 focus:outline-none"
              />
            </div>

            {/* Category & Token Cost */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-300 mb-1">Category</label>
                <input
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="general, meme, alert"
                  className="w-full rounded-lg border border-slate-700 bg-black/60 px-3 py-2 text-xs font-bold text-white focus:border-orange-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-300 mb-1">Token Cost</label>
                <input
                  type="number"
                  min="0"
                  value={newTokenCost}
                  onChange={(e) => setNewTokenCost(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-700 bg-black/60 px-3 py-2 text-xs font-bold text-white focus:border-orange-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={() => setShowUploadForm(false)}
              className="rounded-lg border border-slate-700 bg-black/40 px-4 py-2 text-xs font-bold text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !selectedAudioFile}
              className="rounded-lg bg-orange-600 px-5 py-2 text-xs font-black uppercase text-white hover:bg-orange-500 transition disabled:opacity-50 shadow"
            >
              {busy ? "Uploading & Registering…" : "Save Sound & Icon"}
            </button>
          </div>
        </form>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-[#121316] p-3 shadow-lg">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${clips.length} sounds by name, tag, or key...`}
            className="w-full rounded-lg border border-slate-700 bg-black/60 py-1.5 pl-9 pr-3 text-xs font-bold text-white placeholder-slate-500 focus:border-orange-500 focus:outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500 hover:text-white"
            >
              ✕
            </button>
          )}
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 mr-1">
            <Filter className="inline h-3 w-3 mr-1" /> Category:
          </span>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-md px-2.5 py-1 text-[10px] font-black uppercase tracking-wider transition ${
                selectedCategory === cat
                  ? "bg-orange-500 text-black shadow"
                  : "border border-slate-800 bg-black/40 text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Library Grid */}
      <div className="rounded-xl border border-slate-800 bg-[#121316] p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2">
          <h3 className="text-xs font-black uppercase tracking-wider text-orange-400 flex items-center gap-2">
            <Music className="h-4 w-4" />
            Clips Catalog ({filteredClips.length} / {clips.length})
          </h3>
          {playingKey && (
            <span className="flex items-center gap-1.5 text-[10px] font-black uppercase text-emerald-400 animate-pulse">
              <Sparkles className="h-3 w-3" /> Preview Playing
            </span>
          )}
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs font-semibold text-slate-500">
            <RefreshCw className="mx-auto mb-2 h-6 w-6 animate-spin text-orange-500" />
            Loading soundboard catalog…
          </div>
        ) : filteredClips.length === 0 ? (
          <div className="py-12 text-center text-xs font-semibold text-slate-500">
            {searchQuery || selectedCategory !== "all" ? "No sounds matched your filter." : "No clips uploaded yet."}
          </div>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredClips.map((clip) => {
              const isPlaying = playingKey === clip.soundKey;
              return (
                <div
                  key={clip.id || clip.soundKey}
                  className={`group relative flex items-center justify-between gap-3 rounded-lg border p-2.5 transition ${
                    isPlaying
                      ? "border-emerald-500/60 bg-emerald-950/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                      : "border-slate-800/80 bg-black/50 hover:border-orange-500/50 hover:bg-black/70"
                  }`}
                >
                  {/* Left: Icon & Info with Alt and Tooltip Text */}
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-slate-700 bg-slate-900/80 p-1 cursor-pointer hover:border-orange-500 transition"
                      onClick={() => openEditModal(clip)}
                      title={`Icon: ${clip.name} (Click to change)`}
                    >
                      {clip.iconUrl ? (
                        <img
                          src={clip.iconUrl}
                          alt={clip.name}
                          title={clip.name}
                          className="h-full w-full object-contain rounded"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <Volume2 className="h-5 w-5 text-orange-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p
                        className="truncate text-xs font-black uppercase text-slate-100 group-hover:text-orange-400 transition"
                        title={clip.name}
                      >
                        {clip.name}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="rounded bg-slate-800 px-1.5 py-0.2 text-[9px] font-bold text-slate-400 uppercase">
                          {clip.category || "general"}
                        </span>
                        {clip.tokenCost ? (
                          <span className="text-[9px] font-bold text-amber-400">
                            {clip.tokenCost} pts
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex shrink-0 items-center gap-1">
                    {/* Local Preview */}
                    <button
                      type="button"
                      onClick={() => playPreviewLocal(clip)}
                      title={isPlaying ? "Stop Preview" : "Play Local Preview"}
                      className={`inline-flex h-7 w-7 items-center justify-center rounded transition ${
                        isPlaying
                          ? "bg-emerald-600 text-white hover:bg-emerald-500"
                          : "border border-slate-700 bg-slate-800/80 text-slate-300 hover:border-orange-500 hover:text-white"
                      }`}
                    >
                      {isPlaying ? <Square className="h-3 w-3 fill-current" /> : <Play className="h-3 w-3 fill-current ml-0.5" />}
                    </button>

                    {/* Broadcast to Audience */}
                    <button
                      type="button"
                      onClick={() => void triggerLivePreview(clip)}
                      title="Broadcast to All Live Viewers"
                      className="inline-flex h-7 w-7 items-center justify-center rounded border border-orange-500/40 bg-orange-950/40 text-orange-300 hover:bg-orange-600 hover:text-white transition"
                    >
                      <Radio className="h-3 w-3" />
                    </button>

                    {/* Edit Modal Button */}
                    <button
                      type="button"
                      onClick={() => openEditModal(clip)}
                      title="Edit Sound & Icon"
                      className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-700 bg-slate-800/60 text-slate-300 hover:bg-slate-700 hover:text-white transition"
                    >
                      <Edit2 className="h-3 w-3" />
                    </button>

                    {/* Delete */}
                    <button
                      type="button"
                      onClick={() => void remove(clip)}
                      title="Delete Clip"
                      className="inline-flex h-7 w-7 items-center justify-center rounded border border-red-500/30 bg-red-950/30 text-red-400 hover:bg-red-600 hover:text-white transition"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Sound & Icon Modal */}
      {editingClip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-orange-500/40 bg-[#16181e] p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Edit2 className="h-4 w-4 text-orange-400" />
                <h3 className="text-sm font-black uppercase tracking-wider text-white">
                  Edit Sound & Icon Assignment
                </h3>
              </div>
              <button
                onClick={() => setEditingClip(null)}
                className="text-slate-400 hover:text-white text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              {/* Icon Preview & Replace */}
              <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-black/50 p-3">
                <div className="grid h-12 w-12 place-items-center rounded-lg border border-slate-700 bg-slate-900 p-1">
                  {editIconUrl ? (
                    <img
                      src={editIconUrl}
                      alt={editName}
                      className="h-full w-full object-contain rounded"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <Volume2 className="h-6 w-6 text-orange-400" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-xs font-bold text-slate-200 uppercase">Assigned Icon</p>
                  <input
                    type="file"
                    ref={editIconInputRef}
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleUploadEditIcon(f);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => editIconInputRef.current?.click()}
                    disabled={editSaving}
                    className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-orange-400 hover:underline"
                  >
                    <Upload className="h-3 w-3" /> Upload New Icon Image
                  </button>
                </div>
              </div>

              {/* Sound Name Text */}
              <div>
                <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                  Sound Display Name / Text *
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-black/60 px-3 py-2 text-xs font-bold text-white focus:border-orange-500 focus:outline-none"
                />
              </div>

              {/* Icon URL Direct Input */}
              <div>
                <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                  Icon URL (Image / Emoji Asset)
                </label>
                <input
                  type="text"
                  value={editIconUrl}
                  onChange={(e) => setEditIconUrl(e.target.value)}
                  placeholder="https://db.unenter.live/storage/v1/object/public/..."
                  className="w-full rounded-lg border border-slate-700 bg-black/60 px-3 py-2 text-xs font-bold text-white focus:border-orange-500 focus:outline-none"
                />
              </div>

              {/* Category & Token Cost */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-300 mb-1">Category</label>
                  <input
                    type="text"
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-black/60 px-3 py-2 text-xs font-bold text-white focus:border-orange-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-300 mb-1">Token Cost</label>
                  <input
                    type="number"
                    min="0"
                    value={editTokenCost}
                    onChange={(e) => setEditTokenCost(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-700 bg-black/60 px-3 py-2 text-xs font-bold text-white focus:border-orange-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setEditingClip(null)}
                className="rounded-lg border border-slate-700 bg-black/40 px-4 py-2 text-xs font-bold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={editSaving || !editName.trim()}
                className="rounded-lg bg-orange-600 px-5 py-2 text-xs font-black uppercase text-white hover:bg-orange-500 transition disabled:opacity-50 shadow"
              >
                {editSaving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SoundboardAdminPanel;
