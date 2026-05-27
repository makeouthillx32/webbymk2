/** @jsxRuntime classic */
// src/ink/screens/SnapshotGalleryScreen.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Snapshot Gallery — browse and restore backup bundles for a RuntimeInstance.
//
// Layout:
//   ┌── Snapshot Gallery · <instance name> · N backups ─────────────────────┐
//   │  ▶ 2026-05-08_14-30-00   Thu May 8, 2026 2:30 PM    42.3 MB           │
//   │    2026-05-07_09-15-00   Wed May 7, 2026 9:15 AM    41.1 MB           │
//   │    …                                                                   │
//   ├── selected bundle detail ────────────────────────────────────────────  │
//   │  Bundle      /path/to/bundle                                           │
//   │  Created     Thu May 8, 2026 2:30 PM                                   │
//   │  db.dump     42.3 MB                                                   │
//   │  restore.sh  /path/to/restore.sh                                       │
//   └────────────────────────────────────────────────────────────────────────┘
//   ⚠ Restore 2026-05-08_14-30-00?  [y] yes   [n] cancel
//   [↑↓/jk] navigate   [↵/r] restore   [Esc/q] back
//
// Keys:
//   ↑↓ / j k    — navigate list
//   ↵  / r      — open restore confirm prompt
//   y            — confirm restore
//   n / Esc      — cancel confirm / close gallery
//   q            — close gallery (back to instances)
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from "../ink/reactRuntime.js";
import { Box, Text, useInput } from "../ink/runtimeInk.js";
import { statSync, existsSync } from "fs";
import { listSnapshots } from "../ink/zone/snapshot.js";
import type { SnapshotBundle } from "../ink/zone/snapshot.js";
import type { RuntimeInstance } from "../ink/zone/supabase-factory.js";
import { Divider } from "../ink/components/Divider.jsx";
import { Spinner } from "../ink/components/Spinner.jsx";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface SnapshotGalleryScreenProps {
  instance: RuntimeInstance;
  onRestore: (bundle: SnapshotBundle) => void;
  onBack: () => void;
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function formatBytes(n: number): string {
  if (n < 1_024) return `${n} B`;
  if (n < 1_048_576) return `${(n / 1_024).toFixed(1)} KB`;
  if (n < 1_073_741_824) return `${(n / 1_048_576).toFixed(1)} MB`;
  return `${(n / 1_073_741_824).toFixed(2)} GB`;
}

function dumpSize(bundle: SnapshotBundle): string {
  try {
    if (existsSync(bundle.files.dbDump)) {
      return formatBytes(statSync(bundle.files.dbDump).size);
    }
  } catch { /* bundle on another machine or dump missing */ }
  return "—";
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleString(); }
  catch { return iso; }
}

// ── SnapshotGalleryScreen ─────────────────────────────────────────────────────

