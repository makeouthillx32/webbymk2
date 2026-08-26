"use client";

import React, { useState, useEffect } from "react";
import {
  Users,
  Shield,
  Eye,
  UserCheck,
  Search,
  RefreshCw,
  Clock,
  CheckCircle2,
  Sparkles,
  ChevronDown,
  Lock,
} from "lucide-react";
import { ACTIVE_THEME } from "../theme";
import { ChromePanel } from "../public/components/ChromePanel";
import { ConsoleButton } from "../public/components/ConsoleButton";
import {
  listAllPlatformUsers,
  setTankUserRole,
  type PlatformUserSummary,
  type PromotableRole,
} from "../server/userRoles";

export function UserDirectoryPanel({
  operatorRole = "admin",
  livePresenceCount = 0,
}: {
  operatorRole?: "admin" | "moderator";
  /**
   * Total live viewers across every room. Passed down from HouseConsole, which
   * already holds the useHousePresence() roll-up — subscribing a second time
   * from here would double the console's presence channel fan-out.
   */
  livePresenceCount?: number;
}) {
  const [users, setUsers] = useState<PlatformUserSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const loadUsers = async () => {
    setLoading(true);
    const data = await listAllPlatformUsers();
    setUsers(data);
    setLoading(false);
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const handleRoleChange = async (userId: string, newRole: PromotableRole) => {
    if (operatorRole !== "admin" || busyUserId) return;
    setBusyUserId(userId);
    const res = await setTankUserRole(userId, newRole);
    if (res.success) {
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
    }
    setBusyUserId(null);
  };

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.displayName.toLowerCase().includes(search.toLowerCase()) ||
      (u.email && u.email.toLowerCase().includes(search.toLowerCase())) ||
      u.id.includes(search);
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <ChromePanel withScrews>
      <div className="space-y-4 font-sans select-none">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/15 pb-2">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded bg-orange-950/40 border border-orange-500/40 text-orange-400">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-xs font-black uppercase tracking-wider text-[#241f14]">
                USER DIRECTORY & LIVE VIEWERS AUDIT
              </h2>
              <p className="text-[10px] font-semibold text-[#5a5442]">
                Audit all registered accounts, roles, XP ranks, and live connected viewing presences.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ConsoleButton
              variant="gray"
              onClick={loadUsers}
              disabled={loading}
              className="!py-1 text-xs"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </ConsoleButton>
          </div>
        </div>

        {/* Presence Summary Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="rounded border border-black/20 bg-black/5 p-2 text-center">
            <p className="text-lg font-black text-[#241f14]">{livePresenceCount}</p>
            <p className="text-[9px] font-black uppercase text-slate-500">Live Viewers</p>
          </div>
          <div className="rounded border border-black/20 bg-black/5 p-2 text-center">
            <p className="text-lg font-black text-[#241f14]">{users.length}</p>
            <p className="text-[9px] font-black uppercase text-slate-500">Registered Users</p>
          </div>
          <div className="rounded border border-black/20 bg-black/5 p-2 text-center">
            <p className="text-lg font-black text-orange-600">
              {users.filter((u) => u.role === "admin" || u.role === "moderator").length}
            </p>
            <p className="text-[9px] font-black uppercase text-slate-500">Staff Accounts</p>
          </div>
          <div className="rounded border border-black/20 bg-black/5 p-2 text-center">
            <p className="text-lg font-black text-emerald-600">
              {users.filter((u) => u.level >= 5).length}
            </p>
            <p className="text-[9px] font-black uppercase text-slate-500">VIP / Veteran</p>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by email, name, or UUID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded border border-black/30 bg-white/70 pl-8 pr-3 py-1.5 text-xs text-[#241f14] placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>

          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded border border-black/30 bg-white/70 px-2.5 py-1.5 text-xs font-black uppercase text-[#241f14] focus:outline-none"
          >
            <option value="all">All Roles</option>
            <option value="admin">Admin</option>
            <option value="moderator">Moderator</option>
            <option value="member">Member</option>
          </select>
        </div>

        {/* Users Table */}
        <div className="max-h-96 overflow-y-auto rounded border border-black/20 bg-white/40">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-[#e8e2d2] border-b border-black/20 text-[10px] font-black uppercase tracking-wider text-[#4c4630]">
              <tr>
                <th className="p-2.5">User</th>
                <th className="p-2.5">Email & Auth Provider</th>
                <th className="p-2.5">Verification</th>
                <th className="p-2.5">Role</th>
                <th className="p-2.5">XP & Level</th>
                <th className="p-2.5">Tokens</th>
                {operatorRole === "admin" && <th className="p-2.5 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-xs text-slate-500 italic">
                    No users found matching query.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-white/60 transition">
                    <td className="p-2.5 font-bold text-[#241f14]">
                      <div className="flex items-center gap-2">
                        {user.avatarUrl ? (
                          <img
                            src={user.avatarUrl}
                            alt=""
                            className="h-6 w-6 rounded-full border border-black/20 object-cover"
                          />
                        ) : (
                          <div className="grid h-6 w-6 place-items-center rounded-full bg-slate-300 text-[10px] font-black text-slate-700">
                            {user.displayName.substring(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="leading-tight">{user.displayName}</p>
                          <p className="text-[9px] font-mono text-slate-500 truncate max-w-[120px]">
                            {user.id}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="p-2.5 font-mono text-[11px] text-slate-600">
                      <div>
                        <p>{user.email || <span className="italic text-slate-400">OAuth Guest</span>}</p>
                        <span
                          className={`inline-block mt-0.5 rounded px-1 py-0.2 text-[8px] font-black uppercase font-sans ${
                            user.authProvider === "google"
                              ? "bg-blue-600 text-white"
                              : user.authProvider === "facebook"
                              ? "bg-[#1877F2] text-white"
                              : "bg-slate-200 text-slate-700"
                          }`}
                        >
                          {user.authProvider === "google"
                            ? "Google OAuth"
                            : user.authProvider === "facebook"
                            ? "Facebook OAuth"
                            : "Email Credentials"}
                        </span>
                      </div>
                    </td>
                    <td className="p-2.5">
                      {user.emailVerified ? (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.5 text-[9px] font-black uppercase">
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                          <span>{user.verifiedVia === "google_oauth" ? "Google" : user.verifiedVia === "facebook_oauth" ? "Facebook" : "Verified"}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 text-[9px] font-black uppercase">
                          <Clock className="h-3 w-3 text-amber-600" />
                          <span>Pending</span>
                        </span>
                      )}
                    </td>
                    <td className="p-2.5">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${
                          user.role === "admin"
                            ? "bg-red-600 text-white"
                            : user.role === "moderator"
                            ? "bg-orange-500 text-white"
                            : "bg-black/10 text-[#4c4630]"
                        }`}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="p-2.5">
                      <span className="font-bold text-[#241f14]">Lv. {user.level}</span>{" "}
                      <span className="text-[10px] text-slate-500">({user.xp} XP)</span>
                    </td>
                    <td className="p-2.5 font-bold text-amber-600">
                      {user.tokens} 🪙
                    </td>
                    {operatorRole === "admin" && (
                      <td className="p-2.5 text-right">
                        <select
                          disabled={busyUserId === user.id}
                          value={user.role}
                          onChange={(e) =>
                            handleRoleChange(user.id, e.target.value as PromotableRole)
                          }
                          className="rounded border border-black/30 bg-white px-2 py-1 text-[10px] font-black uppercase text-[#241f14] focus:outline-none"
                        >
                          <option value="member">Member</option>
                          <option value="moderator">Moderator</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ChromePanel>
  );
}

export default UserDirectoryPanel;
