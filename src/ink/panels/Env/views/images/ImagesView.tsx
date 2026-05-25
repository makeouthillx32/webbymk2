// src/ink/panels/Env/views/images/ImagesView.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Docker images view for an environment.
// Mirrors: Portainer images_list.go imageUsageSet pattern
//
// Columns: ID · Filter · Tags · Size · Created
//
// Keyboard:
//   [↑↓/jk]  navigate
//   [p]       pull image
//   [d]       remove unused image (confirm)
//   [r]       refresh
//   [q/←]     back
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Box, Text, useInput } from "../../../../runtimeInk.js";

import {
  fetchImages,
  fetchContainers,
  removeImage,
  type ImageSummary,
} from "../../../../agent-client.ts";
import { Divider } from "../../../../components/Divider.tsx";
import { KeyHints } from "../../../../components/KeyHint.tsx";
import { Spinner } from "../../../../components/Spinner.tsx";
import { useTermHeight } from "../../../../hooks/useTermWidth.ts";
import type { UnaxisEnvironment } from "../../../../environment-store.ts";
import { PullImageView } from "./images.pull.tsx";

interface ImagesViewProps {
  env:    UnaxisEnvironment;
  onBack: () => void;
}

const HINTS = [
  { k: "↑↓/jk", label: "navigate" },
  { k: "p",      label: "pull" },
  { k: "d",      label: "remove unused" },
  { k: "r",      label: "refresh" },
  { k: "q/←",    label: "back" },
];

function truncate(text: string, max = 30): string {
  if (!text) return "—";
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
}

function imageId(image: ImageSummary): string {
  return image.Id.replace(/^sha256:/, "").slice(0, 12);
}

/**
 * Mirrors Portainer images_list.go display logic:
 *   - If image has RepoTags, show them joined.
 *   - If no RepoTags but has RepoDigests, Portainer appends ":<none>" to the
 *     digest repo string so it renders consistently in the UI.
 *   - If neither, fall back to "<none>".
 */
function imageTags(image: ImageSummary): string {
  const tags = image.RepoTags ?? [];
  if (tags.length > 0) return tags.join(", ");

  const digests = image.RepoDigests ?? [];
  if (digests.length > 0) {
    const repo = digests[0].split("@")[0];
    return `${repo}:<none>`;
  }

  return "<none>";
}

/**
 * Portainer cross-references container ImageIDs to determine usage.
 * Tags alone aren't reliable — an image can be tagged but have no containers,
 * or be untagged but actively used. We check both.
 */
function isUnusedImage(image: ImageSummary, usedIds: Set<string>): boolean {
  const bareId = image.Id.replace(/^sha256:/, "");
  if (usedIds.has(image.Id) || usedIds.has(bareId)) return false;
  const tags = image.RepoTags ?? [];
  return tags.length === 0 || tags.every((t) => t === "<none>:<none>");
}

