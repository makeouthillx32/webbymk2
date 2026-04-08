// app/settings/top-banner/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

import "./_components/top-banner.scss";

import { LoadingState } from "./_components/LoadingState";
import { ErrorAlert } from "./_components/ErrorAlert";
import { BannerActionBar, type BannerConfig } from "./_components/BannerActionBar";
import { BannerItemsTable, type BannerItemRow } from "./_components/BannerItemsTable";
import { BannerItemModal } from "./_components/BannerItemModal";
import { DeleteConfirmModal } from "./_components/DeleteConfirmModal";

// -----------------------
// Types
// -----------------------
type BannerRow = {
  id: string;
  key: string;
  is_enabled: boolean;

  display_mode: BannerConfig["display_mode"];
  animation_speed_ms: number;
  rotation_interval_ms: number;
  pause_on_hover: boolean;
  separator: string;
};

// Schedule fields live on site_banner_groups
type GroupRow = BannerItemRow & {
  active_days: number[] | null;
  start_time: string | null; // TIME -> "HH:MM:SS"
  end_time: string | null;
  start_date: string | null; // DATE -> "YYYY-MM-DD"
  end_date: string | null;
  timezone: string;
};

function normalizeDays(arr: any): number[] | null {
  if (!arr) return null;
  if (!Array.isArray(arr)) return null;
  const nums = arr.map((x) => Number(x)).filter((n) => Number.isFinite(n));
  return nums.length ? nums : null;
}

// Modal sends "HH:MM" (or null/empty). DB wants TIME.
// Accept either "HH:MM" or "HH:MM:SS".
function toDbTime(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  if (s.length === 5) return `${s}:00`;
  return s;
}

function toDbDate(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return s ? s : null;
}