export function SnapshotGalleryScreen({
  instance, onRestore, onBack,
}: SnapshotGalleryScreenProps) {

  const [bundles, setBundles] = useState<SnapshotBundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState(0);
  const [confirmIdx, setConfirmIdx] = useState<number | null>(null);

  // Load snapshot list on mount
  useEffect(() => {
    let cancelled = false;
    listSnapshots(instance).then((list) => {
      if (!cancelled) { setBundles(list); setLoading(false); }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [instance]);

  const selected = bundles[cursor] ?? null;

  // ── Key handling ──────────────────────────────────────────────────────────
  useInput((input, key) => {

    // ── Confirm dialog intercepts everything ──────────────────────────────
    if (confirmIdx !== null) {
      if (input === "y" || key.return) {
        const b = bundles[confirmIdx];
        if (b) onRestore(b);        // parent closes gallery + fires runOp
        setConfirmIdx(null);
        return;
      }
      if (input === "n" || key.escape || input === "q") {
        setConfirmIdx(null);
        return;
      }
      return; // swallow everything else while confirm is open
    }

    // ── List navigation ───────────────────────────────────────────────────
    if (key.upArrow || input === "k") {
      setCursor((c) => Math.max(0, c - 1));
      return;
    }
    if (key.downArrow || input === "j") {
      setCursor((c) => Math.min(bundles.length - 1, c + 1));
      return;
    }

    // ── Restore trigger ───────────────────────────────────────────────────
    if ((key.return || input === "r") && selected) {
      setConfirmIdx(cursor);
      return;
    }

    // ── Back ──────────────────────────────────────────────────────────────
    if (input === "q" || key.escape) { onBack(); return; }
  });

  // ── Header label ─────────────────────────────────────────────────────────
  const headerLabel = loading
    ? `Snapshot Gallery  ·  ${instance.name}  ·  loading…`
    : `Snapshot Gallery  ·  ${instance.name}  ·  ${bundles.length} backup${bundles.length !== 1 ? "s" : ""}`;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Box flexDirection="column" gap={1}>

      <Divider title={headerLabel} color="yellow" />

      {/* ── Loading spinner ─────────────────────────────────────────────── */}
      {loading && (
        <Box paddingX={2} gap={2}>
          <Spinner active={true} />
          <Text dimColor>Scanning backup directory…</Text>
        </Box>
      )}

      {/* ── Empty state ─────────────────────────────────────────────────── */}
      {!loading && bundles.length === 0 && (
        <Box paddingX={2} flexDirection="column" gap={1}>
          <Text dimColor>No snapshots found for {instance.name}.</Text>
          <Text dimColor>From the Instances view press [s] to create the first backup.</Text>
        </Box>
      )}

      {/* ── Snapshot list ───────────────────────────────────────────────── */}
      {!loading && bundles.length > 0 && (
        <Box flexDirection="column" paddingX={2}>
          {bundles.map((b, i) => {
            const isActive = i === cursor;
            const size = dumpSize(b);
            return (
              <Box key={b.id} gap={2}>
                <Text color={isActive ? "yellow" : "gray"}>{isActive ? "▶" : " "}</Text>
                <Text
                  bold={isActive}
                  color={isActive ? "white" : "gray"}
                >
                  {b.id}
                </Text>
                <Text dimColor>{formatDate(b.createdAt)}</Text>
                <Text color={isActive ? "cyan" : "gray"}>{size}</Text>
              </Box>
            );
          })}
        </Box>
      )}

      {/* ── Selected bundle detail panel ────────────────────────────────── */}
      {selected && !loading && (
        <Box
          flexDirection="column"
          paddingX={2}
          paddingY={1}
          marginX={2}
          marginTop={1}
          borderStyle="single"
          borderColor="yellow"
        >
          {(
            [
              ["Bundle", selected.bundlePath],
              ["Created", formatDate(selected.createdAt)],
              ["db.dump", dumpSize(selected)],
              ["schema.sql", existsSync(selected.files.schemaSql) ? "✓ present" : "—"],
              ["restore.sh", selected.files.restoreSh],
            ] as [string, string][]
          ).map(([k, v]) => (
            <Box key={k} gap={1}>
              <Text dimColor>{k.padEnd(12)}</Text>
              <Text color={k === "db.dump" ? "cyan" : k === "schema.sql" && v === "✓ present" ? "green" : undefined}>
                {v}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      {/* ── Restore confirm prompt ──────────────────────────────────────── */}
      {confirmIdx !== null && bundles[confirmIdx] && (
        <Box paddingX={2} marginTop={1} gap={2} flexDirection="column">
          <Text color="yellow" bold>
            ⚠  Restore snapshot  {bundles[confirmIdx]!.id}  onto  {instance.name}?
          </Text>
          <Text dimColor>
            This will run pg_restore into the live Postgres container.
            Current data will be overwritten.
          </Text>
          <Box gap={3} marginTop={1}>
            <Text color="green">[y] confirm restore</Text>
            <Text dimColor>[n / Esc] cancel</Text>
          </Box>
        </Box>
      )}

      {/* ── Key hints ───────────────────────────────────────────────────── */}
      <Box paddingX={2} marginTop={1} gap={3}>
        {confirmIdx === null && (
          <>
            <Text dimColor>[↑↓/jk]</Text><Text dimColor>navigate</Text>
            {selected && (
              <><Text dimColor>[↵/r]</Text><Text dimColor>restore</Text></>
            )}
            <Text dimColor>[Esc/q]</Text><Text dimColor>back</Text>
          </>
        )}
      </Box>

    </Box>
  );
}
