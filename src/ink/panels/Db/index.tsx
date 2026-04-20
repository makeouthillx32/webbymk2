// src/ink/panels/Db/index.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Database panel — Supabase self-hosted service overview.
//
// Shows all unt_* Supabase containers with their live status.
// Provides quick access to:
//   [↑↓] navigate
//   [b]   backup     — pg_dump streamed to OperationOverlay
//   [l]   logs       — tail a specific container
//   [c]   copy URL   — copy the Kong URL to clipboard
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState }  from "react";
import { Box, Text, useInput } from "ink";
import { KONG_URL }          from "../../db-api.ts";
import { KeyHints }          from "../../components/KeyHint.tsx";
import { Pane }              from "../../components/Pane.tsx";

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

// ── Types ─────────────────────────────────────────────────────────────────────

interface DbPanelProps {
  onLogs:   (container: string) => void;
  onBackup: () => void;
  onCopy:   (text: string) => void;
}

// ── Hints ─────────────────────────────────────────────────────────────────────

const HINTS = [
  { k: "↑↓", label: "navigate"      },
  { k: "l",  label: "logs (focused)" },
  { k: "b",  label: "backup DB"     },
  { k: "c",  label: "copy Kong URL" },
];

// ── Main panel ────────────────────────────────────────────────────────────────

export function DbPanel({ onLogs, onBackup, onCopy }: DbPanelProps) {
  const [selected, setSelected] = useState(0);

  useInput((input, key) => {
    if (key.upArrow || input === "k") {
      setSelected((s) => Math.max(0, s - 1));
    } else if (key.downArrow || input === "j") {
      setSelected((s) => Math.min(DB_SERVICES.length - 1, s + 1));
    } else if (input === "l") {
      const svc = DB_SERVICES[selected];
      if (svc) onLogs(svc.container);
    } else if (input === "b") {
      onBackup();
    } else if (input === "c") {
      onCopy(KONG_URL);
    }
  });

  return (
    <Box flexDirection="column">

      {/* ── Services section ────────────────────────────────────────────── */}
      <Pane title={`Supabase  ·  ${KONG_URL}`} color="cyan" gap={1}>
        {DB_SERVICES.map((svc, i) => {
          const focused = i === selected;
          return (
            <Box key={svc.container} paddingX={1} gap={2}>
              <Text color={focused ? "cyan" : undefined} bold={focused}>
                {focused ? "▶" : " "}
              </Text>
              <Box width={12}>
                <Text color={focused ? "cyan" : undefined} bold={focused}>
                  {svc.label}
                </Text>
              </Box>
              <Box width={20}>
                <Text dimColor>{svc.container}</Text>
              </Box>
              <Text dimColor={!focused}>{svc.desc}</Text>
            </Box>
          );
        })}
      </Pane>

      <KeyHints hints={HINTS} />

    </Box>
  );
}
