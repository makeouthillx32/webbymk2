"use client";

import Link from "next/link";
import { useState, useEffect, type ReactNode } from "react";
import {
  Activity,
  Antenna,
  Bell,
  Boxes,
  Camera,
  CheckCircle2,
  ChevronRight,
  CirclePause,
  Eye,
  EyeOff,
  Gauge,
  History,
  LayoutDashboard,
  Lock,
  MessageSquare,
  Radio,
  RadioTower,
  RefreshCw,
  Settings2,
  Shield,
  SlidersHorizontal,
  Users,
  Video,
  Webhook,
  XCircle,
  Dices,
  Coins,
  Search,
  Trash2,
  Clock,
  Ban,
  UserCheck,
  Zap,
  ExternalLink,
  HelpCircle,
  Home,
  Tv,
  Pin,
  BarChart3,
  X,
  Plus,
} from "lucide-react";
import type { AdminSection, StreamHealth, TankCamera } from "../contracts";
import { cameras as initialCameras, channels } from "../fixtures";
import LiveCameraRegistry from "./LiveCameraRegistry";
import {
  getAdminChatDeskData,
  auditUserChatHistory,
  saveAutomodConfigAction,
  unbanUserAction,
  banUserFromDeskAction,
  getAdminUsersList,
  grantUserTokensAction,
  updateUserRoleAction,
  getLiveRngEvents,
  type AdminChatDeskData,
  type AdminUserRecord,
  type RngLiveEvent,
} from "../server/adminDeskActions";
import { type AutomodConfig } from "../server/chatModerationDb";
import { useDirectorAttention } from "../director/useDirectorAttention";
import {
  createPollAction,
  endPollAction,
  getActivePoll,
} from "../server/pollSystem";
import type { ActivePoll } from "../server/pollContract";
import { DirectorWorkspace } from "../director-configuration/components/DirectorWorkspace/DirectorWorkspace";

const nav: { section: AdminSection; label: string; icon: typeof Activity }[] = [
  { section: "overview", label: "Overview", icon: LayoutDashboard },
  { section: "chat", label: "Chat & Moderation", icon: MessageSquare },
  { section: "economy", label: "Economy & RNG", icon: Dices },
  { section: "users", label: "Users & Levels", icon: Users },
  { section: "director", label: "Director", icon: Video },
  { section: "sources", label: "Sources", icon: Antenna },
  { section: "channels", label: "Channels", icon: Radio },
  { section: "webhooks", label: "Webhooks", icon: Webhook },
  { section: "system", label: "System", icon: Settings2 },
];

function tone(health: StreamHealth) {
  return health === "live"
    ? "bg-emerald-500"
    : health === "degraded"
      ? "bg-amber-500"
      : "bg-slate-500";
}

