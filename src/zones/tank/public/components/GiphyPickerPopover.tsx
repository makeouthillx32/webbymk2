"use client";

import React, { useState, useEffect, useRef } from "react";
import { Search, Loader2, X, Sparkles, TrendingUp } from "lucide-react";
import { type GiphyMediaItem } from "../../server/chatGifs";

const QUICK_TAGS = [
  "Trending",
  "Cat",
  "Laugh",
  "Dance",
  "Hype",
  "Shock",
  "Cry",
  "Popcorn",
  "Facepalm",
  "Cheer",
  "Fail",
];

export type GiphyPickerPopoverProps = {
  isOpen: boolean;
  onClose: () => void;
  onSelectGif: (item: GiphyMediaItem) => void;
};

export function GiphyPickerPopover({
  isOpen,
  onClose,
  onSelectGif,
}: GiphyPickerPopoverProps) {
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState("Trending");
  const [gifs, setGifs] = useState<GiphyMediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const fetchGifs = async (searchTerm: string) => {
    setLoading(true);
    setError(null);
    try {
      const endpoint = searchTerm && searchTerm !== "Trending"
        ? `/api/tank/chat/gifs/search?q=${encodeURIComponent(searchTerm)}&limit=24`
        : "/api/tank/chat/gifs/trending?limit=24";

      const res = await fetch(endpoint);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setGifs(json.data);
      } else {
        setError(json.error || "Failed to load GIFs");
      }
    } catch {
      setError("Network error loading GIFs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const timeout = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);
    void fetchGifs(query || activeTag);
    return () => clearTimeout(timeout);
  }, [isOpen, activeTag]);

  // Debounced search input
  useEffect(() => {
    if (!isOpen) return;
    const debounce = setTimeout(() => {
      if (query.trim()) {
        void fetchGifs(query.trim());
      } else if (activeTag === "Trending") {
        void fetchGifs("");
      }
    }, 350);
    return () => clearTimeout(debounce);
  }, [query, isOpen]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[99999] flex items-end sm:items-center justify-center bg-black/80 p-2 sm:p-4 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[80vh] max-h-[560px] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-purple-500/50 bg-[#121019] shadow-[0_0_30px_rgba(168,85,247,0.25)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-purple-500/30 bg-black/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-tr from-purple-600 to-pink-500 text-xs font-black text-white shadow-md">
              GIF
            </span>
            <span className="font-mono text-xs font-black uppercase tracking-wider text-purple-300">
              GIPHY Vault
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search Input Bar */}
        <div className="border-b border-white/10 bg-black/40 p-3">
          <div className="relative flex items-center">
            <Search className="absolute left-3 h-4 w-4 text-purple-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (e.target.value) setActiveTag("");
              }}
              placeholder="Search all GIFs on GIPHY..."
              className="h-10 w-full rounded-xl border border-purple-500/40 bg-black/80 pl-9 pr-8 text-xs font-medium text-white placeholder-slate-500 outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setActiveTag("Trending");
                  void fetchGifs("");
                }}
                className="absolute right-2.5 text-slate-400 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Quick Reaction Pills */}
          <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {QUICK_TAGS.map((tag) => {
              const active = (activeTag === tag && !query) || (tag === "Trending" && !query && !activeTag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setActiveTag(tag);
                    void fetchGifs(tag);
                  }}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition select-none ${
                    active
                      ? "border border-purple-400 bg-purple-600 text-white shadow-[0_0_8px_rgba(168,85,247,0.5)]"
                      : "border border-white/10 bg-black/60 text-slate-300 hover:border-purple-500/40 hover:text-white"
                  }`}
                >
                  {tag === "Trending" && <TrendingUp className="mr-1 inline h-3 w-3" />}
                  {tag}
                </button>
              );
            })}
          </div>
        </div>

        {/* GIFs Grid */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="grid h-full place-items-center">
              <div className="flex flex-col items-center gap-2 text-purple-400">
                <Loader2 className="h-8 w-8 animate-spin" />
                <span className="font-mono text-xs font-bold uppercase tracking-widest text-slate-400">
                  Fetching GIFs...
                </span>
              </div>
            </div>
          ) : error ? (
            <div className="grid h-full place-items-center p-4 text-center">
              <p className="text-xs font-bold text-red-400">{error}</p>
              <button
                type="button"
                onClick={() => void fetchGifs(query || activeTag)}
                className="mt-2 rounded bg-purple-600 px-3 py-1 text-xs font-bold text-white hover:bg-purple-500"
              >
                Retry
              </button>
            </div>
          ) : gifs.length === 0 ? (
            <div className="grid h-full place-items-center p-4 text-center">
              <p className="text-xs font-bold text-slate-400">No GIFs found for "{query}".</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {gifs.map((gif) => (
                <button
                  key={gif.id}
                  type="button"
                  onClick={() => onSelectGif(gif)}
                  className="group relative block aspect-[4/3] w-full overflow-hidden rounded-lg border border-black/80 bg-black/60 transition hover:border-purple-400 hover:scale-[1.03] active:scale-[0.98]"
                >
                  <img
                    src={gif.webpUrl || gif.previewUrl}
                    alt={gif.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition group-hover:brightness-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition p-1.5 flex items-end">
                    <span className="line-clamp-1 text-[9px] font-bold text-white">
                      {gif.title || "Insert GIF"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer with Giphy Attribution */}
        <div className="flex items-center justify-between border-t border-white/10 bg-black/70 px-4 py-2 text-[10px] font-mono text-slate-400">
          <span>Click any GIF to insert into chat</span>
          <span className="font-bold tracking-wider text-purple-400">
            Powered by GIPHY
          </span>
        </div>
      </div>
    </div>
  );
}
