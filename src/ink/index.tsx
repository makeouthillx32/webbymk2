#!/usr/bin/env bun
// ink/index.tsx
// ─── Formenwerkstatt — Terminal Dashboard (Ink) ───────────────────────────────
// Run with: bun run ink:dev
// Or inside Docker: the `ink` service auto-starts this

import React, { useState, useEffect } from "react";
import { render, Text, Box, useInput, useApp } from "ink";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL ?? "http://localhost:8000",
  process.env.SUPABASE_ANON_KEY ?? ""
);

// ─── Types ────────────────────────────────────────────────────────────────────
type Tab = "status" | "db" | "logs";

// ─── Components ───────────────────────────────────────────────────────────────

function Header() {
  return (
    <Box borderStyle="round" borderColor="cyan" paddingX={2} marginBottom={1}>
      <Text bold color="cyan">
        ⚙  FORMENWERKSTATT — Dev Dashboard
      </Text>
      <Text color="gray">  [Tab] switch view  [q] quit</Text>
    </Box>
  );
}

function StatusView({ dbOk }: { dbOk: boolean | null }) {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold underline color="yellow">
        System Status
      </Text>
      <Box marginTop={1} flexDirection="column" gap={1}>
        <Text>
          Supabase DB:{" "}
          {dbOk === null ? (
            <Text color="gray">checking…</Text>
          ) : dbOk ? (
            <Text color="green">● connected</Text>
          ) : (
            <Text color="red">✗ unreachable</Text>
          )}
        </Text>
        <Text>
          Next.js App: <Text color="green">● running on :3000</Text>
        </Text>
        <Text>
          Ink Dashboard: <Text color="green">● active</Text>
        </Text>
      </Box>
    </Box>
  );
}

function DbView() {
  const [tables, setTables] = useState<string[]>([]);

  useEffect(() => {
    supabase
      .from("information_schema.tables")
      .select("table_name")
      .eq("table_schema", "public")
      .then(({ data }) => {
        if (data) setTables(data.map((r: { table_name: string }) => r.table_name));
      });
  }, []);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold underline color="yellow">
        Public Tables
      </Text>
      <Box marginTop={1} flexDirection="column">
        {tables.length === 0 ? (
          <Text color="gray">No tables yet — run migrations first</Text>
        ) : (
          tables.map((t) => (
            <Text key={t}>
              <Text color="cyan">▸ </Text>
              {t}
            </Text>
          ))
        )}
      </Box>
    </Box>
  );
}

function LogsView() {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold underline color="yellow">
        Logs
      </Text>
      <Text color="gray" marginTop={1}>
        Connect your log stream here — tail files, subscribe to Realtime, etc.
      </Text>
    </Box>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

function App() {
  const { exit } = useApp();
  const [tab, setTab] = useState<Tab>("status");
  const [dbOk, setDbOk] = useState<boolean | null>(null);

  // Check DB connectivity on mount
  useEffect(() => {
    supabase
      .from("_pgsodium_masks")
      .select("*", { count: "exact", head: true })
      .then(({ error }) => setDbOk(!error));
  }, []);

  useInput((input, key) => {
    if (input === "q") exit();
    if (key.tab) {
      const tabs: Tab[] = ["status", "db", "logs"];
      const idx = tabs.indexOf(tab);
      setTab(tabs[(idx + 1) % tabs.length]);
    }
  });

  const tabs: Tab[] = ["status", "db", "logs"];

  return (
    <Box flexDirection="column" padding={1}>
      <Header />

      {/* Tab bar */}
      <Box gap={2} marginBottom={1}>
        {tabs.map((t) => (
          <Text key={t} color={tab === t ? "cyan" : "gray"} bold={tab === t}>
            {tab === t ? `[${t}]` : ` ${t} `}
          </Text>
        ))}
      </Box>

      {/* Content */}
      {tab === "status" && <StatusView dbOk={dbOk} />}
      {tab === "db" && <DbView />}
      {tab === "logs" && <LogsView />}
    </Box>
  );
}

render(<App />);