export default function TopBannerSettingsPage() {
  const supabase = useMemo(() => {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }, []);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [banner, setBanner] = useState<BannerRow | null>(null);

  // GROUPS
  const [groups, setGroups] = useState<GroupRow[]>([]);

  // banner config
  const [config, setConfig] = useState<BannerConfig>({
    display_mode: "static",
    animation_speed_ms: 450,
    rotation_interval_ms: 2200,
    pause_on_hover: true,
    separator: " • ",
  });
  const [configDirty, setConfigDirty] = useState(false);

  // group modal
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<GroupRow | null>(null);

  // delete
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState<GroupRow | null>(null);

  const BANNER_KEY = "top_banner";

  const load = async () => {
    setErr(null);
    setLoading(true);

    // 1) Ensure banner row exists
    const { data: upserted, error: upsertErr } = await supabase
      .from("site_banners")
      .upsert({ key: BANNER_KEY }, { onConflict: "key" })
      .select(
        "id,key,is_enabled,display_mode,animation_speed_ms,rotation_interval_ms,pause_on_hover,separator"
      )
      .single();

    if (upsertErr) {
      setErr(upsertErr.message);
      setLoading(false);
      return;
    }

    const b = upserted as BannerRow;
    setBanner(b);

    setConfig({
      display_mode: (b.display_mode ?? "static") as BannerConfig["display_mode"],
      animation_speed_ms: Number(b.animation_speed_ms ?? 450),
      rotation_interval_ms: Number(b.rotation_interval_ms ?? 2200),
      pause_on_hover: !!b.pause_on_hover,
      separator: b.separator ?? " • ",
    });
    setConfigDirty(false);

    // 2) Load groups with scheduling fields
    const { data: groupRows, error: groupsErr } = await supabase
      .from("site_banner_groups")
      .select("id,text,position,is_enabled,active_days,start_time,end_time,start_date,end_date,timezone")
      .eq("banner_id", b.id)
      .order("position", { ascending: true });

    if (groupsErr) {
      setErr(groupsErr.message);
      setGroups([]);
      setLoading(false);
      return;
    }

    const mapped: GroupRow[] = (groupRows ?? []).map((g: any) => ({
      id: g.id,
      text: g.text,
      position: g.position,
      is_enabled: !!g.is_enabled,

      active_days: normalizeDays(g.active_days),
      start_time: g.start_time ?? null,
      end_time: g.end_time ?? null,
      start_date: g.start_date ?? null,
      end_date: g.end_date ?? null,
      timezone: g.timezone ?? "America/Chicago",
    }));

    setGroups(mapped);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const previewText = useMemo(() => {
    const enabled = groups
      .filter((g) => g.is_enabled)
      .sort((a, b) => a.position - b.position);

    if (!banner?.is_enabled || enabled.length === 0) return "Banner is disabled.";
    return enabled[0].text;
  }, [banner?.is_enabled, groups]);

  // -----------------------
  // Banner enabled toggle
  // -----------------------
  const setBannerEnabled = async (enabled: boolean) => {
    if (!banner) return;
    setErr(null);

    const { error } = await supabase
      .from("site_banners")
      .update({ is_enabled: enabled })
      .eq("id", banner.id);

    if (error) {
      setErr(error.message);
      return;
    }

    setBanner({ ...banner, is_enabled: enabled });
  };

  // -----------------------
  // Config save
  // -----------------------
  const updateConfig = (next: BannerConfig) => {
    setConfig(next);
    setConfigDirty(true);
  };

  const saveConfig = async () => {
    if (!banner) return;
    setErr(null);

    const { error } = await supabase
      .from("site_banners")
      .update({
        display_mode: config.display_mode,
        animation_speed_ms: config.animation_speed_ms,
        rotation_interval_ms: config.rotation_interval_ms,
        pause_on_hover: config.pause_on_hover,
        separator: config.separator,
      })
      .eq("id", banner.id);

    if (error) {
      setErr(error.message);
      return;
    }

    setConfigDirty(false);
    setBanner({
      ...banner,
      display_mode: config.display_mode,
      animation_speed_ms: config.animation_speed_ms,
      rotation_interval_ms: config.rotation_interval_ms,
      pause_on_hover: config.pause_on_hover,
      separator: config.separator,
    });
  };

  // -----------------------
  // Group CRUD (modal now edits text + schedule)
  // -----------------------
  const openAddGroup = () => {
    setEditingGroup(null);
    setGroupModalOpen(true);
  };

  const openEditGroup = (group: BannerItemRow) => {
    const full = groups.find((g) => g.id === group.id) ?? null;
    setEditingGroup(full);
    setGroupModalOpen(true);
  };

  const saveGroup = async (data: {
    text: string;

    active_days?: number[] | null;
    start_time?: string | null; // "HH:MM"
    end_time?: string | null;
    start_date?: string | null; // "YYYY-MM-DD"
    end_date?: string | null;
    timezone?: string | null;
  }) => {
    if (!banner) return;
    setErr(null);

    const payload = {
      text: data.text.trim(),

      // schedule fields (optional)
      active_days: data.active_days && data.active_days.length ? data.active_days : null,
      start_time: toDbTime(data.start_time),
      end_time: toDbTime(data.end_time),
      start_date: toDbDate(data.start_date),
      end_date: toDbDate(data.end_date),
      timezone: (data.timezone ?? "America/Chicago").trim() || "America/Chicago",
    };

    if (editingGroup) {
      const { error } = await supabase
        .from("site_banner_groups")
        .update(payload)
        .eq("id", editingGroup.id);

      if (error) {
        setErr(error.message);
        return;
      }
    } else {
      const nextPos = groups.length ? Math.max(...groups.map((g) => g.position)) + 1 : 0;

      const { error } = await supabase.from("site_banner_groups").insert({
        banner_id: banner.id,
        position: nextPos,
        is_enabled: true,
        ...payload,
      });

      if (error) {
        setErr(error.message);
        return;
      }
    }

    await load();
  };

  const toggleGroupEnabled = async (group: BannerItemRow, enabled: boolean) => {
    setErr(null);

    const { error } = await supabase
      .from("site_banner_groups")
      .update({ is_enabled: enabled })
      .eq("id", group.id);

    if (error) {
      setErr(error.message);
      return;
    }

    setGroups((prev) =>
      prev.map((x) => (x.id === group.id ? { ...x, is_enabled: enabled } : x))
    );
  };

  // -----------------------
  // Delete
  // -----------------------
  const openDelete = (group: BannerItemRow) => {
    const full = groups.find((g) => g.id === group.id) ?? null;
    setDeletingGroup(full);
    setDeleteOpen(true);
  };

  const confirmDelete = async (group: BannerItemRow) => {
    setErr(null);

    const { error } = await supabase
      .from("site_banner_groups")
      .delete()
      .eq("id", group.id);

    if (error) {
      setErr(error.message);
      return;
    }

    await load();
  };

  // -----------------------
  // UI
  // -----------------------
  return (
    <div className="top-banner-manager">
      <div className="top-banner-header">
        <div>
          <h1 className="text-xl font-semibold text-[hsl(var(--foreground))]">Top Banner</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Manage the message bar shown above the header.
          </p>
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
            Each row below is a <b>group</b>. Open a group to edit text + scheduling.
          </p>
        </div>

        <div className="top-banner-preview">
          <div className="top-banner-preview-bar">{previewText}</div>
        </div>

        <BannerActionBar
          enabled={!!banner?.is_enabled}
          onToggleEnabled={setBannerEnabled}
          onAddGroup={openAddGroup}
          config={config}
          onConfigChange={updateConfig}
          dirty={configDirty}
          onSaveConfig={saveConfig}
        />
      </div>

      {err ? <ErrorAlert message={err} onRetry={load} /> : null}

      {loading ? (
        <LoadingState />
      ) : (
        <BannerItemsTable
          items={groups}
          onEdit={openEditGroup}
          onDelete={openDelete}
          onToggleEnabled={toggleGroupEnabled}
        />
      )}

      <BannerItemModal
        open={groupModalOpen}
        item={editingGroup}
        onClose={() => setGroupModalOpen(false)}
        onSave={saveGroup}
      />

      <DeleteConfirmModal
        open={deleteOpen}
        item={deletingGroup}
        onClose={() => setDeleteOpen(false)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
