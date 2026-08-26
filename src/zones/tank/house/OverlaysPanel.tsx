"use client";

import { useEffect, useState } from "react";
import { Tv, Copy, Check, Plus, Trash2, Zap, Clock as ClockIcon, X, MessageSquare, Hash } from "lucide-react";
import { ChromePanel } from "../public/components/ChromePanel";
import { ConsoleButton } from "../public/components/ConsoleButton";
import {
  listOverlayScenes,
  createOverlayScene,
  deleteOverlayScene,
  createOverlayTrigger,
  toggleOverlayTrigger,
  deleteOverlayTrigger,
  type OverlayScene,
  type OverlayTriggerType,
  type OverlayTriggerScope,
} from "../server/overlays";

const TRIGGER_TYPE_ICON: Record<OverlayTriggerType, React.ReactNode> = {
  cron: <ClockIcon className="h-3 w-3 shrink-0 text-cyan-400" />,
  action: <Zap className="h-3 w-3 shrink-0 text-yellow-400" />,
  message_count: <Hash className="h-3 w-3 shrink-0 text-emerald-400" />,
  keyword: <MessageSquare className="h-3 w-3 shrink-0 text-pink-400" />,
};

export type OverlaysPanelProps = {
  operatorRole: "admin" | "moderator";
};