function fmtBytes(bytes: number): string {
  if (bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function fmtCreated(created: number): string {
  const ms = created * 1000;
  const diff = Date.now() - ms;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return `${Math.max(1, Math.floor(diff / 1000))}s ago`;
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(ms).toLocaleDateString();
}

function windowSlice<T>(items: T[], selected: number, size: number): { start: number; end: number; rows: T[] } {
  if (items.length <= size) {
    return { start: 0, end: items.length, rows: items };
  }
  const half = Math.floor(size / 2);
  const start = Math.max(0, Math.min(selected - half, items.length - size));
  const end = Math.min(items.length, start + size);
  return { start, end, rows: items.slice(start, end) };
}

export function ImagesView({ env, onBack }: ImagesViewProps) {
  const [images,  setImages]  = useState<ImageSummary[]>([]);
  const [usedIds, setUsedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [status,  setStatus]  = useState<string | null>(null);
  const [selected,      setSelected]      = useState(0);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [showPull,      setShowPull]      = useState(false);

  const termHeight = useTermHeight();
  const listSize = Math.max(5, termHeight - 18);

  const refresh = useCallback(async () => {
    if (!env.agentUrl) {
      setLoading(false);
      setError("Agent URL is missing for this environment.");
      setImages([]);
      return;
    }

    setLoading(true);
    setError(null);
    setStatus(null);
    setPendingDelete(null);

    // Fetch images + containers concurrently — cross-ref ImageIDs for usage
    const [list, containers] = await Promise.all([
      fetchImages(env),
      fetchContainers(env),
    ]);

    if (!list) {
      setImages([]);
      setError("Failed to fetch images from the agent.");
    } else {
      const ids = new Set<string>();
      for (const c of containers ?? []) {
        if (c.ImageID) ids.add(c.ImageID);
        if (c.ImageID) ids.add(c.ImageID.replace(/^sha256:/, ""));
      }
      setUsedIds(ids);
      const sorted = [...list].sort((a, b) => b.Created - a.Created);
      setImages(sorted);
    }
    setLoading(false);
  }, [env]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setSelected((current) => Math.min(current, Math.max(0, images.length - 1)));
  }, [images.length]);

  useEffect(() => {
    setPendingDelete(null);
  }, [selected]);

  const selectedImage = images[selected] ?? null;
  const visible = useMemo(
    () => windowSlice(images, selected, listSize),
    [images, listSize, selected],
  );
  const unusedCount = images.filter((img) => isUnusedImage(img, usedIds)).length;
  const selectedUnused = selectedImage ? isUnusedImage(selectedImage, usedIds) : false;

  const confirmDelete = useCallback(async () => {
    const target = selectedImage;
    if (!target) return;
    if (!isUnusedImage(target, usedIds)) {
      setStatus(`Image ${imageId(target)} is still in use or tagged. Only unused images can be removed.`);
      setPendingDelete(null);
      return;
    }

    if (pendingDelete !== target.Id) {
      setPendingDelete(target.Id);
      setStatus(`Press d again to remove ${imageId(target)}.`);
      return;
    }

    setBusy(true);
    const ok = await removeImage(env, target.Id);
    setBusy(false);
    setPendingDelete(null);

    if (ok) {
      setStatus(`✓ Removed image ${imageId(target)}`);
      await refresh();
    } else {
      setStatus(`✗ Failed to remove image ${imageId(target)}`);
    }
  }, [env, pendingDelete, refresh, selectedImage, usedIds]);

  useInput((input, key) => {
    if (showPull) return;
    if (busy) return;
    if (key.escape || input === "q" || key.leftArrow) { onBack(); return; }
    if (key.upArrow || input === "k") {
      setSelected((value) => Math.max(0, value - 1));
      setPendingDelete(null);
      return;
    }
    if (key.downArrow || input === "j") {
      setSelected((value) => Math.min(Math.max(0, images.length - 1), value + 1));
      setPendingDelete(null);
      return;
    }
    if (input === "p") { setShowPull(true); return; }
    if (input === "r") { void refresh(); return; }
    if (input === "d") { void confirmDelete(); return; }
  });

  if (showPull) {
    return (
      <PullImageView
        env={env}
        onDone={(pulled) => {
          setShowPull(false);
          if (pulled) {
            setStatus("✓ Image pulled");
            void refresh();
          }
        }}
      />
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1} overflow="hidden">
      <Box paddingX={1} gap={2} marginBottom={0}>
        <Text bold color="cyan">Images</Text>
        <Text dimColor>{env.name}</Text>
        <Text dimColor>• {images.length} total</Text>
        {unusedCount > 0 && <Text color="yellow">{unusedCount} unused</Text>}
      </Box>

      <Divider />

      {loading && (
        <Box paddingX={1} marginTop={1}>
          <Spinner message="Loading images…" />
        </Box>
      )}

      {!loading && error && (
        <Box paddingX={1} marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
      )}

      {!loading && !error && images.length === 0 && (
        <Box paddingX={1} marginTop={1}>
          <Text dimColor>No images found.  Press [p] to pull one.</Text>
        </Box>
      )}

      {!loading && !error && images.length > 0 && (
        <Box flexDirection="column" gap={0}>
          {/* Portainer columns: Id · Filter · Tags · Size · Created */}
          <Box paddingX={1} marginTop={1} marginBottom={0} gap={2}>
            <Box width={3}><Text dimColor> </Text></Box>
            <Box width={13}><Text dimColor>Id</Text></Box>
            <Box width={10}><Text dimColor>Filter</Text></Box>
            <Box width={34}><Text dimColor>Tags</Text></Box>
            <Box width={12}><Text dimColor>Size</Text></Box>
            <Box flexGrow={1}><Text dimColor>Created</Text></Box>
          </Box>

          {visible.start > 0 && (
            <Box paddingX={1}><Text dimColor>↑ {visible.start} more</Text></Box>
          )}

          {visible.rows.map((image, idx) => {
            const actualIndex = visible.start + idx;
            const selectedRow = actualIndex === selected;
            const unused = isUnusedImage(image, usedIds);

            return (
              <Box key={image.Id} paddingX={1} gap={2}>
                <Box width={3}>
                  <Text color={unused ? "yellow" : "cyan"} bold={selectedRow}>
                    {selectedRow ? "▶" : unused ? "○" : "●"}
                  </Text>
                </Box>
                <Box width={13}>
                  <Text color={selectedRow ? "cyan" : undefined} bold={selectedRow}>
                    {imageId(image)}
                  </Text>
                </Box>
                <Box width={10}>
                  <Text color={unused ? "yellow" : "green"} dimColor={!unused && !selectedRow}>
                    {unused ? "unused" : "in use"}
                  </Text>
                </Box>
                <Box width={34}>
                  <Text dimColor={!selectedRow} color={selectedRow ? "gray" : undefined}>
                    {truncate(imageTags(image), 32)}
                  </Text>
                </Box>
                <Box width={12}>
                  <Text dimColor={!selectedRow} color={selectedRow ? "gray" : undefined}>
                    {fmtBytes(image.Size)}
                  </Text>
                </Box>
                <Box flexGrow={1}>
                  <Text dimColor color={selectedRow ? "gray" : undefined}>
                    {fmtCreated(image.Created)}
                  </Text>
                </Box>
              </Box>
            );
          })}

          {visible.end < images.length && (
            <Box paddingX={1}><Text dimColor>↓ {images.length - visible.end} more</Text></Box>
          )}
        </Box>
      )}

      {selectedImage && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="gray"
          paddingX={2}
          paddingY={1}
          marginTop={1}
        >
          <Box gap={2}>
            <Text bold color="cyan">{imageId(selectedImage)}</Text>
            <Text color={selectedUnused ? "yellow" : "green"} bold={selectedUnused}>
              {selectedUnused ? "unused" : "in use"}
            </Text>
            <Text dimColor>{fmtBytes(selectedImage.Size)}</Text>
          </Box>
          <Text dimColor>tags: {imageTags(selectedImage)}</Text>
          <Text dimColor>created: {new Date(selectedImage.Created * 1000).toLocaleString()}</Text>
          {selectedImage.RepoDigests?.length ? (
            <Text dimColor>digests: {truncate(selectedImage.RepoDigests.join(", "), 72)}</Text>
          ) : null}
          {selectedImage.Labels && Object.keys(selectedImage.Labels).length > 0 && (
            <Text dimColor>
              labels: {truncate(Object.entries(selectedImage.Labels).map(([k, v]) => `${k}=${v}`).join(", "), 72)}
            </Text>
          )}
        </Box>
      )}

      {status && (
        <Box paddingX={1} marginTop={1}>
          <Text dimColor>{status}</Text>
        </Box>
      )}

      <KeyHints hints={HINTS} />
    </Box>
  );
}
