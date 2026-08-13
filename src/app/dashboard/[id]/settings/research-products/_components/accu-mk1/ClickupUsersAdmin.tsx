"use client";

import React, { useEffect, useState } from "react";
import { ClickUpUserMapping } from "./types";

export default function ClickupUsersAdmin() {
  const [mappings, setMappings] = useState<ClickUpUserMapping[]>([]);
  const [loading, setLoading] = useState(true);

  const [clickupUserId, setClickupUserId] = useState("");
  const [clickupUsername, setClickupUsername] = useState("");
  const [clickupEmail, setClickupEmail] = useState("");
  const [systemEmail, setSystemEmail] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchMappings = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/clickup-users");
      const data = await res.json();
      if (data.ok) setMappings(data.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMappings();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clickupUserId.trim()) return;

    setSaving(true);
    try {
      const res = await fetch("/api/admin/clickup-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clickup_user_id: clickupUserId.trim(),
          clickup_username: clickupUsername.trim() || null,
          clickup_email: clickupEmail.trim() || null,
          system_user_email: systemEmail.trim() || null,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setClickupUserId("");
        setClickupUsername("");
        setClickupEmail("");
        setSystemEmail("");
        fetchMappings();
      } else {
        alert(data.error || "Failed to save mapping");
      }
    } catch (err: any) {
      alert(err.message || "Failed to save mapping");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (userId: string) => {
    try {
      const res = await fetch(`/api/admin/clickup-users?clickup_user_id=${userId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.ok) fetchMappings();
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-card p-6 rounded-2xl border border-border shadow-sm space-y-4">
        <h3 className="text-base font-bold text-foreground">ClickUp User Mapping</h3>
        <p className="text-xs text-muted-foreground">
          Map ClickUp user IDs to internal user emails for automatic status update attribution.
        </p>

        <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <input
            type="text"
            placeholder="ClickUp User ID *"
            value={clickupUserId}
            onChange={(e) => setClickupUserId(e.target.value)}
            required
            className="px-3 py-2 text-xs rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <input
            type="text"
            placeholder="ClickUp Username"
            value={clickupUsername}
            onChange={(e) => setClickupUsername(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <input
            type="email"
            placeholder="ClickUp Email"
            value={clickupEmail}
            onChange={(e) => setClickupEmail(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <input
            type="email"
            placeholder="System User Email"
            value={systemEmail}
            onChange={(e) => setSystemEmail(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <div className="sm:col-span-4 text-right">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
            >
              {saving ? "Saving..." : "Add / Update Mapping"}
            </button>
          </div>
        </form>
      </div>

      {loading ? (
        <div className="py-8 text-center text-xs text-muted-foreground">Loading user mappings...</div>
      ) : mappings.length === 0 ? (
        <div className="py-8 text-center text-xs text-muted-foreground bg-card rounded-xl border border-border">
          No ClickUp user mappings configured.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/50 border-b border-border font-semibold text-muted-foreground">
              <tr>
                <th className="p-3">ClickUp User ID</th>
                <th className="p-3">Username</th>
                <th className="p-3">ClickUp Email</th>
                <th className="p-3">System Email</th>
                <th className="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {mappings.map((map) => (
                <tr key={map.id}>
                  <td className="p-3 font-mono font-medium text-foreground">{map.clickup_user_id}</td>
                  <td className="p-3 text-muted-foreground">{map.clickup_username || "—"}</td>
                  <td className="p-3 text-muted-foreground">{map.clickup_email || "—"}</td>
                  <td className="p-3 text-foreground font-medium">{map.system_user_email || "—"}</td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => handleDelete(map.clickup_user_id)}
                      className="px-2.5 py-1 text-xs text-rose-600 hover:text-rose-800 font-medium"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
