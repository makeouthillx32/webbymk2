// tui/tabs/StatusTab.tsx
import React, { useState, useEffect } from "react";
import { Box, Text }                  from "ink";
import { createClient }               from "@supabase/supabase-js";
import { ZONES, PROXY }               from "../../config/zones.ts";
import { type Status }                from "../docker.ts";
import { Dot, Rule, StatusIcon }      from "../ui/primitives.tsx";

// ANON_KEY is the raw .env name; docker-compose remaps it to SUPABASE_ANON_KEY.
// run.ps1 does the same mapping natively — fall back here as a safety net.
const _url  = process.env.SUPABASE_URL      ?? "http://localhost:8000";
const _anon = process.env.SUPABASE_ANON_KEY ?? process.env.ANON_KEY ?? "";
const supabase = _anon ? createClient(_url, _anon) : null;

type StatusMap = Record<string, Status>;

interface StatusTabProps {
  zoneStatuses: StatusMap;
  proxyStatus:  Status;
}

export function StatusTab({ zoneStatuses, proxyStatus }: StatusTabProps) {
  const [dbOk, setDbOk] = useState<boolean | null>(null);

  useEffect(() => {
    if (!supabase) { setDbOk(false); return; }
    supabase
      .from("_pgsodium_masks")
      .select("*", { count: "exact", head: true })
      .then(({ error }) => setDbOk(!error));
  }, []);

  const dbStatus = dbOk === null ? "loading" : dbOk ? "success" : "error";

  return (
    <Box flexDirection="column" paddingX={1} gap={1}>
      <Rule title="system health" />

      {/* Supabase DB */}
      <Box gap={2}>
        <Text dimColor>{"supabase db   "}</Text>
        <StatusIcon status={dbStatus} withSpace />
        {dbOk === null  && <Text color="gray">connecting…</Text>}
        {dbOk === true  && <Text color="green">{process.env.SUPABASE_URL}</Text>}
        {dbOk === false && <Text color="red">unreachable  {process.env.SUPABASE_URL}</Text>}
      </Box>

      <Rule />

      {/* Proxy */}
      <Box gap={2}>
        <Text dimColor>{"proxy         "}</Text>
        <Dot status={proxyStatus} />
        <Text dimColor>  {PROXY.container} :{PROXY.port}</Text>
      </Box>

      {/* All zones */}
      {ZONES.map((zone) => {
        const s = zoneStatuses[zone.key] ?? "missing";
        const iconStatus =
          s === "running"   ? "success" :
          s === "starting"  ? "loading" :
          s === "unhealthy" ? "error"   :
          s === "stopped"   ? "error"   : "warning";
        const textColor =
          s === "runn