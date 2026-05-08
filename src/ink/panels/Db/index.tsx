// src/ink/panels/Db/index.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Database panel — Supabase self-hosted service overview.
//
// Shows all unt_* Supabase containers with their live status.
// Navigation and Enter-to-open-logs are handled by SelectMenu.
//
//   [↑↓/jk]  navigate (SelectMenu)
//   [↵]       open logs for the focused container (SelectMenu onSelect)
//   [b]       backup — pg_dump streamed to OperationOverlay
//   [c]       copy Kong API URL to clipboard
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useCallback } from "react";
import { Box, Text, useInput }          from "ink";
import { KONG_URL }                     from "../../db-api.ts";
import { KeyHints }                     from "../../components/KeyHint.tsx";
import { Pane }                         from "../../components/Pane.tsx";
import { SelectMenu, type SelectOption } from "../../components/SelectMenu.tsx";

// ── Supabase service manifest ─────────────────────────────────────────────────

interface DbService {
  label:     string;
  container: string;
  desc:      string;
}

const DB_SERVICES: DbService[] = [
  { label: "Postgres",  container: "unt_db",       desc: "primary database (pg 15)" },
  { label: "Kong",      container: "unt_kong",      desc: "API gateway :8001"        },
  { label: "Auth",      container: "unt_auth",      desc: "GoTrue authentication"    },
  { label: "PostgREST", container: "unt_rest",      desc: "auto REST API"            },
  { label: "Storage",   container: "unt_storage",   desc: "object / file storage"    },
  { label: "Realtime",  container: "unt_realtime",  desc: "WebSocket broadcast"      },
  { label: "Studio",    container: "unt_studio",    desc: "Supabase dashboard UI"    },
  { label: "Meta",      container: "unt_meta",      desc: "postgres-meta"            },
  { label: "Imgproxy",  container: "unt_imgproxy",  desc: "image processing"         },
];

// Map once — static data so no useMemo needed.
const DB_OPTIONS: SelectOption[] = DB_SERVICES.map((svc) => ({
  id:    svc.container,
  label: svc.label,
  desc:  `${svc.container}  ·  ${svc.desc}`,
}));

// ── Types ─────────────────────────────────────────────────────────────────────

interface DbPanelProps {
  onLogs:   (container: string) => void;
  onBackup: () => void;
  onCopy:   (text: string) => void;
  onGoBack: () => void;
}

// ── Hints ─────────────────────────────────────────────────────────────────────

const HINTS = [
  { k: "↑↓/jk", label: "navigate"      },
  { k: "↵",     label: "logs (focused)" },
  { k: "b",     label: "backup DB"      },
  { k: "c",     label: "copy Kong URL"  },
];

// ── Main panel ────────────────────────────────────────────────────────────────

export function DbPanel({ onLogs, onBackup, onCopy, onGoBack }: DbPanelProps) {

  // Tracks whichever service is currently highlighted in SelectMenu.
  // Used by [b] and [c] — neither needs to know the cursor index directly.
  const [highlighted, setHighlighted] = useState<DbService | null>(null);

  const handleSelect = useCallback((opt: SelectOption) => {
    onLogs(opt.id);  // id === container name
  }, [onLogs]);

  const handleHighlight = useCallback((opt: SelectOption) => {
    const svc = DB_SERVICES.find((s) => s.container === opt.id) ?? null;
    setHighlighted(svc);
  }, []);

  // [q/←] back, [b] backup, [c] copy — no conflict with SelectMenu (searchable=false).
  useInput((input, key) => {
    if (input === "q" || key.leftArrow) { onGoBack();        return; }
    if (input === "b")                  { onBackup();         return; }
    if (input === "c")                  { onCopy(KONG_URL);   return; }
  });

  return (
    <Box flexDirection="column">

      {/* ── Services section ────────────────────────────────────────────── */}
      <Pane title={`Supabase  ·  ${KONG_URL}`} color="cyan" gap={1}>
        <SelectMenu
          options={DB_OPTIONS}
          onSelect={handleSelect}
          onHighlight={handleHighlight}
          searchable={false}
        />
      </Pane>

      <KeyHints hints={HINTS} />

    </Box>
  );
}