function Panel({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-4 border-b border-border p-5">
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export default function AdminConsole({
  section: initialSection,
  operatorName,
}: {
  section: AdminSection;
  operatorName: string;
}) {
  const [currentSection, setCurrentSection] = useState<AdminSection>(initialSection || "overview");
  const [sources, setSources] = useState<TankCamera[]>(initialCameras);
  const [scene, setScene] = useState("LIVE");
  const [paused, setPaused] = useState(false);
  const [locked, setLocked] = useState(true);

  const updateSource = (id: string, patch: Partial<TankCamera>) =>
    setSources((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );

  const sectionLabel =
    nav.find((item) => item.section === currentSection)?.label ?? "Backstage";

  return (
    <main className="min-h-screen min-h-[100dvh] bg-muted/20 text-foreground">
      {/* ═══════════ TOP COMMAND SWITCHER ═══════════ */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 font-black tracking-wider text-primary"
            >
              <Shield className="h-5 w-5" />
              <span>TANK MANAGEMENT</span>
            </Link>
            <span className="text-muted-foreground/40">/</span>
            <span className="text-sm font-semibold text-muted-foreground">
              {sectionLabel}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Quick Cross-Deck Links */}
            <Link
              href="/house"
              className="flex items-center gap-1.5 rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-xs font-bold text-orange-400 hover:bg-orange-500/20 transition"
              title="Live House Director Command Console"
            >
              <Home className="h-3.5 w-3.5" />
              <span>House Deck (/house)</span>
            </Link>

            <Link
              href="/obs"
              target="_blank"
              className="flex items-center gap-1.5 rounded-xl border border-border bg-muted/60 px-3 py-1.5 text-xs font-bold hover:bg-muted transition"
              title="Clean OBS Ingest Output"
            >
              <Tv className="h-3.5 w-3.5 text-cyan-400" />
              <span>OBS Feed (/obs)</span>
            </Link>

            <Link
              href="/"
              className="flex items-center gap-1.5 rounded-xl border border-border bg-muted/60 px-3 py-1.5 text-xs font-bold hover:bg-muted transition"
            >
              <ExternalLink className="h-3.5 w-3.5 text-emerald-400" />
              <span>Live Site</span>
            </Link>

            <div className="ml-2 flex items-center gap-2 border-l border-border pl-4">
              <span className="text-xs text-muted-foreground">Operator:</span>
              <strong className="text-xs font-bold text-primary">
                {operatorName}
              </strong>
            </div>
          </div>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-4rem)] lg:grid-cols-[240px_1fr]">
        {/* ═══════════ SIDEBAR NAVIGATION ═══════════ */}
        <aside className="border-r border-border bg-card p-4">
          <nav className="space-y-1">
            {nav.map((item) => {
              const Icon = item.icon;
              const active = currentSection === item.section;
              return (
                <button
                  key={item.section}
                  onClick={() => setCurrentSection(item.section)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* ═══════════ MAIN CONTENT AREA ═══════════ */}
        <div className="p-6 space-y-6">
          {currentSection === "overview" && (
            <Overview sources={sources} scene={scene} setScene={setScene} locked={locked} setLocked={setLocked} />
          )}

          {currentSection === "chat" && <LiveChatModerationDesk operatorName={operatorName} />}

          {currentSection === "economy" && <LiveEconomyDesk />}

          {currentSection === "users" && <LiveUsersDesk />}

          {currentSection === "director" && <DirectorWorkspace />}

          {currentSection === "sources" && (
            <Sources sources={sources} updateSource={updateSource} />
          )}

          {currentSection === "channels" && <Channels />}

          {currentSection === "webhooks" && <Webhooks />}

          {currentSection === "system" && <SystemPanel />}
        </div>
      </div>
    </main>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. LIVE CHAT MODERATION & BAN AUDIT DESK
// ═══════════════════════════════════════════════════════════════════════════════
function LiveChatModerationDesk({ operatorName }: { operatorName: string }) {
  const [data, setData] = useState<AdminChatDeskData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [auditLogs, setAuditLogs] = useState<any[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [unbanningId, setUnbanningId] = useState<string | null>(null);
  const [automodSaving, setAutomodSaving] = useState(false);
  const [automodState, setAutomodState] = useState<AutomodConfig | null>(null);

  const loadData = async () => {
    try {
      const res = await getAdminChatDeskData();
      setData(res);
      setAutomodState(res.automod);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleAuditSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    const res = await auditUserChatHistory(searchQuery.trim());
    setAuditLogs(res.logs);
    setSearching(false);
  };

  const handleUnban = async (userId: string) => {
    setUnbanningId(userId);
    await unbanUserAction(userId);
    await loadData();
    setUnbanningId(null);
  };

  const handleSaveAutomod = async () => {
    if (!automodState) return;
    setAutomodSaving(true);
    await saveAutomodConfigAction(automodState);
    setAutomodSaving(false);
    await loadData();
  };

  return (
    <div className="space-y-6">
      {/* Search Audit History Bar */}
      <Panel
        title="User Chat History Audit Desk"
        description="Permanent Supabase database chat log search — retrieve full transcripts of any user or banned account."
      >
        <form onSubmit={handleAuditSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Username or User ID (e.g. AlienKitten, usr-1234)..."
              className="w-full rounded-xl border border-border bg-background pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <button
            type="submit"
            disabled={searching || !searchQuery.trim()}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {searching ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span>Audit Search</span>
          </button>
        </form>

        {auditLogs && (
          <div className="mt-4 rounded-xl border border-border bg-muted/40 p-3 max-h-60 overflow-y-auto space-y-1.5">
            <div className="flex items-center justify-between pb-1 border-b border-border text-xs font-bold text-muted-foreground">
              <span>Search Results: {auditLogs.length} messages found</span>
              <button
                type="button"
                onClick={() => setAuditLogs(null)}
                className="text-primary hover:underline"
              >
                Clear
              </button>
            </div>
            {auditLogs.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-4 text-center">
                No chat history found for this query.
              </p>
            ) : (
              auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start justify-between gap-3 text-xs bg-background p-2 rounded border border-border/50"
                >
                  <div>
                    <span className="font-bold text-orange-400">@{log.user}</span>
                    <span className="ml-1 text-[10px] text-muted-foreground font-mono">
                      (#{log.roomId})
                    </span>
                    <p className="text-foreground mt-0.5">{log.body}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {log.time}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        {/* Active Bans and Timeouts Table */}
        <Panel
          title="Active Bans & Timeouts"
          description="Users currently restricted from posting across all house rooms."
          action={
            <button
              onClick={() => void loadData()}
              className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground"
              title="Refresh bans"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          }
        >
          {loading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading ban logs...</p>
          ) : !data?.bannedUsers || data.bannedUsers.length === 0 ? (
            <div className="py-8 text-center">
              <UserCheck className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
              <p className="text-sm font-bold">No active bans or timeouts</p>
              <p className="text-xs text-muted-foreground mt-1">All viewers currently have clear chat standing.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.bannedUsers.map((banEntry) => {
                const isPermanent = !banEntry.expiresAt;
                const remainingMinutes = banEntry.expiresAt
                  ? Math.max(0, Math.ceil((banEntry.expiresAt - Date.now()) / 60000))
                  : null;

                return (
                  <div
                    key={banEntry.userId}
                    className="flex items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-950/20 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-red-400">
                          @{banEntry.userName}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.2 text-[9px] font-black uppercase ${
                            isPermanent
                              ? "bg-red-500 text-black"
                              : "bg-amber-500 text-black"
                          }`}
                        >
                          {isPermanent ? "Permanent Ban" : `Timeout (${remainingMinutes}m remaining)`}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        Reason: <span className="text-foreground">{banEntry.reason}</span>
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={unbanningId === banEntry.userId}
                      onClick={() => handleUnban(banEntry.userId)}
                      className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white transition disabled:opacity-50 shrink-0"
                    >
                      {unbanningId === banEntry.userId ? "Unbanning..." : "Unban"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        {/* Live Automod Safety Controls */}
        <Panel
          title="Automod & Rules"
          description="Real-time message filtering and throttle settings."
          action={
            <button
              onClick={handleSaveAutomod}
              disabled={automodSaving || !automodState}
              className="rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50"
            >
              {automodSaving ? "Saving..." : "Save Rules"}
            </button>
          }
        >
          {automodState ? (
            <div className="space-y-4 text-sm">
              <label className="flex items-center justify-between gap-3 rounded-xl bg-muted/60 p-3 font-semibold">
                <span>Automod Filter Active</span>
                <input
                  type="checkbox"
                  checked={automodState.enabled}
                  onChange={(e) => setAutomodState({ ...automodState, enabled: e.target.checked })}
                  className="h-4 w-4 accent-primary"
                />
              </label>

              <label className="flex items-center justify-between gap-3 rounded-xl bg-muted/60 p-3 font-semibold">
                <span>Block Links from Viewers</span>
                <input
                  type="checkbox"
                  checked={automodState.blockLinks}
                  onChange={(e) => setAutomodState({ ...automodState, blockLinks: e.target.checked })}
                  className="h-4 w-4 accent-primary"
                />
              </label>

              <div className="rounded-xl bg-muted/60 p-3 space-y-1.5">
                <span className="font-semibold text-xs block">Slow Mode Throttle (Seconds)</span>
                <select
                  value={automodState.slowModeSeconds}
                  onChange={(e) =>
                    setAutomodState({ ...automodState, slowModeSeconds: Number(e.target.value) })
                  }
                  className="w-full rounded-lg border border-border bg-background p-2 text-xs font-bold"
                >
                  <option value={0}>Off (No throttle)</option>
                  <option value={3}>3 Seconds</option>
                  <option value={5}>5 Seconds</option>
                  <option value={10}>10 Seconds</option>
                  <option value={30}>30 Seconds</option>
                </select>
              </div>

              <div className="rounded-xl bg-muted/60 p-3 space-y-1.5">
                <span className="font-semibold text-xs block">Max Message Length</span>
                <input
                  type="number"
                  value={automodState.maxMessageLength}
                  onChange={(e) =>
                    setAutomodState({ ...automodState, maxMessageLength: Number(e.target.value) })
                  }
                  className="w-full rounded-lg border border-border bg-background p-2 text-xs font-bold"
                />
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Loading settings...</p>
          )}
        </Panel>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. LIVE ECONOMY & RNG DESK
// ═══════════════════════════════════════════════════════════════════════════════
function LiveEconomyDesk() {
  const [events, setEvents] = useState<RngLiveEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const loadEvents = async () => {
    try {
      const data = await getLiveRngEvents();
      setEvents(data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    void loadEvents();
    const interval = setInterval(() => void loadEvents(), 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      {/* Live RNG Activity Feed */}
      <Panel
        title="Live House RNG & Mini-Games Activity"
        description="Real-time dice rolls, slot spins, coinflips, Russian roulette, and crate unboxing drops."
        action={
          <button
            onClick={() => void loadEvents()}
            className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        }
      >
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center italic">
            No RNG mini-game events recorded recently.
          </p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {events.map((evt) => (
              <div
                key={evt.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/40 p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-yellow-400">
                      @{evt.userName}
                    </span>
                    <span className="rounded bg-purple-500/20 text-purple-300 px-1.5 py-0.2 text-[9px] font-black uppercase">
                      {evt.messageType}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      #{evt.roomId}
                    </span>
                  </div>
                  <p className="text-xs text-foreground mt-0.5 font-medium">{evt.body}</p>
                </div>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {evt.time}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* Economy Overview & Rules */}
      <div className="grid gap-6 sm:grid-cols-3">
        <Panel title="Casino Slots Multiplier">
          <div className="space-y-2 text-xs">
            <div className="flex justify-between border-b border-border pb-1">
              <span>3x 👑 Jackpots</span>
              <strong className="text-amber-400">50x Payout</strong>
            </div>
            <div className="flex justify-between border-b border-border pb-1">
              <span>3x 💎 Diamonds</span>
              <strong className="text-cyan-400">25x Payout</strong>
            </div>
            <div className="flex justify-between border-b border-border pb-1">
              <span>3x 🍒 Cherries</span>
              <strong className="text-red-400">5x Payout</strong>
            </div>
            <div className="flex justify-between">
              <span>Rare Item Drop Chance</span>
              <strong className="text-emerald-400">12%</strong>
            </div>
          </div>
        </Panel>

        <Panel title="Loot Drop Tiers">
          <div className="space-y-2 text-xs">
            <div className="flex justify-between border-b border-border pb-1">
              <span>Legendary (Deed, Lightsaber)</span>
              <strong className="text-amber-400">2%</strong>
            </div>
            <div className="flex justify-between border-b border-border pb-1">
              <span>Epic (Royal Jelly, Keys)</span>
              <strong className="text-purple-400">8%</strong>
            </div>
            <div className="flex justify-between border-b border-border pb-1">
              <span>Rare (Didgeridoo, Mask)</span>
              <strong className="text-blue-400">20%</strong>
            </div>
            <div className="flex justify-between">
              <span>Common (Monitor, Gloves)</span>
              <strong className="text-slate-400">70%</strong>
            </div>
          </div>
        </Panel>

        <Panel title="Discord Broadcast Engine">
          <div className="space-y-2 text-xs">
            <div className="flex justify-between border-b border-border pb-1">
              <span>Trigger Interval</span>
              <strong className="text-primary">Every 25 Msgs</strong>
            </div>
            <div className="flex justify-between border-b border-border pb-1">
              <span>Target Chat Room</span>
              <strong className="text-foreground">Global (Director)</strong>
            </div>
            <div className="flex justify-between">
              <span>Attribution</span>
              <strong className="text-emerald-400">CONSOLE (Action Pill)</strong>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. LIVE USERS & PROGRESSION DESK
// ═══════════════════════════════════════════════════════════════════════════════
function LiveUsersDesk() {
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [modifyingId, setModifyingId] = useState<string | null>(null);

  const loadUsers = async () => {
    try {
      const list = await getAdminUsersList();
      setUsers(list);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const handleGrantTokens = async (userId: string, delta: number) => {
    setModifyingId(userId);
    await grantUserTokensAction(userId, delta);
    await loadUsers();
    setModifyingId(null);
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    setModifyingId(userId);
    await updateUserRoleAction(userId, newRole);
    await loadUsers();
    setModifyingId(null);
  };

  return (
    <Panel
      title="User Accounts & Iceberg Level Progression"
      description="View viewer roles, XP accrual, token wallets, and manage permissions."
      action={
        <button
          onClick={() => void loadUsers()}
          className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="pb-3">User</th>
              <th className="pb-3">Role</th>
              <th className="pb-3">Level & XP</th>
              <th className="pb-3">Tokens</th>
              <th className="pb-3">Inventory</th>
              <th className="pb-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="py-4">
                  <strong>{u.name}</strong>
                  {u.email && <p className="text-xs text-muted-foreground">{u.email}</p>}
                </td>
                <td className="py-4">
                  <select
                    value={u.role}
                    disabled={modifyingId === u.id}
                    onChange={(e) => handleRoleChange(u.id, e.target.value)}
                    className="rounded border border-border bg-background px-2 py-1 text-xs font-bold uppercase text-primary"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="member">Member</option>
                    <option value="moderator">Moderator</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td className="py-4">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-xs">Lvl {u.level}</span>
                    <span className="text-xs text-muted-foreground">
                      ({u.xp.toLocaleString()} XP)
                    </span>
                  </div>
                </td>
                <td className="py-4">
                  <span className="font-black text-amber-400">{u.tokens.toLocaleString()}</span>
                </td>
                <td className="py-4">
                  <span className="text-xs text-muted-foreground">{u.inventoryCount} items</span>
                </td>
                <td className="py-4 text-right space-x-1">
                  <button
                    type="button"
                    disabled={modifyingId === u.id}
                    onClick={() => handleGrantTokens(u.id, 50)}
                    className="rounded border border-border bg-muted/60 px-2 py-1 text-[11px] font-bold hover:bg-muted"
                  >
                    +50 Tokens
                  </button>
                  <button
                    type="button"
                    disabled={modifyingId === u.id}
                    onClick={() => handleGrantTokens(u.id, 250)}
                    className="rounded border border-border bg-muted/60 px-2 py-1 text-[11px] font-bold hover:bg-muted"
                  >
                    +250 Tokens
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. OVERVIEW / DIRECTOR / SOURCES / CHANNELS / SYSTEM PANELS
// ═══════════════════════════════════════════════════════════════════════════════
function Overview({
  sources,
  scene,
  setScene,
  locked,
  setLocked,
}: {
  sources: TankCamera[];
  scene: string;
  setScene: (s: string) => void;
  locked: boolean;
  setLocked: (l: boolean) => void;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Tank Operations Desk</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            SRT/SRTLA ingest projection, real-time audio negotiator & multi-room control plane.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/house"
            className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-orange-500 transition"
          >
            <Home className="h-4 w-4" />
            Open House Deck
          </Link>
          <button
            onClick={() => setLocked(!locked)}
            className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold transition ${
              locked
                ? "border-amber-500/30 bg-amber-500/10 text-amber-600"
                : "border-border hover:bg-muted"
            }`}
          >
            <Lock className="h-4 w-4" />
            {locked ? "Director locked" : "Lock director"}
          </button>
        </div>
      </div>
      <Stats sources={sources} />
      <div className="grid gap-6 xl:grid-cols-[1.25fr_.75fr]">
        <Panel
          title="Camera Multiview"
          description="Preview public and protected receiver source projections."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {sources.map((source, index) => (
              <button
                key={source.id}
                className={`group relative overflow-hidden rounded-xl border text-left ${index === 0 ? "ring-primary/20 border-primary ring-2" : "border-border"}`}
              >
                <div
                  className={`aspect-video bg-gradient-to-br ${source.accent}`}
                >
                  <span className="absolute left-3 top-3 rounded-md bg-black/65 px-2 py-1 text-[10px] font-bold uppercase text-white">
                    {index === 0 ? "Program" : "Preview"}
                  </span>
                </div>
                <div className="flex items-center justify-between bg-background p-3">
                  <span>
                    <strong className="block text-sm">{source.name}</strong>
                    <span className="text-xs text-muted-foreground">
                      {source.latencyMs ? `${source.latencyMs} ms` : "No signal"}
                    </span>
                  </span>
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${tone(source.health)}`}
                  />
                </div>
              </button>
            ))}
          </div>
        </Panel>
        <div className="space-y-6">
          <Panel title="Program scene" description="Manual OBS scene override.">
            <div className="grid gap-2">
              {["LIVE", "LOW", "BRB"].map((item) => (
                <button
                  key={item}
                  onClick={() => setScene(item)}
                  className={`flex justify-between rounded-xl border px-4 py-3 text-sm font-black ${scene === item ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"}`}
                >
                  <span>{item}</span>
                  <span className="text-xs opacity-70">
                    {scene === item ? "On program" : "Take"}
                  </span>
                </button>
              ))}
            </div>
          </Panel>
          <Panel title="Switch countdown">
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4">
              <p className="text-sm font-bold text-amber-600">
                Primary stability check
              </p>
              <p className="mt-1 text-3xl font-black tabular-nums">00:08</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Primary camera recovered above 4 Mbps.
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}

function Stats({ sources }: { sources: TankCamera[] }) {
  const liveCount = sources.filter((s) => s.health === "live").length;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-2xl border border-border bg-card p-5">
        <span className="text-xs font-bold text-muted-foreground">Receiver Feeds</span>
        <p className="mt-2 text-3xl font-black">
          {liveCount} <span className="text-base text-muted-foreground">/ {sources.length}</span>
        </p>
      </div>
      <div className="rounded-2xl border border-border bg-card p-5">
        <span className="text-xs font-bold text-muted-foreground">Program Ingest</span>
        <p className="mt-2 text-3xl font-black text-emerald-500">SRTLA</p>
      </div>
      <div className="rounded-2xl border border-border bg-card p-5">
        <span className="text-xs font-bold text-muted-foreground">Audio Director</span>
        <p className="mt-2 text-3xl font-black text-primary">Active</p>
      </div>
      <div className="rounded-2xl border border-border bg-card p-5">
        <span className="text-xs font-bold text-muted-foreground">Target Health</span>
        <p className="mt-2 text-3xl font-black text-emerald-500">100%</p>
      </div>
    </div>
  );
}

function Director({
  sources,
  scene,
  setScene,
  locked,
  setLocked,
}: {
  sources: TankCamera[];
  scene: string;
  setScene: (s: string) => void;
  locked: boolean;
  setLocked: (l: boolean) => void;
}) {
  const {
    attentionLock,
    timeRemainingSeconds,
    setAttention,
    releaseAttention,
    loading: attentionLoading,
  } = useDirectorAttention();

  const [targetType, setTargetType] = useState<"room" | "camera" | "irl">("irl");
  const [targetId, setTargetId] = useState("cam-irl-1");
  const [targetLabel, setTargetLabel] = useState("IRL Backpack 1 (Primary)");
  const [durationMinutes, setDurationMinutes] = useState<number | "indefinite">(30);
  const [multiCamMode, setMultiCamMode] = useState<"audio_peak" | "round_robin" | "fixed_primary">("audio_peak");

  const formatTimer = (seconds: number | null) => {
    if (seconds === null) return "Indefinite Lock";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleSetLock = async (e: React.FormEvent) => {
    e.preventDefault();
    await setAttention({
      targetType,
      targetId,
      targetLabel,
      durationMinutes,
      lockedBy: "Admin Operator",
      multiCameraMode: multiCamMode,
    });
  };

  return (
    <div className="space-y-6">
      {/* Live Attention Lock Status */}
      <Panel
        title="Director Attention & Stream Focus"
        description="Override automated audio switching to lock public Director feed onto an IRL backpack stream or specific room for a set duration."
        action={
          <Link
            href="/house"
            className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground"
          >
            <span>Open House Deck</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/40 p-4">
          <div className="flex items-center gap-3">
            <div
              className={`grid h-10 w-10 place-items-center rounded-xl border ${
                attentionLock.active
                  ? "border-orange-500/40 bg-orange-950/40 text-orange-400 shadow-[0_0_12px_rgba(255,90,54,0.3)]"
                  : "border-emerald-500/40 bg-emerald-950/40 text-emerald-400"
              }`}
            >
              {attentionLock.active ? <Lock className="h-5 w-5" /> : <Zap className="h-5 w-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-foreground">
                  {attentionLock.active
                    ? `Locked to: ${attentionLock.targetLabel}`
                    : "Auto Director: Audio Tracking"}
                </span>
                {attentionLock.active && (
                  <span className="rounded bg-orange-500/20 text-orange-300 px-2 py-0.5 text-[10px] font-black uppercase border border-orange-500/30">
                    Live Focus
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {attentionLock.active
                  ? `Locked by ${attentionLock.lockedBy} · Mode: ${attentionLock.multiCameraMode}`
                  : "Director actively evaluates rooms with 75s discernment dwell."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {attentionLock.active && (
              <div className="flex items-center gap-1.5 font-mono text-sm font-black text-white bg-black/60 px-3 py-1.5 rounded-lg border border-orange-500/40">
                <Clock className="h-4 w-4 text-orange-400" />
                <span>{formatTimer(timeRemainingSeconds)}</span>
              </div>
            )}

            {attentionLock.active ? (
              <button
                type="button"
                disabled={attentionLoading}
                onClick={() => releaseAttention("Manual Staff Release")}
                className="rounded-xl bg-destructive hover:bg-destructive/90 px-4 py-2 text-xs font-black uppercase text-destructive-foreground transition"
              >
                Release Focus
              </button>
            ) : (
              <span className="text-xs font-bold uppercase text-emerald-400 bg-emerald-950/40 px-3 py-1.5 rounded-lg border border-emerald-500/30">
                🟢 Auto-Tracking
              </span>
            )}
          </div>
        </div>

        {/* Set IRL / Room Focus Form */}
        <form onSubmit={handleSetLock} className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-border">
            <Radio className="h-4 w-4 text-primary" />
            <span className="text-xs font-black uppercase text-foreground">
              Lock Director Feed to IRL Backpack or Room
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <label className="text-[11px] font-black uppercase text-muted-foreground block mb-1">
                Focus Target Type
              </label>
              <select
                value={targetType}
                onChange={(e) => {
                  const val = e.target.value as "room" | "camera" | "irl";
                  setTargetType(val);
                  if (val === "irl") {
                    setTargetId("cam-irl-1");
                    setTargetLabel("IRL Backpack 1 (Primary)");
                  } else if (val === "room") {
                    setTargetId("living-room");
                    setTargetLabel("Living Room");
                  }
                }}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold text-foreground focus:outline-none"
              >
                <option value="irl">📹 IRL Backpack Stream</option>
                <option value="room">🏠 Entire Room (Multi-Cam)</option>
                <option value="camera">🎥 Specific Fixed Camera</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-black uppercase text-muted-foreground block mb-1">
                Select Stream / Backpack
              </label>
              <select
                value={targetId}
                onChange={(e) => {
                  setTargetId(e.target.value);
                  const selectedOption = e.target.options[e.target.selectedIndex];
                  setTargetLabel(selectedOption.text);
                }}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold text-foreground focus:outline-none"
              >
                {targetType === "irl" ? (
                  <>
                    <option value="cam-irl-1">IRL Backpack 1 (Primary)</option>
                    <option value="cam-irl-2">IRL Backpack 2 (Secondary)</option>
                    <option value="cam-irl-mobile">IRL Mobile Ingest</option>
                  </>
                ) : targetType === "room" ? (
                  <>
                    <option value="living-room">Living Room</option>
                    <option value="kitchen">Kitchen</option>
                    <option value="game-room">Game Room</option>
                    <option value="director">Global House</option>
                  </>
                ) : (
                  sources.map((cam) => (
                    <option key={cam.id} value={cam.id}>
                      {cam.name} ({cam.roomId})
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-black uppercase text-muted-foreground block mb-1">
                Lock Duration (X Time)
              </label>
              <select
                value={durationMinutes.toString()}
                onChange={(e) => {
                  const val = e.target.value;
                  setDurationMinutes(val === "indefinite" ? "indefinite" : parseInt(val, 10));
                }}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold text-foreground focus:outline-none"
              >
                <option value="5">⏱️ 5 Minutes</option>
                <option value="15">⏱️ 15 Minutes</option>
                <option value="30">⏱️ 30 Minutes</option>
                <option value="60">⏱️ 1 Hour</option>
                <option value="120">⏱️ 2 Hours</option>
                <option value="240">⏱️ 4 Hours</option>
                <option value="indefinite">🔒 Indefinite (Until Released)</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={attentionLoading}
                className="w-full rounded-xl bg-orange-600 hover:bg-orange-500 py-2 text-xs font-black uppercase tracking-wider text-white shadow-lg transition"
              >
                {attentionLoading ? "Locking..." : "Lock Director to IRL"}
              </button>
            </div>
          </div>
        </form>
      </Panel>

      {/* 2. 📊 LIVE HOUSE POLLS & COMMUNITY VOTES */}
      <AdminPollsDesk />
    </div>
  );
}

function AdminPollsDesk() {
  const [adminPoll, setAdminPoll] = useState<ActivePoll | null>(null);
  const [qInput, setQInput] = useState("");
  const [optsInput, setOptsInput] = useState<string[]>(["", ""]);
  const [durInput, setDurInput] = useState<number | "indefinite">(5);
  const [busy, setBusy] = useState(false);

  const loadPoll = async () => {
    try {
      const p = await getActivePoll();
      setAdminPoll(p);
    } catch {}
  };

  useEffect(() => {
    void loadPoll();
    const interval = setInterval(() => void loadPoll(), 5000);
    return () => clearInterval(interval);
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await createPollAction({
      question: qInput,
      options: optsInput,
      durationMinutes: durInput,
    });
    if (res.success && res.poll) {
      setAdminPoll(res.poll);
      setQInput("");
      setOptsInput(["", ""]);
    } else {
      alert(res.error || "Failed to create poll");
    }
    setBusy(false);
  };

  const handleEnd = async () => {
    if (!adminPoll) return;
    await endPollAction(adminPoll.id);
    setAdminPoll(null);
  };

  return (
    <Panel
      title="Live House Polls & Community Voting"
      description="Launch interactive flash votes and viewer polls. Polls are pinned to the top of the chat feed and broadcasted as official CONSOLE action messages."
      action={
        adminPoll ? (
          <button
            type="button"
            onClick={handleEnd}
            className="rounded-xl bg-destructive hover:bg-destructive/90 px-3 py-1.5 text-xs font-black uppercase text-destructive-foreground transition"
          >
            End Poll & Publish Winner
          </button>
        ) : undefined
      }
    >
      {adminPoll && (
        <div className="rounded-xl border border-orange-500/40 bg-orange-950/20 p-4 mb-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="rounded bg-orange-500/20 text-orange-300 px-2 py-0.5 text-[10px] font-black uppercase border border-orange-500/30 flex items-center gap-1">
                <Pin className="h-3 w-3" /> Pinned Live Poll
              </span>
              <strong className="text-sm text-foreground font-black">{adminPoll.question}</strong>
            </div>
            <span className="font-mono text-xs text-muted-foreground font-bold">
              {adminPoll.totalVotes} total vote{adminPoll.totalVotes === 1 ? "" : "s"}
            </span>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {adminPoll.options.map((opt) => {
              const pct =
                adminPoll.totalVotes > 0 ? Math.round((opt.votes / adminPoll.totalVotes) * 100) : 0;
              return (
                <div
                  key={opt.id}
                  className="relative overflow-hidden rounded-xl border border-border bg-background p-2.5 text-xs font-bold flex items-center justify-between"
                >
                  <div
                    className="absolute inset-y-0 left-0 bg-orange-500/20 pointer-events-none transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                  <span className="relative z-10 text-foreground">{opt.text}</span>
                  <span className="relative z-10 font-mono text-[11px] font-bold text-muted-foreground">
                    {pct}% ({opt.votes})
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <form onSubmit={handleCreate} className="space-y-4 rounded-xl border border-white/10 bg-black/20 p-4">
        <div className="flex items-center gap-2 pb-2 border-b border-border">
          <BarChart3 className="h-4 w-4 text-orange-400" />
          <span className="text-xs font-black uppercase text-foreground">
            Launch New Community Poll
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <label className="text-[11px] font-black uppercase text-muted-foreground block mb-1">
              Poll Question
            </label>
            <input
              type="text"
              required
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="e.g. Who wins the next challenge? Should we order pizza?"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold text-foreground focus:outline-none"
            />
          </div>

          <div>
            <label className="text-[11px] font-black uppercase text-muted-foreground block mb-1">
              Duration
            </label>
            <select
              value={durInput.toString()}
              onChange={(e) => {
                const v = e.target.value;
                setDurInput(v === "indefinite" ? "indefinite" : parseInt(v, 10));
              }}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold text-foreground focus:outline-none"
            >
              <option value="2">⏱️ 2 Minutes (Flash Vote)</option>
              <option value="5">⏱️ 5 Minutes (Standard)</option>
              <option value="10">⏱️ 10 Minutes</option>
              <option value="30">⏱️ 30 Minutes</option>
              <option value="indefinite">🔒 Indefinite (Staff Closes)</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-orange-600 hover:bg-orange-500 py-2 text-xs font-black uppercase tracking-wider text-white shadow-lg transition disabled:opacity-50"
            >
              {busy ? "Broadcasting..." : "Broadcast Poll"}
            </button>
          </div>
        </div>

        {/* Options list */}
        <div className="grid gap-2 sm:grid-cols-2 pt-1">
          {optsInput.map((opt, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-orange-400 w-4 text-center">
                #{idx + 1}
              </span>
              <input
                type="text"
                required
                value={opt}
                onChange={(e) => {
                  const copy = [...optsInput];
                  copy[idx] = e.target.value;
                  setOptsInput(copy);
                }}
                placeholder={`Option ${idx + 1}`}
                className="flex-1 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground focus:outline-none"
              />
              {optsInput.length > 2 && (
                <button
                  type="button"
                  onClick={() => setOptsInput(optsInput.filter((_, i) => i !== idx))}
                  className="text-muted-foreground hover:text-destructive p-1"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          {optsInput.length < 4 && (
            <button
              type="button"
              onClick={() => setOptsInput([...optsInput, ""])}
              className="text-xs font-bold text-primary hover:underline flex items-center gap-1 py-1"
            >
              <Plus className="h-3.5 w-3.5" /> Add Another Option
            </button>
          )}
        </div>
      </form>
    </Panel>
  );
}

function Sources({
  sources,
  updateSource,
}: {
  sources: TankCamera[];
  updateSource: (id: string, patch: Partial<TankCamera>) => void;
}) {
  return (
    <div className="space-y-6">
      <Panel
        title="Automatic camera lifecycle"
        description="Live receiver projection. Credentials are reduced to a non-reversible fingerprint before reaching this page."
      >
        <LiveCameraRegistry />
      </Panel>
      <Panel
        title="Receiver sources"
        description="SRT, SRTLA, IP-camera, and RTMP ingest inventory."
      >
        <div className="space-y-3">
          {sources.map((source) => (
            <div
              key={source.id}
              className="grid gap-4 rounded-xl border border-border p-4 lg:grid-cols-[1fr_120px_130px_190px] lg:items-center"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`h-3 w-3 rounded-full ${tone(source.health)}`}
                />
                <div>
                  <strong>{source.name}</strong>
                  <p className="text-xs text-muted-foreground">
                    {source.location} · receiver/{source.slug}
                  </p>
                </div>
              </div>
              <div className="text-sm">
                <span className="block text-xs text-muted-foreground">
                  Bitrate
                </span>
                <strong>
                  {source.bitrateKbps ? `${source.bitrateKbps} kbps` : "—"}
                </strong>
              </div>
              <div className="text-sm">
                <span className="block text-xs text-muted-foreground">
                  Priority
                </span>
                <strong>{source.priority}</strong>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    updateSource(source.id, { enabled: !source.enabled })
                  }
                  className={`rounded-lg border px-3 py-2 text-xs font-bold ${source.enabled ? "border-primary/30 bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                >
                  {source.enabled ? "Enabled" : "Disabled"}
                </button>
                <button
                  onClick={() =>
                    updateSource(source.id, { isPublic: !source.isPublic })
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold"
                >
                  {source.isPublic ? (
                    <Eye className="h-3.5 w-3.5" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5" />
                  )}
                  {source.isPublic ? "Public" : "Private"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Channels() {
  return (
    <Panel
      title="Channels and rooms"
      description="Stable identities now; creator ownership can attach later."
    >
      <div className="grid gap-4 md:grid-cols-2">
        {channels.map((channel) => (
          <article
            key={channel.id}
            className="rounded-xl border border-border p-4"
          >
            <div className="flex justify-between">
              <div>
                <strong className="text-lg">{channel.name}</strong>
                <p className="text-sm text-primary">{channel.handle}</p>
              </div>
              <span
                className={`h-fit rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${channel.live ? "bg-red-500/15 text-red-500" : "bg-muted text-muted-foreground"}`}
              >
                {channel.live ? "Live" : "Offline"}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {channel.bio}
            </p>
            <div className="mt-4 flex justify-between border-t border-border pt-3 text-xs font-semibold text-muted-foreground">
              <span>{channel.cameraIds.length} sources</span>
              <span>{channel.followers.toLocaleString()} followers</span>
            </div>
          </article>
        ))}
      </div>
    </Panel>
  );
}

function Webhooks() {
  return (
    <Panel
      title="Event webhooks"
      description="Server-to-server delivery only; signing secrets are never shown here."
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="pb-3">Endpoint</th>
              <th className="pb-3">Events</th>
              <th className="pb-3">Last delivery</th>
              <th className="pb-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {[
              [
                "automation.unenter.live/tank",
                "stream.*, source.health",
                "12 seconds ago",
                "200",
              ],
              [
                "chat.unenter.live/hooks/mod",
                "chat.reported",
                "4 minutes ago",
                "200",
              ],
            ].map(([url, events, last, status]) => (
              <tr key={url}>
                <td className="py-4 font-mono text-xs">{url}</td>
                <td className="py-4 text-muted-foreground">{events}</td>
                <td className="py-4 text-muted-foreground">{last}</td>
                <td className="py-4">
                  <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold bg-emerald-500/10 text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function SystemPanel() {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <Panel title="Storage Buckets">
        <div className="space-y-2 text-xs">
          <div className="flex justify-between border-b border-border pb-1">
            <span>tank-assets (Patterns, items, logos)</span>
            <strong className="text-emerald-500">Connected</strong>
          </div>
          <div className="flex justify-between border-b border-border pb-1">
            <span>tank-emoji (173 emotions)</span>
            <strong className="text-emerald-500">Connected</strong>
          </div>
          <div className="flex justify-between">
            <span>tank-avatars (Profile images)</span>
            <strong className="text-emerald-500">Connected</strong>
          </div>
        </div>
      </Panel>

      <Panel title="Realtime Broadcast Health">
        <div className="space-y-2 text-xs">
          <div className="flex justify-between border-b border-border pb-1">
            <span>Supabase Realtime Channel</span>
            <strong className="text-emerald-500">Operational</strong>
          </div>
          <div className="flex justify-between border-b border-border pb-1">
            <span>Postgres DB Retention</span>
            <strong className="text-emerald-500">Indefinite</strong>
          </div>
          <div className="flex justify-between">
            <span>UNAXIS Ingress Proxy</span>
            <strong className="text-emerald-500">Active</strong>
          </div>
        </div>
      </Panel>
    </div>
  );
}
