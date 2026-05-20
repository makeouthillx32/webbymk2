// src/ink/panels/Env/views/ImagesView.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Scrollable image list. Unused images (no tags) are marked and can be deleted.
//
// Keyboard:
//   ↑↓/jk   scroll
//   d        remove selected image (only if unused/untagged)
//   R        refresh
//   q/←      back
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Box, Text, useInput }                              from "ink";

import { fetchImages, removeImage }  from "../../../agent-client.ts";
import type { ImageSummary }         from "../../../agent-client.ts";
import { Spinner }                   from "../../../components/Spinner.tsx";
import { Divider }                   from "../../../components/Divider.tsx";
import { KeyHints }                  from "../../../components/KeyHint.tsx";
import type { UnaxisEnvironment }    from "../../../environment-store.ts";

// ── Helpers ───────────────────────────────────────────────────────────────────

function trunc(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function fmtBytes(bytes: number): string {
  if (bytes <= 0)    return "—";
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`;
  if (bytes >= 1e9)  return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6)  return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3)  return `${(bytes / 1e3).toFixed(1)} KB`;
  return `${bytes} B`;
}

function fmtAge(unix: number): string {
  const diff = Math.floor(Date.now() / 1000) - unix;
  if (diff < 60)        return `${diff}s ago`;
  if (diff < 3600)      return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)     return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(unix * 1000).toISOString().slice(0, 10);
}

function shortId(id: string): string {
  // "sha256:abcdef…" → "abcdef…" (12 chars)
  const raw = id.startsWith("sha256:") ? id.slice(7) : id;
  return raw.slice(0, 12);
}

function isUnused(img: ImageSummary): boolean {
  return !img.RepoTags || img.RepoTags.length === 0 || img.RepoTags.every((t) => t === "<none>:<none>");
}

function tagDisplay(img: ImageSummary): string {
  if (isUnused(img)) return "<none>";
  return (img.RepoTags ?? []).join(", ");
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ImagesView({
  env,
  onBack,
}: {
  env:    UnaxisEnvironment;
  onBack: () => void;
}) {
  const [images,     setImages]     = useState<ImageSummary[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [selected,   setSelected]   = useState(0);
  const [status,     setStatus]     = useState<string | null>(null);
  const [acting,     setActing]     = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const data = await fetchImages(env);
    setLoading(false);
    if (data) {
      setImages(data);
      setSelected((s) => Math.min(s, Math.max(0, data.length - 1)));
    } else {
      setError("Failed to fetch images from agent.");
    }
  }, [env]);

  useEffect(() => { load(); }, [load]);

  const armConfirm = useCallback(() => {
    setConfirmDel(true);
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    confirmTimer.current = setTimeout(() => setConfirmDel(false), 2000);
  }, []);

  const doDelete = useCallback(async () => {
    const img = images[selected];
    if (!img)           return;
    if (!isUnused(img)) { setStatus("Only unused (untagged) images can be removed here."); return; }
    if (!confirmDel)    { armConfirm(); setStatus("Press [d] again to confirm delete"); return; }
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    setConfirmDel(false);
    setActing(true);
    setStatus(`removing ${shortId(img.Id)}…`);
    const ok = await removeImage(env, img.Id);
    setStatus(ok ? "image removed" : "remove failed");
    setActing(false);
    await load();
  }, [images, selected, env, confirmDel, armConfirm, load]);

  useInput((input, key) => {
    if (acting) return;
    if (key.leftArrow || input === "q") { onBack(); return; }
    if (key.upArrow   || input === "k") { setSelected((s) => Math.max(0, s - 1)); return; }
    if (key.downArrow || input === "j") {
      setSelected((s) => Math.min(images.length - 1, s + 1));
      return;
    }
    if (input === "R") { load(); return; }
    if (input === "d") { doDelete(); return; }
  });

  const hints = [
    { k: "↑↓/jk", label: "scroll" },
    { k: "d",      label: confirmDel ? "confirm delete!" : "remove unused" },
    { k: "R",      label: "refresh" },
    { k: "q/←",   label: "back" },
  ];

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1} gap={0}>
      {/* Header */}
      <Box gap={2} alignItems="center">
        <Text bold color="cyan">Images</Text>
        <Box borderStyle="round" borderColor="gray" paddingX={1}>
          <Text bold color="white">{images.length}</Text>
        </Box>
        <Text dimColor>on {env.name}</Text>
        {status && <Text color={confirmDel ? "yellow" : "cyan"}>{status}</Text>}
        {acting  && <Spinner />}
      </Box>

      <Divider />

      {loading && (
        <Box gap={1} paddingX={1}>
          <Spinner />
          <Text color="yellow">Loading images…</Text>
        </Box>
      )}
      {error && !loading && <Text color="red">{error}</Text>}
      {!loading && !error && images.length === 0 && (
        <Text dimColor>No images found.</Text>
      )}

      {!loading && images.map((img, i) => {
        const isSel  = i === selected;
        const unused = isUnused(img);
        const tags   = tagDisplay(img);
        return (
          <Box key={img.Id} gap={1} paddingX={isSel ? 0 : 1} flexDirection="row">
            {isSel && <Text color="cyan">▶</Text>}
            {unused && <Text dimColor>[Unused]</Text>}
            <Text color={isSel ? "cyan" : "white"} bold={isSel}>
              {trunc(tags === "<none>" ? shortId(img.Id) : trunc(tags, 40), 40)}
            </Text>
            {tags === "<none>" && <Text dimColor>{tags}</Text>}
            <Text dimColor>{shortId(img.Id)}</Text>
            <Text dimColor>{fmtBytes(img.Size)}</Text>
            <Text dimColor>{fmtAge(img.Created)}</Text>
          </Box>
        );
      })}

      <KeyHints hints={hints} />
    </Box>
  );
}