// Browser-overlay scene + trigger management — "bones" for the system
// described tonight: scenes are OBS browser sources at /overlay/<slug>,
// each fed by either a cron schedule (real pg_cron jobs, see
// tank_schedule_overlay_trigger in the migration) or an app-level "action"
// key (e.g. tank_signup, fired directly from code via fireOverlayAction —
// see server/overlays.ts). Mutations are admin-only; moderators get a
// read-only view, matching the same admin/moderator split used elsewhere
// in House Console.
export function OverlaysPanel({ operatorRole }: OverlaysPanelProps) {
  const [scenes, setScenes] = useState<OverlayScene[] | null>(null);
  const [origin, setOrigin] = useState("https://tank.unenter.live");
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showNewScene, setShowNewScene] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [newName, setNewName] = useState("");
  const [newSoundKey, setNewSoundKey] = useState("");
  const [newDisplaySeconds, setNewDisplaySeconds] = useState(6);

  const [triggerFormForScene, setTriggerFormForScene] = useState<string | null>(null);
  const [triggerType, setTriggerType] = useState<OverlayTriggerType>("action");
  const [triggerActionKey, setTriggerActionKey] = useState("");
  const [triggerCron, setTriggerCron] = useState("");
  const [triggerKeyword, setTriggerKeyword] = useState("");
  const [triggerMessageCountThreshold, setTriggerMessageCountThreshold] = useState(25);
  const [triggerScope, setTriggerScope] = useState<OverlayTriggerScope>("global");
  const [triggerRoomKey, setTriggerRoomKey] = useState("");
  const [triggerMessage, setTriggerMessage] = useState("");

  const isAdmin = operatorRole === "admin";

  const refresh = async () => {
    const result = await listOverlayScenes();
    setScenes(result);
  };

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
    void refresh();
  }, []);

  const handleCopy = (slug: string) => {
    const url = `${origin}/overlay/${slug}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
      setCopiedSlug(slug);
      setTimeout(() => setCopiedSlug(null), 2000);
    }
  };

  const handleCreateScene = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || busy) return;
    setBusy(true);
    setError(null);
    const res = await createOverlayScene({
      slug: newSlug,
      name: newName,
      soundKey: newSoundKey || null,
      displaySeconds: newDisplaySeconds,
    });
    setBusy(false);
    if (res.success) {
      setShowNewScene(false);
      setNewSlug("");
      setNewName("");
      setNewSoundKey("");
      setNewDisplaySeconds(6);
      void refresh();
    } else {
      setError(res.error ?? "Failed to create scene.");
    }
  };

  const handleDeleteScene = async (sceneId: string) => {
    if (!isAdmin || busy) return;
    if (!confirm("Delete this overlay scene and all its triggers? This cannot be undone.")) return;
    setBusy(true);
    await deleteOverlayScene(sceneId);
    setBusy(false);
    void refresh();
  };

  const handleCreateTrigger = async (e: React.FormEvent, sceneId: string) => {
    e.preventDefault();
    if (!isAdmin || busy) return;
    setBusy(true);
    setError(null);
    const res = await createOverlayTrigger({
      sceneId,
      triggerType,
      actionKey: triggerType === "action" ? triggerActionKey : undefined,
      cronExpression: triggerType === "cron" ? triggerCron : undefined,
      keywordPattern: triggerType === "keyword" ? triggerKeyword : undefined,
      messageCountThreshold: triggerType === "message_count" ? triggerMessageCountThreshold : undefined,
      scope: triggerType === "message_count" || triggerType === "keyword" ? triggerScope : undefined,
      roomKey: triggerScope === "room" ? triggerRoomKey : undefined,
      message: triggerMessage,
    });
    setBusy(false);
    if (res.success) {
      setTriggerFormForScene(null);
      setTriggerActionKey("");
      setTriggerCron("");
      setTriggerKeyword("");
      setTriggerMessageCountThreshold(25);
      setTriggerScope("global");
      setTriggerRoomKey("");
      setTriggerMessage("");
      void refresh();
    } else {
      setError(res.error ?? "Failed to create trigger.");
    }
  };

  const handleToggleTrigger = async (triggerId: string, enabled: boolean) => {
    if (!isAdmin || busy) return;
    setBusy(true);
    await toggleOverlayTrigger(triggerId, enabled);
    setBusy(false);
    void refresh();
  };

  const handleDeleteTrigger = async (triggerId: string) => {
    if (!isAdmin || busy) return;
    setBusy(true);
    await deleteOverlayTrigger(triggerId);
    setBusy(false);
    void refresh();
  };

  return (
    <ChromePanel withScrews>
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-black/15 pb-1">
          <div className="flex items-center gap-2">
            <Tv className="h-4 w-4 text-purple-600" />
            <span className="text-xs font-black uppercase tracking-wider text-[#241f14]">
              BROWSER OVERLAYS & SCENE TRIGGERS
            </span>
          </div>
          {isAdmin && (
            <ConsoleButton
              variant="orange"
              onClick={() => setShowNewScene((prev) => !prev)}
              className="!py-1 !px-2.5 !text-[10px]"
            >
              <Plus className="h-3 w-3" />
              New Scene
            </ConsoleButton>
          )}
        </div>

        {error && <p className="text-xs font-bold text-red-500">{error}</p>}

        {showNewScene && isAdmin && (
          <form onSubmit={handleCreateScene} className="rounded border border-purple-500/30 bg-purple-950/10 p-2.5 space-y-2">
            <div className="grid gap-2 sm:grid-cols-4">
              <input
                type="text"
                required
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
                placeholder="slug (e.g. new-signup)"
                className="rounded border border-black/20 bg-white/90 px-2 py-1 text-xs font-bold text-[#241f14]"
              />
              <input
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Display Name"
                className="rounded border border-black/20 bg-white/90 px-2 py-1 text-xs font-bold text-[#241f14]"
              />
              <input
                type="text"
                value={newSoundKey}
                onChange={(e) => setNewSoundKey(e.target.value)}
                placeholder="sound key (optional)"
                className="rounded border border-black/20 bg-white/90 px-2 py-1 text-xs font-bold text-[#241f14]"
              />
              <input
                type="number"
                min={1}
                max={60}
                value={newDisplaySeconds}
                onChange={(e) => setNewDisplaySeconds(Number(e.target.value))}
                placeholder="Display secs"
                className="rounded border border-black/20 bg-white/90 px-2 py-1 text-xs font-bold text-[#241f14]"
              />
            </div>
            <ConsoleButton variant="orange" type="submit" disabled={busy} className="!py-1 !px-3 !text-xs">
              Create Scene
            </ConsoleButton>
          </form>
        )}

        {scenes === null && <p className="text-xs font-semibold text-slate-500">Loading scenes...</p>}
        {scenes !== null && scenes.length === 0 && (
          <p className="text-xs font-semibold italic text-slate-500">
            No overlay scenes yet. {isAdmin ? "Create one above." : "Ask an admin to create one."}
          </p>
        )}

        <div className="space-y-2.5">
          {(scenes ?? []).map((scene) => (
            <div key={scene.id} className="rounded border border-black/20 bg-white/40 p-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-black text-[#241f14]">{scene.name}</p>
                  <p className="text-[10px] font-mono text-slate-500">/overlay/{scene.slug}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleCopy(scene.slug)}
                    className={`flex items-center gap-1 rounded px-2 py-1 text-[10px] font-black uppercase transition ${
                      copiedSlug === scene.slug ? "bg-emerald-600 text-white" : "bg-black/80 text-white hover:bg-black"
                    }`}
                  >
                    {copiedSlug === scene.slug ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copiedSlug === scene.slug ? "Copied" : "Copy URL"}
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleDeleteScene(scene.id)}
                      className="grid h-6 w-6 place-items-center rounded bg-red-950/60 text-red-400 hover:bg-red-900"
                      title="Delete scene"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Triggers */}
              <div className="space-y-1">
                {scene.triggers.length === 0 && (
                  <p className="text-[10px] italic text-slate-500">No triggers on this scene yet.</p>
                )}
                {scene.triggers.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between gap-2 rounded bg-black/80 px-2 py-1 text-[10px] text-white border border-white/10"
                  >
                    <div className="min-w-0 flex-1 flex items-center gap-1.5">
                      {TRIGGER_TYPE_ICON[t.triggerType]}
                      <span className="font-mono text-slate-400 shrink-0">
                        {t.triggerType === "cron"
                          ? t.cronExpression
                          : t.triggerType === "action"
                            ? t.actionKey
                            : t.triggerType === "keyword"
                              ? `"${t.keywordPattern}"`
                              : `every ${t.messageCountThreshold} msgs (${t.progressCount}/${t.messageCountThreshold})`}
                      </span>
                      {(t.triggerType === "keyword" || t.triggerType === "message_count") && (
                        <span className="shrink-0 rounded bg-white/10 px-1 text-[9px] uppercase text-slate-400">
                          {t.scope === "room" ? t.roomKey : "global"}
                        </span>
                      )}
                      <span className="truncate text-slate-300">— {t.message}</span>
                    </div>
                    {isAdmin && (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleToggleTrigger(t.id, !t.enabled)}
                          className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${
                            t.enabled ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-300"
                          }`}
                        >
                          {t.enabled ? "On" : "Off"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTrigger(t.id)}
                          className="grid h-5 w-5 place-items-center rounded text-red-400 hover:bg-red-950/80"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {isAdmin && (
                <>
                  {triggerFormForScene === scene.id ? (
                    <form
                      onSubmit={(e) => handleCreateTrigger(e, scene.id)}
                      className="rounded border border-black/20 bg-white/60 p-2 space-y-1.5"
                    >
                      <div className="flex gap-2">
                        <select
                          value={triggerType}
                          onChange={(e) => setTriggerType(e.target.value as OverlayTriggerType)}
                          className="rounded border border-black/20 bg-white/90 px-2 py-1 text-[10px] font-bold text-[#241f14]"
                        >
                          <option value="action">On Action</option>
                          <option value="cron">On Cron (time)</option>
                          <option value="message_count">On Message Count</option>
                          <option value="keyword">On Keyword</option>
                        </select>
                        {triggerType === "action" && (
                          <input
                            type="text"
                            required
                            value={triggerActionKey}
                            onChange={(e) => setTriggerActionKey(e.target.value)}
                            placeholder="action key (e.g. tank_signup)"
                            className="flex-1 rounded border border-black/20 bg-white/90 px-2 py-1 text-[10px] font-bold text-[#241f14]"
                          />
                        )}
                        {triggerType === "cron" && (
                          <input
                            type="text"
                            required
                            value={triggerCron}
                            onChange={(e) => setTriggerCron(e.target.value)}
                            placeholder="cron expr (e.g. */30 * * * *)"
                            className="flex-1 rounded border border-black/20 bg-white/90 px-2 py-1 text-[10px] font-mono font-bold text-[#241f14]"
                          />
                        )}
                        {triggerType === "message_count" && (
                          <input
                            type="number"
                            min={1}
                            required
                            value={triggerMessageCountThreshold}
                            onChange={(e) => setTriggerMessageCountThreshold(Number(e.target.value))}
                            placeholder="every N messages"
                            className="flex-1 rounded border border-black/20 bg-white/90 px-2 py-1 text-[10px] font-bold text-[#241f14]"
                          />
                        )}
                        {triggerType === "keyword" && (
                          <input
                            type="text"
                            required
                            value={triggerKeyword}
                            onChange={(e) => setTriggerKeyword(e.target.value)}
                            placeholder="keyword (case-insensitive substring)"
                            className="flex-1 rounded border border-black/20 bg-white/90 px-2 py-1 text-[10px] font-bold text-[#241f14]"
                          />
                        )}
                      </div>
                      {(triggerType === "message_count" || triggerType === "keyword") && (
                        <div className="flex gap-2">
                          <select
                            value={triggerScope}
                            onChange={(e) => setTriggerScope(e.target.value as OverlayTriggerScope)}
                            className="rounded border border-black/20 bg-white/90 px-2 py-1 text-[10px] font-bold text-[#241f14]"
                          >
                            <option value="global">Global (all rooms)</option>
                            <option value="room">Specific Room</option>
                          </select>
                          {triggerScope === "room" && (
                            <input
                              type="text"
                              required
                              value={triggerRoomKey}
                              onChange={(e) => setTriggerRoomKey(e.target.value)}
                              placeholder="room key (e.g. game-room)"
                              className="flex-1 rounded border border-black/20 bg-white/90 px-2 py-1 text-[10px] font-bold text-[#241f14]"
                            />
                          )}
                        </div>
                      )}
                      <input
                        type="text"
                        required
                        value={triggerMessage}
                        onChange={(e) => setTriggerMessage(e.target.value)}
                        placeholder="Overlay message ({{message}} substitutes action context)"
                        className="w-full rounded border border-black/20 bg-white/90 px-2 py-1 text-[10px] font-bold text-[#241f14]"
                      />
                      <div className="flex gap-2">
                        <ConsoleButton variant="orange" type="submit" disabled={busy} className="!py-1 !px-3 !text-[10px]">
                          Add Trigger
                        </ConsoleButton>
                        <ConsoleButton
                          variant="gray"
                          onClick={() => setTriggerFormForScene(null)}
                          className="!py-1 !px-3 !text-[10px]"
                        >
                          Cancel
                        </ConsoleButton>
                      </div>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setTriggerFormForScene(scene.id)}
                      className="flex items-center gap-1 text-[10px] font-bold text-purple-700 hover:underline"
                    >
                      <Plus className="h-3 w-3" /> Add trigger
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </ChromePanel>
  );
}
export default OverlaysPanel;
