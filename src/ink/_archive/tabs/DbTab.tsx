// tui/tabs/DbTab.tsx
import React, { useState, useEffect } from "react";
import { Box, Text }                  from "ink";
import { createClient }               from "@supabase/supabase-js";
import { Rule, StatusIcon }           from "../ui/primitives.tsx";
import { ProgressBar }                from "../ui/ProgressBar.tsx";

// ANON_KEY is the raw .env name; docker-compose remaps it to SUPABASE_ANON_KEY.
// run.ps1 does the same mapping natively — fall back here as a safety net.
const _url  = process.env.SUPABASE_URL      ?? "http://localhost:8000";
const _anon = process.env.SUPABASE_ANON_KEY ?? process.env.ANON_KEY ?? "";
const supabase = _anon ? createClient(_url, _anon) : null;

interface TableInfo {
  table_name:  string;
  table_type:  string;
}

export function DbTab() {
  const [tables,  setTables]  = useState<TableInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setError("SUPABASE_ANON_KEY not set — check your .env");
      setLoading(false);
      return;
    }
    supabase
      .from("information_schema.tables" as never)
      .select("table_name, table_type")
      .eq("table_schema", "public")
      .then(({ data, error: err }: { data: TableInfo[] | null; error: unknown }) => {
        if (err) {
          setError(String(err));
        } else if (data) {
          setTables(data.sort((a, b) => a.table_name.localeCompare(b.table_name)));
        }
        setLoading(false);
      });
  }, []);

  return (
    <Box flexDirection="column" paddingX={1} gap={1}>
      <Rule title="public tables" />

      {loading && (
        <Box gap={1}>
          <StatusIcon status="loading" withSpace />
          <Text color="gray">querying information_schema…</Text>
        </Box>
      )}

      {error && (
        <Box gap={1}>
          <StatusIcon status="error" withSpace />
          <Text color="red">{error}</Text>
        </Box>
      )}

      {!loading && !error && tables.length === 0 && (
        <Box gap={1}>
          <StatusIcon status="warning" withSpace />
          <Text color="yellow">No tables found — run migrations first.</Text>
        </Box>
      )}

      {!loading && tables.length > 0 && (
        <>
          <Box gap={2}>
            <Text dimColor>{"table".padEnd(34)}</Text>
            <Text dimColor>type</Text>
          </Box>
          <Rule width={50} />
          {tables.map((t) => (
            <Box key={t.table_name} gap={2